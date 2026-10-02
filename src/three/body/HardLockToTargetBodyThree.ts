import { HardLockToTargetBody, type HardLockToTargetOptions } from '../../core/body/HardLockToTargetBody.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';

export type { HardLockToTargetOptions };

/** Locks the camera position to an `Object3D`, ref or fixed point, optionally with damping. */
export class HardLockToTargetBodyThree extends HardLockToTargetBody<Target> {
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  protected override readTarget(): TargetPose | null {
    return readTargetPose(this.pose, this.target, this.targetSlot, false) ? this.pose : null;
  }
}
