import { degreesToRadians, quat, radiansToDegrees, vec3, type Euler, type Quat, type Vec3 } from 'math';
import type { CameraState } from '../CameraState';
import { InputAxis } from '../input/InputAxis';

/** `pan` (yaw, wraps ±180°) and `tilt` (pitch, clamped) in degrees. */
export type PanTiltState = { pan: InputAxis; tilt: InputAxis };

export const createPanTiltState = (): PanTiltState => ({
  pan: new InputAxis(0, 0, [-180, 180], true),
  tilt: new InputAxis(0, 0, [-90, 90]),
});

const worldUp: Vec3 = [0, 1, 0];
const forwardAxis: Vec3 = [0, 0, -1];
const epsilon = 1e-6;

const scratchFrame: Quat = [0, 0, 0, 1];
const scratchRotation: Quat = [0, 0, 0, 1];
const scratchAxisRotation: Quat = [0, 0, 0, 1];
const scratchEuler: Euler = [0, 0, 0, 'yxz'];
const scratchForward: Vec3 = [0, 0, 0];
const scratchTargetForward: Vec3 = [0, 0, 0];
const scratchA: Vec3 = [0, 0, 0];
const scratchB: Vec3 = [0, 0, 0];
const scratchRight: Vec3 = [0, 0, 0];
const scratchCross: Vec3 = [0, 0, 0];

/** The frame pan and tilt are measured in: the target's rotation, or `referenceUp` alone. */
function referenceFrame(out: Quat, targetRotation: Quat | null, referenceUp: Vec3): Quat {
  return targetRotation ? quat.copy(out, targetRotation) : quat.rotationTo(out, worldUp, referenceUp);
}

/** Signed angle (degrees) from `from` to `to`, measured around `axis`. */
function signedAngleDeg(from: Vec3, to: Vec3, axis: Vec3): number {
  vec3.cross(scratchCross, from, to);
  return radiansToDegrees(Math.atan2(vec3.dot(scratchCross, axis), vec3.dot(from, to)));
}

function projectOnPlane(out: Vec3, v: Vec3, normal: Vec3): Vec3 {
  const lengthSq = vec3.squaredLength(normal);
  if (lengthSq === 0) return vec3.copy(out, v);
  return vec3.scaleAndAdd(out, v, normal, -vec3.dot(normal, v) / lengthSq);
}

/** Advances both axes and writes the resulting rotation to `out`. */
export function updatePanTilt(out: CameraState, state: PanTiltState, targetRotation: Quat | null, dt: number): void {
  state.pan.update(dt);
  state.tilt.update(dt);

  referenceFrame(scratchFrame, targetRotation, out.referenceUp);
  scratchEuler[0] = -degreesToRadians(state.tilt.value);
  scratchEuler[1] = -degreesToRadians(state.pan.value);
  quat.multiply(out.quaternion, scratchFrame, quat.fromEuler(scratchRotation, scratchEuler));
}

/**
 * Seeds `pan`/`tilt` from `rotation`'s forward direction, relative to the reference frame. Call before
 * any `applyDelta`, since it assumes both axes are still at their raw value.
 */
export function seedPanTilt(state: PanTiltState, targetRotation: Quat | null, rotation: Quat, referenceUp: Vec3): void {
  referenceFrame(scratchFrame, targetRotation, referenceUp);
  vec3.transformQuat(scratchForward, forwardAxis, scratchFrame);
  vec3.transformQuat(scratchTargetForward, forwardAxis, rotation);

  projectOnPlane(scratchA, scratchForward, referenceUp);
  projectOnPlane(scratchB, scratchTargetForward, referenceUp);
  let panRawDeg = 0;
  if (vec3.squaredLength(scratchA) > epsilon && vec3.squaredLength(scratchB) > epsilon) {
    panRawDeg = signedAngleDeg(scratchA, scratchB, referenceUp);
  }

  quat.setAxisAngle(scratchAxisRotation, referenceUp, degreesToRadians(panRawDeg));
  vec3.transformQuat(scratchForward, scratchForward, scratchAxisRotation);
  vec3.cross(scratchRight, referenceUp, scratchForward);
  let tiltDeg = 0;
  if (vec3.squaredLength(scratchRight) > epsilon) {
    tiltDeg = signedAngleDeg(scratchForward, scratchTargetForward, scratchRight);
  }

  // pan.value grows in the opposite direction from a standard signed angle around referenceUp.
  const panDeg = -panRawDeg;
  state.pan.applyDelta(panDeg - state.pan.value);
  state.tilt.applyDelta(tiltDeg - state.tilt.value);
}
