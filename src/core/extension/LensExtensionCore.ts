import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import { createLensParams, createLensState, updateLens, type LensParams } from './lens.js';

export type LensOptions = Partial<LensParams>;

/** Overrides lens fields with independent damping. */
export class LensExtensionCore implements LensParams {
  declare fov?: number;
  declare near?: number;
  declare far?: number;
  declare fovDamping: DampingConstant;
  declare nearDamping: DampingConstant;
  declare farDamping: DampingConstant;
  declare fovMaxSpeed: number;
  declare nearMaxSpeed: number;
  declare farMaxSpeed: number;

  readonly state = createLensState();

  constructor(options?: LensOptions) {
    Object.assign(this, createLensParams(options));
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean =>
    updateLens(out, this.state, this, dt, justActivated);
}
