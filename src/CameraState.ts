import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

/** A camera's full visual state at one instant — position, rotation, lens. Owns its `Vector3`/
 *  `Quaternion` (not shared refs) so it can be frozen as an independent blend start point.
 *
 *  `out`-parameter style throughout — only `createCameraState()` allocates, never per frame. */
export type CameraState = {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
  near: number;
  far: number;
  /** `camera.setViewOffset`'s `offsetX`/`offsetY`, in pixels — shifts the frustum without moving or
   *  rotating the camera, e.g. to keep a subject visually centered in the space left over after
   *  reserving room for UI on one side. `0` (default) = no shift, equivalent to
   *  `camera.clearViewOffset()`. */
  viewOffsetX: number;
  viewOffsetY: number;
};

/** Allocates a new `CameraState` with default values — call once, not per frame. */
export function createCameraState(): CameraState {
  return {
    position: new Vector3(),
    quaternion: new Quaternion(),
    fov: 50,
    near: 0.1,
    far: 1000,
    viewOffsetX: 0,
    viewOffsetY: 0,
  };
}

/** Copies `source` into `out` in place — the copy stays valid even if `source` is later mutated. Safe if
 *  `out === source`. */
export function copyCameraState(out: CameraState, source: CameraState): CameraState {
  out.position.copy(source.position);
  out.quaternion.copy(source.quaternion);
  out.fov = source.fov;
  out.near = source.near;
  out.far = source.far;
  out.viewOffsetX = source.viewOffsetX;
  out.viewOffsetY = source.viewOffsetY;
  return out;
}

export function copyCameraStateFromCamera(out: CameraState, camera: PerspectiveCamera): CameraState {
  out.position.copy(camera.position);
  out.quaternion.copy(camera.quaternion);
  out.fov = camera.fov;
  out.near = camera.near;
  out.far = camera.far;
  out.viewOffsetX = camera.view?.enabled ? camera.view.offsetX : 0;
  out.viewOffsetY = camera.view?.enabled ? camera.view.offsetY : 0;
  return out;
}

/** The reverse of `copyCameraStateFromCamera` — writes `state` onto a real `PerspectiveCamera`.
 *  `viewportWidth`/`viewportHeight` are only needed to convert `viewOffsetX`/`Y` into
 *  `camera.setViewOffset`'s pixel arguments — pass the canvas's actual size. */
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
  // setViewOffset/clearViewOffset call updateProjectionMatrix() themselves, which also picks up the
  // fov/near/far just set above
  if (state.viewOffsetX !== 0 || state.viewOffsetY !== 0) {
    camera.setViewOffset(viewportWidth, viewportHeight, state.viewOffsetX, state.viewOffsetY, viewportWidth, viewportHeight);
  } else {
    camera.clearViewOffset();
  }
}
