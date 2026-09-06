import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { clamp, degreesToRadians } from 'math';
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetHalfExtents, resolveTargetPosition, resolveTargetRotation, type Target } from '../resolve/Target';

const worldUp = new Vector3(0, 1, 0);
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
/** `[halfExtentRight, halfExtentUp]`, in WORLD units - reused scratch, no allocation. Converted to an
 *  angular (screen-fraction) extent at the point of use, since unlike `PositionComposerBody` the target
 *  here can sit at any, changing distance - there's no fixed `cameraDistance` to divide by. */
const scratchExtents: [number, number] = [0, 0];
/** Matches `Damper.update`'s own `epsilon` — the gap at which it declares the distance arrived. */
const DISTANCE_EPSILON = 1e-4;

/** `[x, y, depth]` of a world point in a camera's local screen space — reused scratch, no allocation.
 *  `depth <= 0` means the point is behind the camera (degenerate). */
const scratchScreenPoint: [number, number, number] = [0, 0, 0];

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

/** Base "look straight at target" orientation, composed toward a desired screen point — the one exact
 *  `setFromUnitVectors` operation both the dead zone and hard limit passes need, just for different
 *  desired points (see `RotationComposerAim`'s doc comment for why it can't be split into yaw+pitch). */
function composeQuaternionForScreenPoint(
  out: Quaternion,
  cameraPosition: Vector3,
  targetPosition: Vector3,
  desiredX: number,
  desiredY: number,
  tanHalfFovH: number,
  tanHalfFovV: number,
): void {
  scratchLookMatrix.lookAt(cameraPosition, targetPosition, worldUp);
  out.setFromRotationMatrix(scratchLookMatrix);

  if (desiredX !== 0 || desiredY !== 0) {
    scratchDesiredLocalDir.set(desiredX * tanHalfFovH, desiredY * tanHalfFovV, -1).normalize();
    scratchDelta.setFromUnitVectors(scratchDesiredLocalDir, forwardAxis);
    out.multiply(scratchDelta);
  }
}

/**
 * Rotation-only Aim: finds the ONE exact rotation (`Quaternion.setFromUnitVectors`, not separate yaw+pitch
 * — those don't commute) that puts the target at `screenPosition` (or the `deadZone`/`hardLimit` edge).
 *
 * Runs AFTER Body, so `out.position` here is already this frame's — unlike `PositionComposerBody`, which
 * reads last frame's `out.quaternion`.
 *
 * **Paired with `PositionComposer` on the same `screenPosition`, BOTH need a non-zero `deadZone`** — with
 * either side still hard, that side perfectly compensates every frame, so the other's dead zone check
 * never reacts.
 *
 * `radius`/`size` give the target an angular extent instead of a point: `deadZone`/`hardLimit` react to
 * its nearest edge, capped to the zone's own half-size so an oversized target settles on dead center
 * instead of oscillating - same idea as `PositionComposerBody`'s, but converted through the target's
 * actual, possibly-changing distance (`computeScreenPoint`'s `depth`) rather than a fixed `cameraDistance`.
 */
export class RotationComposerAim {
  target: Target;
  screenPosition: [number, number];
  aspect: number;
  deadZone: [number, number];
  damping: DampingConstant;
  hardLimit: [number, number];
  targetOffset: Vector3;
  radius?: number;
  size?: Vector3Like;

