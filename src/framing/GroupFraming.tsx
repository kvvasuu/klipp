import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { GroupFramingExtension } from './GroupFramingExtension';
import { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './TargetGroup';

export type GroupFramingProps = {
  /** Targets to keep framed, each with its own Weight/Radius/Size — see `TargetGroupMember`. */
  members: TargetGroupMember[];
  /** See `TargetGroupPositionMode`. Default `'groupCenter'`. */
  positionMode?: TargetGroupPositionMode;
  /** Margin kept clear around the group's members, in world units. Default `0`. */
  padding?: number;
  /** Seconds to catch up to the distance ceiling (and `screenPosition`) as they change. `0` (default)
   *  = hard, instant. */
  damping?: DampingConstant;
  /** Shifts the frustum without moving/rotating the camera — e.g. to keep the framed group visually
   *  centered in the space left over after reserving room for UI on one side. Same convention as
   *  `PositionComposer`'s `screenPosition` (0 = center, ±1 = frame edge), not pixels. Default `[0, 0]`. */
  screenPosition?: [number, number];
  /** Imperative access to the underlying `GroupFramingExtension`, for reading/writing its fields (or
   *  the `TargetGroup` it owns) directly instead of through props. */
  ref?: Ref<GroupFramingExtension>;
};

/**
 * Thin wrapper — the actual logic lives in `GroupFramingExtension` (dolly-only distance ceiling) and
 * `TargetGroup` (position/bounds from `members`). Only works correctly when this `VirtualCamera`'s Aim
 * already looks straight at the same group's position.
 */
export function GroupFraming({
  members,
  positionMode = 'groupCenter',
  padding = 0,
  damping = 0,
  screenPosition = [0, 0],
  ref,
}: GroupFramingProps) {
  const slots = useVirtualCameraSlots();
  const size = useThree((state) => state.size);
  const [group] = useState(() => new TargetGroup(members, positionMode));
  const [extension] = useState(
    () => new GroupFramingExtension(group, padding, size.width, size.height, damping, screenPosition),
  );

  group.members = members;
  group.positionMode = positionMode;
  extension.padding = padding;
  extension.viewportWidth = size.width;
  extension.viewportHeight = size.height;
  extension.damping = damping;
  extension.screenPosition = screenPosition;

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => slots.registerExtension(extension.update), [slots, extension]);

  return null;
}
