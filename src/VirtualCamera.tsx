import { useThree } from '@react-three/fiber';
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import { BlendHints } from './blend/BlendHints';
import { copyCameraState, createCameraState, mergeCameraState } from './CameraState';
import { useKlipp } from './KlippContext';
import { resolveVector3 } from './resolve/resolveVector3';
import { useCameraTransitionEvent, type CameraTransitionEventProps } from './useCameraTransitionEvent';
import {
  useVirtualCamera,
  VirtualCameraActiveContext,
  VirtualCameraContext,
  VirtualCameraLiveContext,
  type InitialCameraState,
  type VirtualCameraContextValue,
} from './VirtualCameraContext';
import { VirtualCameraController } from './VirtualCameraController';

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
  ref?: Ref<VirtualCameraController>;
};

/** Registers a virtual camera with the nearest `Klipp`. */
export function VirtualCamera({
  name,
  priority,
  active = true,
  hints = BlendHints.none,
  initialState,
  children,
  ref,
}: VirtualCameraProps) {
  const { core, registerUpdate, initialCameraState } = useKlipp();
  const invalidate = useThree((state) => state.invalidate);
  const [context] = useState<VirtualCameraContextValue>(() => {
    const seeded = copyCameraState(createCameraState(), initialCameraState);
    if (initialState) {
      const { position, target, lookAtTarget, ...rest } = initialState;
      mergeCameraState(seeded, rest);
      if (position) resolveVector3(seeded.position, position);
      if (target) resolveVector3(seeded.target, target);
      if (lookAtTarget) resolveVector3(seeded.lookAtTarget, lookAtTarget);
    }
    return { controller: new VirtualCameraController(name), state: seeded, initialState };
  });
  const { state, controller } = context;
  controller.name = name;
  useImperativeHandle(ref, () => controller, [controller]);
  useEffect(() => controller.trackEvents(core), [controller, core]);

  const registerCamera = useEffectEvent(() => core.registerCamera({ id: name, priority, state, hints }));

  useEffect(() => {
    if (!active) return;
    invalidate();
    const unregister = registerCamera();
    return () => {
      unregister();
      invalidate();
    };
  }, [core, name, state, active, invalidate]);

  useEffect(() => {
    if (!active) return;
    invalidate();
    core.updatePriority(name, priority);
  }, [core, name, priority, active, invalidate]);

  useEffect(() => {
    if (!active) return;
    core.updateHints(name, hints);
  }, [core, name, hints, active]);

  useEffect(() => {
    if (!active) return;
    // Reactivation starts with a fresh activation flag.
    let justActivated = true;
    return registerUpdate((dt) => {
      const stillInFlight = controller.update(state, dt, justActivated);
      justActivated = false;
      return stillInFlight;
    });
  }, [registerUpdate, controller, state, active]);

  const isActive = useSyncExternalStore(core.subscribeActiveId, () => active && core.isActive(name));
  const isLive = useSyncExternalStore(core.subscribeLiveId, () => active && core.isLive(name));

  return (
    <VirtualCameraContext.Provider value={context}>
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
  const { controller } = useVirtualCamera();

  useCameraTransitionEvent(controller, 'activated', onActivated);
  useCameraTransitionEvent(controller, 'deactivated', onDeactivated);
  useCameraTransitionEvent(controller, 'blendCreated', onBlendCreated);
  useCameraTransitionEvent(controller, 'blendFinished', onBlendFinished);
  useCameraTransitionEvent(controller, 'cut', onCut);

  return null;
}

VirtualCamera.Events = VirtualCameraEvents;
