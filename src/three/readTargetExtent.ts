import type { Vec3 } from 'math';
import { Quaternion, Vector3 } from 'three';
import { createTargetExtent, projectTargetExtent, type TargetExtent } from '../core/TargetExtent';
import { resolveTargetRotation, resolveTargetSize, type Target } from './resolve/Target';
import type { TargetSlot } from './resolve/TargetRegistry';
import type { Vector3Like } from './resolve/resolveVector3';

const scratchSize = new Vector3();
const scratchRotation = new Quaternion();

/**
 * Resolve how far a target reaches: an explicit `size`, else `radius`, else its geometry's bounds.
 * `dynamicSize` re-measures geometry instead of using the cached bounding box.
 */
export function readTargetExtent(
  out: TargetExtent,
  target: Target,
  size: Vector3Like | undefined,
  radius: number | undefined,
  dynamicSize: boolean,
  slot: TargetSlot | null,
): TargetExtent {
  out.hasSize = false;
  if (radius !== undefined && !size) {
    out.radius = radius;
    return out;
  }
  out.radius = 0;
  if (!resolveTargetSize(scratchSize, target, size, radius, dynamicSize, slot)) return out;

  out.hasSize = true;
  scratchSize.toArray(out.size);
  if (resolveTargetRotation(scratchRotation, target, slot)) scratchRotation.toArray(out.rotation);
  else scratchRotation.identity().toArray(out.rotation);
  return out;
}

const scratchExtent = createTargetExtent();
const scratchAxisA: Vec3 = [0, 0, 0];
const scratchAxisB: Vec3 = [0, 0, 0];

/** Resolve target half-extents along two world axes. */
export function resolveTargetHalfExtents(
  outExtents: [number, number],
  target: Target,
  size: Vector3Like | undefined,
  radius: number | undefined,
  axisA: Vector3,
  axisB: Vector3,
  dynamicSize = false,
  slot?: TargetSlot | null,
): void {
  readTargetExtent(scratchExtent, target, size, radius, dynamicSize, slot ?? null);
  projectTargetExtent(outExtents, scratchExtent, axisA.toArray(scratchAxisA), axisB.toArray(scratchAxisB));
}
