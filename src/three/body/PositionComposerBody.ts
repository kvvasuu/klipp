import type { Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createPositionComposerParams,
  createPositionComposerState,
  primePositionComposer,
  retargetPositionComposer,
  updatePositionComposer,
  type PositionComposerParams,
} from '../../core/body/positionComposer.js';
import { createTargetPose } from '../../core/TargetPose.js';
import { readTargetExtent } from '../readTargetExtent.js';
import { readTargetPose } from '../readTargetPose.js';
import type { Target } from '../resolve/Target.js';
import type { TargetSlot } from '../resolve/TargetRegistry.js';
import type { Vector3Like } from '../resolve/resolveVector3.js';

export type PositionComposerOptions = Partial<PositionComposerParams> & {
  /** Target radius used when composing its visible edge. Ignored when `size` is set. */
  radius?: number;
  /** Target dimensions used when composing its visible edges. Measured automatically for meshes. */
  size?: Vector3Like;
};

/** Positions the camera using depth and screen-space composition. */
export class PositionComposerBody implements PositionComposerParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  declare cameraDistance: number;
  declare screenPosition: [number, number];
  declare aspect: number;
  declare deadZone: [number, number];
  declare damping: DampingConstant;
  declare hardLimit: [number, number];
  declare depthDeadZone: number;
  declare maxSpeed: number;
  declare lookaheadTime: number;
  declare lookaheadSmoothing: number;
  declare lookaheadIgnoreY: boolean;
  radius?: number;
  size?: Vector3Like;

  readonly state = createPositionComposerState();
  private readonly pose = createTargetPose();
  private lastTarget: Target = undefined;
  private forceSizeRecalculation = false;

  constructor(target: Target, options?: PositionComposerOptions) {
    this.target = target;
    Object.assign(this, createPositionComposerParams(options));
    this.radius = options?.radius;
    this.size = options?.size;
  }

  /** Forces the auto-detected `size` to be re-measured on the next `update()`, then goes back to the cached value. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  primeFrom = (position: Vec3): void => primePositionComposer(this.state, this, position);

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, false);
    if (resolved) {
      if (this.target !== this.lastTarget) retargetPositionComposer(this.state);
      this.lastTarget = this.target;
      readTargetExtent(
        this.pose.extent,
        this.target,
        this.size,
        this.radius,
        this.forceSizeRecalculation,
        this.targetSlot,
      );
      this.forceSizeRecalculation = false;
    }
    updatePositionComposer(out, this.state, this, resolved ? this.pose : null, dt, justActivated);
  };
}
