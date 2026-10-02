import { createContext, use } from 'react';
import type { KlippThree } from '../three/KlippThree.js';

export type { FrameUpdate } from '../three/KlippThree.js';

export const KlippContext = createContext<KlippThree | null>(null);

/** The nearest `<Klipp>`'s `KlippThree`, which picks the camera and knows about every one. */
export function useKlipp(): KlippThree {
  const value = use(KlippContext);
  if (!value) throw new Error('useKlipp must be used within a <Klipp> provider.');
  return value;
}
