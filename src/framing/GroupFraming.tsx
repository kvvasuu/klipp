import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { GroupFramingExtension } from './GroupFramingExtension';
import { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './TargetGroup';

export type GroupFramingProps = {
  /** Targets to keep framed, each with its own Weight/Radius — see `TargetGroupMember`. */
  members: TargetGroupMember[];
  /** See `TargetGroupPositionMode`. Default `'groupCenter'`. */
  positionMode?: TargetGroupPositionMode;
  /** Margin kept clear on every side, in screen pixels. Default `0`. */
  paddingPixels?: number;
  /** Seconds to catch up to the fitted distance as the group's bounds change. `0` (default) = hard,
   *  instant fit. */
  damping?: DampingConstant;
  /** Imperative access to the underlying `GroupFramingExtension`, for reading/writing its fields (or
   *  the `TargetGroup` it owns) directly instead of through props. */
  ref?: Ref<GroupFramingExtension>;
};

/**
 * Thin wrapper — the actual logic lives in `GroupFramingExtension` (dolly-only distance fit) and
 * `TargetGroup` (position/bounds from `members`). Owns its own `TargetGroup` instance built from
 * `members`/`positionMode`; pass the same array reference across renders if you want to mutate members
 * in place instead of replacing the whole array.
 *
 * Only works correctly when this `VirtualCamera`'s Aim already looks straight at the SAME group's
 * position (dolly-only framing moves along the existing sightline — it doesn't establish one).
 */
export function GroupFraming({
  members,
  positionMode = 'groupCenter',
  paddingPixels = 0,
  damping = 0,
  ref,
}: GroupFramingProps) {
  const slots = useVirtualCameraSlots();
  const size = useThree((state) => state.size);
  const [group] = useState(() => new TargetGroup(members, positionMode));
  const [extension] = useState(
    () => new GroupFramingExtension(group, paddingPixels, size.width, size.height, damping),
  );

  group.members = members;
  group.positionMode = positionMode;
  extension.paddingPixels = paddingPixels;
  extension.viewportWidth = size.width;
  extension.viewportHeight = size.height;
  extension.damping = damping;

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => slots.registerExtension(extension.update), [slots, extension]);

  return null;
}
