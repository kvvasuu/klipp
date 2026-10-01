import { HardLookAtAimCore } from '../../core/aim/HardLookAtAimCore.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

/** Rotates so an `Object3D`, ref or fixed point is dead-center. */
export class HardLookAtAim extends HardLookAtAimCore<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose | null {
    return readTargetPose(this.pose, this.target, this.targetSlot, false) ? this.pose : null;
  }
}
