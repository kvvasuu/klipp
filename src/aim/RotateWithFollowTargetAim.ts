import { Quaternion } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { QuaternionDamper } from '../damping/QuaternionDamper';
import { resolveTargetRotation, type Target } from '../resolve/Target';

const scratchTargetRotation = new Quaternion();

/**
 * Rotation = Tracking Target's world rotation, 1:1 — the rotation analog of `HardLockToTargetBody`. A
 * target with no rotation (e.g. a fixed point) has nothing to copy, so this is a no-op for it, same as an
 * unmounted ref. `damping` uses `QuaternionDamper` — see its doc comment for how it stays jump-free.
 */
export class RotateWithFollowTargetAim {
  target: Target;
  damping: DampingConstant;

  private readonly damper = new QuaternionDamper();

  constructor(target: Target, damping: DampingConstant = 0) {
    this.target = target;
    this.damping = damping;
  }

  update = (out: CameraState, dt: number): void => {
    if (!resolveTargetRotation(scratchTargetRotation, this.target)) return;
    this.damper.update(out.quaternion, scratchTargetRotation, this.damping, dt);
  };
}
