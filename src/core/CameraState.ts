import { vec3, vec4, type Quat, type Vec3 } from 'math';

/** A reusable snapshot of camera transform, lens, targets, and view offset. */
export type CameraState = {
  position: Vec3;
  quaternion: Quat;
  fov: number;
  near: number;
  far: number;
  /** Normalized frustum offset; `0` is centered. */
  viewOffset: [number, number];
  /** Body tracking position, valid when `hasTarget` is true. */
  target: Vec3;
  hasTarget: boolean;
  /** Aim look-at position, valid when `hasLookAtTarget` is true. */
  lookAtTarget: Vec3;
  hasLookAtTarget: boolean;
  /** Up direction used by look-at rotation. */
  referenceUp: Vec3;
};

/** Create a camera state. */
export function createCameraState(): CameraState {
  return {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    fov: 50,
    near: 0.1,
    far: 1000,
    viewOffset: [0, 0],
    target: [0, 0, 0],
    hasTarget: false,
    lookAtTarget: [0, 0, 0],
    hasLookAtTarget: false,
    referenceUp: [0, 1, 0],
  };
}

/** Copy `source` into `out` without replacing nested objects. */
export function copyCameraState(out: CameraState, source: CameraState): CameraState {
  vec3.copy(out.position, source.position);
  vec4.copy(out.quaternion, source.quaternion);
  out.fov = source.fov;
  out.near = source.near;
  out.far = source.far;
  out.viewOffset[0] = source.viewOffset[0];
  out.viewOffset[1] = source.viewOffset[1];
  vec3.copy(out.target, source.target);
  out.hasTarget = source.hasTarget;
  vec3.copy(out.lookAtTarget, source.lookAtTarget);
  out.hasLookAtTarget = source.hasLookAtTarget;
  vec3.copy(out.referenceUp, source.referenceUp);
  return out;
}

/** Merge defined fields from `partial` into `out`. */
export function mergeCameraState(out: CameraState, partial: Partial<CameraState>): CameraState {
  if (partial.position) vec3.copy(out.position, partial.position);
  if (partial.quaternion) vec4.copy(out.quaternion, partial.quaternion);
  if (partial.fov !== undefined) out.fov = partial.fov;
  if (partial.near !== undefined) out.near = partial.near;
  if (partial.far !== undefined) out.far = partial.far;
  if (partial.viewOffset) {
    out.viewOffset[0] = partial.viewOffset[0];
    out.viewOffset[1] = partial.viewOffset[1];
  }
  if (partial.target) vec3.copy(out.target, partial.target);
  if (partial.hasTarget !== undefined) out.hasTarget = partial.hasTarget;
  if (partial.lookAtTarget) vec3.copy(out.lookAtTarget, partial.lookAtTarget);
  if (partial.hasLookAtTarget !== undefined) out.hasLookAtTarget = partial.hasLookAtTarget;
  if (partial.referenceUp) vec3.copy(out.referenceUp, partial.referenceUp);
  return out;
}

/** Whether `a` and `b` have the same position and rotation. */
export const cameraTransformEquals = (a: CameraState, b: CameraState): boolean =>
  vec3.exactEquals(a.position, b.position) && vec4.exactEquals(a.quaternion, b.quaternion);

/** Whether `a` and `b` have the same lens, view offset included. */
export const cameraLensEquals = (a: CameraState, b: CameraState): boolean =>
  a.fov === b.fov &&
  a.near === b.near &&
  a.far === b.far &&
  a.viewOffset[0] === b.viewOffset[0] &&
  a.viewOffset[1] === b.viewOffset[1];
