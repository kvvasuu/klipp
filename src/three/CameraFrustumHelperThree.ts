import { CameraHelper, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../core/CameraState.js';

const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();

/** A `CameraHelper` that draws a virtual camera's frustum from its `state`. */
export class CameraFrustumHelperThree extends CameraHelper {
  /** How far the frustum is drawn. */
  maxDistance: number;

  private readonly lens = { fov: NaN, near: NaN, far: NaN, aspect: NaN };

  constructor(maxDistance = 1) {
    super(new PerspectiveCamera());
    this.maxDistance = maxDistance;
  }

  /** Follow `state`, seen at `aspect`. Redraws only when the pose or lens changed. */
  sync(state: CameraState, aspect: number): void {
    const camera = this.camera as PerspectiveCamera;
    const far = Math.min(state.far, this.maxDistance);
    const lens = this.lens;
    const lensChanged =
      lens.fov !== state.fov || lens.near !== state.near || lens.far !== far || lens.aspect !== aspect;
    if (lensChanged) {
      camera.fov = lens.fov = state.fov;
      camera.near = lens.near = state.near;
      camera.far = lens.far = far;
      camera.aspect = lens.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    scratchPosition.fromArray(state.position);
    scratchQuaternion.fromArray(state.quaternion);
    const transformChanged = !camera.position.equals(scratchPosition) || !camera.quaternion.equals(scratchQuaternion);
    if (transformChanged) {
      camera.position.copy(scratchPosition);
      camera.quaternion.copy(scratchQuaternion);
      camera.updateMatrixWorld(true);
    }

    if (lensChanged || transformChanged) this.update();
  }
}
