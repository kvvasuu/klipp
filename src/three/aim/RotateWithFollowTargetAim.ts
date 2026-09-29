import type { Quat } from 'math';
import type { CameraState } from '../../core/CameraState';
import type { DampingConstant } from '../../core/damping/Damper';
import {
  createRotateWithFollowTargetState,
  primeRotateWithFollowTarget,
  updateRotateWithFollowTarget,
  type RotateWithFollowTargetParams,
} from '../../core/aim/rotateWithFollowTarget';
import { readTargetRotation } from '../readTargetPose';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';

/** Follows the target's rotation. */
export class RotateWithFollowTargetAim implements RotateWithFollowTargetParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  damping: DampingConstant;
  maxSpeed: number;

  readonly state = createRotateWithFollowTargetState();
  private readonly rotation: Quat = [0, 0, 0, 1];

  constructor(target: Target, damping: DampingConstant = 0, maxSpeed = Infinity) {
    this.target = target;
    this.damping = damping;
    this.maxSpeed = maxSpeed;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetRotation(this.rotation, this.target, this.targetSlot);
    updateRotateWithFollowTarget(out, this.state, this, resolved ? this.rotation : null, dt, justActivated);
  };

  primeFrom = (rotation: Quat): void => primeRotateWithFollowTarget(this.state, this, rotation);
}
