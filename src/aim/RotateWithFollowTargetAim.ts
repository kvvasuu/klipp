import { Quaternion } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetRotation, type Target } from '../resolve/Target';

const scratchTargetRotation = new Quaternion();

/** Follows the target's rotation. */
export class RotateWithFollowTargetAim {
  target: Target;
  damping: DampingConstant;
  maxSpeed: number;

  private readonly damper = new QuaternionDamper();
  private primed = false;

  constructor(target: Target, damping: DampingConstant = 0, maxSpeed = Infinity) {
    this.target = target;
    this.damping = damping;
    this.maxSpeed = maxSpeed;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (justActivated) {
      if (this.primed) this.primed = false;
      else this.damper.reset();
    }
    if (!resolveTargetRotation(scratchTargetRotation, this.target)) return;
    this.damper.update(out.quaternion, scratchTargetRotation, this.damping, dt, this.maxSpeed);
  };

  primeFrom = (rotation: Quaternion): void => {
    this.damper.update(rotation, rotation, this.damping, 0);
    this.primed = true;
  };
}
