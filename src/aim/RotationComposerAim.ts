import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { clamp, degreesToRadians } from 'math';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';
import { Predictor } from '../damping/Predictor';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetHalfExtents, resolveTargetPosition, resolveTargetRotation, type Target } from '../resolve/Target';

const forwardAxis = new Vector3(0, 0, -1);
const scratchTargetPosition = new Vector3();
const scratchTargetRotation = new Quaternion();
const scratchOffset = new Vector3();
const scratchLookMatrix = new Matrix4();
const scratchDesiredLocalDir = new Vector3();
const scratchDelta = new Quaternion();
const scratchTargetQuaternion = new Quaternion();
const scratchHardLimitQuaternion = new Quaternion();
const scratchOutInverse = new Quaternion();
const scratchLocalDir = new Vector3();
const scratchRight = new Vector3();
const scratchUp = new Vector3();
/** Reused world-space target extents, converted to screen fractions at the point of use. */
const scratchExtents: [number, number] = [0, 0];
/** Matches `Damper.update`'s own `epsilon` - the gap at which it declares the distance arrived. */
const DISTANCE_EPSILON = 1e-4;

/** `[x, y, depth]` of a world point in a camera's local screen space - reused scratch, no allocation.
 *  `depth <= 0` means the point is behind the camera (degenerate). */
const scratchScreenPoint: [number, number, number] = [0, 0, 0];
const scratchLookaheadDelta = new Vector3();

function computeScreenPoint(
  cameraPosition: Vector3,
  cameraQuaternionInverse: Quaternion,
  worldPoint: Vector3,
  tanHalfFovH: number,
  tanHalfFovV: number,
): readonly [number, number, number] {
  scratchLocalDir.copy(worldPoint).sub(cameraPosition).applyQuaternion(cameraQuaternionInverse);
  const depth = -scratchLocalDir.z;
  scratchScreenPoint[0] = scratchLocalDir.x / depth / tanHalfFovH;
  scratchScreenPoint[1] = scratchLocalDir.y / depth / tanHalfFovV;
  scratchScreenPoint[2] = depth;
  return scratchScreenPoint;
}

/** Builds a look-at rotation with an optional screen-space offset. */
function composeQuaternionForScreenPoint(
  out: Quaternion,
  cameraPosition: Vector3,
  targetPosition: Vector3,
  referenceUp: Vector3,
  desiredX: number,
  desiredY: number,
  tanHalfFovH: number,
  tanHalfFovV: number,
): void {
  scratchLookMatrix.lookAt(cameraPosition, targetPosition, referenceUp);
  out.setFromRotationMatrix(scratchLookMatrix);

  if (desiredX !== 0 || desiredY !== 0) {
    scratchDesiredLocalDir.set(desiredX * tanHalfFovH, desiredY * tanHalfFovV, -1).normalize();
    scratchDelta.setFromUnitVectors(scratchDesiredLocalDir, forwardAxis);
    out.multiply(scratchDelta);
  }
}

/** Rotates the camera to place a target at `screenPosition`. */
export class RotationComposerAim {
  target: Target;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  maxSpeed: number;
  hardLimit: [number, number];
  targetOffset: Vector3;
  radius?: number;
  size?: Vector3Like;
  lookaheadTime: number;
  lookaheadSmoothing: number;
  lookaheadIgnoreY: boolean;

  private readonly damper = new QuaternionDamper();
  /** Damp the look-at direction as a rotation to avoid degenerate intermediate points. */
  private readonly lookAtDirectionDamper = new QuaternionDamper();
  private readonly lookAtDistanceDamper = new Damper();
  private readonly publishedLookRotation = new Quaternion();
  private publishedDistance = 0;
  private forceSizeRecalculation = false;
  /** Last desired rotation used while the target remains inside the dead zone. */
  private hasActiveDesiredRotation = false;
  private readonly lastActiveDesiredRotation = new Quaternion();
  private readonly predictor = new Predictor();
  private lastLookaheadTarget: Target = undefined;
  private primed = false;

