import { useEffect, useImperativeHandle, type Ref } from 'react';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import type {
  BasicMultiChannelPerlinNoise,
  PerlinNoiseOptions,
} from '../../three/noise/BasicMultiChannelPerlinNoise.js';
import { useBasicMultiChannelPerlinNoise } from './useBasicMultiChannelPerlinNoise.js';

export type BasicMultiChannelPerlinProps = PerlinNoiseOptions & {
  ref?: Ref<BasicMultiChannelPerlinNoise>;
};

/** Adds position and rotation noise to the camera. */
export function BasicMultiChannelPerlin({ ref, ...props }: BasicMultiChannelPerlinProps) {
  const camera = useVirtualCamera();
  const noise = useBasicMultiChannelPerlinNoise(props);

  useImperativeHandle(ref, () => noise, [noise]);
  useEffect(() => camera.addNoise(noise), [camera, noise]);

  return null;
}
