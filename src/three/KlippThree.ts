import type { Camera, PerspectiveCamera } from 'three';
import { createCameraState, type CameraState } from '../core/CameraState.js';
import { Klipp, type KlippOptions } from '../core/Klipp.js';
import { copyCameraStateFromCamera, writeCameraLens, writeCameraTransform } from './camera.js';
import { TargetRegistry } from './resolve/TargetRegistry.js';
import { VirtualCameraThree, type VirtualCameraThreeOptions } from './VirtualCameraThree.js';

export type { KlippMode, FrameUpdate } from '../core/Klipp.js';

export type KlippThreeOptions = Omit<KlippOptions, 'initialCameraState'>;

/** `three` can load twice in monorepos; `instanceof` then fails. Use the camera's own flag instead. */
function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

/** The original pose and lens per camera, so a later `KlippThree` on the same camera does not inherit stale state. */
const pristineCameraStates = new WeakMap<Camera, CameraState>();

function pristineStateOf(camera: Camera): CameraState {
  let pristine = pristineCameraStates.get(camera);
  if (!pristine) {
    pristine = createCameraState();
    if (isPerspectiveCamera(camera)) copyCameraStateFromCamera(pristine, camera);
    pristineCameraStates.set(camera, pristine);
  }
  return pristine;
}

/** `Klipp` for three.js: reads `Object3D` targets once per frame and writes the shot to a camera. */
export class KlippThree extends Klipp {
  /** Reads every target once per frame for all the pieces that follow it. */
  readonly targets = new TargetRegistry();
  /** The camera to drive. New virtual cameras start from its pose and lens. */
  camera: Camera;

  constructor(camera: Camera, options: KlippThreeOptions = {}) {
    super({ ...options, initialCameraState: pristineStateOf(camera) });
    this.camera = camera;
  }

  override addCamera(name: string, options?: VirtualCameraThreeOptions): VirtualCameraThree {
    const camera = new VirtualCameraThree(name, options);
    this.add(camera);
    return camera;
  }

  protected override prepareFrame(): void {
    super.prepareFrame();
    this.targets.refresh();
  }

  protected override write(result: CameraState, transformChanged: boolean, lensChanged: boolean): void {
    if (transformChanged) writeCameraTransform(this.camera, result);
    if (lensChanged && isPerspectiveCamera(this.camera)) {
      // The view offset is a ratio of the viewport, so any size works until setSize.
      writeCameraLens(this.camera, result, this.width || 1, this.height || 1);
    }
  }
}
