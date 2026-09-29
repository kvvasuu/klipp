import type { Vec3 } from 'math';
import { Vector3 } from 'three';
import {
  computeGroupBounds,
  createGroupMember,
  type GroupMember,
  type GroupPositionMode,
} from '../../core/extension/groupFraming';
import { readTargetExtent } from '../readTargetExtent';
import { resolveTargetPosition, resolveTargetSize, type Target } from '../resolve/Target';
import type { TargetSlot } from '../resolve/TargetRegistry';
import type { Vector3Like } from '../resolve/resolveVector3';

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
export type TargetGroupPositionMode = GroupPositionMode;

const scratchPosition = new Vector3();
const scratchCenter: Vec3 = [0, 0, 0];
const noSlots: ReadonlyMap<Target, TargetSlot> = new Map();

/** Combines multiple targets into one position and bound. */
export class TargetGroup {
  members: TargetGroupMember[];
  positionMode: TargetGroupPositionMode;
  /** Registry slots by member target; members without one are resolved directly. */
  memberSlots: ReadonlyMap<Target, TargetSlot> = noSlots;

  private readonly resolved: GroupMember[] = [];

  constructor(members: TargetGroupMember[] = [], positionMode: TargetGroupPositionMode = 'groupCenter') {
    this.members = members;
    this.positionMode = positionMode;
  }

  slotOf = (member: TargetGroupMember): TargetSlot | null => this.memberSlots.get(member.target) ?? null;

  /** Resolve a member's dimensions. */
  resolveMemberSize = (outSize: Vector3, member: TargetGroupMember, dynamicSize = false): boolean =>
    resolveTargetSize(outSize, member.target, member.size, member.radius, dynamicSize, this.slotOf(member));

  /** Resolve every member's position and extent for this frame, as plain data for the core. */
  resolveMembers = (dynamicSize = false): readonly GroupMember[] => {
    const count = this.members.length;
    while (this.resolved.length < count) this.resolved.push(createGroupMember());
    this.resolved.length = count;
    for (let i = 0; i < count; i++) {
      const member = this.members[i];
      const out = this.resolved[i];
      const slot = this.slotOf(member);
      out.weight = member.weight ?? 1;
      out.resolved = resolveTargetPosition(scratchPosition, member.target, slot);
      if (!out.resolved) continue;
      scratchPosition.toArray(out.position);
      readTargetExtent(out.extent, member.target, member.size, member.radius, dynamicSize, slot);
    }
    return this.resolved;
  };

  /** Write the group position and return a conservative enclosing radius. */
  computeBounds = (outPosition: Vector3, dynamicSize = false): number => {
    const radius = computeGroupBounds(scratchCenter, this.resolveMembers(dynamicSize), this.positionMode);
    if (radius < 0) return 0;
    outPosition.fromArray(scratchCenter);
    return radius;
  };
}
