import { Quaternion, Vector3 } from 'three';
import type { CameraState } from '../../core/CameraState';
import type { BasicMultiChannelPerlinNoise } from '../noise/BasicMultiChannelPerlinNoise';
import { impulseField, type ImpulseField } from './ImpulseField';

const scratchPositionOffset = new Vector3();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();

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
    scratchPosition.fromArray(out.position);
    const strength = this.field.sampleAt(scratchPositionOffset, scratchPosition, this.channelMask, this.gain, now);
    if (this.cameraSpace) scratchPositionOffset.applyQuaternion(scratchQuaternion.fromArray(out.quaternion));
    scratchPosition.add(scratchPositionOffset).toArray(out.position);

    if (this.shake) {
      this.shake.amplitudeGain = strength;
      this.shake.update(out, dt, justActivated);
    }

    return this.field.hasEvents;
  };
}
