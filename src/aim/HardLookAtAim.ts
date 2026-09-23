import { Matrix4, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { resolveTargetPosition, type Target } from '../resolve/Target';

/**
 * Rotates so the Look At Target is dead-center.
 *
 * Builds the look-at matrix directly because a plain `Object3D` swaps eye and target in `.lookAt()`,
 * which reverses the camera orientation.
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
    this.scratchMatrix.lookAt(out.position, this.scratchTargetPosition, out.referenceUp);
    out.quaternion.setFromRotationMatrix(this.scratchMatrix);
    out.lookAtTarget.copy(this.scratchTargetPosition);
    out.hasLookAtTarget = true;
  };
}
