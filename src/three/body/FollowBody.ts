import type { Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import { createTargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import type { BindingMode } from '../../core/body/BindingModes.js';
import {
  createFollowState,
  followNeedsTargetRotation,
  primeFollow,
  updateFollow,
  createFollowParams,
  type FollowParams,
} from '../../core/body/follow.js';

export type FollowOptions = Partial<FollowParams>;

/** Follows a target with an offset rotated according to `bindingMode`. */
export class FollowBody implements FollowParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  declare offset: Vec3;
  declare damping: DampingConstant;
  declare bindingMode: BindingMode;
  declare maxSpeed: number;

  readonly state = createFollowState();
  private readonly pose = createTargetPose();
  private lastTarget: Target = undefined;

  constructor(target: Target, options?: FollowOptions) {
    this.target = target;
    Object.assign(this, createFollowParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (this.target !== this.lastTarget) {
      this.lastTarget = this.target;
      this.state.assigned = false;
    }
    const withRotation = followNeedsTargetRotation(this.state, this);
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, withRotation);
    updateFollow(out, this.state, this, resolved ? this.pose : null, dt, justActivated);
  };

  primeFrom = (position: Vec3): void => primeFollow(this.state, this, position);
}
