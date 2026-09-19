import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, type Target } from '../resolve/Target';

/** `damping` uses `Vector3Damper` (per-axis) rather than a single radial damper — an axis-aligned lag
 *  reads as "chasing," not the arcing motion a radial one would produce. */
export class HardLockToTargetBody {
  target: Target;
  damping: DampingConstant;
  /** Caps how fast `damping` can close the gap, in world units/sec, per axis. Default `Infinity` (no cap). */
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
    this.damper.update(out.position, this.resolvedTarget, this.damping, dt, this.maxSpeed);
    out.target.copy(out.position);
    out.hasTarget = true;
  };
}
