import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createRotationComposerParams } from '../../core/aim/rotationComposer.js';
import { composerDebugZones } from '../../core/debug/debugZones.js';
import { DebugZoneOverlay } from '../DebugZoneOverlay.js';
import { resolveVec3, type Vector3Like } from '../../three/resolve/resolveVector3.js';
import type { Target } from '../../three/resolve/Target.js';
import { useTargetSlot } from '../useTargetSlot.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { RotationComposerAim, type RotationComposerOptions } from '../../three/aim/RotationComposerAim.js';

export type RotationComposerProps = Omit<RotationComposerOptions, 'aspect' | 'targetOffset'> & {
  /** Target to compose at `screenPosition`. Unresolved targets are ignored. */
  target?: Target;
  /** Offset applied in the target's local rotation space. */
  targetOffset?: Vector3Like;
  /** Draws the `deadZone` and `hardLimit` overlays. */
  debug?: boolean;
  ref?: Ref<RotationComposerAim>;
};

/** Keeps a target within a chosen screen region by rotating the camera. */
export function RotationComposer({ target, targetOffset, debug = false, ref, ...settings }: RotationComposerProps) {
  const { controller, state: cameraState, initialState } = useVirtualCamera();
  const aspect = useThree((state) => state.viewport.aspect);
  const params = createRotationComposerParams({
    ...settings,
    aspect,
    targetOffset: targetOffset === undefined ? undefined : resolveVec3([0, 0, 0], targetOffset),
  });
  const [aim] = useState(() => {
    const instance = new RotationComposerAim(target, params);
    if (initialState?.quaternion) instance.primeFrom(cameraState.quaternion);
    return instance;
  });
  aim.target = target;
  aim.targetSlot = useTargetSlot(target);
  Object.assign(aim, params);
  aim.radius = settings.radius;
  aim.size = settings.size;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => controller.registerAim(aim.update), [controller, aim]);

  if (!debug) return null;
  return (
    <DebugZoneOverlay
      zones={composerDebugZones(aim.screenPosition, aim.deadZone, aim.hardLimit)}
      crosshair={aim.screenPosition}
    />
  );
}
