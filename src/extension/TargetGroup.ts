import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { Vector3 } from 'three';
import { resolveTargetPosition, resolveTargetSize, type Target } from '../resolve/Target';

export type TargetGroupMember = {
  target: Target;
  /** Position weight used by `groupAverage`. */
  weight?: number;
  /** Bounding-sphere radius. Ignored when `size` is set. */
  radius?: number;
  /** Bounding-box dimensions. Takes priority over `radius`. */
  size?: Vector3Like;
};

/** Strategy used to compute the group's position. */
export type TargetGroupPositionMode = 'groupCenter' | 'groupAverage';

const scratchMemberPosition = new Vector3();
const scratchMin = new Vector3();
const scratchMax = new Vector3();
const scratchAccumulator = new Vector3();
const scratchSize = new Vector3();

/** Combines multiple targets into one position and bound. */
export class TargetGroup {
  members: TargetGroupMember[];
  positionMode: TargetGroupPositionMode;

  constructor(members: TargetGroupMember[] = [], positionMode: TargetGroupPositionMode = 'groupCenter') {
    this.members = members;
    this.positionMode = positionMode;
  }

  /** Resolve a member's dimensions. */
  resolveMemberSize = (outSize: Vector3, member: TargetGroupMember, dynamicSize = false): boolean =>
    resolveTargetSize(outSize, member.target, member.size, member.radius, dynamicSize);

  /** Write the group position and return a conservative enclosing radius. */
  computeBounds = (outPosition: Vector3, dynamicSize = false): number => {
    const resolved =
      this.positionMode === 'groupAverage'
        ? this.computeAveragePosition(outPosition)
        : this.computeCenterPosition(outPosition, dynamicSize);
    if (!resolved) return 0;

    let radius = 0;
    for (const member of this.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      const reach = scratchMemberPosition.distanceTo(outPosition) + this.resolveFallbackRadius(member, dynamicSize);
      if (reach > radius) radius = reach;
    }
    return radius;
  };

  private resolveFallbackRadius = (member: TargetGroupMember, dynamicSize = false): number => {
    if (this.resolveMemberSize(scratchSize, member, dynamicSize)) return scratchSize.length() / 2; // box's own half-diagonal
    return member.radius ?? 0;
  };

  private computeCenterPosition = (outPosition: Vector3, dynamicSize = false): boolean => {
    let any = false;
    for (const member of this.members) {
      if (!resolveTargetPosition(scratchMemberPosition, member.target)) continue;
      const radius = this.resolveFallbackRadius(member, dynamicSize);
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
