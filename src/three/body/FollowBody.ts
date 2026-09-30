import type { Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import { createTargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import { BindingModes, type BindingMode } from '../../core/body/BindingModes.js';
import {
  createFollowState,
  followNeedsTargetRotation,
  primeFollow,
  updateFollow,
  type FollowParams,
} from '../../core/body/follow.js';

/** Follows a target with an offset rotated according to `bindingMode`. */
export class FollowBody implements FollowParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  offset: Vec3;
  damping: DampingConstant;
  bindingMode: BindingMode;
  maxSpeed: number;

  readonly state = createFollowState();
  private readonly pose = createTargetPose();
  private lastTarget: Target = undefined;

  constructor(
    target: Target,
    offset: Vec3 = [0, 0, 10],
    damping: DampingConstant = 0,
    bindingMode: BindingMode = BindingModes.lockToTarget,
    maxSpeed = Infinity,
  ) {
    this.target = target;
    this.offset = offset;
    this.damping = damping;
    this.bindingMode = bindingMode;
    this.maxSpeed = maxSpeed;
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
