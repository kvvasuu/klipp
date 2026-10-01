import { renderHook } from '@testing-library/react';
import { create } from '@react-three/test-renderer';
import { createRef, useEffect, type ReactNode } from 'react';
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { CameraState } from '../../src/core/CameraState';
import { Klipp } from '../../src/react/Klipp';
import { useKlipp } from '../../src/react/KlippContext';
import type { KlippCore } from '../../src/core/KlippCore';
import { VirtualCamera, VirtualCameraEvents } from '../../src/react/VirtualCamera';
import {
  useIsActiveVirtualCamera,
  useIsLiveVirtualCamera,
  useVirtualCamera,
} from '../../src/react/VirtualCameraContext';
import type { VirtualCameraController } from '../../src/core/VirtualCameraController';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { BlendHints } from '../../src/core/blend/BlendHints';
import { toQuaternion } from '../tuples';

function CoreReader({ onRead }: { onRead: (core: KlippCore) => void }) {
  onRead(useKlipp().core);
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

/** Mounts cameras a and b, lets a go live, then hands over to b with a 1 s blend. */
async function handOver(events: { a?: ReactNode; klipp?: ReactNode }) {
  const scene = (bPriority: number) => (
    <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 1 }}>
      {events.klipp}
      <VirtualCamera name="a" priority={10}>
        {events.a}
      </VirtualCamera>
      <VirtualCamera name="b" priority={bPriority} />
    </Klipp>
  );
  const renderer = await create(scene(5));
  await renderer.advanceFrames(1, 0.05);
  await renderer.update(scene(30));
  await renderer.advanceFrames(1, 0.05);
  return renderer;
}

describe('VirtualCamera — registration lifecycle', () => {
  it('registers under its name, re-registers on rename, and unregisters on unmount', async () => {
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
    expect([core!.isActive('a'), core!.isActive('b')]).toEqual([false, true]);

    await renderer.unmount();
    expect(core!.activeCameraId).toBeNull();
  });

  it('takes part in arbitration with its priority, following prop changes', async () => {
    let core: KlippCore | undefined;
    const scene = (challenger: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} />
        <VirtualCamera name="challenger" priority={challenger} />
      </Klipp>
    );

    const renderer = await create(scene(5));
    expect(core!.activeCameraId).toBe('a');

    await renderer.update(scene(30));
    expect(core!.activeCameraId).toBe('challenger');
  });

  it('the hints prop reaches core.registerCamera on mount, and core.updateHints on a later change (without a full re-register)', async () => {
    let core: KlippCore | undefined;
    const scene = (mounted: boolean, hints: number) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        {mounted && <VirtualCamera name="a" priority={10} hints={hints} />}
      </Klipp>
    );

    const renderer = await create(scene(false, BlendHints.none));
    const registerSpy = vi.spyOn(core!, 'registerCamera');
    const updateHintsSpy = vi.spyOn(core!, 'updateHints');

    await renderer.update(scene(true, BlendHints.sphericalPosition));
    expect(registerSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', hints: BlendHints.sphericalPosition }));

    await renderer.update(scene(true, BlendHints.cylindricalPosition));
    expect(updateHintsSpy).toHaveBeenCalledWith('a', BlendHints.cylindricalPosition);
    expect(registerSpy).toHaveBeenCalledTimes(1); // the hints-only change did not re-register
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
  it('useVirtualCamera throws outside a <VirtualCamera>', () => {
    expect(() => renderHook(() => useVirtualCamera())).toThrow(/within a <VirtualCamera>/);
  });

  it("ticks the core and runs the camera's pieces against its own state every frame", async () => {
    let core: KlippCore | undefined;
    let state: CameraState | undefined;
    function Piece() {
      const camera = useVirtualCamera();
      state = camera.state;
      useEffect(() => camera.controller.registerBody((out) => (out.position[0] = 42)), [camera.controller]);
      return null;
    }

    const renderer = await create(
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10}>
          <Piece />
        </VirtualCamera>
      </Klipp>,
    );
    const tick = vi.spyOn(core!, 'tick');
    await renderer.advanceFrames(1, 0.25);

    expect(tick).toHaveBeenCalledWith(0.25);
    expect(state).toBe(core!.activeState);
    expect(state!.position[0]).toBe(42);
  });
});

