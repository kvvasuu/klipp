import { Quaternion, Vector3 } from 'three';
import type { TargetExtent } from '../core/TargetExtent.js';
import { resolveTargetRotation, resolveTargetSize, type Target } from './resolve/Target.js';
import type { TargetSlot } from './resolve/TargetRegistry.js';
import type { Vector3Like } from './resolve/resolveVector3.js';

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
