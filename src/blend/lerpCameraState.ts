import { clamp, deltaAngle, lerp } from 'math';
import { Matrix4, Quaternion, Spherical, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { BlendHints, hasBlendHint } from './BlendHints';

/** Reused quaternion for the sign-adjusted destination case. */
const negatedB = new Quaternion();

const scratchOffsetA = new Vector3();
const scratchOffsetB = new Vector3();
const scratchSphericalA = new Spherical();
const scratchSphericalB = new Spherical();
const scratchLookMatrix = new Matrix4();
const scratchLookAtCurrent = new Quaternion();
const scratchDeltaA = new Quaternion();
const scratchDeltaB = new Quaternion();

/** Interpolates look-at rotation while preserving each state's additional aim offset. */
function lerpLookAtRotation(
  out: Quaternion,
  a: CameraState,
  b: CameraState,
  position: Vector3,
  lookAtTarget: Vector3,
  referenceUp: Vector3,
  t: number,
): void {
  scratchLookMatrix.lookAt(a.position, a.lookAtTarget, a.referenceUp);
  scratchDeltaA.setFromRotationMatrix(scratchLookMatrix).invert().multiply(a.quaternion);
  scratchLookMatrix.lookAt(b.position, b.lookAtTarget, b.referenceUp);
  scratchDeltaB.setFromRotationMatrix(scratchLookMatrix).invert().multiply(b.quaternion);

  scratchLookMatrix.lookAt(position, lookAtTarget, referenceUp);
  scratchLookAtCurrent.setFromRotationMatrix(scratchLookMatrix);
  out.slerpQuaternions(scratchDeltaA, scratchDeltaB, t).premultiply(scratchLookAtCurrent);
}

/** Below this radius, angular values are not meaningful. */
const RADIUS_EPSILON = 1e-4;

/** Keeps the valid side's angle when the other radius is too small. */
function blendAngle(angleA: number, radiusA: number, angleB: number, radiusB: number, t: number): number {
  const validA = radiusA >= RADIUS_EPSILON;
  const validB = radiusB >= RADIUS_EPSILON;
  if (validA && validB) return angleA + deltaAngle(angleA, angleB) * t;
  return validA ? angleA : angleB;
}

/** Interpolates the camera offset in spherical or cylindrical coordinates. */
function lerpPositionAroundTarget(out: Vector3, a: CameraState, b: CameraState, t: number, cylindrical: boolean): void {
  scratchOffsetA.copy(a.position).sub(a.target);
  scratchOffsetB.copy(b.position).sub(b.target);

  if (cylindrical) {
    const radiusA = Math.hypot(scratchOffsetA.x, scratchOffsetA.z);
    const radiusB = Math.hypot(scratchOffsetB.x, scratchOffsetB.z);
    const angle = blendAngle(
      Math.atan2(scratchOffsetA.x, scratchOffsetA.z),
      radiusA,
      Math.atan2(scratchOffsetB.x, scratchOffsetB.z),
      radiusB,
      t,
    );
    const radius = lerp(radiusA, radiusB, t);
    out.set(radius * Math.sin(angle), lerp(scratchOffsetA.y, scratchOffsetB.y, t), radius * Math.cos(angle));
  } else {
    scratchSphericalA.setFromVector3(scratchOffsetA);
    scratchSphericalB.setFromVector3(scratchOffsetB);
    const theta = blendAngle(
      scratchSphericalA.theta,
      scratchSphericalA.radius,
      scratchSphericalB.theta,
      scratchSphericalB.radius,
      t,
    );
    const phi = blendAngle(
      scratchSphericalA.phi,
      scratchSphericalA.radius,
      scratchSphericalB.phi,
      scratchSphericalB.radius,
      t,
    );
    out.setFromSphericalCoords(lerp(scratchSphericalA.radius, scratchSphericalB.radius, t), phi, theta);
  }

  out.x += lerp(a.target.x, b.target.x, t);
  out.y += lerp(a.target.y, b.target.y, t);
  out.z += lerp(a.target.z, b.target.z, t);
}

/** Slerps quaternions without changing the caller-selected sign of `to`. */
function slerpWithContinuity(out: Quaternion, from: Quaternion, to: Quaternion, t: number): void {
  const toX = to.x,
    toY = to.y,
    toZ = to.z,
    toW = to.w;

  const dot = clamp(from.x * toX + from.y * toY + from.z * toZ + from.w * toW, -1, 1);
  const fromX = from.x,
    fromY = from.y,
    fromZ = from.z,
    fromW = from.w;

  if (Math.abs(dot) < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    const s = Math.sin((1 - t) * theta) / sin;
    const u = Math.sin(t * theta) / sin;
    out.set(fromX * s + toX * u, fromY * s + toY * u, fromZ * s + toZ * u, fromW * s + toW * u);
  } else {
    // Lerp and normalize when the angle is near zero or pi.
    const s = 1 - t;
    out.set(fromX * s + toX * t, fromY * s + toY * t, fromZ * s + toZ * t, fromW * s + toW * t);
    out.normalize();
  }
}

/** Interpolates a camera state while preserving blend hints and rotation continuity. */
export function lerpCameraState(
  out: CameraState,
  a: CameraState,
  b: CameraState,
  t: number,
  hints: BlendHints = BlendHints.none,
): CameraState {
  const clamped = clamp(t, 0, 1);
  const hasTarget = a.hasTarget && b.hasTarget;
  const hasLookAtTarget = a.hasLookAtTarget && b.hasLookAtTarget;
  const spherical = hasTarget && hasBlendHint(hints, BlendHints.sphericalPosition);
  const cylindrical = hasTarget && !spherical && hasBlendHint(hints, BlendHints.cylindricalPosition);
  const useLookAtRotation = hasLookAtTarget && !hasBlendHint(hints, BlendHints.ignoreTarget);

  if (spherical || cylindrical) {
    lerpPositionAroundTarget(out.position, a, b, clamped, cylindrical);
  } else {
    out.position.lerpVectors(a.position, b.position, clamped);
  }

  if (hasTarget) out.target.lerpVectors(a.target, b.target, clamped);
  out.hasTarget = hasTarget;
  if (hasLookAtTarget) out.lookAtTarget.lerpVectors(a.lookAtTarget, b.lookAtTarget, clamped);
  out.hasLookAtTarget = hasLookAtTarget;
  out.referenceUp.lerpVectors(a.referenceUp, b.referenceUp, clamped).normalize();

  if (useLookAtRotation) {
    lerpLookAtRotation(out.quaternion, a, b, out.position, out.lookAtTarget, out.referenceUp, clamped);
  } else {
    const bQuaternion =
      out.quaternion.dot(b.quaternion) < 0
        ? negatedB.set(-b.quaternion.x, -b.quaternion.y, -b.quaternion.z, -b.quaternion.w)
        : b.quaternion;
    slerpWithContinuity(out.quaternion, a.quaternion, bQuaternion, clamped);
  }

  out.fov = lerp(a.fov, b.fov, clamped);
  out.near = lerp(a.near, b.near, clamped);
  out.far = lerp(a.far, b.far, clamped);
  out.viewOffset[0] = lerp(a.viewOffset[0], b.viewOffset[0], clamped);
  out.viewOffset[1] = lerp(a.viewOffset[1], b.viewOffset[1], clamped);
  return out;
}
