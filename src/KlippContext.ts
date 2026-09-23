import { createContext, use } from 'react';
import type { CameraState } from './CameraState';
import type { KlippCore } from './KlippCore';

/** Per-frame update for a virtual camera. Return `true` while future work remains. */
export type FrameUpdate = (dt: number) => boolean | void;

export type KlippContextValue = {
  core: KlippCore;
  registerUpdate: (update: FrameUpdate) => () => void;
  initialCameraState: CameraState;
};

export const KlippContext = createContext<KlippContextValue | null>(null);

/** Access the nearest `Klipp` context. */
export function useKlipp(): KlippContextValue {
  const value = use(KlippContext);
  if (!value) throw new Error('useKlipp must be used within a <Klipp> provider.');
  return value;
}
