import { useThree } from '@react-three/fiber';
import { useEffect, useImperativeHandle, useState, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { BlendHints } from '../core/blend/BlendHints.js';
import { VirtualCameraThree } from '../three/VirtualCameraThree.js';
import { useKlipp } from './KlippContext.js';
import { useCameraTransitionEvent, type CameraTransitionEventProps } from './useCameraTransitionEvent.js';
import {
  useVirtualCamera,
  VirtualCameraActiveContext,
  VirtualCameraContext,
  VirtualCameraLiveContext,
  type InitialCameraState,
} from './VirtualCameraContext.js';

export type VirtualCameraProps = {
  name: string;
  priority: number;
  /** Whether this camera participates in arbitration and updates. */
  active?: boolean;
  /** Blend hints for transitions involving this camera. */
  hints?: BlendHints;
  /** Initial pose applied once when the camera mounts. */
  initialState?: InitialCameraState;
  children?: ReactNode;
  ref?: Ref<VirtualCameraThree>;
};

/** Registers a virtual camera with the nearest `<Klipp>`. */
export function VirtualCamera({
  name,
  priority,
  active = true,
  hints = BlendHints.none,
  initialState,
  children,
  ref,
}: VirtualCameraProps) {
  const klipp = useKlipp();
  const invalidate = useThree((state) => state.invalidate);
  const [camera] = useState(() => new VirtualCameraThree(name, { priority, active, hints, initialState }));
  useImperativeHandle(ref, () => camera, [camera]);

  // Settings first, so a (re)registration below already uses them.
  useEffect(() => {
    camera.name = name;
  }, [camera, name]);

  useEffect(() => {
    camera.priority = priority;
    if (camera.active) invalidate();
  }, [camera, priority, invalidate]);

  useEffect(() => {
    camera.hints = hints;
  }, [camera, hints]);

  useEffect(() => {
    camera.active = active;
    invalidate();
  }, [camera, active, invalidate]);

  useEffect(() => {
    const remove = klipp.add(camera);
    invalidate();
    return () => {
      remove();
      invalidate();
    };
  }, [klipp, camera, invalidate]);

  const isActive = useSyncExternalStore(klipp.subscribeActiveId, () => active && klipp.isActive(name));
  const isLive = useSyncExternalStore(klipp.subscribeLiveId, () => active && klipp.isLive(name));

  return (
    <VirtualCameraContext.Provider value={camera}>
      <VirtualCameraActiveContext.Provider value={isActive}>
        <VirtualCameraLiveContext.Provider value={isLive}>{children}</VirtualCameraLiveContext.Provider>
      </VirtualCameraActiveContext.Provider>
    </VirtualCameraContext.Provider>
  );
}

export type VirtualCameraEventsProps = CameraTransitionEventProps;

/** Listen to transition events from the nearest virtual camera. */
export function VirtualCameraEvents({
  onActivated,
  onDeactivated,
  onBlendCreated,
  onBlendFinished,
  onCut,
}: VirtualCameraEventsProps) {
  const camera = useVirtualCamera();

  useCameraTransitionEvent(camera, 'activated', onActivated);
  useCameraTransitionEvent(camera, 'deactivated', onDeactivated);
  useCameraTransitionEvent(camera, 'blendCreated', onBlendCreated);
  useCameraTransitionEvent(camera, 'blendFinished', onBlendFinished);
  useCameraTransitionEvent(camera, 'cut', onCut);

  return null;
}

VirtualCamera.Events = VirtualCameraEvents;
