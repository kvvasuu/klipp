import type { CameraState } from '../../core/CameraState.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import { createTargetPose } from '../../core/TargetPose.js';
import { readTargetPose } from '../readTargetPose.js';
import { updateHardLookAt } from '../../core/aim/hardLookAt.js';

/** Rotates so the Look At Target is dead-center. */
export class HardLookAtAim {
  target: Target;
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  constructor(target: Target) {
    this.target = target;
  }

  update = (out: CameraState): void => {
    if (readTargetPose(this.pose, this.target, this.targetSlot, false)) updateHardLookAt(out, this.pose.position);
  };
}
