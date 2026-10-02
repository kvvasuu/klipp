import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState, type ReactNode } from 'react';
import type { Camera } from 'three';
import type { KlippOptions } from '../core/Klipp.js';
import { KlippThree, type KlippMode } from '../three/KlippThree.js';
import { KlippContext, useKlipp } from './KlippContext.js';
import { useCameraTransitionEvent, type CameraTransitionEventProps } from './useCameraTransitionEvent.js';

export type { KlippMode };

/** Bound `dt` under `frameloop="demand"` so an idle gap does not jump the blend forward in one frame. */
const DEMAND_MODE_MAX_DELTA = 1 / 30;

export type KlippProps = Pick<KlippOptions, 'defaultBlend' | 'customBlends'> & {
  children?: ReactNode;
  camera?: Camera;
  /** See `KlippMode`. */
  mode?: KlippMode;
};

/** Provides the camera driver and writes its output to the active camera. */
export function Klipp({ children, defaultBlend, customBlends, camera: cameraProp, mode = 'enabled' }: KlippProps) {
  const defaultCamera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const camera = cameraProp ?? defaultCamera;
  const [klipp] = useState(() => new KlippThree(camera, { defaultBlend, customBlends }));
  klipp.camera = camera;
  klipp.mode = mode;
  klipp.setSize(size.width, size.height);

  useEffect(() => klipp.setDefaultBlend(defaultBlend), [klipp, defaultBlend]);
  useEffect(() => klipp.setCustomBlends(customBlends), [klipp, customBlends]);

  useFrame((state, rawDelta) => {
    const delta = state.frameloop === 'demand' ? Math.min(rawDelta, DEMAND_MODE_MAX_DELTA) : rawDelta;
    if (klipp.update(delta)) state.invalidate();
  });

  return <KlippContext.Provider value={klipp}>{children}</KlippContext.Provider>;
}

export type KlippEventsProps = CameraTransitionEventProps;

/** Listen to transitions from every camera in the nearest `<Klipp>`. */
export function KlippEvents({ onActivated, onDeactivated, onBlendCreated, onBlendFinished, onCut }: KlippEventsProps) {
  const klipp = useKlipp();

  useCameraTransitionEvent(klipp, 'activated', onActivated);
  useCameraTransitionEvent(klipp, 'deactivated', onDeactivated);
  useCameraTransitionEvent(klipp, 'blendCreated', onBlendCreated);
  useCameraTransitionEvent(klipp, 'blendFinished', onBlendFinished);
  useCameraTransitionEvent(klipp, 'cut', onCut);

  return null;
}

Klipp.Events = KlippEvents;
