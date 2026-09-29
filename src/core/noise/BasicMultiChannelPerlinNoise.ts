import type { Vec3 } from 'math';
import type { CameraState } from '../CameraState';
import type { DampingConstant } from '../damping/Damper';
import {
  createPerlinNoiseState,
  updatePerlinNoise,
  type PerlinNoiseParams,
  type PerlinNoiseState,
} from './perlinNoise';

/** Adds Perlin position and rotation noise to a camera state. */
export class BasicMultiChannelPerlinNoise implements PerlinNoiseParams {
  positionAmplitude: Vec3;
  positionFrequency: Vec3;
  rotationAmplitude: Vec3;
  rotationFrequency: Vec3;
  amplitudeGain: number;
  frequencyGain: number;
  amplitudeDamping: DampingConstant;

  readonly state: PerlinNoiseState;

  constructor(
    positionAmplitude: Vec3 = [0, 0, 0],
    positionFrequency: Vec3 = [1, 1, 1],
    rotationAmplitude: Vec3 = [0, 0, 0],
    rotationFrequency: Vec3 = [1, 1, 1],
    amplitudeGain = 1,
    frequencyGain = 1,
    seed = Math.random() * 10000,
    amplitudeDamping: DampingConstant = 0,
  ) {
    this.positionAmplitude = positionAmplitude;
    this.positionFrequency = positionFrequency;
    this.rotationAmplitude = rotationAmplitude;
    this.rotationFrequency = rotationFrequency;
    this.amplitudeGain = amplitudeGain;
    this.frequencyGain = frequencyGain;
    this.amplitudeDamping = amplitudeDamping;
    this.state = createPerlinNoiseState(seed, amplitudeGain);
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void =>
    updatePerlinNoise(out, this.state, this, dt, justActivated);
}
