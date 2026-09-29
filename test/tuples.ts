import type { Quat, Vec3 } from 'math';
import { Quaternion, Vector3 } from 'three';

/** A new three.js `Vector3` holding a `CameraState` tuple's value. */
export const toVector3 = (v: Vec3): Vector3 => new Vector3().fromArray(v);

/** A new three.js `Quaternion` holding a `CameraState` tuple's value. */
export const toQuaternion = (q: Quat): Quaternion => new Quaternion().fromArray(q);

/** A three.js `Vector3` or `Quaternion` as a new `CameraState` tuple. */
export function toTuple(v: Vector3): Vec3;
export function toTuple(q: Quaternion): Quat;
export function toTuple(value: Vector3 | Quaternion): Vec3 | Quat {
  return value instanceof Vector3 ? [value.x, value.y, value.z] : [value.x, value.y, value.z, value.w];
}
