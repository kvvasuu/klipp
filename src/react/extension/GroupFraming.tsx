import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import { createGroupFramingParams } from '../../core/extension/groupFraming.js';
import { groupFramingPaddingBox } from '../../core/debug/debugZones.js';
import { DebugZoneOverlay } from '../DebugZoneOverlay.js';
import { useTargetSlots } from '../useTargetSlot.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { GroupFramingExtension, type GroupFramingOptions } from '../../three/extension/GroupFramingExtension.js';
import {
  TargetGroup,
  type TargetGroupMember,
  type TargetGroupPositionMode,
} from '../../three/extension/TargetGroup.js';

const scratchGroupPosition = new Vector3();
const scratchCameraPosition = new Vector3();
/** Minimum visible change for the debug overlay. */
const DEBUG_BOX_EPSILON = 0.002;

export type GroupFramingProps = Omit<GroupFramingOptions, 'viewportWidth' | 'viewportHeight'> & {
  /** Targets to keep in frame. */
  members: TargetGroupMember[];
  /** Strategy used to compute the group's position. */
  positionMode?: TargetGroupPositionMode;
  /** Draws the padding boundary while this camera is live. */
  debug?: boolean;
  ref?: Ref<GroupFramingExtension>;
};

/** Keeps a target group framed within the camera. */
export function GroupFraming({
  members,
  positionMode = 'groupCenter',
  debug = false,
  ref,
  ...settings
}: GroupFramingProps) {
  const { controller, state: cameraState } = useVirtualCamera();
  const size = useThree((state) => state.size);
  const params = createGroupFramingParams({ ...settings, viewportWidth: size.width, viewportHeight: size.height });
  const [group] = useState(() => new TargetGroup(members, positionMode));
  const [extension] = useState(() => new GroupFramingExtension(group, params));

  group.members = members;
  group.memberSlots = useTargetSlots(members.map((member) => member.target));
  group.positionMode = positionMode;
  Object.assign(extension, params);

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => controller.registerExtension(extension.update), [controller, extension]);

  const [paddingBox, setPaddingBox] = useState<[number, number] | null>(null);

  useFrame(() => {
    if (!debug) return;
    const boundsRadius = group.computeBounds(scratchGroupPosition);
    if (boundsRadius <= 0) {
      setPaddingBox((previous) => (previous === null ? previous : null));
      return;
    }
    const distance = scratchCameraPosition.fromArray(cameraState.position).distanceTo(scratchGroupPosition);
    const next = groupFramingPaddingBox(
      [0, 0],
      cameraState.fov,
      size.width / size.height,
      distance,
      extension.padding,
      extension.framingMode,
    );
    setPaddingBox((previous) =>
      previous &&
      Math.abs(previous[0] - next[0]) < DEBUG_BOX_EPSILON &&
      Math.abs(previous[1] - next[1]) < DEBUG_BOX_EPSILON
        ? previous
        : next,
    );
  });

  if (!debug || !paddingBox) return null;
  return (
    <DebugZoneOverlay
      zones={[{ screenPosition: extension.screenPosition, size: paddingBox, className: 'klipp-debug-groupframing' }]}
    />
  );
}
