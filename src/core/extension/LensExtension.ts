import type { CameraState } from '../CameraState';
import { Damper, type DampingConstant } from '../damping/Damper';

/** Overrides lens fields with independent damping. */
export class LensExtension {
  fov?: number;
  near?: number;
  far?: number;
  fovDamping: DampingConstant;
  nearDamping: DampingConstant;
  farDamping: DampingConstant;
  fovMaxSpeed: number;
  nearMaxSpeed: number;
  farMaxSpeed: number;

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
          : this.fovDamper.update(this.currentFov, this.fov, this.fovDamping, dt, this.fovMaxSpeed);
      out.fov = this.currentFov;
    }
    if (this.near !== undefined) {
      this.currentNear =
        typeof this.nearDamping === 'number' && this.nearDamping <= 0
          ? this.near
          : this.nearDamper.update(this.currentNear, this.near, this.nearDamping, dt, this.nearMaxSpeed);
      out.near = this.currentNear;
    }
    if (this.far !== undefined) {
      this.currentFar =
        typeof this.farDamping === 'number' && this.farDamping <= 0
          ? this.far
          : this.farDamper.update(this.currentFar, this.far, this.farDamping, dt, this.farMaxSpeed);
      out.far = this.currentFar;
    }

    return (
      (this.fov !== undefined && this.currentFov !== this.fov) ||
      (this.near !== undefined && this.currentNear !== this.near) ||
      (this.far !== undefined && this.currentFar !== this.far)
    );
  };
}
