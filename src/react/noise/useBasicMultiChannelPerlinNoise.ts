import { useState } from 'react';
import { createPerlinNoiseParams } from '../../core/noise/perlinNoise.js';
import { resolveVec3 } from '../../three/resolve/resolveVector3.js';
import type { BasicMultiChannelPerlinProps } from './BasicMultiChannelPerlin.js';
import { BasicMultiChannelPerlinNoiseThree } from '../../three/noise/BasicMultiChannelPerlinNoiseThree.js';

/** Creates and synchronizes a shared Perlin noise instance from props. */
export function useBasicMultiChannelPerlinNoise({
  positionAmplitude,
  positionFrequency,
  rotationAmplitude,
  rotationFrequency,
  seed,
  ...settings
}: Omit<BasicMultiChannelPerlinProps, 'ref'>): BasicMultiChannelPerlinNoiseThree {
  const {
    positionAmplitude: defaultPositionAmplitude,
    positionFrequency: defaultPositionFrequency,
    rotationAmplitude: defaultRotationAmplitude,
    rotationFrequency: defaultRotationFrequency,
    ...params
  } = createPerlinNoiseParams(settings);
  const [noise] = useState(() => new BasicMultiChannelPerlinNoiseThree({ ...params, seed }));
  Object.assign(noise, params);
  resolveVec3(noise.positionAmplitude, positionAmplitude ?? defaultPositionAmplitude);
  resolveVec3(noise.positionFrequency, positionFrequency ?? defaultPositionFrequency);
  resolveVec3(noise.rotationAmplitude, rotationAmplitude ?? defaultRotationAmplitude);
  resolveVec3(noise.rotationFrequency, rotationFrequency ?? defaultRotationFrequency);

  return noise;
}
