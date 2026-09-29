import { Vector3 } from 'three';
import type { CameraState } from '../../core/CameraState';
import type { DampingConstant } from '../../core/damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, type Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';

const scratchPosition = new Vector3();

/** Locks the camera position to a target, optionally with damping. */
export class HardLockToTargetBody {
  target: Target;
  targetSlot: TargetSlot | null = null;
  damping: DampingConstant;
  maxSpeed: number;

  private readonly damper = new Vector3Damper();
  private readonly resolvedTarget = new Vector3();

  constructor(target: Target, damping: DampingConstant = 0, maxSpeed = Infinity) {
    this.target = target;
    this.damping = damping;
    this.maxSpeed = maxSpeed;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(this.resolvedTarget, this.target, this.targetSlot)) return;
    if (justActivated) this.damper.reset();
    scratchPosition.fromArray(out.position);
    this.damper.update(scratchPosition, this.resolvedTarget, this.damping, dt, this.maxSpeed).toArray(out.position);
    scratchPosition.toArray(out.target);
    out.hasTarget = true;
  };
}
