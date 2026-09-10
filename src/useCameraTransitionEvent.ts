import { useEffect, useEffectEvent } from 'react';
import type { EventDispatcher } from 'three';
import type { CameraTransitionEventMap } from './KlippCore';

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
