import {
  RotateWithFollowTargetAim,
  type RotateWithFollowTargetOptions,
} from '../../core/aim/RotateWithFollowTargetAim.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetRotation } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

export type { RotateWithFollowTargetOptions };

/** Follows the rotation of an `Object3D` or ref. */
export class RotateWithFollowTargetAimThree extends RotateWithFollowTargetAim<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose {
    this.pose.hasRotation = readTargetRotation(this.pose.rotation, this.target, this.targetSlot);
    return this.pose;
  }
}
