import { create } from '@react-three/test-renderer';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Klipp } from '../src/Klipp';
import { KlippContext, useKlipp, type KlippContextValue } from '../src/KlippContext';
import type { Target } from '../src/resolve/Target';
import { TargetRegistry, type TargetSlot } from '../src/resolve/TargetRegistry';
import { useTargetSlot } from '../src/useTargetSlot';

function Probe({
  target,
  onRead,
}: {
  target: Target;
  onRead: (slot: TargetSlot | null, targets: TargetRegistry) => void;
}) {
  const slot = useTargetSlot(target);
  onRead(slot, useKlipp().targets);
  return null;
}

describe('useTargetSlot', () => {
  it('keeps one slot through StrictMode double effects and drops the entry after unmount', () => {
    const targets = new TargetRegistry();
    const calls: string[] = [];
    const acquire = targets.acquire.bind(targets);
    const release = targets.release.bind(targets);
    targets.acquire = (t) => (calls.push('acquire'), acquire(t));
    targets.release = (t) => (calls.push('release'), release(t));
    const context = { targets } as unknown as KlippContextValue;
    const target = new Object3D();

    const { result, unmount } = renderHook(() => useTargetSlot(target), {
      wrapper: ({ children }) => <KlippContext value={context}>{children}</KlippContext>,
      reactStrictMode: true,
    });

    expect(calls).toEqual(['acquire', 'release', 'acquire']);
    expect(result.current).toBe(acquire(target));
    release(target);

    unmount();
    expect(targets.has(target)).toBe(true);
    targets.refresh();
    expect(targets.has(target)).toBe(false);
  });

  it('shares one slot between readers of the same ref', async () => {
    const slots: (TargetSlot | null)[] = [];
    function Scene() {
      const ref = useRef<Object3D>(null);
      return (
        <>
          <object3D ref={ref} position={[4, 5, 6]} />
          <Probe target={ref} onRead={(s) => (slots[0] = s)} />
          <Probe target={ref} onRead={(s) => (slots[1] = s)} />
        </>
      );
    }

    const renderer = await create(
      <Klipp>
        <Scene />
      </Klipp>,
    );
    await renderer.advanceFrames(1, 1 / 60);

    expect(slots[0]).not.toBeNull();
    expect(slots[0]).toBe(slots[1]);
    expect(slots[0]!.valid).toBe(true);
    expect(slots[0]!.position).toEqual([4, 5, 6]);
  });

  it('returns null for fixed points so callers resolve them directly', async () => {
    let slot: TargetSlot | null | undefined;
    const renderer = await create(
      <Klipp>
        <Probe target={[1, 2, 3]} onRead={(s) => (slot = s)} />
      </Klipp>,
    );
    await renderer.advanceFrames(1, 1 / 60);

    expect(slot).toBeNull();
  });
});
