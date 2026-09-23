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
  /** Whether this camera is a candidate at all, independent of `priority`. `false` means not registered
   *  with `KlippCore` at all - its Body/Aim/Noise don't run either. Default `true`. */
  active?: boolean;
  /** Combined (OR'd) with whichever other camera is on the other end of a transition into/out of this
   *  one - see `BlendHints`. Default `BlendHints.none`. */
  hints?: BlendHints;
  /** Overrides this camera's starting pose at mount, before any Body/Aim ever runs. Only the fields you
   *  set are overridden; applied once, at mount. */
  initialState?: InitialCameraState;
  children?: ReactNode;
  /** Imperative access to the underlying `VirtualCameraController`. */
  ref?: Ref<VirtualCameraController>;
};

/** Registers a candidate camera with the nearest `<Klipp>`. Thin wrapper - the Body/Aim/Noise combining
 *  logic lives in `VirtualCameraController`, a plain class with no React dependency. */
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
    // re-armed on every false→true flip, since this effect reruns from scratch then
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

/** Place inside a `<VirtualCamera>` to hear `CameraTransitionEventMap` events as callback props. Also
 *  available as `VirtualCamera.Events`. */
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
