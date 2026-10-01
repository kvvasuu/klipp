import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import type { TargetPose } from '../TargetPose.js';
import {
  createHardLockToTargetParams,
  createHardLockToTargetState,
  updateHardLockToTarget,
  type HardLockToTargetParams,
} from './hardLockToTarget.js';

export type HardLockToTargetOptions = Partial<HardLockToTargetParams>;

/** Locks the camera position to a target. Layers override `readTarget` to read their own targets. */
export class HardLockToTargetBodyCore<T = TargetPose | null> implements HardLockToTargetParams {
  target: T;
  declare damping: DampingConstant;
  declare maxSpeed: number;

  readonly state = createHardLockToTargetState();

  constructor(target: T, options?: HardLockToTargetOptions) {
    this.target = target;
    Object.assign(this, createHardLockToTargetParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    updateHardLockToTarget(out, this.state, this, this.readTarget()?.position ?? null, dt, justActivated);
  };

  /** This frame's target pose, or `null` when there is none. */
  protected readTarget(): TargetPose | null {
    return this.target as TargetPose | null;
  }
}
