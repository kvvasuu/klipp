import { useEffect, useImperativeHandle, type Ref } from 'react';
import type { Vector3Like } from '../../three/resolve/resolveVector3.js';
import { useVirtualCamera } from '../VirtualCameraContext.js';
import type {
  BasicMultiChannelPerlinNoise,
  PerlinNoiseOptions,
} from '../../core/noise/BasicMultiChannelPerlinNoise.js';
import { useBasicMultiChannelPerlinNoise } from './useBasicMultiChannelPerlinNoise.js';

export type BasicMultiChannelPerlinProps = Omit<
  PerlinNoiseOptions,
  'positionAmplitude' | 'positionFrequency' | 'rotationAmplitude' | 'rotationFrequency'
> & {
  /** Per-axis positional shake amplitude in camera-local space. */
  positionAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for position noise. */
  positionFrequency?: Vector3Like;
  /** Per-axis rotational shake amplitude in degrees. */
  rotationAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for rotation noise. */
  rotationFrequency?: Vector3Like;
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
