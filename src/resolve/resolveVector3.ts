import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';

/** True for anything r3f's flexible `Vector3` prop shorthand accepts. A real type predicate rather than
 *  a bare `Array.isArray` check, because `Array.isArray` alone doesn't narrow a `readonly [x,y,z]` tuple
 *  out of a union in the negative branch (a readonly array isn't a subtype of its `any[]` guard type). */
export function isVector3Like(value: unknown): value is Vector3Like {
  return typeof value === 'number' || value instanceof Vector3 || Array.isArray(value);
}

/** Resolves r3f's flexible `Vector3` prop shorthand (`THREE.Vector3 | [x,y,z] | number`) into `out`,
 *  matching `applyProps`'s own resolution order (instance → copy, array → set, number → setScalar). */
export function resolveVector3(out: Vector3, value: Vector3Like): Vector3 {
  if (typeof value === 'number') return out.setScalar(value);
  if (value instanceof Vector3) return out.copy(value);
  return out.set(value[0], value[1], value[2] ?? 0);
}
