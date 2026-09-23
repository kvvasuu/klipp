import { useEffect, useEffectEvent } from 'react';
import type { EventDispatcher } from 'three';
import type { CameraTransitionEventMap } from './KlippCore';

/** The `CameraTransitionEventMap` entries `VirtualCamera.Events`/`Klipp.Events` both forward as optional
 *  callback props - one shared shape instead of two identical type declarations. */
export type CameraTransitionEventProps = {
  onActivated?: (event: CameraTransitionEventMap['activated']) => void;
  onDeactivated?: (event: CameraTransitionEventMap['deactivated']) => void;
  onBlendCreated?: (event: CameraTransitionEventMap['blendCreated']) => void;
  onBlendFinished?: (event: CameraTransitionEventMap['blendFinished']) => void;
  onCut?: (event: CameraTransitionEventMap['cut']) => void;
};

/** Subscribes `listener` to `dispatcher`'s `type` event for as long as it's set - shared by
 *  `VirtualCamera.Events` and `Klipp.Events`, both of which forward several `CameraTransitionEventMap`
 *  entries as optional callback props. `useEffectEvent` keeps the subscription itself stable across
 *  re-renders (`dispatcher`/`type` rarely change) while still calling the latest `listener` closure. */
export function useCameraTransitionEvent<T extends keyof CameraTransitionEventMap>(
  dispatcher: EventDispatcher<CameraTransitionEventMap>,
  type: T,
  listener: ((event: CameraTransitionEventMap[T]) => void) | undefined,
): void {
  const onEvent = useEffectEvent((event: CameraTransitionEventMap[T]) => {
    listener?.(event);
  });

  useEffect(() => {
    dispatcher.addEventListener(type, onEvent);
    return () => dispatcher.removeEventListener(type, onEvent);
  }, [dispatcher, type]);
}