  private readonly damper = new QuaternionDamper();
  /** Direction is damped as a ROTATION, not by lerping the point: a straight line between two look-at
   *  points can pass through the camera, where the look-at is degenerate and flips 180°. */
  private readonly lookAtDirectionDamper = new QuaternionDamper();
  private readonly lookAtDistanceDamper = new Damper();
  private readonly publishedLookRotation = new Quaternion();
  private publishedDistance = 0;
  private forceSizeRecalculation = false;

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
  }

  /** Forces the auto-detected `size` to be re-measured on the NEXT `update()` call, then goes back to the
   *  cheap cached behavior - for a target that deforms occasionally (an event), not continuously. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(scratchTargetPosition, this.target)) return;
    // captured up front so an early return below can't leave it lit for a later, unrelated frame
    const recalculateSizeThisFrame = this.forceSizeRecalculation;
    this.forceSizeRecalculation = false;

    if (!resolveTargetRotation(scratchTargetRotation, this.target)) scratchTargetRotation.identity();
    scratchTargetPosition.add(scratchOffset.copy(this.targetOffset).applyQuaternion(scratchTargetRotation));

    // `lookAtTarget` is published through the SAME `damping` as the rotation below, because
    // `lerpLookAtRotation` blends on how far a camera's rotation deviates from pointing at it — publishing
    // the raw target makes that deviation jump on every retarget, popping any blend in progress. Only what
    // this Aim PUBLISHES is smoothed; the aiming math keeps using the raw `scratchTargetPosition`.
    if (justActivated) {
      this.lookAtDirectionDamper.reset();
      this.lookAtDistanceDamper.reset();
    }
    scratchLookMatrix.lookAt(out.position, scratchTargetPosition, worldUp);
    scratchTargetQuaternion.setFromRotationMatrix(scratchLookMatrix);
    this.lookAtDirectionDamper.update(this.publishedLookRotation, scratchTargetQuaternion, this.damping, dt);
    const targetDistance = out.position.distanceTo(scratchTargetPosition);
    this.publishedDistance = this.lookAtDistanceDamper.update(this.publishedDistance, targetDistance, this.damping, dt);
    // BOTH parts have to have caught up: the two dampers converge on their own thresholds, and a target
    // moved straight along the current look direction converges the rotation one instantly while the
    // distance is still easing — publishing the target then would jump the point along that ray
    if (
      this.publishedLookRotation.equals(scratchTargetQuaternion) &&
      Math.abs(this.publishedDistance - targetDistance) < DISTANCE_EPSILON
    ) {
      // nothing lagging (`damping: 0`, or caught up) — publish the target itself, so the common case
      // stays exact instead of picking up matrix→quaternion→ray round-trip error
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

    // justActivated skips the dead zone check entirely — it exists to judge whether `out.quaternion`'s
    // CURRENT orientation has drifted from screenPosition, but on a fresh activation that orientation is
    // whatever an earlier, unrelated activation left behind, not a meaningful "current" to stay near
    if (!justActivated && (this.deadZone[0] > 0 || this.deadZone[1] > 0)) {
      // where does the target CURRENTLY appear, given out's existing (pre-this-frame) orientation?
      scratchOutInverse.copy(out.quaternion).invert();
      const [screenX, screenY, depth] = computeScreenPoint(
        out.position,
        scratchOutInverse,
        scratchTargetPosition,
        tanHalfFovH,
        tanHalfFovV,
      );

      if (depth > 1e-6) {
        const halfWidth = this.deadZone[0] / 2;
        const halfHeight = this.deadZone[1] / 2;
        scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
        scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);
        resolveTargetHalfExtents(scratchExtents, this.target, this.size, this.radius, scratchRight, scratchUp, recalculateSizeThisFrame);
        // capped to the zone's own half-size, or an oversized target would overshoot center and oscillate
        const extentX = Math.min(scratchExtents[0] / depth / tanHalfFovH, halfWidth);
        const extentY = Math.min(scratchExtents[1] / depth / tanHalfFovV, halfHeight);

        const errorX = screenX - this.screenPosition[0];
        const errorY = screenY - this.screenPosition[1];
        // the leading edge (center error + extent) must stay inside the zone, not just the center
        const edgeErrorX = errorX + Math.sign(errorX) * extentX;
        const edgeErrorY = errorY + Math.sign(errorY) * extentY;
        insideDeadZone = Math.abs(edgeErrorX) <= halfWidth && Math.abs(edgeErrorY) <= halfHeight;

        if (!insideDeadZone) {
          desiredX = this.screenPosition[0] + clamp(edgeErrorX, -halfWidth, halfWidth) - Math.sign(errorX) * extentX;
          desiredY = this.screenPosition[1] + clamp(edgeErrorY, -halfHeight, halfHeight) - Math.sign(errorY) * extentY;
        }
      }
      // depth <= 0 (target behind camera): degenerate, fall through and correct all the way to screenPosition
    }

    // still falls through to the hardLimit pass below even when inside the dead zone (no reaction here)
    // — hardLimit is a SEPARATE, wider box that must hold regardless of the dead zone, not just when the
    // dead zone itself happened to react this frame (e.g. a misconfigured hardLimit smaller than
    // deadZone would otherwise never actually enforce anything)
    if (!insideDeadZone) {
      composeQuaternionForScreenPoint(
        scratchTargetQuaternion,
        out.position,
        scratchTargetPosition,
        desiredX,
        desiredY,
        tanHalfFovH,
        tanHalfFovV,
      );
      if (justActivated) this.damper.reset();
      this.damper.update(out.quaternion, scratchTargetQuaternion, this.damping, dt);
    }

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

    const halfLimitWidth = this.hardLimit[0] / 2;
    const halfLimitHeight = this.hardLimit[1] / 2;
    scratchRight.set(1, 0, 0).applyQuaternion(out.quaternion);
    scratchUp.set(0, 1, 0).applyQuaternion(out.quaternion);
    resolveTargetHalfExtents(scratchExtents, this.target, this.size, this.radius, scratchRight, scratchUp, recalculateSizeThisFrame);
    // same overshoot cap as the dead zone pass, against this box's own half-size
    const limitExtentX = Math.min(scratchExtents[0] / depth / tanHalfFovH, halfLimitWidth);
    const limitExtentY = Math.min(scratchExtents[1] / depth / tanHalfFovV, halfLimitHeight);

    const errorX = screenX - this.screenPosition[0];
    const errorY = screenY - this.screenPosition[1];
    const edgeErrorX = errorX + Math.sign(errorX) * limitExtentX;
    const edgeErrorY = errorY + Math.sign(errorY) * limitExtentY;
    if (Math.abs(edgeErrorX) <= halfLimitWidth && Math.abs(edgeErrorY) <= halfLimitHeight) return;

    const clampedX = this.screenPosition[0] + clamp(edgeErrorX, -halfLimitWidth, halfLimitWidth) - Math.sign(errorX) * limitExtentX;
    const clampedY = this.screenPosition[1] + clamp(edgeErrorY, -halfLimitHeight, halfLimitHeight) - Math.sign(errorY) * limitExtentY;
    composeQuaternionForScreenPoint(
      scratchHardLimitQuaternion,
      out.position,
      scratchTargetPosition,
      clampedX,
      clampedY,
      tanHalfFovH,
      tanHalfFovV,
    );
    out.quaternion.copy(scratchHardLimitQuaternion);
  };
}
