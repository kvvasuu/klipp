import { useFrame, useThree } from '@react-three/fiber';
import { clamp, degreesToRadians } from 'math';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import { DebugZoneOverlay, type DebugZone } from '../DebugZoneOverlay';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCameraSlots, useVirtualCameraState } from '../VirtualCamera';
import { GroupFramingExtension } from './GroupFramingExtension';
import { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './TargetGroup';

const scratchGroupPosition = new Vector3();
/** Below this change, a re-render isn't worth it - the box would visually look identical anyway. */
const DEBUG_BOX_EPSILON = 0.002;

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
  /** Draws `padding` as a bordered box inset from the frame edges - only while this `VirtualCamera` is on
   *  screen. Unlike `deadZone`/`hardLimit`'s fixed fraction, `padding` is a world-unit margin, so its
   *  on-screen size is re-measured every frame. Default `false`. */
  debug?: boolean;
  /** Imperative access to the underlying `GroupFramingExtension`, for reading/writing its fields (or the
   *  `TargetGroup` it owns) directly instead of through props, and for calling `recalculateSize()` on a
   *  member that deformed - auto-detected member sizes are otherwise only measured once. */
  ref?: Ref<GroupFramingExtension>;
};

/**
 * Thin wrapper — the actual logic lives in `GroupFramingExtension` (dolly-only distance ceiling) and
 * `TargetGroup` (position/bounds from `members`). Only works correctly when this `VirtualCamera`'s Aim
 * already looks straight at the same group's position.
 */
export function GroupFraming({ members, positionMode, padding, damping, screenPosition, debug = false, ref }: GroupFramingProps) {
  const slots = useVirtualCameraSlots();
  const size = useThree((state) => state.size);
  const [group] = useState(() => new TargetGroup(members, positionMode));
  const [extension] = useState(
    () => new GroupFramingExtension(group, padding, size.width, size.height, damping, screenPosition),
  );

  group.members = members;
  // only synced when actually passed - otherwise this would fight a ref-based imperative mutation on
  // every unrelated re-render
  if (positionMode !== undefined) group.positionMode = positionMode;
  if (padding !== undefined) extension.padding = padding;
  extension.viewportWidth = size.width;
  extension.viewportHeight = size.height;
  if (damping !== undefined) extension.damping = damping;
  if (screenPosition !== undefined) extension.screenPosition = screenPosition;

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => slots.registerExtension(extension.update), [slots, extension]);

  const cameraState = useVirtualCameraState();
  const [paddingBox, setPaddingBox] = useState<[number, number] | null>(null);

  useFrame(() => {
    if (!debug) return;
    const boundsRadius = group.computeBounds(scratchGroupPosition);
    if (boundsRadius <= 0) {
      setPaddingBox((previous) => (previous === null ? previous : null));
      return;
    }
    const distance = cameraState.position.distanceTo(scratchGroupPosition);
    const halfHeight = distance * Math.tan(degreesToRadians(cameraState.fov) / 2);
    const halfWidth = halfHeight * (size.width / size.height);
    // fraction convention matches deadZone/hardLimit's ([2, 2] = full frame) - clamped so a padding
    // bigger than the frame itself doesn't invert the box
    const next: [number, number] = [
      clamp(1 - extension.padding / halfWidth, 0, 1) * 2,
      clamp(1 - extension.padding / halfHeight, 0, 1) * 2,
    ];
    setPaddingBox((previous) =>
      previous && Math.abs(previous[0] - next[0]) < DEBUG_BOX_EPSILON && Math.abs(previous[1] - next[1]) < DEBUG_BOX_EPSILON
        ? previous
        : next,
    );
  });

  if (!debug || !paddingBox) return null;
  const zones: DebugZone[] = [{ screenPosition: extension.screenPosition, size: paddingBox, color: '#3399cc' }];
  return <DebugZoneOverlay zones={zones} />;
}
