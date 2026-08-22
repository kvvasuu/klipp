import type { Vector3 as Vector3Like } from '@react-three/fiber';
import type { RefObject } from 'react';
import type { Object3D, Quaternion, Vector3 } from 'three';
import { isVector3Like, resolveVector3 } from './resolveVector3';

/** What a Body/Aim `target` prop accepts: a fixed point (r3f's `Vector3` shorthand — instance, `[x,y,z]`,
 *  or a single number), a live object, or a ref to one that may mount later. `null`/`undefined` are
 *  accepted too — same "not ready yet" no-op as a ref whose `.current` isn't mounted — so a nullable
 *  piece of React state can be passed straight through without a caller-side `? :` coercion. */
export type Target = Object3D | RefObject<Object3D | null> | Vector3Like | null | undefined;

/** Resolves a `Target` to a world position. Returns `false` (leaving `out` untouched) for `null`/
 *  `undefined` or a ref that isn't mounted yet — everything else always resolves. */
export function resolveTargetPosition(out: Vector3, target: Target): boolean {
  if (target == null) return false;

  if (isVector3Like(target)) {
    resolveVector3(out, target);
    return true;
  }

  const object = 'current' in target ? target.current : target;
  if (!object) return false;

  object.getWorldPosition(out);
  return true;
}

/** Resolves a `Target`'s world rotation. A fixed-point target has no rotation to give, so this returns
 *  `false` (leaving `out` untouched) for one — callers that want to degrade gracefully (e.g. `Follow`'s
 *  offset falling back to world space) should fall back to identity themselves, not treat it as an error. */
export function resolveTargetRotation(out: Quaternion, target: Target): boolean {
  if (target == null) return false;
  if (isVector3Like(target)) return false;

  const object = 'current' in target ? target.current : target;
  if (!object) return false;

  object.getWorldQuaternion(out);
  return true;
}
