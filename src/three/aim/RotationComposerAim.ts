import type { RotationComposerParams } from '../../core/aim/rotationComposer.js';
import { rotationComposerNeedsExtent } from '../../core/aim/rotationComposer.js';
import { RotationComposerAimCore } from '../../core/aim/RotationComposerAimCore.js';
import { createTargetPose, type TargetPose } from '../../core/TargetPose.js';
import { readTargetExtent } from '../readTargetExtent.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import type { Vector3Like } from '../resolve/resolveVector3.js';

export type RotationComposerOptions = Partial<RotationComposerParams> & {
  /** Target radius used when composing its visible edge. Ignored when `size` is set. */
  radius?: number;
  /** Target dimensions used when composing its visible edges. Measured automatically for meshes. */
  size?: Vector3Like;
};

/** Rotates the camera to place an `Object3D`, ref or fixed point at `screenPosition`. */
export class RotationComposerAim extends RotationComposerAimCore<Target> {
  targetSlot: TargetSlot | null = null;
  radius?: number;
  size?: Vector3Like;

  private readonly pose = createTargetPose();
  private forceSizeRecalculation = false;

  constructor(target: Target, options?: RotationComposerOptions) {
    super(target, options);
    this.radius = options?.radius;
    this.size = options?.size;
  }

  /** Forces the auto-detected `size` to be re-measured on the next `update()`, then goes back to the cached value. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  protected override readTarget(): TargetPose | null {
    if (!readTargetPose(this.pose, this.target, this.targetSlot, true)) return null;
    if (rotationComposerNeedsExtent(this)) {
      readTargetExtent(
        this.pose.extent,
        this.target,
        this.size,
        this.radius,
        this.forceSizeRecalculation,
        this.targetSlot,
      );
    }
    this.forceSizeRecalculation = false;
    return this.pose;
  }
}
