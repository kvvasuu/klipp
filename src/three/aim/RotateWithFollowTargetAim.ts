import type { Quat } from 'math';
import { Quaternion } from 'three';
import type { CameraState } from '../../core/CameraState';
import type { DampingConstant } from '../../core/damping/Damper';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetRotation, type Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';

const scratchTargetRotation = new Quaternion();
const scratchRotation = new Quaternion();

/** Follows the target's rotation. */
export class RotateWithFollowTargetAim {
  target: Target;
  targetSlot: TargetSlot | null = null;
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
    if (!resolveTargetRotation(scratchTargetRotation, this.target, this.targetSlot)) return;
    scratchRotation.fromArray(out.quaternion);
    this.damper.update(scratchRotation, scratchTargetRotation, this.damping, dt, this.maxSpeed).toArray(out.quaternion);
  };

  primeFrom = (rotation: Quat): void => {
    scratchRotation.fromArray(rotation);
    this.damper.update(scratchRotation, scratchRotation, this.damping, 0).toArray(rotation);
    this.primed = true;
  };
}
