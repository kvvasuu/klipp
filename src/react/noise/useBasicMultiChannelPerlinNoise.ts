import { useState } from 'react';
import { createPerlinNoiseParams } from '../../core/noise/perlinNoise.js';
import { resolveVec3, type Vector3Like } from '../../three/resolve/resolveVector3.js';
import type { BasicMultiChannelPerlinProps } from './BasicMultiChannelPerlin.js';
import { BasicMultiChannelPerlinNoise } from '../../core/noise/BasicMultiChannelPerlinNoise.js';

const toVec3 = (value: Vector3Like | undefined) => (value === undefined ? undefined : resolveVec3([0, 0, 0], value));

/** Creates and synchronizes a shared Perlin noise instance from props. */
export function useBasicMultiChannelPerlinNoise({
  positionAmplitude,
  positionFrequency,
  rotationAmplitude,
  rotationFrequency,
  seed,
  ...settings
}: Omit<BasicMultiChannelPerlinProps, 'ref'>): BasicMultiChannelPerlinNoise {
  const params = createPerlinNoiseParams({
    ...settings,
    positionAmplitude: toVec3(positionAmplitude),
    positionFrequency: toVec3(positionFrequency),
    rotationAmplitude: toVec3(rotationAmplitude),
    rotationFrequency: toVec3(rotationFrequency),
  });
  const [noise] = useState(() => new BasicMultiChannelPerlinNoise({ ...params, seed }));
  Object.assign(noise, params);

  return noise;
}
