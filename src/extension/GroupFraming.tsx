import { useFrame, useThree } from '@react-three/fiber';
import { clamp, degreesToRadians } from 'math';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Vector3 } from 'three';
import type { DampingConstant } from '../damping/Damper';
import { DebugZoneOverlay, type DebugZone } from '../DebugZoneOverlay';
import { useVirtualCamera } from '../VirtualCameraContext';
import { GroupFramingExtension, type GroupFramingFitMode, type GroupFramingMode } from './GroupFramingExtension';
import { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './TargetGroup';

const scratchGroupPosition = new Vector3();
/** Minimum visible change for the debug overlay. */
const DEBUG_BOX_EPSILON = 0.002;

// Use the frustum plane distance for a padded box.
function paddingBoxEdgeFraction(halfFov: number, distance: number, padding: number): number {
  return clamp(1 - padding / (distance * Math.sin(halfFov)), 0, 1);
}

export type GroupFramingProps = {
  /** Targets to keep in frame. */
  members: TargetGroupMember[];
  positionMode?: TargetGroupPositionMode;
  /** Margin kept clear around the group's members, in world units. */
  padding?: number;
  /** Response time for distance and screen composition. */
  damping?: DampingConstant;
  /** Maximum damping speed, in world units/sec. */
  maxSpeed?: number;
  /** Frustum offset used to compose the group on screen. */
  screenPosition?: [number, number];
  fitMode?: GroupFramingFitMode;
  /** Minimum and maximum fit distance. */
  minDistance?: number;
  maxDistance?: number;
  framingMode?: GroupFramingMode;
  /** Draws the padding boundary while this camera is live. */
  debug?: boolean;
  ref?: Ref<GroupFramingExtension>;
};

/** Keeps a target group framed within the camera. */
export function GroupFraming({
  members,
  positionMode = 'groupCenter',
  padding = 0,
  damping = 0,
  maxSpeed = Infinity,
  screenPosition = [0, 0],
  fitMode = 'ceiling',
  minDistance = 0,
  maxDistance = Infinity,
  framingMode = 'horizontalAndVertical',
  debug = false,
  ref,
}: GroupFramingProps) {
  const { controller, state: cameraState } = useVirtualCamera();
  const size = useThree((state) => state.size);
  const [group] = useState(() => new TargetGroup(members, positionMode));
  const [extension] = useState(
    () =>
      new GroupFramingExtension(
        group,
        padding,
        size.width,
        size.height,
        damping,
        screenPosition,
        fitMode,
        minDistance,
        maxDistance,
        framingMode,
        maxSpeed,
      ),
  );

  group.members = members;
  group.positionMode = positionMode;
  extension.padding = padding;
  extension.viewportWidth = size.width;
  extension.viewportHeight = size.height;
  extension.damping = damping;
  extension.maxSpeed = maxSpeed;
  extension.screenPosition = screenPosition;
  extension.fitMode = fitMode;
  extension.minDistance = minDistance;
  extension.maxDistance = maxDistance;
  extension.framingMode = framingMode;

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
    const distance = cameraState.position.distanceTo(scratchGroupPosition);
    const verticalHalfFov = degreesToRadians(cameraState.fov) / 2;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (size.width / size.height));
    // an excluded axis has no padding boundary to show - full frame, not a fabricated constraint
    const next: [number, number] = [
      framingMode === 'vertical' ? 2 : paddingBoxEdgeFraction(horizontalHalfFov, distance, padding) * 2,
      framingMode === 'horizontal' ? 2 : paddingBoxEdgeFraction(verticalHalfFov, distance, padding) * 2,
    ];
    setPaddingBox((previous) =>
      previous &&
      Math.abs(previous[0] - next[0]) < DEBUG_BOX_EPSILON &&
      Math.abs(previous[1] - next[1]) < DEBUG_BOX_EPSILON
        ? previous
        : next,
    );
  });

  if (!debug || !paddingBox) return null;
  const zones: DebugZone[] = [{ screenPosition, size: paddingBox, className: 'klipp-debug-groupframing' }];
  return <DebugZoneOverlay zones={zones} />;
}
