import { Matrix4, Quaternion, Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import { Vector3Damper } from '../damping/Vector3Damper';
import { resolveTargetPosition, resolveTargetRotation, type Target } from '../resolve/Target';
import { BindingModes, type BindingMode } from './BindingModes';

const worldUp = new Vector3(0, 1, 0);
const scratchOrigin = new Vector3();
const scratchRotation = new Quaternion();
const scratchForward = new Vector3();
const scratchLookMatrix = new Matrix4();

/**
 * Position = target's world position + `offset`, rotated per `bindingMode` (see `BindingModes`) so the
 * camera stays behind as the target turns.
 *
 * Default offset `(0, 0, 10)` — three.js faces local -Z, so a positive Z offset sits the camera behind
 * the target, not in front of it.
 */
export class FollowBody {
  target: Target;
  offset: Vector3;
  damping: DampingConstant;
  bindingMode: BindingMode;

  private readonly damper = new Vector3Damper();
  private readonly targetPosition = new Vector3();
  private readonly desiredPosition = new Vector3();

  private lastAssignedTarget: Target = undefined;
  private readonly onAssignRotation = new Quaternion();

  constructor(
    target: Target,
    offset = new Vector3(0, 0, 10),
    damping: DampingConstant = 0,
    bindingMode: BindingMode = BindingModes.lockToTarget,
  ) {
    this.target = target;
    this.offset = offset;
    this.damping = damping;
    this.bindingMode = bindingMode;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void => {
    if (!resolveTargetPosition(this.targetPosition, this.target)) return;

    this.resolveOffsetRotation(scratchRotation);
    this.desiredPosition.copy(this.offset).applyQuaternion(scratchRotation).add(this.targetPosition);

    if (justActivated) this.damper.reset();
    this.damper.update(out.position, this.desiredPosition, this.damping, dt);
  };

  private resolveOffsetRotation(out: Quaternion): void {
    if (this.bindingMode === BindingModes.worldSpace) {
      out.identity();
      return;
    }

    if (this.bindingMode === BindingModes.lockToTargetOnAssign) {
      if (this.target !== this.lastAssignedTarget) {
        this.lastAssignedTarget = this.target;
        if (!resolveTargetRotation(this.onAssignRotation, this.target)) this.onAssignRotation.identity();
      }
      out.copy(this.onAssignRotation);
      return;
    }

    if (!resolveTargetRotation(out, this.target)) {
      out.identity();
      return;
    }

    if (this.bindingMode === BindingModes.lockToTarget) return; // full live rotation, nothing more to do

    scratchForward.set(0, 0, -1).applyQuaternion(out);
    if (this.bindingMode === BindingModes.lockToTargetWithWorldUp) scratchForward.y = 0;
    if (scratchForward.lengthSq() < 1e-10) return; // degenerate (straight up/down): keep the full rotation
    scratchForward.normalize();
    scratchLookMatrix.lookAt(scratchOrigin, scratchForward, worldUp);
    out.setFromRotationMatrix(scratchLookMatrix);
  }
}
