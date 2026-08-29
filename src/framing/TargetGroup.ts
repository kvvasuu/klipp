import { Vector3 } from 'three';
import { resolveTargetPosition, type Target } from '../resolve/Target';

export type TargetGroupMember = {
  target: Target;
  /** Influence on the group's position in `'groupAverage'` mode — non-negative, default `1`. Unused in
   *  `'groupCenter'` mode (that mode only cares about the member's extent, via `radius`). */
  weight?: number;
  /** This member's own bounding-sphere radius, folded into the GROUP's bounds — non-negative, default
   *  `0` (a dimensionless point). */
  radius?: number;
};

/** `'groupCenter'` — center of the AABB enclosing every member's own bounding sphere. `'groupAverage'` —
 *  weighted mean of member positions, ignoring radius. */
export type TargetGroupPositionMode = 'groupCenter' | 'groupAverage';

const scratchMemberPosition = new Vector3();
const scratchMin = new Vector3();
const scratchMax = new Vector3();
const scratchAccumulator = new Vector3();

/** Treats several targets, each with its own weight and radius, as one. A member that can't currently
 *  resolve (`null`/unmounted ref) is skipped, not treated as sitting at the origin. */
export class TargetGroup {
  members: TargetGroupMember[];
  positionMode: TargetGroupPositionMode;

  constructor(members: TargetGroupMember[] = [], positionMode: TargetGroupPositionMode = 'groupCenter') {
    this.members = members;
    this.positionMode = positionMode;
  }

  /** Writes the group's world position into `outPosition` and returns the radius of the smallest sphere,
   *  centered there, that encloses every resolvable member's own bounding sphere — the shape
   *  `GroupFraming` fits to screen space. Returns `0` (leaving `outPosition` untouched) if no member
   *  currently resolves, mirroring `resolveTargetPosition`'s "not ready" convention. */
  computeBounds = (outPosition: Vector3): number => {
    const resolved =
      this.positionMode === 'groupAverage'
        ? this.computeAveragePosition(outPosition)
        : this.computeCenterPosition(outPosition);
    if (!resolved) return 0;

    // regardless of how the center was chosen, the enclosing radius is always "how far this member's
    // own sphere reaches past it" — an AABB corner-to-corner distance is NOT the same thing (a sphere
    // doesn't need to cover a box's corners, only each member's actual surface)
    let radius = 0;
    for (const member of this.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      const reach = scratchMemberPosition.distanceTo(outPosition) + (member.radius ?? 0);
      if (reach > radius) radius = reach;
    }
    return radius;
  };

  private computeCenterPosition = (outPosition: Vector3): boolean => {
    let any = false;
    for (const member of this.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      const radius = member.radius ?? 0;
      if (!any) {
        scratchMin.copy(scratchMemberPosition).subScalar(radius);
        scratchMax.copy(scratchMemberPosition).addScalar(radius);
        any = true;
        continue;
      }
      scratchMin.x = Math.min(scratchMin.x, scratchMemberPosition.x - radius);
      scratchMin.y = Math.min(scratchMin.y, scratchMemberPosition.y - radius);
      scratchMin.z = Math.min(scratchMin.z, scratchMemberPosition.z - radius);
      scratchMax.x = Math.max(scratchMax.x, scratchMemberPosition.x + radius);
      scratchMax.y = Math.max(scratchMax.y, scratchMemberPosition.y + radius);
      scratchMax.z = Math.max(scratchMax.z, scratchMemberPosition.z + radius);
    }
    if (!any) return false;
    outPosition.addVectors(scratchMin, scratchMax).multiplyScalar(0.5);
    return true;
  };

  private computeAveragePosition = (outPosition: Vector3): boolean => {
    let totalWeight = 0;
    scratchAccumulator.set(0, 0, 0);
    for (const member of this.members) {
      const weight = member.weight ?? 1;
      if (weight <= 0) continue;
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      scratchAccumulator.addScaledVector(scratchMemberPosition, weight);
      totalWeight += weight;
    }
    if (totalWeight <= 0) return false;
    outPosition.copy(scratchAccumulator).multiplyScalar(1 / totalWeight);
    return true;
  };
}
