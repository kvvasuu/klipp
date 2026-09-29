import type { Quat, Vec3 } from 'math';
import type { CameraState } from '../../core/CameraState';
import type { DampingConstant } from '../../core/damping/Damper';
import {
  createRotationComposerState,
  primeRotationComposer,
  rotationComposerNeedsExtent,
  updateRotationComposer,
  type RotationComposerParams,
} from '../../core/aim/rotationComposer';
import { createTargetExtent } from '../../core/TargetExtent';
import { createTargetPose } from '../../core/TargetPose';
import { readTargetExtent } from '../readTargetExtent';
import { readTargetPose } from '../readTargetPose';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';
import type { Vector3Like } from '../resolve/resolveVector3';

/** Rotates the camera to place a target at `screenPosition`. */
export class RotationComposerAim implements RotationComposerParams {
  target: Target;
  targetSlot: TargetSlot | null = null;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  maxSpeed: number;
  hardLimit: [number, number];
  targetOffset: Vec3;
  radius?: number;
  size?: Vector3Like;
  lookaheadTime: number;
  lookaheadSmoothing: number;
  lookaheadIgnoreY: boolean;

  readonly state = createRotationComposerState();
  private readonly pose = createTargetPose();
  private readonly extent = createTargetExtent();
  private lastTarget: Target = undefined;
  private forceSizeRecalculation = false;

  constructor(
    target: Target,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
    targetOffset: Vec3 = [0, 0, 0],
    radius?: number,
    size?: Vector3Like,
    lookaheadTime = 0,
    lookaheadSmoothing = 1,
    lookaheadIgnoreY = false,
    maxSpeed = Infinity,
  ) {
    this.target = target;
    this.screenPosition = screenPosition;
    this.aspect = aspect;
    this.deadZone = deadZone;
    this.damping = damping;
    this.hardLimit = hardLimit;
    this.targetOffset = targetOffset;
    this.radius = radius;
    this.size = size;
    this.lookaheadTime = lookaheadTime;
    this.lookaheadSmoothing = lookaheadSmoothing;
    this.lookaheadIgnoreY = lookaheadIgnoreY;
    this.maxSpeed = maxSpeed;
  }

  /** Forces the auto-detected `size` to be re-measured on the next `update()`, then goes back to the cached value. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  primeFrom = (rotation: Quat): void => primeRotationComposer(this.state, this, rotation);

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const resolved = readTargetPose(this.pose, this.target, this.targetSlot, true);
    const retarget = resolved && this.target !== this.lastTarget;
    if (resolved) {
      this.lastTarget = this.target;
      if (rotationComposerNeedsExtent(this)) {
        readTargetExtent(
          this.extent,
          this.target,
          this.size,
          this.radius,
          this.forceSizeRecalculation,
          this.targetSlot,
        );
      }
      this.forceSizeRecalculation = false;
    }
    const position = resolved ? this.pose.position : null;
    const rotation = resolved && this.pose.hasRotation ? this.pose.rotation : null;
    updateRotationComposer(out, this.state, this, position, rotation, this.extent, dt, justActivated, retarget);
  };
}
