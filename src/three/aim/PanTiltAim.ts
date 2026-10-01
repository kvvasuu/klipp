import { PanTiltAimCore } from '../../core/aim/PanTiltAimCore.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetRotation } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

/** `PanTiltAimCore` relative to an optional `Object3D` or ref's rotation. */
export class PanTiltAim extends PanTiltAimCore<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose {
    this.pose.hasRotation = readTargetRotation(this.pose.rotation, this.target, this.targetSlot);
    return this.pose;
  }
}
