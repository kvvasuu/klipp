import type { Quat } from 'math';
import type { CameraState } from '../CameraState.js';
import { createDamperState, resetDamper, type DamperState, type DampingConstant } from '../damping/Damper.js';
import { dampQuaternion } from '../damping/dampQuaternion.js';

export type RotateWithFollowTargetParams = { damping: DampingConstant; maxSpeed: number };

export type RotateWithFollowTargetState = { damper: DamperState; primed: boolean };

export const createRotateWithFollowTargetState = (): RotateWithFollowTargetState => ({
  damper: createDamperState(),
  primed: false,
});

/** Turns `out` toward `targetRotation`, optionally damped. A `null` rotation leaves `out` as is. */
export function updateRotateWithFollowTarget(
  out: CameraState,
  state: RotateWithFollowTargetState,
  params: RotateWithFollowTargetParams,
  targetRotation: Quat | null,
  dt: number,
  justActivated: boolean,
): void {
  if (justActivated) {
    if (state.primed) state.primed = false;
    else resetDamper(state.damper);
  }
  if (!targetRotation) return;
  dampQuaternion(state.damper, out.quaternion, targetRotation, params.damping, dt, params.maxSpeed);
}

/** Start the next activation from `rotation` instead of snapping to the target. */
export function primeRotateWithFollowTarget(
  state: RotateWithFollowTargetState,
  params: RotateWithFollowTargetParams,
  rotation: Quat,
): void {
  dampQuaternion(state.damper, rotation, rotation, params.damping, 0);
  state.primed = true;
}
