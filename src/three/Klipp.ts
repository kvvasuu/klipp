import { vec3, vec4 } from 'math';
import type { Camera, PerspectiveCamera } from 'three';
import { copyCameraState, createCameraState, type CameraState } from '../core/CameraState.js';
import { KlippCore, type KlippCoreOptions } from '../core/KlippCore.js';
import { copyCameraStateFromCamera, writeCameraLens, writeCameraTransform } from './camera.js';
import { TargetRegistry } from './resolve/TargetRegistry.js';
import { VirtualCamera, type VirtualCameraOptions } from './VirtualCamera.js';

/** `'enabled'` writes the real camera, `'standby'` keeps every camera updating without writing, `'disabled'` stops. */
export type KlippMode = 'enabled' | 'standby' | 'disabled';

export type KlippOptions = KlippCoreOptions & {
  /** See `KlippMode`. */
  mode?: KlippMode;
};

/** Per-frame work that runs before the cameras, like input. Return `true` while it is still moving. */
export type FrameUpdate = (dt: number) => boolean | void;

/** `three` can load twice in monorepos; `instanceof` then fails. Use the camera's own flag instead. */
function isPerspectiveCamera(camera: Camera): camera is PerspectiveCamera {
  return (camera as PerspectiveCamera).isPerspectiveCamera === true;
}

/** The original pose and lens per camera, so a later `Klipp` on the same camera does not inherit stale state. */
const pristineCameraStates = new WeakMap<Camera, CameraState>();

/** `KlippCore` for three.js: runs virtual cameras, reads their targets and writes the shot to a camera. */
export class Klipp extends KlippCore {
  /** Reads every target once per frame for all the pieces that follow it. */
  readonly targets = new TargetRegistry();
  /** The camera's pose and lens when it was first driven. New virtual cameras start from it. */
  readonly initialCameraState: CameraState;
  /** The camera to drive. */
  camera: Camera;
  mode: KlippMode;
  /** Viewport width in pixels, passed on to pieces that frame by screen size. */
  width = 1;
  /** Viewport height in pixels. */
  height = 1;

  private readonly cameras = new Map<VirtualCamera, () => void>();
  private readonly updates = new Set<FrameUpdate>();
  private readonly previousResult = createCameraState();
  private settled = false;

  constructor(camera: Camera, options: KlippOptions = {}) {
    super(options);
    this.camera = camera;
    this.mode = options.mode ?? 'enabled';
    let pristine = pristineCameraStates.get(camera);
    if (!pristine) {
      pristine = createCameraState();
      if (isPerspectiveCamera(camera)) copyCameraStateFromCamera(pristine, camera);
      pristineCameraStates.set(camera, pristine);
    }
    this.initialCameraState = pristine;
  }

  /** Set the viewport size in pixels. */
  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Create a virtual camera and add it. */
  addCamera(name: string, options?: VirtualCameraOptions): VirtualCamera {
    const camera = new VirtualCamera(this, name, options);
    this.add(camera);
    return camera;
  }

  /** Add a virtual camera created for this `Klipp`. Returns a function that removes it. */
  add(camera: VirtualCamera): () => void {
    if (!this.cameras.has(camera)) this.cameras.set(camera, camera.attach());
    return () => this.remove(camera);
  }

  /** Remove a virtual camera. It leaves the arbitration, and the shot blends to the next winner. */
  remove(camera: VirtualCamera): void {
    this.cameras.get(camera)?.();
    this.cameras.delete(camera);
  }

  /** Run `update` every frame before the cameras. Returns a function that stops it. */
  registerUpdate(update: FrameUpdate): () => void {
    this.updates.add(update);
    return () => this.updates.delete(update);
  }

  /**
   * Advance one frame: read targets, run every camera, pick and blend the shot, and write it to the camera.
   * Returns `true` while something is still moving, so on-demand rendering knows to request another frame.
   */
  update(dt: number): boolean {
    if (this.mode === 'disabled') return false;

    for (const camera of this.cameras.keys()) camera.prepare(this.width, this.height);
    this.targets.refresh();
    // Keep `=== true` semantics: some writers return a real boolean value even when typed as void.
    let stillInFlight = false;
    for (const update of this.updates) {
      if (update(dt) === true) stillInFlight = true;
    }
    for (const camera of this.cameras.keys()) {
      if (camera.tick(dt)) stillInFlight = true;
    }
    const result = this.tick(dt);

    // Standby stays warm but never touches the real camera.
    if (this.mode === 'standby') return stillInFlight || this.isBlending;
    // Do not write the untouched initial state before any camera has gone live.
    if (!this.hasEverActivated) return stillInFlight;

    const previous = this.previousResult;
    const transformUnchanged =
      this.settled &&
      vec3.exactEquals(result.position, previous.position) &&
      vec4.exactEquals(result.quaternion, previous.quaternion);
    // Lens changes also cover view-offset changes.
    const lensUnchanged =
      this.settled &&
      result.fov === previous.fov &&
      result.near === previous.near &&
      result.far === previous.far &&
      result.viewOffset[0] === previous.viewOffset[0] &&
      result.viewOffset[1] === previous.viewOffset[1];
    if (transformUnchanged && lensUnchanged) return stillInFlight;

    copyCameraState(previous, result);
    this.settled = true;
    if (!transformUnchanged) writeCameraTransform(this.camera, result);
    if (!lensUnchanged && isPerspectiveCamera(this.camera))
      writeCameraLens(this.camera, result, this.width, this.height);
    return true;
  }
}
