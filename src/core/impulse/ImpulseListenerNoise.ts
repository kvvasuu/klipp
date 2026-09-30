import { vec3, type Vec3 } from 'math';
import type { CameraState } from '../CameraState.js';
import type { BasicMultiChannelPerlinNoise } from '../noise/BasicMultiChannelPerlinNoise.js';
import { impulseField, type ImpulseField } from './ImpulseField.js';

const scratchOffset: Vec3 = [0, 0, 0];

/** Applies impulse offsets and optional strength-driven Perlin shake. */
export class ImpulseListenerNoise {
  field: ImpulseField;
  channelMask: number;
  gain: number;
  shake?: BasicMultiChannelPerlinNoise;
  cameraSpace: boolean;

  constructor(
    field: ImpulseField = impulseField,
    channelMask = 1,
    gain = 1,
    shake?: BasicMultiChannelPerlinNoise,
    cameraSpace = false,
  ) {
    this.field = field;
    this.channelMask = channelMask;
    this.gain = gain;
    this.shake = shake;
    this.cameraSpace = cameraSpace;
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
