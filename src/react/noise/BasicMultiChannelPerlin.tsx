import { useEffect, useImperativeHandle, type Ref } from 'react';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import type {
  BasicMultiChannelPerlinNoiseThree,
  PerlinNoiseThreeOptions,
} from '../../three/noise/BasicMultiChannelPerlinNoiseThree.js';
import { useBasicMultiChannelPerlinNoise } from './useBasicMultiChannelPerlinNoise.js';

export type BasicMultiChannelPerlinProps = PerlinNoiseThreeOptions & {
  ref?: Ref<BasicMultiChannelPerlinNoiseThree>;
};

/** Adds position and rotation noise to the camera. */
export function BasicMultiChannelPerlin({ ref, ...props }: BasicMultiChannelPerlinProps) {
  const camera = useVirtualCamera();
  const noise = useBasicMultiChannelPerlinNoise(props);

  useImperativeHandle(ref, () => noise, [noise]);
  useEffect(() => camera.addNoise(noise), [camera, noise]);

  return null;
}
