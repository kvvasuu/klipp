import { mat3, mat4, quat, vec3, type Mat3, type Mat4, type Vec3 } from 'math';
import type { CameraState } from '../CameraState';
import type { Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';
import { createTargetPose } from '../TargetPose';
import { readTargetPose } from '../three/readTargetPose';

const scratchLookMatrix: Mat4 = mat4.create();
const scratchRotationMatrix: Mat3 = mat3.create();

/** Rotates `out` so `targetPosition` is dead-center. */
export function updateHardLookAt(out: CameraState, targetPosition: Vec3): void {
  mat4.targetTo(scratchLookMatrix, out.position, targetPosition, out.referenceUp);
  // Not quat.fromMat4: it allocates a Mat3 per call.
  quat.fromMat3(out.quaternion, mat3.fromMat4(scratchRotationMatrix, scratchLookMatrix));
  vec3.copy(out.lookAtTarget, targetPosition);
  out.hasLookAtTarget = true;
}

/** Rotates so the Look At Target is dead-center. */
export class HardLookAtAim {
  target: Target;
  targetSlot: TargetSlot | null = null;
  private readonly pose = createTargetPose();

  constructor(target: Target) {
    this.target = target;
  }

  update = (out: CameraState): void => {
    if (readTargetPose(this.pose, this.target, this.targetSlot, false)) updateHardLookAt(out, this.pose.position);
  };
}
