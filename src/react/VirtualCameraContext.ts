import { createContext, use } from 'react';
import type { VirtualCameraThree } from '../three/VirtualCameraThree.js';

export type { InitialCameraState } from '../three/VirtualCameraThree.js';

export const VirtualCameraContext = createContext<VirtualCameraThree | null>(null);
export const VirtualCameraActiveContext = createContext<boolean>(false);
export const VirtualCameraLiveContext = createContext<boolean>(false);

/** The nearest `<VirtualCamera>`'s `VirtualCameraThree`, with its `state` and pieces. */
export function useVirtualCamera(): VirtualCameraThree {
  const value = use(VirtualCameraContext);
  if (!value) throw new Error('useVirtualCamera must be used within a <VirtualCamera>.');
  return value;
}

/** Whether the nearest virtual camera currently wins priority. */
export function useIsActiveVirtualCamera(): boolean {
  return use(VirtualCameraActiveContext);
}

/** Whether the nearest virtual camera currently contributes to output. */
export function useIsLiveVirtualCamera(): boolean {
  return use(VirtualCameraLiveContext);
}
