import type { Vector3 as Vector3Like } from '@react-three/fiber';
import type { Quat } from 'math';
import { createContext, use } from 'react';
import type { Quaternion } from 'three';
import type { CameraState } from './CameraState';
import type { VirtualCameraController } from './VirtualCameraController';

/** Initial camera state with r3f vector shorthand support. */
export type InitialCameraState = Partial<
  Omit<CameraState, 'position' | 'quaternion' | 'target' | 'lookAtTarget' | 'referenceUp'>
> & {
  position?: Vector3Like;
  quaternion?: Quaternion | Quat;
  target?: Vector3Like;
  lookAtTarget?: Vector3Like;
  referenceUp?: Vector3Like;
};

export type VirtualCameraContextValue = {
  controller: VirtualCameraController;
  /** This camera's mutable raw state. */
  state: CameraState;
  /** Initial state passed to the camera. */
  initialState: InitialCameraState | undefined;
};

export const VirtualCameraContext = createContext<VirtualCameraContextValue | null>(null);
export const VirtualCameraActiveContext = createContext<boolean>(false);
export const VirtualCameraLiveContext = createContext<boolean>(false);

/** Access the nearest virtual camera context. */
export function useVirtualCamera(): VirtualCameraContextValue {
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
