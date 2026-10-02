import { FollowBodyCore, type FollowOptions as FollowCoreOptions } from '../../core/body/FollowBodyCore.js';
import { followNeedsTargetRotation } from '../../core/body/follow.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import { optionalVec3, type Vector3Like } from '../resolve/resolveVector3.js';

export type FollowOptions = Omit<FollowCoreOptions, 'offset'> & {
  /** Offset from the target, rotated according to `bindingMode`. */
  offset?: Vector3Like;
};

/** Follows an `Object3D`, ref or fixed point with an offset rotated according to `bindingMode`. */
export class FollowBody extends FollowBodyCore<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  constructor(target: Target, { offset, ...options }: FollowOptions = {}) {
    super(target, { ...options, offset: optionalVec3(offset) });
  }

  protected override readTarget(): TargetPose | null {
    const withRotation = followNeedsTargetRotation(this.state, this);
    return readTargetPose(this.pose, this.target, this.targetSlot, withRotation) ? this.pose : null;
  }
}
