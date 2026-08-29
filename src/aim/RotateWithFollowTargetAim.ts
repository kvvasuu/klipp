import { Quaternion } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetRotation, type Target } from '../resolve/Target';

const scratchTargetRotation = new Quaternion();

/** The rotation analog of `HardLockToTargetBody`. */
export class RotateWithFollowTargetAim {
  target: Target;
  damping: DampingConstant;

  private readonly damper = new QuaternionDamper();

  constructor(target: Target, damping: DampingConstant = 0) {
    this.target = target;
    this.damping = damping;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetRotation(scratchTargetRotation, this.target)) return;
    if (justActivated) this.damper.reset();
    this.damper.update(out.quaternion, scratchTargetRotation, this.damping, dt);
  };
}
