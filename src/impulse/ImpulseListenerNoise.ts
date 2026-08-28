import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { impulseManager, type ImpulseManager } from './ImpulseManager';

const scratchOffset = new Vector3();

/**
 * Additive position offset from in-flight impulse events (explosions, footsteps, anything that calls
 * `manager.generate(...)`). Fits the SAME `Noise` slot as `BasicMultiChannelPerlinNoise` (runs after
 * Body+Aim, adds on top, stacks with other Noise writers).
 *
 * `manager` defaults to the shared `impulseManager` singleton — pass your own `ImpulseManager` instance
 * only for isolated impulse "worlds" (e.g. split-screen). No per-listener smoothing beyond what the
 * SOURCE's own envelope already provides, matching `BasicMultiChannelPerlinNoise`'s "no persistent state
 * between frames" shape.
 *
 * Rotation is never touched — the impulse signal is position-only, see `ImpulseManager`'s doc comment.
 */
export class ImpulseListenerNoise {
  manager: ImpulseManager;
  channelMask: number;
  gain: number;

  constructor(manager: ImpulseManager = impulseManager, channelMask = 1, gain = 1) {
    this.manager = manager;
    this.channelMask = channelMask;
    this.gain = gain;
  }

  /** `now` (seconds, same clock as `ImpulseManager.generate`/`sampleAt` — real time by default) is a
   *  3rd, optional param, NOT `dt` — `registerNoise` never passes it, so production code gets the real
   *  clock automatically; tests pass it explicitly for determinism instead of depending on wall time.
   *
   *  Returns whether `manager` still has an event in flight — an event's constant-amplitude sustain
   *  phase can hold the exact same offset across several frames without being done, so klipp can't infer
   *  "settled" from this frame's output alone (see `CameraStateWriter` in `VirtualCameraController.ts`). */
  update = (out: CameraState, _dt: number, now?: number): boolean => {
    this.manager.sampleAt(scratchOffset, out.position, this.channelMask, now);
    out.position.addScaledVector(scratchOffset, this.gain);
    return this.manager.hasEvents;
  };
}
