import {
  RotateWithFollowTargetAimCore,
  type RotateWithFollowTargetOptions,
} from '../../core/aim/RotateWithFollowTargetAimCore.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetRotation } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

export type { RotateWithFollowTargetOptions };

/** Follows the rotation of an `Object3D` or ref. */
export class RotateWithFollowTargetAim extends RotateWithFollowTargetAimCore<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose {
    this.pose.hasRotation = readTargetRotation(this.pose.rotation, this.target, this.targetSlot);
    return this.pose;
  }
}
