import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import { resolveTargetPosition, type Target } from '../resolve/Target';

const scratchPosition = new Vector3();
const scratchUp = new Vector3();
const scratchRotation = new Quaternion();

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
    scratchPosition.fromArray(out.position);
    scratchUp.fromArray(out.referenceUp);
    this.scratchMatrix.lookAt(scratchPosition, this.scratchTargetPosition, scratchUp);
    scratchRotation.setFromRotationMatrix(this.scratchMatrix).toArray(out.quaternion);
    this.scratchTargetPosition.toArray(out.lookAtTarget);
    out.hasLookAtTarget = true;
  };
}
