import { Quaternion, Vector3, type Line, type Mesh, type Object3D, type Points } from 'three';
import { isVector3Like, resolveVector3, type Vector3Like } from './resolveVector3';
import type { TargetSlot } from './TargetRegistry';

/** A React-style ref, without depending on React. */
export type RefLike<T> = { current: T };

/** A fixed point, live object, or ref to a target object. */
export type Target = Object3D | RefLike<Object3D | null> | Vector3Like | null | undefined;

/** Resolve a target to its live object, if it has one. */
export function resolveTargetObject3D(target: Target): Object3D | null {
  if (target == null || isVector3Like(target)) return null;
  return ('current' in target ? target.current : target) ?? null;
}

const scratchWorldScale = new Vector3();

/** Identify geometry-bearing three.js objects. */
function isGeometryObject(object: Object3D): object is Mesh | Line | Points {
  const o = object as Partial<Mesh & Line & Points>;
  return o.isMesh === true || o.isLine === true || o.isPoints === true;
}

/** Resolve target dimensions, using explicit size, radius, or geometry bounds. */
export function resolveTargetSize(
  outSize: Vector3,
  target: Target,
  size?: Vector3Like,
  radius?: number,
  dynamicSize = false,
  slot?: TargetSlot | null,
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
  if (slot?.valid) scratchWorldScale.fromArray(slot.scale);
  else object.getWorldScale(scratchWorldScale);
  outSize.multiply(scratchWorldScale);
  return true;
}

/** Resolve a target to a world position, from `slot` when it holds this frame's value. */
export function resolveTargetPosition(out: Vector3, target: Target, slot?: TargetSlot | null): boolean {
  if (slot?.valid) {
    out.fromArray(slot.position);
    return true;
  }
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

/** Resolve a target to a world rotation. Fixed points return `false`. */
export function resolveTargetRotation(out: Quaternion, target: Target, slot?: TargetSlot | null): boolean {
  if (slot?.valid) {
    out.fromArray(slot.rotation);
    return true;
  }
  if (target == null) return false;
  if (isVector3Like(target)) return false;

  const object = 'current' in target ? target.current : target;
  if (!object) return false;

  object.getWorldQuaternion(out);
  return true;
}