  constructor(
    target: Target,
    screenPosition: [number, number] = [0, 0],
    aspect = 1,
    deadZone: [number, number] = [0, 0],
    damping: DampingConstant = 0,
    hardLimit: [number, number] = [0, 0],
    targetOffset: Vector3 = new Vector3(),
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

  /** Forces the auto-detected `size` to be re-measured on the NEXT `update()` call, then goes back to the
   *  cheap cached behavior - for a target that deforms occasionally (an event), not continuously. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  primeFrom = (rotation: Quaternion): void => {
    this.damper.update(rotation, rotation, this.damping, 0);
    this.primed = true;
  };

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    const skipReset = justActivated && this.primed;
    if (justActivated) this.primed = false;

    if (!resolveTargetPosition(scratchTargetPosition, this.target)) return;
    // Capture this before any early return so it applies to one update only.
    const recalculateSizeThisFrame = this.forceSizeRecalculation;
    this.forceSizeRecalculation = false;

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

    if (!resolveTargetRotation(scratchTargetRotation, this.target)) scratchTargetRotation.identity();
    scratchTargetPosition.add(scratchOffset.copy(this.targetOffset).applyQuaternion(scratchTargetRotation));

    // Publish the damped look-at point so blends do not jump to the raw target position.
    if (justActivated) {
      this.lookAtDirectionDamper.reset();
      this.lookAtDistanceDamper.reset();
    }
    scratchLookMatrix.lookAt(out.position, scratchTargetPosition, out.referenceUp);
    scratchTargetQuaternion.setFromRotationMatrix(scratchLookMatrix);
    this.lookAtDirectionDamper.update(
      this.publishedLookRotation,
      scratchTargetQuaternion,
      this.damping,
      dt,
      this.maxSpeed,
    );
    const targetDistance = out.position.distanceTo(scratchTargetPosition);
    this.publishedDistance = this.lookAtDistanceDamper.update(this.publishedDistance, targetDistance, this.damping, dt);
    // Publish the exact target only after both direction and distance have settled.
    if (
      this.publishedLookRotation.equals(scratchTargetQuaternion) &&
      Math.abs(this.publishedDistance - targetDistance) < DISTANCE_EPSILON
    ) {
      // Preserve the exact target when no damping remains.
      out.lookAtTarget.copy(scratchTargetPosition);
    } else {
      out.lookAtTarget
        .copy(forwardAxis)
        .applyQuaternion(this.publishedLookRotation)
        .multiplyScalar(this.publishedDistance)
        .add(out.position);
    }
    out.hasLookAtTarget = true;

    const halfFovV = degreesToRadians(out.fov) / 2;
    const tanHalfFovV = Math.tan(halfFovV);
    const tanHalfFovH = tanHalfFovV * this.aspect;

    let desiredX = this.screenPosition[0];
    let desiredY = this.screenPosition[1];
    let insideDeadZone = false;

    // A fresh activation has no meaningful previous orientation for a dead-zone check.
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      // Measure the target using the orientation from before this update.
      scratchOutInverse.copy(out.quaternion).invert();
      const [screenX, screenY, depth] = computeScreenPoint(
        out.position,
        scratchOutInverse,
        scratchTargetPosition,
        tanHalfFovH,
        tanHalfFovV,
      );

      if (depth > 1e-6) {
        const halfWidth = this.deadZone[0];
        const halfHeight = this.deadZone[1];
        scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
        scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);
        resolveTargetHalfExtents(
          scratchExtents,
          this.target,
          this.size,
          this.radius,
          scratchRight,
          scratchUp,
          recalculateSizeThisFrame,
        );
        // Cap the extent to prevent an oversized target from overshooting the zone.
        const extentX = Math.min(scratchExtents[0] / depth / tanHalfFovH, halfWidth);
        const extentY = Math.min(scratchExtents[1] / depth / tanHalfFovV, halfHeight);

        const errorX = screenX - this.screenPosition[0];
        const errorY = screenY - this.screenPosition[1];
        // Check the target's leading edge, not only its center.
        const edgeErrorX = errorX + Math.sign(errorX) * extentX;
        const edgeErrorY = errorY + Math.sign(errorY) * extentY;
        insideDeadZone = Math.abs(edgeErrorX) <= halfWidth && Math.abs(edgeErrorY) <= halfHeight;

        if (!insideDeadZone) {
          desiredX = this.screenPosition[0] + clamp(edgeErrorX, -halfWidth, halfWidth) - Math.sign(errorX) * extentX;
          desiredY = this.screenPosition[1] + clamp(edgeErrorY, -halfHeight, halfHeight) - Math.sign(errorY) * extentY;
        }
      }
      // A target behind the camera is corrected directly toward screenPosition.
    }

    // hardLimit is enforced independently of the dead zone.
    if (!insideDeadZone) {
      composeQuaternionForScreenPoint(
        scratchTargetQuaternion,
        out.position,
        scratchTargetPosition,
        out.referenceUp,
        desiredX,
        desiredY,
        tanHalfFovH,
        tanHalfFovV,
      );
      this.lastActiveDesiredRotation.copy(scratchTargetQuaternion);
      this.hasActiveDesiredRotation = true;
    } else if (this.hasActiveDesiredRotation) {
      // Keep damping toward the last active target instead of the current camera rotation.
      scratchTargetQuaternion.copy(this.lastActiveDesiredRotation);
    } else {
      scratchTargetQuaternion.copy(out.quaternion); // No previous target means no correction.
    }

    if (justActivated && !skipReset) this.damper.reset();
    this.damper.update(out.quaternion, scratchTargetQuaternion, this.damping, dt, this.maxSpeed);

    if (this.hardLimit[0] <= 0 && this.hardLimit[1] <= 0) return;

    scratchOutInverse.copy(out.quaternion).invert();
    const [screenX, screenY, depth] = computeScreenPoint(
      out.position,
      scratchOutInverse,
      scratchTargetPosition,
      tanHalfFovH,
      tanHalfFovV,
    );
    if (depth <= 1e-6) return;

    const halfLimitWidth = this.hardLimit[0];
    const halfLimitHeight = this.hardLimit[1];
    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);
    resolveTargetHalfExtents(
      scratchExtents,
      this.target,
      this.size,
      this.radius,
      scratchRight,
      scratchUp,
      recalculateSizeThisFrame,
    );
    // Cap the extent to prevent an oversized target from overshooting the limit.
    const limitExtentX = Math.min(scratchExtents[0] / depth / tanHalfFovH, halfLimitWidth);
    const limitExtentY = Math.min(scratchExtents[1] / depth / tanHalfFovV, halfLimitHeight);

    const errorX = screenX - this.screenPosition[0];
    const errorY = screenY - this.screenPosition[1];
    const edgeErrorX = errorX + Math.sign(errorX) * limitExtentX;
    const edgeErrorY = errorY + Math.sign(errorY) * limitExtentY;
    if (Math.abs(edgeErrorX) <= halfLimitWidth && Math.abs(edgeErrorY) <= halfLimitHeight) return;

    const clampedX =
      this.screenPosition[0] + clamp(edgeErrorX, -halfLimitWidth, halfLimitWidth) - Math.sign(errorX) * limitExtentX;
    const clampedY =
      this.screenPosition[1] + clamp(edgeErrorY, -halfLimitHeight, halfLimitHeight) - Math.sign(errorY) * limitExtentY;
    composeQuaternionForScreenPoint(
      scratchHardLimitQuaternion,
      out.position,
      scratchTargetPosition,
      out.referenceUp,
      clampedX,
      clampedY,
      tanHalfFovH,
      tanHalfFovV,
    );
    out.quaternion.copy(scratchHardLimitQuaternion);
  };
}
