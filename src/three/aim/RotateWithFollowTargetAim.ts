import type { Quat } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createRotateWithFollowTargetState,
  primeRotateWithFollowTarget,
  updateRotateWithFollowTarget,
  createRotateWithFollowTargetParams,
  type RotateWithFollowTargetParams,
} from '../../core/aim/rotateWithFollowTarget.js';
import { readTargetRotation } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

export type RotateWithFollowTargetOptions = Partial<RotateWithFollowTargetParams>;

/** Follows the target's rotation. */
export class RotateWithFollowTargetAim implements RotateWithFollowTargetParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  declare damping: DampingConstant;
  declare maxSpeed: number;

  readonly state = createRotateWithFollowTargetState();
  private readonly rotation: Quat = [0, 0, 0, 1];

  constructor(target: Target, options?: RotateWithFollowTargetOptions) {
    this.target = target;
    Object.assign(this, createRotateWithFollowTargetParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetRotation(this.rotation, this.target, this.targetSlot);
    updateRotateWithFollowTarget(out, this.state, this, resolved ? this.rotation : null, dt, justActivated);
  };

  primeFrom = (rotation: Quat): void => primeRotateWithFollowTarget(this.state, this, rotation);
}
