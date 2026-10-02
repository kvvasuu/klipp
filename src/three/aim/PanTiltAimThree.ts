import { PanTiltAim } from '../../core/aim/PanTiltAim.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetRotation } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

/** `PanTiltAim` relative to an optional `Object3D` or ref's rotation. */
export class PanTiltAimThree extends PanTiltAim<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose {
    this.pose.hasRotation = readTargetRotation(this.pose.rotation, this.target, this.targetSlot);
    return this.pose;
  }
}
