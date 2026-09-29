import { vec3 } from 'math';
import type { Object3D, PerspectiveCamera } from 'three';
import type { CameraState } from '../core/CameraState';

/** Read a perspective camera's transform and lens into `out`. */
export function copyCameraStateFromCamera(out: CameraState, camera: PerspectiveCamera): CameraState {
  camera.position.toArray(out.position);
  camera.quaternion.toArray(out.quaternion);
  out.fov = camera.fov;
  out.near = camera.near;
  out.far = camera.far;
  // three.js stores the viewport dimensions needed to normalize its offset.
  out.viewOffset[0] = camera.view?.enabled ? -camera.view.offsetX / (camera.view.fullWidth / 2) : 0;
  out.viewOffset[1] = camera.view?.enabled ? camera.view.offsetY / (camera.view.fullHeight / 2) : 0;
  out.hasTarget = false;
  out.hasLookAtTarget = false;
  vec3.set(out.referenceUp, 0, 1, 0);
  return out;
}

/** Write a camera state's position and rotation to a camera. */
export function writeCameraTransform(camera: Object3D, state: CameraState): void {
  camera.position.fromArray(state.position);
  camera.quaternion.fromArray(state.quaternion);
}

/** Write a camera state's lens and view offset to a perspective camera. */
export function writeCameraLens(
  camera: PerspectiveCamera,
  state: CameraState,
  viewportWidth: number,
  viewportHeight: number,
): void {
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

/** Apply a camera state to a perspective camera. */
export function applyCameraState(
  camera: PerspectiveCamera,
  state: CameraState,
  viewportWidth: number,
  viewportHeight: number,
): void {
  writeCameraTransform(camera, state);
  writeCameraLens(camera, state, viewportWidth, viewportHeight);
}
