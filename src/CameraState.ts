import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

/** A reusable snapshot of camera transform, lens, targets, and view offset. */
export type CameraState = {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
  near: number;
  far: number;
  /** Normalized frustum offset; `0` is centered. */
  viewOffset: [number, number];
  /** Body tracking position, valid when `hasTarget` is true. */
  target: Vector3;
  hasTarget: boolean;
  /** Aim look-at position, valid when `hasLookAtTarget` is true. */
  lookAtTarget: Vector3;
  hasLookAtTarget: boolean;
  /** Up direction used by look-at rotation. */
  referenceUp: Vector3;
};

/** Create a camera state. */
export function createCameraState(): CameraState {
  return {
    position: new Vector3(),
    quaternion: new Quaternion(),
    fov: 50,
    near: 0.1,
    far: 1000,
    viewOffset: [0, 0],
    target: new Vector3(),
    hasTarget: false,
    lookAtTarget: new Vector3(),
    hasLookAtTarget: false,
    referenceUp: new Vector3(0, 1, 0),
  };
}

/** Copy `source` into `out` without replacing nested objects. */
export function copyCameraState(out: CameraState, source: CameraState): CameraState {
  out.position.copy(source.position);
  out.quaternion.copy(source.quaternion);
  out.fov = source.fov;
  out.near = source.near;
  out.far = source.far;
  out.viewOffset[0] = source.viewOffset[0];
  out.viewOffset[1] = source.viewOffset[1];
  out.target.copy(source.target);
  out.hasTarget = source.hasTarget;
  out.lookAtTarget.copy(source.lookAtTarget);
  out.hasLookAtTarget = source.hasLookAtTarget;
  out.referenceUp.copy(source.referenceUp);
  return out;
}

/** Merge defined fields from `partial` into `out`. */
export function mergeCameraState(out: CameraState, partial: Partial<CameraState>): CameraState {
  if (partial.position) out.position.copy(partial.position);
  if (partial.quaternion) out.quaternion.copy(partial.quaternion);
  if (partial.fov !== undefined) out.fov = partial.fov;
  if (partial.near !== undefined) out.near = partial.near;
  if (partial.far !== undefined) out.far = partial.far;
  if (partial.viewOffset) {
    out.viewOffset[0] = partial.viewOffset[0];
    out.viewOffset[1] = partial.viewOffset[1];
  }
  if (partial.target) out.target.copy(partial.target);
  if (partial.hasTarget !== undefined) out.hasTarget = partial.hasTarget;
  if (partial.lookAtTarget) out.lookAtTarget.copy(partial.lookAtTarget);
  if (partial.hasLookAtTarget !== undefined) out.hasLookAtTarget = partial.hasLookAtTarget;
  if (partial.referenceUp) out.referenceUp.copy(partial.referenceUp);
  return out;
}

export function copyCameraStateFromCamera(out: CameraState, camera: PerspectiveCamera): CameraState {
  out.position.copy(camera.position);
  out.quaternion.copy(camera.quaternion);
  out.fov = camera.fov;
  out.near = camera.near;
  out.far = camera.far;
  // three.js stores the viewport dimensions needed to normalize its offset.
  out.viewOffset[0] = camera.view?.enabled ? -camera.view.offsetX / (camera.view.fullWidth / 2) : 0;
  out.viewOffset[1] = camera.view?.enabled ? camera.view.offsetY / (camera.view.fullHeight / 2) : 0;
  out.hasTarget = false;
  out.hasLookAtTarget = false;
  out.referenceUp.set(0, 1, 0);
  return out;
}

/** Apply a camera state to a perspective camera. */
export function applyCameraState(
  camera: PerspectiveCamera,
  state: CameraState,
  viewportWidth: number,
  viewportHeight: number,
): void {
  camera.position.copy(state.position);
  camera.quaternion.copy(state.quaternion);
  camera.fov = state.fov;
  camera.near = state.near;
  camera.far = state.far;
  // These methods also update the projection matrix.
  if (state.viewOffset[0] !== 0 || state.viewOffset[1] !== 0) {
    // three.js uses the opposite horizontal offset convention.
    const offsetX = -state.viewOffset[0] * (viewportWidth / 2);
    const offsetY = state.viewOffset[1] * (viewportHeight / 2);
    camera.setViewOffset(viewportWidth, viewportHeight, offsetX, offsetY, viewportWidth, viewportHeight);
  } else {
    camera.clearViewOffset();
  }
}
