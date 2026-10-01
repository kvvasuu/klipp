import { vec3, type Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { BasicMultiChannelPerlinNoise } from '../noise/BasicMultiChannelPerlinNoise.js';
import { withDefaults } from '../params.js';
import { impulseField, type ImpulseField } from './ImpulseField.js';

const scratchOffset: Vec3 = [0, 0, 0];

export type ImpulseListenerParams = {
  /** Impulse field to sample. */
  field: ImpulseField;
  /** Only reacts to events where `(event.channel & channelMask) !== 0`. */
  channelMask: number;
  /** Multiplies the sampled offset. `0` mutes this listener entirely. */
  gain: number;
  /** Whether to apply the impulse direction in camera space. */
  cameraSpace: boolean;
};

/** Every setting from `settings`, or its default. */
export const createImpulseListenerParams = (settings?: Partial<ImpulseListenerParams>): ImpulseListenerParams =>
  withDefaults({ field: impulseField, channelMask: 1, gain: 1, cameraSpace: false }, settings);

export type ImpulseListenerOptions = Partial<ImpulseListenerParams> & {
  /** Perlin shake driven by the impulse strength. */
  shake?: BasicMultiChannelPerlinNoise;
};

/** Applies impulse offsets and optional strength-driven Perlin shake. */
export class ImpulseListenerNoise implements ImpulseListenerParams {
  declare field: ImpulseField;
  declare channelMask: number;
  declare gain: number;
  declare cameraSpace: boolean;
  shake?: BasicMultiChannelPerlinNoise;

  constructor(options?: ImpulseListenerOptions) {
    Object.assign(this, createImpulseListenerParams(options));
    this.shake = options?.shake;
  }

  /** Apply the current impulse effect and report whether events remain active. */
  update = (out: CameraState, dt: number, justActivated: boolean, now?: number): boolean => {
    const strength = this.field.sampleAt(scratchOffset, out.position, this.channelMask, this.gain, now);
    if (this.cameraSpace) vec3.transformQuat(scratchOffset, scratchOffset, out.quaternion);
    vec3.add(out.position, out.position, scratchOffset);

    if (this.shake) {
      this.shake.amplitudeGain = strength;
      this.shake.update(out, dt, justActivated);
    }

    return this.field.hasEvents;
  };
}
