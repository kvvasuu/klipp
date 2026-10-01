import { createContext, use } from 'react';
import type { Klipp } from '../three/Klipp.js';

export type { FrameUpdate } from '../three/Klipp.js';

export const KlippContext = createContext<Klipp | null>(null);

/** The nearest `<Klipp>`'s three.js `Klipp`, which picks the camera and knows about every one. */
export function useKlipp(): Klipp {
  const value = use(KlippContext);
  if (!value) throw new Error('useKlipp must be used within a <Klipp> provider.');
  return value;
}
