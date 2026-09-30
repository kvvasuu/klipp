import { Quaternion, Vector3 } from 'three';
import type { Quat } from 'math';
import { resolveTargetPosition, resolveTargetRotation, type Target } from './resolve/Target.js';
import type { TargetSlot } from './resolve/TargetRegistry.js';
import type { TargetPose } from '../core/TargetPose.js';

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

/** Read only a target's world rotation into `out`. Returns false for fixed points and unresolved targets. */
export function readTargetRotation(out: Quat, target: Target, slot: TargetSlot | null): boolean {
  if (!resolveTargetRotation(scratchRotation, target, slot)) return false;
  scratchRotation.toArray(out);
  return true;
}
