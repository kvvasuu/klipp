import { clamp, deltaAngle, lerp, vec3, vec4, type Quat, type Vec3 } from 'math';
import { Matrix4, Quaternion, Spherical, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { BlendHints, hasBlendHint } from './BlendHints';

/** Reused quaternion for the sign-adjusted destination case. */
const negatedB: Quat = [0, 0, 0, 1];

const scratchOffsetA = new Vector3();
const scratchOffsetB = new Vector3();
const scratchSphericalA = new Spherical();
const scratchSphericalB = new Spherical();
const scratchLookMatrix = new Matrix4();
const scratchLookAtCurrent = new Quaternion();
const scratchDeltaA = new Quaternion();
const scratchDeltaB = new Quaternion();
const scratchEye = new Vector3();
const scratchCenter = new Vector3();
const scratchUp = new Vector3();
const scratchRotation = new Quaternion();
const scratchTarget = new Vector3();
const scratchPosition = new Vector3();

/** Interpolates look-at rotation while preserving each state's additional aim offset. */
function lerpLookAtRotation(out: Quat, a: CameraState, b: CameraState, t: number, current: CameraState): void {
  lookAt(a.position, a.lookAtTarget, a.referenceUp);
  scratchDeltaA.setFromRotationMatrix(scratchLookMatrix).invert().multiply(scratchRotation.fromArray(a.quaternion));
  lookAt(b.position, b.lookAtTarget, b.referenceUp);
  scratchDeltaB.setFromRotationMatrix(scratchLookMatrix).invert().multiply(scratchRotation.fromArray(b.quaternion));

  lookAt(current.position, current.lookAtTarget, current.referenceUp);
  scratchLookAtCurrent.setFromRotationMatrix(scratchLookMatrix);
  scratchRotation.slerpQuaternions(scratchDeltaA, scratchDeltaB, t).premultiply(scratchLookAtCurrent).toArray(out);
}

function lookAt(eye: Vec3, center: Vec3, up: Vec3): void {
  scratchLookMatrix.lookAt(scratchEye.fromArray(eye), scratchCenter.fromArray(center), scratchUp.fromArray(up));
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
function lerpPositionAroundTarget(out: Vec3, a: CameraState, b: CameraState, t: number, cylindrical: boolean): void {
  scratchOffsetA.fromArray(a.position).sub(scratchTarget.fromArray(a.target));
  scratchOffsetB.fromArray(b.position).sub(scratchTarget.fromArray(b.target));

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
    vec3.set(out, radius * Math.sin(angle), lerp(scratchOffsetA.y, scratchOffsetB.y, t), radius * Math.cos(angle));
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
    scratchPosition.setFromSphericalCoords(lerp(scratchSphericalA.radius, scratchSphericalB.radius, t), phi, theta);
    scratchPosition.toArray(out);
  }

  out[0] += lerp(a.target[0], b.target[0], t);
  out[1] += lerp(a.target[1], b.target[1], t);
  out[2] += lerp(a.target[2], b.target[2], t);
}

/** Slerps quaternions without changing the caller-selected sign of `to`. */
function slerpWithContinuity(out: Quat, from: Quat, to: Quat, t: number): void {
  const toX = to[0],
    toY = to[1],
    toZ = to[2],
    toW = to[3];

  const dot = clamp(from[0] * toX + from[1] * toY + from[2] * toZ + from[3] * toW, -1, 1);
  const fromX = from[0],
    fromY = from[1],
    fromZ = from[2],
    fromW = from[3];

  if (Math.abs(dot) < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    const s = Math.sin((1 - t) * theta) / sin;
    const u = Math.sin(t * theta) / sin;
    vec4.set(out, fromX * s + toX * u, fromY * s + toY * u, fromZ * s + toZ * u, fromW * s + toW * u);
  } else {
    // Lerp and normalize when the angle is near zero or pi.
    const s = 1 - t;
    scratchRotation.set(fromX * s + toX * t, fromY * s + toY * t, fromZ * s + toZ * t, fromW * s + toW * t);
    scratchRotation.normalize().toArray(out);
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
    vec3.lerp(out.position, a.position, b.position, clamped);
  }

  if (hasTarget) vec3.lerp(out.target, a.target, b.target, clamped);
  out.hasTarget = hasTarget;
  if (hasLookAtTarget) vec3.lerp(out.lookAtTarget, a.lookAtTarget, b.lookAtTarget, clamped);
  out.hasLookAtTarget = hasLookAtTarget;
  vec3.normalize(out.referenceUp, vec3.lerp(out.referenceUp, a.referenceUp, b.referenceUp, clamped));

  if (useLookAtRotation) {
    lerpLookAtRotation(out.quaternion, a, b, clamped, out);
  } else {
    const bQuaternion =
      vec4.dot(out.quaternion, b.quaternion) < 0
        ? vec4.set(negatedB, -b.quaternion[0], -b.quaternion[1], -b.quaternion[2], -b.quaternion[3])
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
