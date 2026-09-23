import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { clamp, degreesToRadians } from 'math';
import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';
import { Predictor } from '../damping/Predictor';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetHalfExtents, resolveTargetPosition, type Target } from '../resolve/Target';

const scratchForward = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
const scratchTargetPosition = new Vector3();
const scratchRelative = new Vector3();
const scratchDesiredPosition = new Vector3();
const scratchLookaheadDelta = new Vector3();
/** Reused target extents. */
const scratchExtents: [number, number] = [0, 0];

/** Positions the camera using depth and screen-space composition. */
export class PositionComposerBody {
  target: Target;
  cameraDistance: number;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  hardLimit: [number, number];
  depthDeadZone: number;
  maxSpeed: number;
  radius?: number;
  size?: Vector3Like;
  lookaheadTime: number;
  lookaheadSmoothing: number;
  lookaheadIgnoreY: boolean;

  private readonly damper = new Vector3Damper();
  private readonly depthDamper = new Damper();
  private readonly predictor = new Predictor();
  private lastLookaheadTarget: Target = undefined;
  private forceSizeRecalculation = false;
  /** Last desired lateral position used while the target remains inside the dead zone. */
  private hasActiveDesiredPosition = false;
  private readonly lastActiveDesiredPosition = new Vector3();
  private primed = false;

  constructor(
    target: Target,
    cameraDistance = 10,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
    radius?: number,
    size?: Vector3Like,
    depthDeadZone = 0,
    lookaheadTime = 0,
    lookaheadSmoothing = 1,
    lookaheadIgnoreY = false,
    maxSpeed = Infinity,
  ) {
    this.target = target;
    this.cameraDistance = cameraDistance;
    this.screenPosition = screenPosition;
    this.aspect = aspect;
    this.deadZone = deadZone;
    this.damping = damping;
    this.hardLimit = hardLimit;
    this.radius = radius;
    this.size = size;
    this.depthDeadZone = depthDeadZone;
    this.lookaheadTime = lookaheadTime;
    this.lookaheadSmoothing = lookaheadSmoothing;
    this.lookaheadIgnoreY = lookaheadIgnoreY;
    this.maxSpeed = maxSpeed;
  }

