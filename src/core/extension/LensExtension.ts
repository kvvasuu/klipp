import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import { createLensState, updateLens, type LensParams } from './lens.js';

/** Overrides lens fields with independent damping. */
export class LensExtension implements LensParams {
  fov?: number;
  near?: number;
  far?: number;
  fovDamping: DampingConstant;
  nearDamping: DampingConstant;
  farDamping: DampingConstant;
  fovMaxSpeed: number;
  nearMaxSpeed: number;
  farMaxSpeed: number;

  readonly state = createLensState();

  constructor(
    fov?: number,
    near?: number,
    far?: number,
    fovDamping: DampingConstant = 0,
    nearDamping: DampingConstant = 0,
    farDamping: DampingConstant = 0,
    fovMaxSpeed = Infinity,
    nearMaxSpeed = Infinity,
    farMaxSpeed = Infinity,
  ) {
    this.fov = fov;
    this.near = near;
    this.far = far;
    this.fovDamping = fovDamping;
    this.nearDamping = nearDamping;
    this.farDamping = farDamping;
    this.fovMaxSpeed = fovMaxSpeed;
    this.nearMaxSpeed = nearMaxSpeed;
    this.farMaxSpeed = farMaxSpeed;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean =>
    updateLens(out, this.state, this, dt, justActivated);
}
