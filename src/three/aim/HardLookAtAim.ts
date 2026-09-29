import type { CameraState } from '../../core/CameraState';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';
import { createTargetPose } from '../../core/TargetPose';
import { readTargetPose } from '../readTargetPose';
import { updateHardLookAt } from '../../core/aim/hardLookAt';

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
