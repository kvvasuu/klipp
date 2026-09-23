import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import type { BasicMultiChannelPerlinProps } from '../noise/BasicMultiChannelPerlin';
import { useBasicMultiChannelPerlinNoise } from '../noise/useBasicMultiChannelPerlinNoise';
import { useVirtualCamera } from '../VirtualCameraContext';
import { impulseField, type ImpulseField } from './ImpulseField';
import { ImpulseListenerNoise } from './ImpulseListenerNoise';

/** Perlin shake options driven by the current impulse strength. */
export type ImpulseShakeProps = Omit<BasicMultiChannelPerlinProps, 'amplitudeGain' | 'ref'>;

export type ImpulseListenerProps = {
  /** Impulse field to sample. */
  field?: ImpulseField;
  /** Only reacts to events where `(event.channel & channelMask) !== 0`. */
  channelMask?: number;
  /** Multiplies the sampled offset. `0` mutes this listener entirely. */
  gain?: number;
  /** Optional Perlin shake driven by the impulse strength. */
  shake?: ImpulseShakeProps;
  /** Whether to apply the impulse direction in camera space. */
  cameraSpace?: boolean;
  ref?: Ref<ImpulseListenerNoise>;
};

/** Adds impulse-driven camera shake and kick. */
export function ImpulseListener({
  field = impulseField,
  channelMask = 1,
  gain = 1,
  shake,
  cameraSpace = false,
  ref,
}: ImpulseListenerProps) {
  const { controller } = useVirtualCamera();
  const [listener] = useState(() => new ImpulseListenerNoise(field, channelMask, gain));
  listener.field = field;
  listener.channelMask = channelMask;
  listener.gain = gain;
  listener.cameraSpace = cameraSpace;

  useImperativeHandle(ref, () => listener, [listener]);
  useEffect(() => controller.registerNoise(listener.update), [controller, listener]);

  return shake ? <ImpulseListenerShake listener={listener} {...shake} /> : null;
}

/** Mounts the optional Perlin shake. */
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
