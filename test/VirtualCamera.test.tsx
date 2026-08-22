import { renderHook } from '@testing-library/react';
import { create } from '@react-three/test-renderer';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Klipp, useKlippCore } from '../src/Klipp';
import type { KlippCore } from '../src/KlippCore';
import {
  useIsActiveVirtualCamera,
  useIsLiveVirtualCamera,
  useVirtualCameraSlots,
  VirtualCamera,
} from '../src/VirtualCamera';
import { BlendCurves } from '../src/blend/BlendCurves';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlippCore());
  return null;
}

function ActiveReader({ onRead }: { onRead: (isActive: boolean) => void }) {
  onRead(useIsActiveVirtualCamera());
  return null;
}

function LiveReader({ onRead }: { onRead: (isLive: boolean) => void }) {
  onRead(useIsLiveVirtualCamera());
  return null;
}

describe('VirtualCamera — registration lifecycle', () => {
  it('registers on mount and unregisters on unmount', async () => {
    let core: KlippCore | undefined;
    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} />
      </Klipp>,
    );

    expect(core!.isActive('a')).toBe(true);

    await renderer.unmount();
    expect(core!.activeCameraId).toBeNull();
  });

  it('several cameras: highest priority wins', async () => {
    let core: KlippCore | undefined;
    await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="low" priority={10} />
        <VirtualCamera name="high" priority={20} />
      </Klipp>,
    );

    expect(core!.activeCameraId).toBe('high');
  });

  it('a priority prop change is reactive — updates in place and can flip the winner', async () => {
    let core: KlippCore | undefined;
    const scene = (challengerPriority: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} />
        <VirtualCamera name="challenger" priority={challengerPriority} />
      </Klipp>
    );

    const renderer = await create(scene(5));
    expect(core!.activeCameraId).toBe('a');

    await renderer.update(scene(30));
    expect(core!.activeCameraId).toBe('challenger');
  });

  it('a priority edit on the sole, already-live camera does not spuriously restart a blend (real bug: it briefly stopped tracking)', async () => {
    let core: KlippCore | undefined;
    const scene = (priority: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="main" priority={priority} />
      </Klipp>
    );

    const renderer = await create(scene(10));
    await renderer.advanceFrames(1, 0.1); // 'main' settles as live, no blend

    expect(core!.liveCameraId).toBe('main');
    expect(core!.isBlending).toBe(false);

    await renderer.update(scene(11)); // priority edit, same sole camera
    expect(core!.isBlending).toBe(false); // a full unregister+register would have started one here

    await renderer.advanceFrames(1, 0.1);
    expect(core!.isBlending).toBe(false); // still no blend after a tick — not just deferred by a frame
    expect(core!.liveCameraId).toBe('main');
  });

  it('a name change unregisters the old id and registers the new one', async () => {
    let core: KlippCore | undefined;
    const scene = (name: string) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name={name} priority={10} />
      </Klipp>
    );

    const renderer = await create(scene('a'));
    expect(core!.isActive('a')).toBe(true);

    await renderer.update(scene('b'));
    expect(core!.isActive('a')).toBe(false);
    expect(core!.isActive('b')).toBe(true);
  });

  it("a camera's own CameraState instance survives an unrelated re-render", async () => {
    let core: KlippCore | undefined;
    const scene = () => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} />
      </Klipp>
    );

    const renderer = await create(scene());
    const stateBefore = core!.activeState;
    expect(stateBefore).not.toBeNull();

    await renderer.update(scene());
    expect(core!.activeState).toBe(stateBefore);
  });
});

describe('VirtualCamera — Body/Aim/Noise wiring', () => {
  it('useVirtualCameraSlots throws outside a <VirtualCamera>', () => {
    expect(() => renderHook(() => useVirtualCameraSlots())).toThrow(/within a <VirtualCamera>/);
  });

  it('the frame driver calls core.tick(dt) every frame', async () => {
    let core: KlippCore | undefined;
    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} />
      </Klipp>,
    );
    const tickSpy = vi.spyOn(core!, 'tick');

    await renderer.advanceFrames(1, 0.25);
    expect(tickSpy).toHaveBeenCalledWith(0.25);
  });

  it("its VirtualCameraController.update actually runs every frame against the camera's own CameraState", async () => {
    let core: KlippCore | undefined;
    function Writer() {
      const slots = useVirtualCameraSlots();
      useEffect(() => slots.registerBody((out) => (out.position.x = 42)), [slots]);
      return null;
    }

    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <Writer />
        </VirtualCamera>
      </Klipp>,
    );

    await renderer.advanceFrames(1, 0.1);
    expect(core!.activeState!.position.x).toBe(42);
  });
});

