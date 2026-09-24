import { CameraFrustumHelper, type CameraFrustumHelperProps } from '@kvvasuu/klipp/react';
import { spectatorLayer } from './BaseScene';

/** A frustum helper visible only in the spectator inset, since the main view is this camera. */
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
