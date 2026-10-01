import { vec3, type Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import {
  createVector3DamperState,
  dampVector3,
  resetVector3Damper,
  type Vector3DamperState,
} from '../damping/dampVector3.js';
import { withDefaults } from '../params.js';

export type HardLockToTargetParams = {
  /** Response time for following the target position. */
  damping: DampingConstant;
  /** Maximum damping speed, in world units/sec. */
  maxSpeed: number;
};

/** Every setting from `settings`, or its default. */
export const createHardLockToTargetParams = (settings?: Partial<HardLockToTargetParams>): HardLockToTargetParams =>
  withDefaults({ damping: 0, maxSpeed: Infinity }, settings);

export type HardLockToTargetState = { damper: Vector3DamperState };

export const createHardLockToTargetState = (): HardLockToTargetState => ({ damper: createVector3DamperState() });

/** Moves `out` onto `targetPosition`, optionally damped. A `null` target leaves `out` as is. */
export function updateHardLockToTarget(
  out: CameraState,
  state: HardLockToTargetState,
  params: HardLockToTargetParams,
  targetPosition: Vec3 | null,
  dt: number,
  justActivated: boolean,
): void {
  if (!targetPosition) return;
  if (justActivated) resetVector3Damper(state.damper);
  dampVector3(state.damper, out.position, targetPosition, params.damping, dt, params.maxSpeed);
  vec3.copy(out.target, out.position);
  out.hasTarget = true;
}
