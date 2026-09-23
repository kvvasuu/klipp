import type { Vector3 as Vector3Like } from '@react-three/fiber';
import type { RefObject } from 'react';
import { Quaternion, Vector3, type Line, type Mesh, type Object3D, type Points } from 'three';
import { isVector3Like, resolveVector3 } from './resolveVector3';

/** A fixed point, live object, or ref to a target object. */
export type Target = Object3D | RefObject<Object3D | null> | Vector3Like | null | undefined;

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

/** Resolve target half-extents along two world axes. */
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

/** Resolve a target to a world position. */
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

/** Resolve a target to a world rotation. Fixed points return `false`. */
export function resolveTargetRotation(out: Quaternion, target: Target): boolean {
  if (target == null) return false;
  if (isVector3Like(target)) return false;

  const object = 'current' in target ? target.current : target;
  if (!object) return false;

  object.getWorldQuaternion(out);
  return true;
}
