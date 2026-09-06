import type { Vector3 as Vector3Like } from '@react-three/fiber';
import type { RefObject } from 'react';
import { Quaternion, Vector3, type Line, type Mesh, type Object3D, type Points } from 'three';
import { isVector3Like, resolveVector3 } from './resolveVector3';

/** What a Body/Aim `target` prop accepts: a fixed point (r3f's `Vector3` shorthand — instance, `[x,y,z]`,
 *  or a single number), a live object, or a ref to one that may mount later. `null`/`undefined` are
 *  accepted too — same "not ready yet" no-op as a ref whose `.current` isn't mounted — so a nullable
 *  piece of React state can be passed straight through without a caller-side `? :` coercion. */
export type Target = Object3D | RefObject<Object3D | null> | Vector3Like | null | undefined;

/** The live `Object3D` behind a `Target`, or `null` for a fixed point/unmounted ref - the "unwrap a ref,
 *  reject a bare point" step shared by every resolver below. */
export function resolveTargetObject3D(target: Target): Object3D | null {
  if (target == null || isVector3Like(target)) return null;
  return ('current' in target ? target.current : target) ?? null;
}

const scratchWorldScale = new Vector3();

/** Duck-types via three.js's own `is*` instance flags. **/
function isGeometryObject(object: Object3D): object is Mesh | Line | Points {
  const o = object as Partial<Mesh & Line & Points>;
  return o.isMesh === true || o.isLine === true || o.isPoints === true;
}

/** Resolves a target's full box dimensions - explicit `size` wins, then `radius` (returns `false`: a
 *  sphere/point, not a box), then auto-detection from a Mesh/Line/Points target's own geometry bounds
 *  (scaled by its current world scale). Auto-detection only computes the bounding box ONCE and reuses it
 *  after that (cheap, but stale for a deforming mesh - e.g. `SkinnedMesh` bone animation, or a procedural
 *  geometry mutating its position attribute directly) - pass `dynamicSize: true` to recompute it fresh
 *  every call instead, at the cost of an O(vertex count) scan each time. Returns `false` (`outSize`
 *  untouched) if nothing resolves. */
export function resolveTargetSize(
  outSize: Vector3,
  target: Target,
  size?: Vector3Like,
  radius?: number,
  dynamicSize = false,
): boolean {
  if (size) {
    resolveVector3(outSize, size);
    return true;
  }
  if (radius !== undefined) return false;

  const object = resolveTargetObject3D(target);
  if (!object || !isGeometryObject(object)) return false;
  if (dynamicSize || !object.geometry.boundingBox) object.geometry.computeBoundingBox();
  if (!object.geometry.boundingBox) return false;
  object.geometry.boundingBox.getSize(outSize);
  object.getWorldScale(scratchWorldScale);
  outSize.multiply(scratchWorldScale);
  return true;
}

const scratchHalfSize = new Vector3();
const scratchAxisX = new Vector3();
const scratchAxisY = new Vector3();
const scratchAxisZ = new Vector3();
const scratchTargetRotation = new Quaternion();
const scratchTargetSize = new Vector3();

/** Half a target's reach along two given world axes (typically a camera's Right/Up) - `[0, 0]` for a
 *  dimensionless point (no `radius`/`size`, nothing auto-detected). A box's half-extent along an axis is
 *  the sum of its own (rotated) half-size axes' projections onto it - the standard oriented-bounding-box
 *  formula. Writes into `outExtents` in place - no allocation. */
export function resolveTargetHalfExtents(
  outExtents: [number, number],
  target: Target,
  size: Vector3Like | undefined,
  radius: number | undefined,
  axisA: Vector3,
  axisB: Vector3,
  dynamicSize = false,
): void {
  if (radius !== undefined && !size) {
    outExtents[0] = radius;
    outExtents[1] = radius;
    return;
  }
  if (!resolveTargetSize(scratchTargetSize, target, size, radius, dynamicSize)) {
    outExtents[0] = 0;
    outExtents[1] = 0;
    return;
  }

  if (!resolveTargetRotation(scratchTargetRotation, target)) scratchTargetRotation.identity();
  scratchHalfSize.copy(scratchTargetSize).multiplyScalar(0.5);
  scratchAxisX.set(scratchHalfSize.x, 0, 0).applyQuaternion(scratchTargetRotation);
  scratchAxisY.set(0, scratchHalfSize.y, 0).applyQuaternion(scratchTargetRotation);
  scratchAxisZ.set(0, 0, scratchHalfSize.z).applyQuaternion(scratchTargetRotation);
  outExtents[0] =
    Math.abs(scratchAxisX.dot(axisA)) + Math.abs(scratchAxisY.dot(axisA)) + Math.abs(scratchAxisZ.dot(axisA));
  outExtents[1] =
    Math.abs(scratchAxisX.dot(axisB)) + Math.abs(scratchAxisY.dot(axisB)) + Math.abs(scratchAxisZ.dot(axisB));
}

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
