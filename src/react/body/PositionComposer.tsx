import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createPositionComposerParams } from '../../core/body/positionComposer.js';
import { composerDebugZones } from '../../core/debug/debugZones.js';
import { DebugZoneOverlay } from '../DebugZoneOverlay.js';
import type { Target } from '../../three/resolve/Target.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { PositionComposerBody, type PositionComposerOptions } from '../../three/body/PositionComposerBody.js';

export type PositionComposerProps = Omit<PositionComposerOptions, 'aspect'> & {
  /** Target to compose around. Unresolved targets are ignored. */
  target?: Target;
  /** Draws the `deadZone` and `hardLimit` overlays. */
  debug?: boolean;
  ref?: Ref<PositionComposerBody>;
};

/** Positions the camera around a target while maintaining screen composition. */
export function PositionComposer({ target, debug = false, ref, ...settings }: PositionComposerProps) {
  const camera = useVirtualCamera();
  const aspect = useThree((state) => state.viewport.aspect);
  const params = createPositionComposerParams({ ...settings, aspect });
  const [body] = useState(() => new PositionComposerBody(target, params));
  body.target = target;
  Object.assign(body, params);
  body.radius = settings.radius;
  body.size = settings.size;

  useImperativeHandle(ref, () => body, [body]);
  useEffect(() => camera.setBody(body), [camera, body]);

  if (!debug) return null;
  return (
    <DebugZoneOverlay
      zones={composerDebugZones(body.screenPosition, body.deadZone, body.hardLimit)}
      crosshair={body.screenPosition}
    />
  );
}
