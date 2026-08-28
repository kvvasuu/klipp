import { useThree } from '@react-three/fiber';
import { createContext, use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createCameraState } from './CameraState';
import { useKlippCore, useKlippUpdateRegistry } from './Klipp';
import { VirtualCameraController, type VirtualCameraSlots } from './VirtualCameraController';

const VirtualCameraSlotsContext = createContext<VirtualCameraSlots | null>(null);
/** Separate contexts on purpose — each changes at a different cadence (slots: never, active: the instant
 *  arbitration picks a winner, live: once that winner's blend finishes), so a Body/Aim/Noise that only
 *  cares about one never re-renders because of the other two. */
const VirtualCameraActiveContext = createContext<boolean>(false);
const VirtualCameraLiveContext = createContext<boolean>(false);

/** The nearest `<VirtualCamera>`'s Body/Aim/Noise registration slots. Throws outside one. */
export function useVirtualCameraSlots(): VirtualCameraSlots {
  const slots = use(VirtualCameraSlotsContext);
  if (!slots) throw new Error('useVirtualCameraSlots must be used within a <VirtualCamera>.');
  return slots;
}

/** Whether the nearest `<VirtualCamera>` is `KlippCore`'s current priority winner — reactive, updates
 *  the instant arbitration picks a new winner (not gated on `Klipp`'s blend finishing, see
 *  `KlippCore.activeCameraId`'s doc comment — `useIsLiveVirtualCamera` is the gated version). `false`
 *  outside any `<VirtualCamera>`. Only a few Body/Aim (e.g. `OrbitalControlsBody`, deciding whether to
 *  listen to user input) need this — most don't. */
export function useIsActiveVirtualCamera(): boolean {
  return use(VirtualCameraActiveContext);
}

/** Whether the nearest `<VirtualCamera>` is what `Klipp`'s `tick()` is CURRENTLY outputting — lags
 *  behind `useIsActiveVirtualCamera()` until any in-progress blend into it finishes (see
 *  `KlippCore.liveCameraId`'s doc comment). `false` outside any `<VirtualCamera>`. */
export function useIsLiveVirtualCamera(): boolean {
  return use(VirtualCameraLiveContext);
}

export type VirtualCameraProps = {
  name: string;
  priority: number;
  /** Whether this camera is a candidate at all, independent of `priority` (which stays whatever it's set
   *  to; it's never used to "opt out"). `false` means fully out: not registered with `KlippCore`, and its
   *  Body/Aim/Noise don't even run — no wasted per-frame work for a camera that isn't a candidate anyway.
   *  Default `true`. */
  active?: boolean;
  children?: ReactNode;
};

/**
 * Registers a candidate camera with the nearest `<Klipp>` — mount/unmount (and `name`/`active` changes)
 * add/remove it from arbitration. Thin wrapper — the Body/Aim/Noise combining logic lives in
 * `VirtualCameraController`, a plain class with no React dependency.
 */
export function VirtualCamera({ name, priority, active = true, children }: VirtualCameraProps) {
  const core = useKlippCore();
  const registerUpdate = useKlippUpdateRegistry();
  const invalidate = useThree((state) => state.invalidate);
  const [state] = useState(() => createCameraState());
  const [controller] = useState(() => new VirtualCameraController(name));
  controller.name = name;
  const priorityRef = useRef(priority);
  priorityRef.current = priority;

  // `priority` is deliberately NOT a dependency here — re-registering on every edit would spuriously
  // restart a blend (see `KlippCore.updatePriority`'s doc comment). The effect below keeps it in sync.
  useEffect(() => {
    if (!active) return;
    // wake frameloop="demand" on both edges — candidacy just changed, and Klipp's own useFrame (which
    // decides whether that actually moves the composited camera) otherwise never gets a chance to run
    invalidate();
    const unregister = core.registerCamera({ id: name, priority: priorityRef.current, state });
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
    return registerUpdate((dt) => controller.update(state, dt));
  }, [registerUpdate, controller, state, active]);

  const isActive = useSyncExternalStore(core.subscribeActiveId, () => active && core.isActive(name));
  const isLive = useSyncExternalStore(core.subscribeLiveId, () => active && core.isLive(name));

  return (
    <VirtualCameraSlotsContext.Provider value={controller}>
      <VirtualCameraActiveContext.Provider value={isActive}>
        <VirtualCameraLiveContext.Provider value={isLive}>{children}</VirtualCameraLiveContext.Provider>
      </VirtualCameraActiveContext.Provider>
    </VirtualCameraSlotsContext.Provider>
  );
}
