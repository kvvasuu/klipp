import type { CameraState } from '../../core/CameraState';
import type { DampingConstant } from '../../core/damping/Damper';
import {
  createHardLockToTargetState,
  updateHardLockToTarget,
  type HardLockToTargetParams,
} from '../../core/body/hardLockToTarget';
import { createTargetPose } from '../../core/TargetPose';
import { readTargetPose } from '../readTargetPose';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';

/** Locks the camera position to a target, optionally with damping. */
export class HardLockToTargetBody implements HardLockToTargetParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  damping: DampingConstant;
  maxSpeed: number;

  readonly state = createHardLockToTargetState();
  private readonly pose = createTargetPose();

  constructor(target: Target, damping: DampingConstant = 0, maxSpeed = Infinity) {
    this.target = target;
    this.damping = damping;
    this.maxSpeed = maxSpeed;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!readTargetPose(this.pose, this.target, this.targetSlot, false)) return;
    updateHardLockToTarget(out, this.state, this, this.pose.position, dt, justActivated);
  };
}
