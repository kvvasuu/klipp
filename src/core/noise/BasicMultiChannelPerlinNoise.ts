import type { Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { DampingConstant } from '../damping/Damper.js';
import {
  createPerlinNoiseParams,
  createPerlinNoiseState,
  updatePerlinNoise,
  type PerlinNoiseParams,
  type PerlinNoiseState,
} from './perlinNoise.js';

export type PerlinNoiseOptions = Partial<PerlinNoiseParams> & {
  /** Seed for the six independent Perlin channels. Random when omitted. */
  seed?: number;
};

/** Adds Perlin position and rotation noise to a camera state. */
export class BasicMultiChannelPerlinNoise implements PerlinNoiseParams {
  declare positionAmplitude: Vec3;
  declare positionFrequency: Vec3;
  declare rotationAmplitude: Vec3;
  declare rotationFrequency: Vec3;
  declare amplitudeGain: number;
  declare frequencyGain: number;
  declare amplitudeDamping: DampingConstant;

  readonly state: PerlinNoiseState;

  constructor(options?: PerlinNoiseOptions) {
    Object.assign(this, createPerlinNoiseParams(options));
    this.state = createPerlinNoiseState(options?.seed ?? Math.random() * 10000, this.amplitudeGain);
  }

  update = (out: CameraState, dt: number, justActivated: boolean): void =>
    updatePerlinNoise(out, this.state, this, dt, justActivated);
}
