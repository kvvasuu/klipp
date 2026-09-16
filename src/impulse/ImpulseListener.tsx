import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { BasicMultiChannelPerlinProps } from '../noise/BasicMultiChannelPerlin';
import { useBasicMultiChannelPerlinNoise } from '../noise/useBasicMultiChannelPerlinNoise';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { impulseField, type ImpulseField } from './ImpulseField';
import { ImpulseListenerNoise } from './ImpulseListenerNoise';

/** Same props as `<Noise.BasicMultiChannelPerlin>`, minus `amplitudeGain` - `ImpulseListener` drives that
 *  itself from the impulse's current strength every frame. */
export type ImpulseShakeProps = Omit<BasicMultiChannelPerlinProps, 'amplitudeGain' | 'ref'>;

export type ImpulseListenerProps = {
  /** Which `ImpulseField` to sample from. Default: the shared `impulseField` singleton - pass your own
   *  instance only for isolated impulse "worlds" (e.g. split-screen). */
  field?: ImpulseField;
  /** Only reacts to events where `(event.channel & channelMask) !== 0`. Default `1`. */
  channelMask?: number;
  /** Multiplies the sampled offset. `0` mutes this listener entirely. Default `1`. */
  gain?: number;
  /** Secondary shake, riding on top of the kick - its `amplitudeGain` is overwritten every frame by the
   *  impulse's current strength. Omit for a pure position kick with no rattle. */
  shake?: ImpulseShakeProps;
  /** Rotates the sampled offset by the camera's current orientation, so the same `direction` always kicks
   *  the same way relative to where the camera is looking instead of a fixed world-space vector.
   *  Default `false`. */
  cameraSpace?: boolean;
  /** Imperative access to the underlying `ImpulseListenerNoise`. */
  ref?: Ref<ImpulseListenerNoise>;
};

/** Additive camera shake from in-flight impulse events, see `ImpulseListenerNoise`'s doc comment for the
 *  algorithm. Thin wrapper - the actual logic lives there. */
export function ImpulseListener({
  field = impulseField,
  channelMask = 1,
  gain = 1,
  shake,
  cameraSpace = false,
  ref,
}: ImpulseListenerProps) {
  const slots = useVirtualCameraSlots();
  const [listener] = useState(() => new ImpulseListenerNoise(field, channelMask, gain));
  listener.field = field;
  listener.channelMask = channelMask;
  listener.gain = gain;
  listener.cameraSpace = cameraSpace;

  useImperativeHandle(ref, () => listener, [listener]);
  useEffect(() => slots.registerNoise(listener.update), [slots, listener]);

  return shake ? <ImpulseListenerShake listener={listener} {...shake} /> : null;
}

/** Mounted only when `shake` is given */
function ImpulseListenerShake({ listener, ...props }: ImpulseShakeProps & { listener: ImpulseListenerNoise }) {
  const shakeNoise = useBasicMultiChannelPerlinNoise(props);

  useEffect(() => {
    listener.shake = shakeNoise;
    return () => {
      listener.shake = undefined;
    };
  }, [listener, shakeNoise]);

  return null;
}
