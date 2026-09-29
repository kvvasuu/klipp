import { vec3, type Vec3 } from 'math';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import {
  createVector3DamperState,
  dampVector3,
  resetVector3Damper,
  type Vector3DamperState,
} from '../damping/dampVector3';

export type HardLockToTargetParams = { damping: DampingConstant; maxSpeed: number };

export type HardLockToTargetState = { damper: Vector3DamperState };

export const createHardLockToTargetState = (): HardLockToTargetState => ({ damper: createVector3DamperState() });

/** Moves `out` onto `targetPosition`, optionally damped. */
export function updateHardLockToTarget(
  out: CameraState,
  state: HardLockToTargetState,
  params: HardLockToTargetParams,
  targetPosition: Vec3,
  dt: number,
  justActivated: boolean,
): void {
  if (justActivated) resetVector3Damper(state.damper);
  dampVector3(state.damper, out.position, targetPosition, params.damping, dt, params.maxSpeed);
  vec3.copy(out.target, out.position);
  out.hasTarget = true;
}
