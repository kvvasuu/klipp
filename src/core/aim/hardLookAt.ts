import { mat4, quat, vec3, type Mat4, type Vec3 } from 'math';
import type { CameraState } from '../CameraState';

const scratchLookMatrix: Mat4 = mat4.create();

/** Rotates `out` so `targetPosition` is dead-center. */
export function updateHardLookAt(out: CameraState, targetPosition: Vec3): void {
  mat4.targetTo(scratchLookMatrix, out.position, targetPosition, out.referenceUp);
  quat.fromMat4(out.quaternion, scratchLookMatrix);
  vec3.copy(out.lookAtTarget, targetPosition);
  out.hasLookAtTarget = true;
}
