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
  /** Shifts the frustum without moving/rotating the camera - same normalized convention as
   *  `screenPosition` elsewhere (0 = center, ±1 = frame edge), NOT raw pixels; `[0, 0]` (default) = no
   *  shift. Mutable tuple - mutate elements in place, never replace the array. */
  viewOffset: [number, number];
  /** The Body's tracking target world position, if it has one - e.g. for `BlendHints.sphericalPosition`.
   *  Always allocated; `hasTarget` says whether it's meaningful. */
  target: Vector3;
  hasTarget: boolean;
  /** The Aim's Look At target world position, if it has one - distinct from `target` (Body's own
   *  tracking point, e.g. equal to `position` itself for `HardLockToTarget`). */
  lookAtTarget: Vector3;
  hasLookAtTarget: boolean;
};

/** Allocates a new `CameraState` with default values — call once, not per frame. */
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
  out.viewOffset[0] = source.viewOffset[0];
  out.viewOffset[1] = source.viewOffset[1];
  out.target.copy(source.target);
  out.hasTarget = source.hasTarget;
  out.lookAtTarget.copy(source.lookAtTarget);
  out.hasLookAtTarget = source.hasLookAtTarget;
  return out;
}

/** Overwrites only the fields present in `partial` — `.copy()`s Vector3/Quaternion/`viewOffset` fields so
 *  `out` never ends up aliasing an object the caller still owns, straight-assigns everything else. */
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
  return out;
}

export function copyCameraStateFromCamera(out: CameraState, camera: PerspectiveCamera): CameraState {
  out.position.copy(camera.position);
  out.quaternion.copy(camera.quaternion);
  out.fov = camera.fov;
  out.near = camera.near;
  out.far = camera.far;
  // camera.view stores its own fullWidth/fullHeight from the setViewOffset() call that created it, so
  // normalizing back needs no separate viewport size argument here
  out.viewOffset[0] = camera.view?.enabled ? camera.view.offsetX / (camera.view.fullWidth / 2) : 0;
  out.viewOffset[1] = camera.view?.enabled ? camera.view.offsetY / (camera.view.fullHeight / 2) : 0;
  out.hasTarget = false;
  out.hasLookAtTarget = false;
  return out;
}

/** The reverse of `copyCameraStateFromCamera` — writes `state` onto a real `PerspectiveCamera`.
 *  `viewportWidth`/`viewportHeight` are only needed to convert `viewOffset` into `camera.setViewOffset`'s
 *  pixel arguments — pass the canvas's actual size. */
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
  if (state.viewOffset[0] !== 0 || state.viewOffset[1] !== 0) {
    const offsetX = state.viewOffset[0] * (viewportWidth / 2);
    const offsetY = state.viewOffset[1] * (viewportHeight / 2);
    camera.setViewOffset(viewportWidth, viewportHeight, offsetX, offsetY, viewportWidth, viewportHeight);
  } else {
    camera.clearViewOffset();
  }
}
