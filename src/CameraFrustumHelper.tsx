import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CameraHelper, Color, PerspectiveCamera, type ColorRepresentation } from 'three';
import { useIsLiveVirtualCamera, useVirtualCamera } from './VirtualCameraContext';

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
  const [scratchCamera] = useState(() => new PerspectiveCamera());
  const [helper] = useState(() => new CameraHelper(scratchCamera));
  const [scratchColor] = useState(() => new Color());
  const lastLens = useRef({ fov: NaN, near: NaN, far: NaN, aspect: NaN });

  useImperativeHandle(ref, () => helper, [helper]);
  useEffect(() => () => helper.dispose(), [helper]);

  useEffect(() => {
    if (color === undefined) return;
    scratchColor.set(color);
    helper.setColors(scratchColor, scratchColor, scratchColor, scratchColor, scratchColor);
  }, [helper, scratchColor, color]);

  useFrame(() => {
    const aspect = size.width / size.height;
    const far = Math.min(state.far, maxDistance);
    const lens = lastLens.current;
    const lensChanged =
      lens.fov !== state.fov || lens.near !== state.near || lens.far !== far || lens.aspect !== aspect;
    if (lensChanged) {
      scratchCamera.fov = state.fov;
      scratchCamera.near = state.near;
      scratchCamera.far = far;
      scratchCamera.aspect = aspect;
      scratchCamera.updateProjectionMatrix();
      lens.fov = state.fov;
      lens.near = state.near;
      lens.far = far;
      lens.aspect = aspect;
    }

    const transformChanged =
      !scratchCamera.position.equals(state.position) || !scratchCamera.quaternion.equals(state.quaternion);
    if (transformChanged) {
      scratchCamera.position.copy(state.position);
      scratchCamera.quaternion.copy(state.quaternion);
      scratchCamera.updateMatrixWorld(true);
    }

    if (lensChanged || transformChanged) helper.update();
  });

  if (hideWhenLive && isLive) return null;
  return <primitive object={helper} />;
}
