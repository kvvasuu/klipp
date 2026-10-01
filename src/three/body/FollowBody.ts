import { FollowBodyCore, type FollowOptions } from '../../core/body/FollowBodyCore.js';
import { followNeedsTargetRotation } from '../../core/body/follow.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

export type { FollowOptions };

/** Follows an `Object3D`, ref or fixed point with an offset rotated according to `bindingMode`. */
export class FollowBody extends FollowBodyCore<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose | null {
    const withRotation = followNeedsTargetRotation(this.state, this);
    return readTargetPose(this.pose, this.target, this.targetSlot, withRotation) ? this.pose : null;
  }
}
