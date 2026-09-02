import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CameraHelper, Color, PerspectiveCamera, type ColorRepresentation } from 'three';
import { useIsLiveVirtualCamera, useVirtualCameraState } from './VirtualCamera';

export type CameraFrustumHelperProps = {
  /** Single color for the whole helper. Default: `THREE.CameraHelper`'s own built-in colors. */
  color?: ColorRepresentation;
  /** Caps how far the drawn frustum extends, regardless of the camera's own (often much larger) `far` —
   *  keeps the cone a sane on-screen size. Default `1`. */
  maxDistance?: number;
  /** Hides the helper while this is the camera actually on screen right now — its frustum would radiate
   *  from the viewer's own eye at that point, which is more visual noise than signal. Default `true`. */
  hideWhenLive?: boolean;
  /** Imperative access to the underlying `THREE.CameraHelper`. */
  ref?: Ref<CameraHelper>;
};

/**
 * Debug visualization: draws the nearest `<VirtualCamera>`'s own frustum, synced from its raw
 * `CameraState` (`useVirtualCameraState`) — so it stays visible and accurate even while this camera isn't
 * the current priority winner, since arbitration never stops its Body/Aim/Extension/Noise from running.
 */
export function CameraFrustumHelper({
  color,
  maxDistance = 1,
  hideWhenLive = true,
  ref,
}: CameraFrustumHelperProps = {}) {
  const state = useVirtualCameraState();
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
