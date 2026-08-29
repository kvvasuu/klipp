import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, type Target } from '../resolve/Target';

/**
 * Plain class, zero React dependency — the actual logic behind `<HardLockToTarget>`. Position = Tracking
 * Target's world position, 1:1 by default. `damping` optionally smooths the catch-up per axis
 * independently (`Vector3Damper`) — an axis-aligned lag reads as "chasing," not the arcing motion a
 * single radial damper would produce.
 */
export class HardLockToTargetBody {
  target: Target;
  damping: DampingConstant;

  private readonly damper = new Vector3Damper();
  private readonly resolvedTarget = new Vector3();

  constructor(target: Target, damping: DampingConstant = 0) {
    this.target = target;
    this.damping = damping;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(this.resolvedTarget, this.target)) return;
    if (justActivated) this.damper.reset();
    this.damper.update(out.position, this.resolvedTarget, this.damping, dt);
  };
}
