import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';
import { resolveTargetPosition, resolveTargetSize, type Target } from '../resolve/Target';

export type TargetGroupMember = {
  target: Target;
  /** Influence on the group's position in `'groupAverage'` mode — non-negative, default `1`. Unused in
   *  `'groupCenter'` mode (that mode only cares about the member's extent, via `radius`/`size`). */
  weight?: number;
  /** This member's own bounding-sphere radius, folded into the GROUP's bounds — non-negative, default
   *  `0` (a dimensionless point). Ignored if `size` is given. */
  radius?: number;
  /** Full box dimensions (width/height/depth) for a non-spherical member — takes priority over `radius`.
   *  Auto-detected from `target.geometry.boundingBox` when `target` is a `Mesh` and neither `size` nor
   *  `radius` is given. */
  size?: Vector3Like;
};

/** `'groupCenter'` — center of the AABB enclosing every member's own bounding sphere. `'groupAverage'` —
 *  weighted mean of member positions, ignoring radius. */
export type TargetGroupPositionMode = 'groupCenter' | 'groupAverage';

const scratchMemberPosition = new Vector3();
const scratchMin = new Vector3();
const scratchMax = new Vector3();
const scratchAccumulator = new Vector3();
const scratchSize = new Vector3();

/** Treats several targets, each with its own weight and radius/size, as one. A member that can't currently
 *  resolve (`null`/unmounted ref) is skipped, not treated as sitting at the origin. */
export class TargetGroup {
  members: TargetGroupMember[];
  positionMode: TargetGroupPositionMode;

  constructor(members: TargetGroupMember[] = [], positionMode: TargetGroupPositionMode = 'groupCenter') {
    this.members = members;
    this.positionMode = positionMode;
  }

  /** Resolves one member's full box dimensions — see `resolveTargetSize`. */
  resolveMemberSize = (outSize: Vector3, member: TargetGroupMember): boolean =>
    resolveTargetSize(outSize, member.target, member.size, member.radius);

  /** Writes the group's world position into `outPosition` and returns the radius of the smallest sphere,
   *  centered there, that encloses every resolvable member's own bounding sphere — a conservative
   *  fallback extent (box members contribute their bounding sphere here, not their tight silhouette; see
   *  `GroupFraming` for the camera-aware box fit). Returns `0` (leaving `outPosition` untouched) if no
   *  member currently resolves, mirroring `resolveTargetPosition`'s "not ready" convention. */
  computeBounds = (outPosition: Vector3): number => {
    const resolved =
      this.positionMode === 'groupAverage'
        ? this.computeAveragePosition(outPosition)
        : this.computeCenterPosition(outPosition);
    if (!resolved) return 0;

    let radius = 0;
    for (const member of this.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      const reach = scratchMemberPosition.distanceTo(outPosition) + this.resolveFallbackRadius(member);
      if (reach > radius) radius = reach;
    }
    return radius;
  };

  private resolveFallbackRadius = (member: TargetGroupMember): number => {
    if (this.resolveMemberSize(scratchSize, member)) return scratchSize.length() / 2; // box's own half-diagonal
    return member.radius ?? 0;
  };

  private computeCenterPosition = (outPosition: Vector3): boolean => {
    let any = false;
    for (const member of this.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      const radius = this.resolveFallbackRadius(member);
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
