import { Matrix4, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { resolveTargetPosition, type Target } from '../resolve/Target';

const worldUp = new Vector3(0, 1, 0);

/**
 * Rotates so the Look At Target is dead-center, zero dead/soft zone. Uses `out.position` as the eye —
 * Body already ran this frame (`<VirtualCamera>` runs Body before Aim), so this looks from wherever the
 * camera actually ended up, not a stale position.
 *
 * Builds the look-at matrix directly rather than calling `.lookAt()` on a scratch `Object3D` — a plain
 * `Object3D` uses the OPPOSITE (eye/target swapped) convention, meant for arrows etc., which silently
 * orients a camera 180° backwards.
 */
export class HardLookAtAim {
  target: Target;
  private readonly scratchMatrix = new Matrix4();
  private readonly scratchTargetPosition = new Vector3();

  constructor(target: Target) {
    this.target = target;
  }

  update = (out: CameraState): void => {
    if (!resolveTargetPosition(this.scratchTargetPosition, this.target)) return;
    this.scratchMatrix.lookAt(out.position, this.scratchTargetPosition, worldUp);
    out.quaternion.setFromRotationMatrix(this.scratchMatrix);
    out.lookAtTarget.copy(this.scratchTargetPosition);
    out.hasLookAtTarget = true;
  };
}
