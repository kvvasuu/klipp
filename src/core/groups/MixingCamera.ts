import { quat, vec3 } from 'math';
import { createCameraState, type CameraState } from '../CameraState.js';

const MAX_SLOTS = 8;

export type MixingCameraSlot = {
  cameraId: string;
  /** Live reference - read fresh every `tick()`, same convention as `KlippCore.registerCamera`. */
  state: CameraState;
  /** Mutable - this camera's contribution is `weight / sum(weights)`. Zero/negative = no contribution. */
  weight: number;
};

/**
 * Writes the weighted mix of `slots` into `out`, weighted by `weight / sum(weights)`. If every weight is
 * zero (or negative), `out` is left unchanged.
 */
export function mixCameraStates(out: CameraState, slots: readonly MixingCameraSlot[]): CameraState {
  let totalWeight = 0;
  for (const slot of slots) if (slot.weight > 0) totalWeight += slot.weight;
  if (totalWeight <= 0) return out;

  vec3.set(out.position, 0, 0, 0);
  let fov = 0;
  let near = 0;
  let far = 0;
  for (const slot of slots) {
    if (slot.weight <= 0) continue;
    const share = slot.weight / totalWeight;
    vec3.scaleAndAdd(out.position, out.position, slot.state.position, share);
    fov += slot.state.fov * share;
    near += slot.state.near * share;
    far += slot.state.far * share;
  }
  out.fov = fov;
  out.near = near;
  out.far = far;

  let accumulatedWeight = 0;
  for (const slot of slots) {
    if (slot.weight <= 0) continue;
    if (accumulatedWeight === 0) {
      quat.copy(out.quaternion, slot.state.quaternion);
    } else {
      const t = slot.weight / (accumulatedWeight + slot.weight);
      quat.slerp(out.quaternion, out.quaternion, slot.state.quaternion, t);
    }
    accumulatedWeight += slot.weight;
  }

  return out;
}

/**
 * Continuous N-way cross-fade of up to 8 fixed slots, weighted by `weight / sum(weights)` - unlike
 * `KlippCore`/`Sequencer`, there's no winner and no time-driven curve; the caller drives the mix by
 * mutating `weight` directly (e.g. an authored slider blend between two cameras).
 *
 * Position/lens average in a plain weighted sum. Quaternions have no closed-form weighted average, so
 * they're combined incrementally: start from the first contributing camera, then `slerp` each next one
 * in by its share of the weight accumulated so far - exact for 2 cameras, a standard approximation for
 * more.
 */
export class MixingCamera {
  private readonly slots: MixingCameraSlot[];
  private readonly output: CameraState = createCameraState();

  constructor(slots: MixingCameraSlot[]) {
    if (slots.length === 0) throw new Error('MixingCamera needs at least one slot.');
    if (slots.length > MAX_SLOTS) throw new Error(`MixingCamera supports at most ${MAX_SLOTS} slots.`);
    this.slots = slots;
  }

  /** Recomputes the weighted mix from the slots' current weights and returns it - same scratch instance
   *  every call. If every weight is zero (or negative), returns the previous output unchanged. */
  tick(): CameraState {
    return mixCameraStates(this.output, this.slots);
  }
}
