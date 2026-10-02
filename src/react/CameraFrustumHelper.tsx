import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { Color, type CameraHelper, type ColorRepresentation } from 'three';
import { CameraFrustumHelper as FrustumHelper } from '../three/CameraFrustumHelper.js';
import { useIsLiveVirtualCamera, useVirtualCamera } from './VirtualCameraContext.js';

export type CameraFrustumHelperProps = {
  /** Single color for the whole helper. */
  color?: ColorRepresentation;
  /** Maximum distance drawn for the frustum. */
  maxDistance?: number;
  /** Whether to hide the helper while its camera is live. */
  hideWhenLive?: boolean;
  ref?: Ref<CameraHelper>;
};

/** Debug helper that draws the current virtual camera frustum. */
export function CameraFrustumHelper({
  color,
  maxDistance = 1,
  hideWhenLive = true,
  ref,
}: CameraFrustumHelperProps = {}) {
  const { state } = useVirtualCamera();
  const isLive = useIsLiveVirtualCamera();
  const size = useThree((s) => s.size);
  const [helper] = useState(() => new FrustumHelper(maxDistance));
  const [scratchColor] = useState(() => new Color());
  helper.maxDistance = maxDistance;

  useImperativeHandle(ref, () => helper, [helper]);
  useEffect(() => () => helper.dispose(), [helper]);

  useEffect(() => {
    if (color === undefined) return;
    scratchColor.set(color);
    helper.setColors(scratchColor, scratchColor, scratchColor, scratchColor, scratchColor);
  }, [helper, scratchColor, color]);

  useFrame(() => helper.sync(state, size.width / size.height));

  if (hideWhenLive && isLive) return null;
  return <primitive object={helper} />;
}
