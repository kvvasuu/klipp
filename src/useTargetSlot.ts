import { useEffect, useState } from 'react';
import { useKlipp } from './KlippContext';
import type { Target } from './resolve/Target';
import type { TargetSlot } from './resolve/TargetRegistry';
import { isVector3Like } from './resolve/resolveVector3';

/**
 * Registers `target` with the nearest `<Klipp>` and returns its per-frame slot. Returns `null` for
 * fixed points and empty targets, and until the first effect runs: callers then resolve the target themselves.
 */
export function useTargetSlot(target: Target): TargetSlot | null {
  const { targets } = useKlipp();
  const [slot, setSlot] = useState<TargetSlot | null>(null);

  useEffect(() => {
    if (target == null || isVector3Like(target)) {
      setSlot(null);
      return;
    }
    setSlot(targets.acquire(target));
    return () => targets.release(target);
  }, [targets, target]);

  return slot;
}
