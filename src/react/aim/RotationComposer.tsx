import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createRotationComposerParams } from '../../core/aim/rotationComposer.js';
import { composerDebugZones } from '../../core/debug/debugZones.js';
import { DebugZoneOverlay } from '../DebugZoneOverlay.js';
import { resolveVec3 } from '../../three/resolve/resolveVector3.js';
import type { Target } from '../../three/resolve/Target.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { RotationComposerAim, type RotationComposerOptions } from '../../three/aim/RotationComposerAim.js';

export type RotationComposerProps = Omit<RotationComposerOptions, 'aspect'> & {
  /** Target to compose at `screenPosition`. Unresolved targets are ignored. */
  target?: Target;
  /** Draws the `deadZone` and `hardLimit` overlays. */
  debug?: boolean;
  ref?: Ref<RotationComposerAim>;
};

/** Keeps a target within a chosen screen region by rotating the camera. */
export function RotationComposer({ target, targetOffset, debug = false, ref, ...settings }: RotationComposerProps) {
  const camera = useVirtualCamera();
  const aspect = useThree((state) => state.viewport.aspect);
  const { targetOffset: defaultTargetOffset, ...params } = createRotationComposerParams({ ...settings, aspect });
  const [aim] = useState(() => new RotationComposerAim(target, params));
  aim.target = target;
  Object.assign(aim, params);
  resolveVec3(aim.targetOffset, targetOffset ?? defaultTargetOffset);
  aim.radius = settings.radius;
  aim.size = settings.size;

  useImperativeHandle(ref, () => aim, [aim]);
  useEffect(() => camera.setAim(aim), [camera, aim]);

  if (!debug) return null;
  return (
    <DebugZoneOverlay
      zones={composerDebugZones(aim.screenPosition, aim.deadZone, aim.hardLimit)}
      crosshair={aim.screenPosition}
    />
  );
}