describe('VirtualCamera — initialState prop', () => {
  it("seeds the given fields before any piece runs, leaving the rest as the real camera's", async () => {
    const states: Record<string, CameraState> = {};
    function StateReader({ name }: { name: string }) {
      states[name] = useVirtualCamera().state;
      return null;
    }

    await create(
      <Klipp>
        <VirtualCamera name="plain" priority={10}>
          <StateReader name="plain" />
        </VirtualCamera>
        <VirtualCamera
          name="seeded"
          priority={20}
          initialState={{ position: new Vector3(5, 20, 5), target: [1, 2, 3] }}>
          <StateReader name="seeded" />
        </VirtualCamera>
      </Klipp>,
    );

    expect(states.seeded.position).toEqual([5, 20, 5]);
    expect(states.seeded.target).toEqual([1, 2, 3]);
    expect(states.seeded.fov).toBe(states.plain.fov);
  });

  it("copies them once at mount, without keeping the caller's objects", async () => {
    let core: KlippCore | undefined;
    const position = new Vector3(1, 2, 3);
    const quaternion = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
    const scene = (initial: Vector3) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="a" priority={10} initialState={{ position: initial, quaternion }} />
      </Klipp>
    );

    const renderer = await create(scene(position));
    position.set(99, 99, 99);
    quaternion.set(0, 0, 0, 1);
    await renderer.update(scene(new Vector3(7, 7, 7)));

    expect(core!.activeState!.position).toEqual([1, 2, 3]);
    expect(
      toQuaternion(core!.activeState!.quaternion).angleTo(new Quaternion(0.1, 0.2, 0.3, 0.9).normalize()),
    ).toBeLessThan(1e-6);
  });
});

