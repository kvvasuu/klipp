import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useState } from 'react';
import { Vector3 } from 'three';
import { resolveVector3 } from '../resolve/resolveVector3';
import type { BasicMultiChannelPerlinProps } from './BasicMultiChannelPerlin';
import { BasicMultiChannelPerlinNoise } from './BasicMultiChannelPerlinNoise';

const defaultAmplitude: Vector3Like = [0, 0, 0];
const defaultFrequency: Vector3Like = [1, 1, 1];

/** Creates and synchronizes a shared Perlin noise instance from props. */
export function useBasicMultiChannelPerlinNoise({
  positionAmplitude = defaultAmplitude,
  positionFrequency = defaultFrequency,
  rotationAmplitude = defaultAmplitude,
  rotationFrequency = defaultFrequency,
  amplitudeGain = 1,
  frequencyGain = 1,
  seed,
  amplitudeDamping = 0,
}: Omit<BasicMultiChannelPerlinProps, 'ref'>): BasicMultiChannelPerlinNoise {
  const [noise] = useState(
    () =>
      new BasicMultiChannelPerlinNoise(
        new Vector3(),
        new Vector3(),
        new Vector3(),
        new Vector3(),
        amplitudeGain,
        frequencyGain,
        seed,
        amplitudeDamping,
      ),
  );
  resolveVector3(noise.positionAmplitude, positionAmplitude);
  resolveVector3(noise.positionFrequency, positionFrequency);
  resolveVector3(noise.rotationAmplitude, rotationAmplitude);
  resolveVector3(noise.rotationFrequency, rotationFrequency);
  noise.amplitudeGain = amplitudeGain;
  noise.frequencyGain = frequencyGain;
  noise.amplitudeDamping = amplitudeDamping;

  return noise;
}
