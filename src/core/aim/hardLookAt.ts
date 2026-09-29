import { mat3, mat4, quat, vec3, type Mat3, type Mat4, type Vec3 } from 'math';
import type { CameraState } from '../CameraState';

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
