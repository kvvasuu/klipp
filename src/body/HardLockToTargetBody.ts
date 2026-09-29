import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, type Target } from '../resolve/Target';

const scratchPosition = new Vector3();

/** Locks the camera position to a target, optionally with damping. */
export class HardLockToTargetBody {
  target: Target;
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
    if (!resolveTargetPosition(this.resolvedTarget, this.target)) return;
    if (justActivated) this.damper.reset();
    scratchPosition.fromArray(out.position);
    this.damper.update(scratchPosition, this.resolvedTarget, this.damping, dt, this.maxSpeed).toArray(out.position);
    scratchPosition.toArray(out.target);
    out.hasTarget = true;
  };
}
