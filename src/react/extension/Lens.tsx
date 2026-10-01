import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { createLensParams } from '../../core/extension/lens.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import { LensExtension, type LensOptions } from '../../core/extension/LensExtension.js';

export type LensProps = LensOptions & { ref?: Ref<LensExtension> };

/** Animates the camera lens without forcing a React re-render. */
export function Lens({ ref, ...settings }: LensProps) {
  const camera = useVirtualCamera();
  const invalidate = useThree((state) => state.invalidate);
  const params = createLensParams(settings);
  const [extension] = useState(() => new LensExtension(params));
  Object.assign(extension, params);

  useImperativeHandle(ref, () => extension, [extension]);
  useEffect(() => camera.addExtension(extension), [camera, extension]);

  const { fov, near, far, fovDamping, nearDamping, farDamping } = params;
  useEffect(() => {
    invalidate();
  }, [fov, near, far, fovDamping, nearDamping, farDamping, invalidate]);

  return null;
}
