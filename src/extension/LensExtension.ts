import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';

/**
 * Camera extension: overrides `fov`/`near`/`far` after Body/Aim/Noise, each independently damped.
 * Nothing else in klipp's pipeline writes these fields (`initialState`/blend aside) - without an
 * extension claiming them, an external `useFrame` mutating `camera.fov` directly would get silently
 * overwritten by Klipp's own driver every frame. A field left `undefined` is a no-op - whatever
 * `initialState`/blend already set stays untouched.
 */
export class LensExtension {
  fov?: number;
  near?: number;
  far?: number;
  fovDamping: DampingConstant;
  nearDamping: DampingConstant;
  farDamping: DampingConstant;

  private readonly fovDamper = new Damper();
  private readonly nearDamper = new Damper();
  private readonly farDamper = new Damper();
  private currentFov = 0;
  private currentNear = 0;
  private currentFar = 0;

  constructor(
    fov?: number,
    near?: number,
    far?: number,
    fovDamping: DampingConstant = 0,
    nearDamping: DampingConstant = 0,
    farDamping: DampingConstant = 0,
  ) {
    this.fov = fov;
    this.near = near;
    this.far = far;
    this.fovDamping = fovDamping;
    this.nearDamping = nearDamping;
    this.farDamping = farDamping;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    if (justActivated) {
      this.fovDamper.reset();
      this.nearDamper.reset();
      this.farDamper.reset();
    }

    if (this.fov !== undefined) {
      this.currentFov =
        typeof this.fovDamping === 'number' && this.fovDamping <= 0
          ? this.fov
          : this.fovDamper.update(this.currentFov, this.fov, this.fovDamping, dt);
      out.fov = this.currentFov;
    }
    if (this.near !== undefined) {
      this.currentNear =
        typeof this.nearDamping === 'number' && this.nearDamping <= 0
          ? this.near
          : this.nearDamper.update(this.currentNear, this.near, this.nearDamping, dt);
      out.near = this.currentNear;
    }
    if (this.far !== undefined) {
      this.currentFar =
        typeof this.farDamping === 'number' && this.farDamping <= 0
          ? this.far
          : this.farDamper.update(this.currentFar, this.far, this.farDamping, dt);
      out.far = this.currentFar;
    }

    return (
      (this.fov !== undefined && this.currentFov !== this.fov) ||
      (this.near !== undefined && this.currentNear !== this.near) ||
      (this.far !== undefined && this.currentFar !== this.far)
    );
  };
}
