import type { Quat, Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createRotationComposerState,
  primeRotationComposer,
  retargetRotationComposer,
  rotationComposerNeedsExtent,
  updateRotationComposer,
  createRotationComposerParams,
  type RotationComposerParams,
} from '../../core/aim/rotationComposer.js';
import { createTargetPose } from '../../core/TargetPose.js';
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

/** Rotates the camera to place a target at `screenPosition`. */
export class RotationComposerAim implements RotationComposerParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  declare screenPosition: [number, number];
  declare aspect: number;
  declare deadZone: [number, number];
  declare damping: DampingConstant;
  declare maxSpeed: number;
  declare hardLimit: [number, number];
  declare targetOffset: Vec3;
  radius?: number;
  size?: Vector3Like;
  declare lookaheadTime: number;
  declare lookaheadSmoothing: number;
  declare lookaheadIgnoreY: boolean;

  readonly state = createRotationComposerState();
  private readonly pose = createTargetPose();
  private lastTarget: Target = undefined;
  private forceSizeRecalculation = false;

  constructor(target: Target, options?: RotationComposerOptions) {
    this.target = target;
    Object.assign(this, createRotationComposerParams(options));
    this.radius = options?.radius;
    this.size = options?.size;
  }

  /** Forces the auto-detected `size` to be re-measured on the next `update()`, then goes back to the cached value. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  primeFrom = (rotation: Quat): void => primeRotationComposer(this.state, this, rotation);

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, true);
    if (resolved) {
      if (this.target !== this.lastTarget) retargetRotationComposer(this.state);
      this.lastTarget = this.target;
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
    }
    updateRotationComposer(out, this.state, this, resolved ? this.pose : null, dt, justActivated);
  };
}
