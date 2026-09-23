import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';

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
