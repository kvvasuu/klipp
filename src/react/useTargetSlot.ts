import { useEffect, useRef, useState } from 'react';
import { useKlipp } from './KlippContext.js';
import type { Target } from '../three/resolve/Target.js';
import type { RegisteredTarget, TargetSlot } from '../three/resolve/TargetRegistry.js';
import { isVector3Like } from '../three/resolve/resolveVector3.js';

const isRegistrable = (target: Target): target is RegisteredTarget => target != null && !isVector3Like(target);

/**
 * Registers `target` with the nearest `<Klipp>` and returns its per-frame slot. Returns `null` for
 * fixed points and empty targets, and until the effect for the current target has run: callers then
 * resolve the target themselves.
 */
export function useTargetSlot(target: Target): TargetSlot | null {
  const { targets } = useKlipp();
  const [entry, setEntry] = useState<{ target: Target; slot: TargetSlot } | null>(null);

  useEffect(() => {
    if (!isRegistrable(target)) return;
    setEntry({ target, slot: targets.acquire(target) });
    return () => targets.release(target);
  }, [targets, target]);

  return entry !== null && entry.target === target ? entry.slot : null;
}

const noSlots: ReadonlyMap<Target, TargetSlot> = new Map();

/** `useTargetSlot` for a list of targets, keyed by target. A new array with the same targets keeps the slots. */
export function useTargetSlots(list: readonly Target[]): ReadonlyMap<Target, TargetSlot> {
  const { targets } = useKlipp();
  // Fixed points are new literals every render; only registrable targets decide whether the list changed.
  const registrable = list.filter(isRegistrable);
  const stable = useRef(registrable);
  if (stable.current.length !== registrable.length || stable.current.some((target, i) => target !== registrable[i])) {
    stable.current = registrable;
  }
  const current = stable.current;
  const [slots, setSlots] = useState(noSlots);

  useEffect(() => {
    const next = new Map<Target, TargetSlot>();
    for (const target of current) next.set(target, targets.acquire(target));
    setSlots(next);
    return () => {
      for (const target of current) targets.release(target);
    };
  }, [targets, current]);

  return slots;
}
