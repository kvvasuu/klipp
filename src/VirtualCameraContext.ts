import type { Vector3 as Vector3Like } from '@react-three/fiber';
import { createContext, use } from 'react';
import type { CameraState } from './CameraState';
import type { VirtualCameraController } from './VirtualCameraController';

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
export const VirtualCameraContext = createContext<VirtualCameraContextValue | null>(null);
export const VirtualCameraActiveContext = createContext<boolean>(false);
export const VirtualCameraLiveContext = createContext<boolean>(false);

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
