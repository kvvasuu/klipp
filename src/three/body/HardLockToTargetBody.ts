import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createHardLockToTargetState,
  updateHardLockToTarget,
  createHardLockToTargetParams,
  type HardLockToTargetParams,
} from '../../core/body/hardLockToTarget.js';
import { createTargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

export type HardLockToTargetOptions = Partial<HardLockToTargetParams>;

/** Locks the camera position to a target, optionally with damping. */
export class HardLockToTargetBody implements HardLockToTargetParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  declare damping: DampingConstant;
  declare maxSpeed: number;

  readonly state = createHardLockToTargetState();
  private readonly pose = createTargetPose();

  constructor(target: Target, options?: HardLockToTargetOptions) {
    this.target = target;
    Object.assign(this, createHardLockToTargetParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, false);
    updateHardLockToTarget(out, this.state, this, resolved ? this.pose.position : null, dt, justActivated);
  };
}
