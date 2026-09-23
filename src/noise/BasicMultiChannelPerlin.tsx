import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useEffect, useImperativeHandle, type Ref } from 'react';
import type { DampingConstant } from '../damping/Damper';
import { useVirtualCamera } from '../VirtualCameraContext';
import type { BasicMultiChannelPerlinNoise } from './BasicMultiChannelPerlinNoise';
import { useBasicMultiChannelPerlinNoise } from './useBasicMultiChannelPerlinNoise';

export type BasicMultiChannelPerlinProps = {
  /** Per-axis positional shake amplitude in camera-local space. */
  positionAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for position noise. */
  positionFrequency?: Vector3Like;
  /** Per-axis rotational shake amplitude in degrees. */
  rotationAmplitude?: Vector3Like;
  /** Per-axis oscillation speed for rotation noise. */
  rotationFrequency?: Vector3Like;
  /** Multiplies every amplitude at once. */
  amplitudeGain?: number;
  /** Multiplies every channel's frequency. */
  frequencyGain?: number;
  /** Seed for the six independent Perlin channels. It is fixed when the component mounts. */
  seed?: number;
  /** Response time for changes to `amplitudeGain`. */
  amplitudeDamping?: DampingConstant;
  ref?: Ref<BasicMultiChannelPerlinNoise>;
};

/** Adds position and rotation noise to the camera. */
export function BasicMultiChannelPerlin({ ref, ...props }: BasicMultiChannelPerlinProps) {
  const { controller } = useVirtualCamera();
  const noise = useBasicMultiChannelPerlinNoise(props);

  useImperativeHandle(ref, () => noise, [noise]);
  useEffect(() => controller.registerNoise(noise.update), [controller, noise]);

  return null;
}
