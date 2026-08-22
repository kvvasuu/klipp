import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { useVirtualCameraSlots } from '../VirtualCamera';
import { impulseManager, type ImpulseManager } from './ImpulseManager';
import { ImpulseListenerNoise } from './ImpulseListenerNoise';

export type ImpulseListenerProps = {
  /** Which `ImpulseManager` to sample from. Default: the shared `impulseManager` singleton — pass your
   *  own instance only for isolated impulse "worlds" (e.g. split-screen). */
  manager?: ImpulseManager;
  /** Only reacts to events where `(event.channel & channelMask) !== 0`. Default `1`. */
  channelMask?: number;
  /** Multiplies the sampled offset. `0` mutes this listener entirely. Default `1`. */
  gain?: number;
  /** Imperative access to the underlying `ImpulseListenerNoise`. */
  ref?: Ref<ImpulseListenerNoise>;
};

/** Additive camera shake from in-flight impulse events, see `ImpulseListenerNoise`'s doc comment for the
 *  algorithm. Thin wrapper — the actual logic lives there. */
export function ImpulseListener({ manager = impulseManager, channelMask = 1, gain = 1, ref }: ImpulseListenerProps) {
  const slots = useVirtualCameraSlots();
  const [listener] = useState(() => new ImpulseListenerNoise(manager, channelMask, gain));
  listener.manager = manager;
  listener.channelMask = channelMask;
  listener.gain = gain;

  useImperativeHandle(ref, () => listener, [listener]);
  useEffect(() => slots.registerNoise(listener.update), [slots, listener]);

  return null;
}
