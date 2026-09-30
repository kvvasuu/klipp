import { mat4, quat, vec3, type Quat, type Vec3 } from 'math';

/** Angle in radians between two rotations, clamped so rounding never yields NaN. */
export const angleBetween = (a: Quat, b: Quat): number => 2 * Math.acos(Math.min(1, Math.abs(quat.dot(a, b))));

/** A rotation of `degrees` around the Y axis. */
export const yaw = (degrees: number): Quat => quat.setAxisAngle(quat.create(), [0, 1, 0], (degrees * Math.PI) / 180);

/** The rotation that looks from `position` at `target`, like `HardLookAt` produces. */
export function lookAtQuaternion(position: Vec3, target: Vec3): Quat {
  return quat.fromMat4(quat.create(), mat4.targetTo(mat4.create(), position, target, [0, 1, 0]));
}

/** Cosine between the camera's forward (-Z) and the direction from `position` to `point`: 1 means looking right at it. */
export function forwardDot(rotation: Quat, position: Vec3, point: Vec3): number {
  const forward = vec3.transformQuat(vec3.create(), [0, 0, -1], rotation);
  const toPoint = vec3.normalize(vec3.create(), vec3.subtract(vec3.create(), point, position));
  return vec3.dot(forward, toPoint);
}
