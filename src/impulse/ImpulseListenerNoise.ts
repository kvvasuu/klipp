import { Vector3 } from 'three';
import type { CameraState } from '../CameraState';
import type { BasicMultiChannelPerlinNoise } from '../noise/BasicMultiChannelPerlinNoise';
import { impulseField, type ImpulseField } from './ImpulseField';

const scratchPositionOffset = new Vector3();

/**
 * Additive position offset from in-flight impulse events (explosions, footsteps, anything that calls
 * `field.generate(...)`), plus an optional secondary `shake` - a `BasicMultiChannelPerlinNoise` whose
 * `amplitudeGain` this drives every frame from the impulse's current strength.
 *
 * `field` defaults to the shared `impulseField` singleton - pass your own instance only for isolated
 * impulse "worlds" (e.g. split-screen).
 */
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

  /** `now` (seconds, same clock as `ImpulseField.generate`/`sampleAt` - real time by default) is a 5th,
   *  optional param, NOT `dt` - `registerNoise` never passes it, so production code gets the real clock
   *  automatically; tests pass it explicitly for determinism instead of depending on wall time.
   *
   *  Returns whether `field` still has an event in flight - an event's constant-amplitude sustain phase
   *  can hold the exact same offset across several frames without being done, so klipp can't infer
   *  "settled" from this frame's output alone (see `CameraStateWriter` in `VirtualCameraController.ts`). */
  update = (out: CameraState, dt: number, justActivated: boolean, now?: number): boolean => {
    const strength = this.field.sampleAt(scratchPositionOffset, out.position, this.channelMask, this.gain, now);
    if (this.cameraSpace) scratchPositionOffset.applyQuaternion(out.quaternion);
    out.position.add(scratchPositionOffset);

    if (this.shake) {
      this.shake.amplitudeGain = strength;
      this.shake.update(out, dt, justActivated);
    }

    return this.field.hasEvents;
  };
}