describe('VirtualCamera — active prop', () => {
  it('active={false} keeps the camera out of arbitration entirely, even alone', async () => {
    let core: KlippCore | undefined;
    await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} active={false} />
      </Klipp>,
    );

    expect(core!.activeCameraId).toBeNull();
  });

  it('an inactive camera never steals the win from an active, lower-priority one', async () => {
    let core: KlippCore | undefined;
    await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="low" priority={10} />
        <VirtualCamera name="high" priority={20} active={false} />
      </Klipp>,
    );

    expect(core!.activeCameraId).toBe('low');
  });

  it('toggling active on/off registers/unregisters, priority staying fixed throughout', async () => {
    let core: KlippCore | undefined;
    const scene = (active: boolean) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} active={active} />
      </Klipp>
    );

    const renderer = await create(scene(false));
    expect(core!.activeCameraId).toBeNull();

    await renderer.update(scene(true));
    expect(core!.activeCameraId).toBe('a');

    await renderer.update(scene(false));
    expect(core!.activeCameraId).toBeNull();
  });

  it("an inactive camera's Body/Aim/Noise do not run — no wasted work for a non-candidate", async () => {
    let runs = 0;
    function CountingWriter() {
      const slots = useVirtualCameraSlots();
      useEffect(
        () =>
          slots.registerBody(() => {
            runs += 1;
          }),
        [slots],
      );
      return null;
    }

    const scene = (active: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10} active={active}>
          <CountingWriter />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(false));
    await renderer.advanceFrames(3, 0.1);
    expect(runs).toBe(0);

    await renderer.update(scene(true));
    await renderer.advanceFrames(1, 0.1);
    expect(runs).toBe(1); // the already-mounted writer just starts running, no remount needed
  });
});

describe('useIsActiveVirtualCamera', () => {
  it('defaults to false outside any <VirtualCamera> (no throw, unlike useVirtualCameraSlots)', () => {
    const { result } = renderHook(() => useIsActiveVirtualCamera());
    expect(result.current).toBe(false);
  });

  it('reports true for the priority winner, false for everyone else', async () => {
    let lowActive: boolean | undefined;
    let highActive: boolean | undefined;

    await create(
      <Klipp>
        <VirtualCamera name="low" priority={10}>
          <ActiveReader onRead={(v) => (lowActive = v)} />
        </VirtualCamera>
        <VirtualCamera name="high" priority={20}>
          <ActiveReader onRead={(v) => (highActive = v)} />
        </VirtualCamera>
      </Klipp>,
    );

    expect(highActive).toBe(true);
    expect(lowActive).toBe(false);
  });

  it('updates reactively when a priority change flips the winner', async () => {
    let aActive: boolean | undefined;
    let bActive: boolean | undefined;

    const scene = (bPriority: number) => (
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <ActiveReader onRead={(v) => (aActive = v)} />
        </VirtualCamera>
        <VirtualCamera name="b" priority={bPriority}>
          <ActiveReader onRead={(v) => (bActive = v)} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(5));
    expect(aActive).toBe(true);
    expect(bActive).toBe(false);

    await renderer.update(scene(30));
    expect(aActive).toBe(false);
    expect(bActive).toBe(true);
  });

  it('false while active={false}, even as the only registered camera', async () => {
    let isActive: boolean | undefined;

    await create(
      <Klipp>
        <VirtualCamera name="a" priority={10} active={false}>
          <ActiveReader onRead={(v) => (isActive = v)} />
        </VirtualCamera>
      </Klipp>,
    );

    expect(isActive).toBe(false);
  });
});

describe('useIsLiveVirtualCamera', () => {
  it('defaults to false outside any <VirtualCamera>', () => {
    const { result } = renderHook(() => useIsLiveVirtualCamera());
    expect(result.current).toBe(false);
  });

  it('the first-ever camera goes live immediately (no blend to wait for)', async () => {
    let isLive: boolean | undefined;

    const renderer = await create(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <LiveReader onRead={(v) => (isLive = v)} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.05);

    expect(isLive).toBe(true);
  });

  it('lags behind useIsActiveVirtualCamera until the blend into the new winner finishes', async () => {
    let aActive: boolean | undefined;
    let aLive: boolean | undefined;
    let bActive: boolean | undefined;
    let bLive: boolean | undefined;

    const scene = (bPriority: number) => (
      <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 2 }}>
        <VirtualCamera name="a" priority={10}>
          <ActiveReader onRead={(v) => (aActive = v)} />
          <LiveReader onRead={(v) => (aLive = v)} />
        </VirtualCamera>
        <VirtualCamera name="b" priority={bPriority}>
          <ActiveReader onRead={(v) => (bActive = v)} />
          <LiveReader onRead={(v) => (bLive = v)} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(5));
    await renderer.advanceFrames(1, 0.05); // 'a' is first-ever: active AND live immediately
    expect(aActive).toBe(true);
    expect(aLive).toBe(true);

    await renderer.update(scene(30)); // 'b' wins priority — 2s blend into it starts
    await renderer.advanceFrames(1, 0.5); // mid-blend
    expect(bActive).toBe(true); // instant — arbitration doesn't wait for the blend
    expect(bLive).toBe(false); // still blending in
    expect(aActive).toBe(false);
    expect(aLive).toBe(true); // 'a' stays "live" (still what's on screen) until the blend finishes

    await renderer.advanceFrames(1, 2); // past the 2s blend duration
    expect(bLive).toBe(true);
    expect(aLive).toBe(false);
  });

  it('false while active={false}, even as the only registered camera', async () => {
    let isLive: boolean | undefined;

    await create(
      <Klipp>
        <VirtualCamera name="a" priority={10} active={false}>
          <LiveReader onRead={(v) => (isLive = v)} />
        </VirtualCamera>
      </Klipp>,
    );

    expect(isLive).toBe(false);
  });
});
