import {
  clamp,
  deltaAngle,
  lerp,
  mat3,
  mat4,
  quat,
  spherical,
  vec3,
  vec4,
  type Mat3,
  type Mat4,
  type Quat,
  type Spherical,
  type Vec3,
} from 'math';
import type { CameraState } from '../CameraState';
import { BlendHints, hasBlendHint } from './BlendHints';

/** Reused quaternion for the sign-adjusted destination case. */
const negatedB: Quat = [0, 0, 0, 1];

const scratchOffsetA: Vec3 = [0, 0, 0];
const scratchOffsetB: Vec3 = [0, 0, 0];
const scratchSphericalA: Spherical = [0, 0, 0];
const scratchSphericalB: Spherical = [0, 0, 0];
const scratchSphericalOut: Spherical = [0, 0, 0];
const scratchLookMatrix: Mat4 = mat4.create();
const scratchRotationMatrix: Mat3 = mat3.create();
const scratchLookAtCurrent: Quat = [0, 0, 0, 1];
const scratchDeltaA: Quat = [0, 0, 0, 1];
const scratchDeltaB: Quat = [0, 0, 0, 1];

/** Interpolates look-at rotation while preserving each state's additional aim offset. */
function lerpLookAtRotation(out: Quat, a: CameraState, b: CameraState, t: number, current: CameraState): void {
  quat.multiply(scratchDeltaA, quat.conjugate(scratchDeltaA, lookAtRotation(scratchDeltaA, a)), a.quaternion);
  quat.multiply(scratchDeltaB, quat.conjugate(scratchDeltaB, lookAtRotation(scratchDeltaB, b)), b.quaternion);
  lookAtRotation(scratchLookAtCurrent, current);
  quat.multiply(out, scratchLookAtCurrent, quat.slerp(out, scratchDeltaA, scratchDeltaB, t));
}

/** The rotation looking from `state.position` at `state.lookAtTarget`. */
function lookAtRotation(out: Quat, state: CameraState): Quat {
  mat4.targetTo(scratchLookMatrix, state.position, state.lookAtTarget, state.referenceUp);
  // Not quat.fromMat4: it allocates a Mat3 per call.
  return quat.fromMat3(out, mat3.fromMat4(scratchRotationMatrix, scratchLookMatrix));
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
  vec3.subtract(scratchOffsetA, a.position, a.target);
  vec3.subtract(scratchOffsetB, b.position, b.target);

  if (cylindrical) {
    const radiusA = Math.hypot(scratchOffsetA[0], scratchOffsetA[2]);
    const radiusB = Math.hypot(scratchOffsetB[0], scratchOffsetB[2]);
    const angle = blendAngle(
      Math.atan2(scratchOffsetA[0], scratchOffsetA[2]),
      radiusA,
      Math.atan2(scratchOffsetB[0], scratchOffsetB[2]),
      radiusB,
      t,
    );
    const radius = lerp(radiusA, radiusB, t);
    vec3.set(out, radius * Math.sin(angle), lerp(scratchOffsetA[1], scratchOffsetB[1], t), radius * Math.cos(angle));
  } else {
    spherical.setFromVec3(scratchSphericalA, scratchOffsetA);
    spherical.setFromVec3(scratchSphericalB, scratchOffsetB);
    const theta = blendAngle(scratchSphericalA[1], scratchSphericalA[0], scratchSphericalB[1], scratchSphericalB[0], t);
    const phi = blendAngle(scratchSphericalA[2], scratchSphericalA[0], scratchSphericalB[2], scratchSphericalB[0], t);
    spherical.toVec3(
      out,
      spherical.set(scratchSphericalOut, lerp(scratchSphericalA[0], scratchSphericalB[0], t), theta, phi),
    );
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
    vec4.set(out, fromX * s + toX * t, fromY * s + toY * t, fromZ * s + toZ * t, fromW * s + toW * t);
    // Opposite endpoints can cancel out; fall back to identity like three.js does.
    if (vec4.squaredLength(out) === 0) quat.identity(out);
    else quat.normalize(out, out);
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