describe('VirtualCamera — active prop', () => {
  it('active={false} takes it out of arbitration until it turns back on', async () => {
    let core: KlippCore | undefined;
    const scene = (active: boolean) => (
      <Klipp>
        <CoreReader onRead={(c) => (core = c)} />
        <VirtualCamera name="low" priority={10} />
        <VirtualCamera name="high" priority={20} active={active} />
      </Klipp>
    );

    const renderer = await create(scene(false));
    expect(core!.activeCameraId).toBe('low');

    await renderer.update(scene(true));
    expect(core!.activeCameraId).toBe('high');

    await renderer.update(scene(false));
    expect(core!.activeCameraId).toBe('low');
  });

  it("an inactive camera's Body/Aim/Noise do not run — no wasted work for a non-candidate", async () => {
    let runs = 0;
    function CountingWriter() {
      const { controller } = useVirtualCamera();
      useEffect(
        () =>
          controller.registerBody(() => {
            runs += 1;
          }),
        [controller],
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

  it('passes justActivated on the first frame after mounting and after each reactivation', async () => {
    const seen: boolean[] = [];
    const record = (justActivated: boolean) => void seen.push(justActivated);
    function Writer({ onCall }: { onCall: (justActivated: boolean) => void }) {
      const { controller } = useVirtualCamera();
      useEffect(
        () => controller.registerBody((_out, _dt, justActivated) => onCall(justActivated)),
        [controller, onCall],
      );
      return null;
    }
    const scene = (active: boolean) => (
      <Klipp>
        <VirtualCamera name="a" priority={10} active={active}>
          <Writer onCall={record} />
        </VirtualCamera>
      </Klipp>
    );

    const renderer = await create(scene(true));
    await renderer.advanceFrames(2, 0.1);
    await renderer.update(scene(false));
    await renderer.advanceFrames(2, 0.1);
    await renderer.update(scene(true));
    await renderer.advanceFrames(2, 0.1);

    expect(seen).toEqual([true, false, true, false]);
  });
});

describe('useIsActiveVirtualCamera', () => {
  it('is true only inside the winning camera, follows changes, and is false outside any camera', async () => {
    expect(renderHook(() => useIsActiveVirtualCamera()).result.current).toBe(false);

    const active: Record<string, boolean> = {};
    const scene = (b: number, cActive: boolean) => (
      <Klipp>
        {(['a', 'b', 'c'] as const).map((name) => (
          <VirtualCamera key={name} name={name} priority={{ a: 10, b, c: 100 }[name]} active={name !== 'c' || cActive}>
            <ActiveReader onRead={(value) => (active[name] = value)} />
          </VirtualCamera>
        ))}
      </Klipp>
    );

    const renderer = await create(scene(5, false));
    expect(active).toEqual({ a: true, b: false, c: false });

    await renderer.update(scene(30, false));
    expect(active).toEqual({ a: false, b: true, c: false });
  });
});

describe('useIsLiveVirtualCamera', () => {
  it('is false outside any camera and for an inactive one, and true at once for the first camera', async () => {
    expect(renderHook(() => useIsLiveVirtualCamera()).result.current).toBe(false);

    const live: Record<string, boolean> = {};
    const renderer = await create(
      <Klipp>
        <VirtualCamera name="a" priority={10}>
          <LiveReader onRead={(value) => (live.a = value)} />
        </VirtualCamera>
        <VirtualCamera name="off" priority={20} active={false}>
          <LiveReader onRead={(value) => (live.off = value)} />
        </VirtualCamera>
      </Klipp>,
    );
    await renderer.advanceFrames(1, 0.05);

    expect(live).toEqual({ a: true, off: false });
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
});

describe('VirtualCameraEvents', () => {
  it("calls each callback for its own camera's transitions", async () => {
    const calls: string[] = [];
    const log = (name: string) => (event: { incoming?: string | null; outgoing?: string | null; liveId?: string }) =>
      calls.push(
        `${name} ${JSON.stringify({ incoming: event.incoming, outgoing: event.outgoing, liveId: event.liveId })}`,
      );
    const renderer = await handOver({
      a: (
        <VirtualCamera.Events
          onActivated={log('activated')}
          onCut={log('cut')}
          onBlendCreated={log('blendCreated')}
          onBlendFinished={log('blendFinished')}
          onDeactivated={log('deactivated')}
        />
      ),
    });
    await renderer.advanceFrames(1, 1);

    expect(calls.map((call) => call.split(' ')[0])).toEqual(['activated', 'cut', 'blendCreated', 'deactivated']);
    expect(calls[3]).toContain('"outgoing":"a"');
  });

  it('throws outside a <VirtualCamera> (but inside <Klipp>)', async () => {
    await expect(create(<Klipp>{<VirtualCameraEvents />}</Klipp>)).rejects.toThrow(
      /must be used within a <VirtualCamera>/,
    );
  });
});

describe('VirtualCamera ref', () => {
  it('is the camera controller, whose events work without <VirtualCamera.Events>', async () => {
    const ref = createRef<VirtualCameraController>();
    const onDeactivated = vi.fn();
    const scene = (bPriority: number) => (
      <Klipp defaultBlend={{ curve: BlendCurves.linear, time: 0 }}>
        <VirtualCamera name="a" priority={10} ref={ref} />
        <VirtualCamera name="b" priority={bPriority} />
      </Klipp>
    );

    const renderer = await create(scene(5));
    await renderer.advanceFrames(1, 0.05);
    expect(ref.current!.name).toBe('a');
    ref.current!.addEventListener('deactivated', onDeactivated);

    await renderer.update(scene(30));
    await renderer.advanceFrames(1, 0.05);

    expect(onDeactivated).toHaveBeenCalledTimes(1);
  });
});

describe('KlippEvents', () => {
  it('calls each callback for every camera, once a blend has actually finished', async () => {
    const calls: string[] = [];
    const log = (name: string) => (event: { incoming?: string | null; outgoing?: string | null; liveId?: string }) =>
      calls.push(
        `${name} ${JSON.stringify({ incoming: event.incoming, outgoing: event.outgoing, liveId: event.liveId })}`,
      );
    const renderer = await handOver({
      klipp: (
        <Klipp.Events
          onActivated={log('activated')}
          onCut={log('cut')}
          onBlendCreated={log('blendCreated')}
          onBlendFinished={log('blendFinished')}
          onDeactivated={log('deactivated')}
        />
      ),
    });
    expect(calls.map((call) => call.split(' ')[0])).toEqual(['activated', 'cut', 'activated', 'blendCreated']);

    await renderer.advanceFrames(1, 1);
    expect(calls.slice(4)).toEqual(['blendFinished {"liveId":"b"}', 'deactivated {"outgoing":"a"}']);
  });
});
