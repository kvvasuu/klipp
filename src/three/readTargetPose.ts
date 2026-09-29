import { Quaternion, Vector3 } from 'three';
import { resolveTargetPosition, resolveTargetRotation, type Target } from './resolve/Target';
import type { TargetSlot } from './resolve/TargetRegistry';
import type { TargetPose } from '../core/TargetPose';

const scratchPosition = new Vector3();
const scratchRotation = new Quaternion();

/** Read a target's world pose into `out`, from `slot` when it is fresh. Returns false when unresolved. */
export function readTargetPose(
  out: TargetPose,
  target: Target,
  slot: TargetSlot | null,
  withRotation: boolean,
): boolean {
  if (!resolveTargetPosition(scratchPosition, target, slot)) return false;
  scratchPosition.toArray(out.position);
  out.hasRotation = withRotation && resolveTargetRotation(scratchRotation, target, slot);
  if (out.hasRotation) scratchRotation.toArray(out.rotation);
  return true;
}
