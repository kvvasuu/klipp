import { useState } from 'react';
import { createPerlinNoiseParams } from '../../core/noise/perlinNoise.js';
import { resolveVec3 } from '../../three/resolve/resolveVector3.js';
import type { BasicMultiChannelPerlinProps } from './BasicMultiChannelPerlin.js';
import { BasicMultiChannelPerlinNoise } from '../../three/noise/BasicMultiChannelPerlinNoise.js';

/** Creates and synchronizes a shared Perlin noise instance from props. */
export function useBasicMultiChannelPerlinNoise({
  positionAmplitude,
  positionFrequency,
  rotationAmplitude,
  rotationFrequency,
  seed,
  ...settings
}: Omit<BasicMultiChannelPerlinProps, 'ref'>): BasicMultiChannelPerlinNoise {
  const {
    positionAmplitude: defaultPositionAmplitude,
    positionFrequency: defaultPositionFrequency,
    rotationAmplitude: defaultRotationAmplitude,
    rotationFrequency: defaultRotationFrequency,
    ...params
  } = createPerlinNoiseParams(settings);
  const [noise] = useState(() => new BasicMultiChannelPerlinNoise({ ...params, seed }));
  Object.assign(noise, params);
  resolveVec3(noise.positionAmplitude, positionAmplitude ?? defaultPositionAmplitude);
  resolveVec3(noise.positionFrequency, positionFrequency ?? defaultPositionFrequency);
  resolveVec3(noise.rotationAmplitude, rotationAmplitude ?? defaultRotationAmplitude);
  resolveVec3(noise.rotationFrequency, rotationFrequency ?? defaultRotationFrequency);

  return noise;
}
