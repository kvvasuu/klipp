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
import { vec4 } from 'math';
import { Quaternion, Vector3 } from 'three';
import { BlendHints } from '../core/blend/BlendHints.js';
import { copyCameraState, createCameraState, mergeCameraState } from '../core/CameraState.js';
import { useKlipp } from './KlippContext.js';
import { resolveVector3 } from '../three/resolve/resolveVector3.js';
import { useCameraTransitionEvent, type CameraTransitionEventProps } from './useCameraTransitionEvent.js';
import {
  useVirtualCamera,
  VirtualCameraActiveContext,
  VirtualCameraContext,
  VirtualCameraLiveContext,
  type InitialCameraState,
  type VirtualCameraContextValue,
} from './VirtualCameraContext.js';
import { VirtualCameraController } from '../core/VirtualCameraController.js';

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
      const { position, quaternion, target, lookAtTarget, referenceUp, ...rest } = initialState;
      mergeCameraState(seeded, rest);
      const scratch = new Vector3();
      if (position) resolveVector3(scratch, position).toArray(seeded.position);
      if (quaternion instanceof Quaternion) quaternion.toArray(seeded.quaternion);
      else if (quaternion) vec4.copy(seeded.quaternion, quaternion);
      if (target) resolveVector3(scratch, target).toArray(seeded.target);
      if (lookAtTarget) resolveVector3(scratch, lookAtTarget).toArray(seeded.lookAtTarget);
      if (referenceUp) resolveVector3(scratch, referenceUp).toArray(seeded.referenceUp);
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