  /** Forces the auto-detected `size` to be re-measured on the NEXT `update()` call, then goes back to the
   *  cheap cached behavior - for a target that deforms occasionally (an event), not continuously. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  primeFrom = (position: Vector3): void => {
    this.damper.update(position, position, this.damping, 0);
    this.depthDamper.update(0, 0, this.damping, 0);
    this.primed = true;
  };

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const skipReset = justActivated && this.primed;
    if (justActivated) this.primed = false;

    if (!resolveTargetPosition(scratchTargetPosition, this.target)) return;

    if (justActivated || this.target !== this.lastLookaheadTarget) {
      this.lastLookaheadTarget = this.target;
      this.predictor.reset();
    }
    this.predictor.addPosition(scratchTargetPosition, dt, this.lookaheadSmoothing);
    if (this.lookaheadTime > 0) {
      this.predictor.predictPositionDelta(scratchLookaheadDelta, this.lookaheadTime);
      if (this.lookaheadIgnoreY) scratchLookaheadDelta.y = 0;
      scratchTargetPosition.add(scratchLookaheadDelta);
    }

    out.target.copy(scratchTargetPosition);
    out.hasTarget = true;

    scratchForward.set(0, 0, -1).applyQuaternion(out.quaternion);
    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);

    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const currentDepth = scratchRelative.dot(scratchForward);

    let desiredDepth = this.cameraDistance;
    let insideDepthDeadZone = false;

    // A fresh activation has no meaningful previous camera position for this check.
    if (!justActivated && this.depthDeadZone > 0) {
      const depthError = currentDepth - this.cameraDistance;
      insideDepthDeadZone = Math.abs(depthError) <= this.depthDeadZone;
      if (!insideDepthDeadZone) {
        desiredDepth = this.cameraDistance + clamp(depthError, -this.depthDeadZone, this.depthDeadZone);
      }
    }

    // Recompute the desired depth so target motion remains visible inside the dead zone.
    if (!insideDepthDeadZone) {
      if (justActivated && !skipReset) this.depthDamper.reset();
      const instant = typeof this.damping === 'number' && this.damping <= 0;
      const dampedDepth = instant
        ? desiredDepth
        : this.depthDamper.update(currentDepth, desiredDepth, this.damping, dt, this.maxSpeed);
      out.position.addScaledVector(scratchForward, currentDepth - dampedDepth);
    }

    // Shift laterally to screenPosition or the dead-zone edge.
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const halfHeight = this.cameraDistance * Math.tan(degreesToRadians(out.fov) / 2);
    const halfWidth = halfHeight * this.aspect;

    resolveTargetHalfExtents(
      scratchExtents,
      this.target,
      this.size,
      this.radius,
      scratchRight,
      scratchUp,
      this.forceSizeRecalculation,
    );
    this.forceSizeRecalculation = false;
    const extentX = scratchExtents[0] / halfWidth;
    const extentY = scratchExtents[1] / halfHeight;

    const currentRight = scratchRelative.dot(scratchRight);
    const currentUp = scratchRelative.dot(scratchUp);

    let desiredScreenX = this.screenPosition[0];
    let desiredScreenY = this.screenPosition[1];
    let insideDeadZone = false;

    // A fresh activation has no meaningful previous camera position for this check.
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      const halfDeadWidth = this.deadZone[0];
      const halfDeadHeight = this.deadZone[1];
      // Cap the extent to prevent an oversized target from overshooting the zone.
      const deadExtentX = Math.min(extentX, halfDeadWidth);
      const deadExtentY = Math.min(extentY, halfDeadHeight);

      const errorX = currentRight / halfWidth - this.screenPosition[0];
      const errorY = currentUp / halfHeight - this.screenPosition[1];
      // Check the target's leading edge, not only its center.
      const edgeErrorX = errorX + Math.sign(errorX) * deadExtentX;
      const edgeErrorY = errorY + Math.sign(errorY) * deadExtentY;
      insideDeadZone = Math.abs(edgeErrorX) <= halfDeadWidth && Math.abs(edgeErrorY) <= halfDeadHeight;

      if (!insideDeadZone) {
        desiredScreenX =
          this.screenPosition[0] + clamp(edgeErrorX, -halfDeadWidth, halfDeadWidth) - Math.sign(errorX) * deadExtentX;
        desiredScreenY =
          this.screenPosition[1] + clamp(edgeErrorY, -halfDeadHeight, halfDeadHeight) - Math.sign(errorY) * deadExtentY;
      }
    }

    // Enforce hardLimit independently of the dead zone.
    if (!insideDeadZone) {
      scratchDesiredPosition
        .copy(out.position)
        .addScaledVector(scratchRight, currentRight - desiredScreenX * halfWidth)
        .addScaledVector(scratchUp, currentUp - desiredScreenY * halfHeight);
      this.lastActiveDesiredPosition.copy(scratchDesiredPosition);
      this.hasActiveDesiredPosition = true;
    } else if (this.hasActiveDesiredPosition) {
      // Keep damping toward the last active target instead of the current camera position.
      scratchDesiredPosition.copy(this.lastActiveDesiredPosition);
    } else {
      scratchDesiredPosition.copy(out.position); // No previous target means no correction.
    }

    if (justActivated && !skipReset) this.damper.reset();
    this.damper.update(out.position, scratchDesiredPosition, this.damping, dt, this.maxSpeed);

    if (this.hardLimit[0] <= 0 && this.hardLimit[1] <= 0) return;

    // undamped pass: same stage-2 math again, clamped to hardLimit instead of the dead zone edge
    scratchRelative.copy(scratchTargetPosition).sub(out.position);
    const afterRight = scratchRelative.dot(scratchRight);
    const afterUp = scratchRelative.dot(scratchUp);

    const halfLimitWidth = this.hardLimit[0];
    const halfLimitHeight = this.hardLimit[1];
    // same overshoot cap as the dead zone pass, against this box's own half-size
    const limitExtentX = Math.min(extentX, halfLimitWidth);
    const limitExtentY = Math.min(extentY, halfLimitHeight);

    const limitErrorX = afterRight / halfWidth - this.screenPosition[0];
    const limitErrorY = afterUp / halfHeight - this.screenPosition[1];
    const limitEdgeErrorX = limitErrorX + Math.sign(limitErrorX) * limitExtentX;
    const limitEdgeErrorY = limitErrorY + Math.sign(limitErrorY) * limitExtentY;
    if (Math.abs(limitEdgeErrorX) <= halfLimitWidth && Math.abs(limitEdgeErrorY) <= halfLimitHeight) return;

    const clampedX =
      this.screenPosition[0] +
      clamp(limitEdgeErrorX, -halfLimitWidth, halfLimitWidth) -
      Math.sign(limitErrorX) * limitExtentX;
    const clampedY =
      this.screenPosition[1] +
      clamp(limitEdgeErrorY, -halfLimitHeight, halfLimitHeight) -
      Math.sign(limitErrorY) * limitExtentY;
    out.position
      .addScaledVector(scratchRight, afterRight - clampedX * halfWidth)
      .addScaledVector(scratchUp, afterUp - clampedY * halfHeight);
  };
}
