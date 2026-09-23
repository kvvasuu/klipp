import { useEffect, useEffectEvent } from 'react';
import type { EventDispatcher } from 'three';
import type { CameraTransitionEventMap } from './KlippCore';

/** Callback props for camera transition events. */
export type CameraTransitionEventProps = {
  onActivated?: (event: CameraTransitionEventMap['activated']) => void;
  onDeactivated?: (event: CameraTransitionEventMap['deactivated']) => void;
  onBlendCreated?: (event: CameraTransitionEventMap['blendCreated']) => void;
  onBlendFinished?: (event: CameraTransitionEventMap['blendFinished']) => void;
  onCut?: (event: CameraTransitionEventMap['cut']) => void;
};

/** Subscribe to one camera transition event. */
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
