import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react';
import { BlendHints } from './blend/BlendHints';
import { copyCameraState, createCameraState, mergeCameraState, type CameraState } from './CameraState';
import { useKlippCore, useKlippInitialCameraState, useKlippUpdateRegistry } from './Klipp';
import type { CameraTransitionEventMap } from './KlippCore';
import { resolveVector3 } from './resolve/resolveVector3';
import { useCameraTransitionEvent } from './useCameraTransitionEvent';
import { VirtualCameraController } from './VirtualCameraController';

/** `position`/`target`/`lookAtTarget` accept the r3f Vector3 shorthand; `quaternion` needs a real
 *  `THREE.Quaternion`. */
export type InitialCameraState = Partial<Omit<CameraState, 'position' | 'target' | 'lookAtTarget'>> & {
  position?: Vector3Like;
  target?: Vector3Like;
  lookAtTarget?: Vector3Like;
};

export type VirtualCameraContextValue = {
  /** Registration slots (`registerBody`/`registerAim`/...) - the full `VirtualCameraController`. */
  controller: VirtualCameraController;
  /** This camera's raw, un-blended `CameraState`, updated in place every frame. A Body/Aim/Extension/
   *  Noise should write through its own `CameraStateWriter`'s `out` instead of this. */
  state: CameraState;
  /** This camera's `initialState` prop, exactly as passed - `undefined` when not given, unlike `state`.
   *  For a Body/Aim seeding its own persistent state once at mount. */
  initialState: InitialCameraState | undefined;
};

/** `controller`/`state`/`initialState` never change after mount, bundled into one context. `active`/
 *  `live` stay separate - different cadence, so a consumer of one isn't re-rendered by the other. */
const VirtualCameraContext = createContext<VirtualCameraContextValue | null>(null);
const VirtualCameraActiveContext = createContext<boolean>(false);
const VirtualCameraLiveContext = createContext<boolean>(false);

/** The nearest `<VirtualCamera>`'s registration slots, `CameraState`, and `initialState`. Throws
 *  outside one. */
export function useVirtualCamera(): VirtualCameraContextValue {
  const value = use(VirtualCameraContext);
  if (!value) throw new Error('useVirtualCamera must be used within a <VirtualCamera>.');
  return value;
}

/** Whether the nearest `<VirtualCamera>` is `KlippCore`'s current priority winner - not gated on blend
 *  finishing (see `useIsLiveVirtualCamera`). `false` outside any `<VirtualCamera>`. */
export function useIsActiveVirtualCamera(): boolean {
  return use(VirtualCameraActiveContext);
}

/** Whether the nearest `<VirtualCamera>` is what `Klipp`'s `tick()` is currently outputting - lags
 *  behind `useIsActiveVirtualCamera()` until an in-progress blend finishes. */
export function useIsLiveVirtualCamera(): boolean {
  return use(VirtualCameraLiveContext);
}

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
  const core = useKlippCore();
  const registerUpdate = useKlippUpdateRegistry();
  const initialCameraState = useKlippInitialCameraState();
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

export type VirtualCameraEventsProps = {
  onActivated?: (event: CameraTransitionEventMap['activated']) => void;
  onDeactivated?: (event: CameraTransitionEventMap['deactivated']) => void;
  onBlendCreated?: (event: CameraTransitionEventMap['blendCreated']) => void;
  onBlendFinished?: (event: CameraTransitionEventMap['blendFinished']) => void;
  onCut?: (event: CameraTransitionEventMap['cut']) => void;
};

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
