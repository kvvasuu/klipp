import { CameraFrustumHelper, type CameraFrustumHelperProps } from '@kvvasuu/klipp/react';
import { spectatorLayer } from './BaseScene';

/** `CameraFrustumHelper` moved onto `spectatorLayer` so it only ever shows up in `BaseScene`'s spectator
 *  inset, never in the main view (that view IS this camera). Always visible in the inset. */
export function SpectatorFrustum({ color, maxDistance }: Pick<CameraFrustumHelperProps, 'color' | 'maxDistance'>) {
  return (
    <CameraFrustumHelper
      color={color}
      maxDistance={maxDistance}
      hideWhenLive={false}
      ref={(helper) => helper?.layers.set(spectatorLayer)}
    />
  );
}
