import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useState } from 'react';
import { resolveVec3 } from '../../three/resolve/resolveVector3.js';
import type { BasicMultiChannelPerlinProps } from './BasicMultiChannelPerlin.js';
import { BasicMultiChannelPerlinNoise } from '../../core/noise/BasicMultiChannelPerlinNoise.js';

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
        [0, 0, 0],
        [1, 1, 1],
        [0, 0, 0],
        [1, 1, 1],
        amplitudeGain,
        frequencyGain,
        seed,
        amplitudeDamping,
      ),
  );
  resolveVec3(noise.positionAmplitude, positionAmplitude);
  resolveVec3(noise.positionFrequency, positionFrequency);
  resolveVec3(noise.rotationAmplitude, rotationAmplitude);
  resolveVec3(noise.rotationFrequency, rotationFrequency);
  noise.amplitudeGain = amplitudeGain;
  noise.frequencyGain = frequencyGain;
  noise.amplitudeDamping = amplitudeDamping;

  return noise;
}
