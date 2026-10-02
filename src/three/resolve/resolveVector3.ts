import { vec3, type Vec3 } from 'math';
import { Vector3 } from 'three';

/** A vector as a `Vector3`, an `[x, y, z?]` tuple or one number for all axes (same shape as r3f's `Vector3` prop). */
export type Vector3Like = Vector3 | readonly [x: number, y: number, z?: number] | number;

/** Whether a value matches r3f's `Vector3` prop shorthand. */
export function isVector3Like(value: unknown): value is Vector3Like {
  return typeof value === 'number' || value instanceof Vector3 || Array.isArray(value);
}

/** Resolve a r3f vector shorthand into `out`. */
export function resolveVector3(out: Vector3, value: Vector3Like): Vector3 {
  if (typeof value === 'number') return out.setScalar(value);
  if (value instanceof Vector3) return out.copy(value);
  return out.set(value[0], value[1], value[2] ?? 0);
}

/** A new tuple from a vector shorthand, or `undefined` to keep a setting's default. */
export function optionalVec3(value: Vector3Like | undefined): Vec3 | undefined {
  return value === undefined ? undefined : resolveVec3([0, 0, 0], value);
}

/** Resolve a r3f vector shorthand into the tuple `out`. */
export function resolveVec3(out: Vec3, value: Vector3Like): Vec3 {
  if (typeof value === 'number') return vec3.set(out, value, value, value);
  if (value instanceof Vector3) return vec3.set(out, value.x, value.y, value.z);
  return vec3.set(out, value[0], value[1], value[2] ?? 0);
}
