import {
  BasicMultiChannelPerlinNoiseCore,
  type PerlinNoiseOptions as PerlinNoiseCoreOptions,
} from '../../core/noise/BasicMultiChannelPerlinNoiseCore.js';
import { optionalVec3, type Vector3Like } from '../resolve/resolveVector3.js';

export type PerlinNoiseOptions = Omit<
  PerlinNoiseCoreOptions,
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
};

/** `BasicMultiChannelPerlinNoiseCore` taking three.js vectors in its options. */
export class BasicMultiChannelPerlinNoise extends BasicMultiChannelPerlinNoiseCore {
  constructor({
    positionAmplitude,
    positionFrequency,
    rotationAmplitude,
    rotationFrequency,
    ...options
  }: PerlinNoiseOptions = {}) {
    super({
      ...options,
      positionAmplitude: optionalVec3(positionAmplitude),
      positionFrequency: optionalVec3(positionFrequency),
      rotationAmplitude: optionalVec3(rotationAmplitude),
      rotationFrequency: optionalVec3(rotationFrequency),
    });
  }
}
