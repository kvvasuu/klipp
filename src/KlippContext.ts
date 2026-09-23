import { createContext, use } from 'react';
import type { CameraState } from './CameraState';
import type { KlippCore } from './KlippCore';

/** A per-frame update — used by `<VirtualCamera>` to drive its own Body/Aim/Noise. Return `true` if
 *  there's still work in flight that could change the output on a LATER frame even though this
 *  particular frame's output happens to match the previous one (e.g. a constant-amplitude envelope
 *  plateau) — `frameloop="demand"` stops requesting frames once output stops changing, and without this
 *  it would misread a coincidentally-still frame mid-plateau as "settled forever". Ordinary continuous
 *  motion doesn't need it: Klipp's own output comparison already keeps requesting frames for that. */
export type FrameUpdate = (dt: number) => boolean | void;

export type KlippContextValue = {
  core: KlippCore;
  registerUpdate: (update: FrameUpdate) => () => void;
  initialCameraState: CameraState;
};

export const KlippContext = createContext<KlippContextValue | null>(null);

/** The nearest `<Klipp>`'s `core`/`registerUpdate`/`initialCameraState`. Throws outside one. */
export function useKlipp(): KlippContextValue {
  const value = use(KlippContext);
  if (!value) throw new Error('useKlipp must be used within a <Klipp> provider.');
  return value;
}
