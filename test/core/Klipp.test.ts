import { vec3, type Vec3 } from 'math';
import { describe, expect, it, vi } from 'vitest';
import { copyCameraState, createCameraState, type CameraState } from '../../src/core/CameraState';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { BlendHints } from '../../src/core/blend/BlendHints';
import { Klipp, type KlippOptions } from '../../src/core/Klipp';
import type { CameraPiece } from '../../src/core/VirtualCamera';
import { advance, register, setHints, setPriority } from '../../src/core/internal';

function stateAt(x: number): ReturnType<typeof createCameraState> {
  const state = createCameraState();
  vec3.set(state.position, x, 0, 0);
  return state;
}

describe('Klipp — registry & priority arbitration', () => {
  it('makes the highest priority camera active, the latest one on a tie, exposing its live state', () => {
    const core = new Klipp();
    expect(core.activeCameraId).toBeNull();
    expect(core.activeState).toBeNull();

    const high = createCameraState();
    core[register]({ id: '', priority: 20, state: high });
    core[register]({ id: 'low', priority: 10, state: createCameraState() });
    expect(core.activeCameraId).toBe('');
    expect(core.isActive('')).toBe(true);
    expect(core.activeState).toBe(high);

    core[register]({ id: 'tie', priority: 20, state: createCameraState() });
    expect(core.activeCameraId).toBe('tie');
  });

  it('hasEverActivated distinguishes "never activated" from "was live, now forgotten mid-blend" — unlike liveCameraId, it stays true through the latter', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    expect(core.hasEverActivated).toBe(false);

    const unregisterA = core[register]({ id: 'a', priority: 10, state: createCameraState() });
    core[advance](0); // 'a' snaps live
    expect(core.hasEverActivated).toBe(true);

    unregisterA(); // forgotten — liveCameraId goes null, but hasEverActivated must not
    expect(core.liveCameraId).toBeNull();
    expect(core.hasEverActivated).toBe(true);
  });

  it('falls back to the next camera when the winner unregisters, and to none after the last', () => {
    const core = new Klipp();
    const unregisterLow = core[register]({ id: 'low', priority: 10, state: createCameraState() });
    const unregisterHigh = core[register]({ id: 'high', priority: 20, state: createCameraState() });

    unregisterHigh();
    expect(core.activeCameraId).toBe('low');
    unregisterLow();
    expect(core.activeCameraId).toBeNull();
    expect(core.activeState).toBeNull();
  });

  it("re-registering the same id: the older registration's unregister must not tear down the newer one", () => {
    const core = new Klipp();
    const first = core[register]({ id: 'main', priority: 10, state: createCameraState() });
    const secondState = createCameraState();
    core[register]({ id: 'main', priority: 10, state: secondState });

    first(); // stale cleanup from the first, already-overwritten registration
    expect(core.activeCameraId).toBe('main');
    expect(core.activeState).toBe(secondState);
  });

  describe('subscribeActiveId', () => {
    it('notifies only when the winner changes, until unsubscribed', () => {
      const core = new Klipp();
      const listener = vi.fn();
      const unsubscribe = core.subscribeActiveId(listener);

      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[register]({ id: 'b', priority: 20, state: createCameraState() });
      core[register]({ id: 'c', priority: 5, state: createCameraState() }); // b still wins
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      core[register]({ id: 'd', priority: 30, state: createCameraState() });
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscribeLiveId', () => {
    it('notifies when a camera goes live: the first one at once, later ones when their blend finishes', () => {
      const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const listener = vi.fn();
      core.subscribeLiveId(listener);

      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(core.isLive('a')).toBe(true);

      core[register]({ id: 'b', priority: 20, state: createCameraState() });
      core[advance](0.5);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(core.isLive('a')).toBe(true);

      core[advance](0.6);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(core.isLive('b')).toBe(true);
    });

    it('the returned unsubscribe function stops further notifications', () => {
      // zero-time blend = instant, so a single tick(0) after registering 'b' genuinely flips liveId —
      // proves the listener was skipped because it unsubscribed, not because nothing actually changed
      const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 0 } });
      const listener = vi.fn();
      const unsubscribe = core.subscribeLiveId(listener);

      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      core[register]({ id: 'b', priority: 20, state: createCameraState() });
      core[advance](0);
      expect(core.isLive('b')).toBe(true); // liveId DID change...
      expect(listener).toHaveBeenCalledTimes(1); // ...but still 1 — no further calls after unsubscribing
    });
  });

  describe('activated/deactivated events', () => {
    it('dispatches activated on each new winner, not when none is left, until removed', () => {
      const core = new Klipp();
      const listener = vi.fn();
      core.addEventListener('activated', listener);

      const unregisterA = core[register]({ id: 'a', priority: 10, state: createCameraState() });
      const unregisterB = core[register]({ id: 'b', priority: 20, state: createCameraState() });
      expect(listener.mock.calls.map(([event]) => [event.incoming, event.outgoing])).toEqual([
        ['a', null],
        ['b', 'a'],
      ]);

      unregisterB();
      unregisterA();
      expect(listener).toHaveBeenCalledTimes(3); // back to a, but nothing for "no camera"

      core.removeEventListener('activated', listener);
      core[register]({ id: 'c', priority: 30, state: createCameraState() });
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('dispatches deactivated once a camera has blended out, never for the first camera going live', () => {
      const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const listener = vi.fn();
      core.addEventListener('deactivated', listener);
      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0);
      core[register]({ id: 'b', priority: 20, state: createCameraState() });

      core[advance](0.5);
      expect(listener).not.toHaveBeenCalled();

      core[advance](0.6);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0]).toMatchObject({ outgoing: 'a' });
    });
  });

  describe('blendCreated/blendFinished/cut events', () => {
    it('dispatches cut (not blendCreated/blendFinished) for the very first camera going live', () => {
      const core = new Klipp();
      const onCut = vi.fn();
      const onBlendCreated = vi.fn();
      const onBlendFinished = vi.fn();
      core.addEventListener('cut', onCut);
      core.addEventListener('blendCreated', onBlendCreated);
      core.addEventListener('blendFinished', onBlendFinished);

      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0);

      expect(onCut).toHaveBeenCalledTimes(1);
      expect(onCut.mock.calls[0][0]).toMatchObject({ incoming: 'a', outgoing: null });
      expect(onBlendCreated).not.toHaveBeenCalled();
      expect(onBlendFinished).not.toHaveBeenCalled();
    });

    it('dispatches blendCreated when a real blend starts and blendFinished once it completes, never cut', () => {
      const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0); // 'a' snaps live - the first-ever cut, not under test here

      const onCreated = vi.fn();
      const onFinished = vi.fn();
      const onCut = vi.fn();
      core.addEventListener('blendCreated', onCreated);
      core.addEventListener('blendFinished', onFinished);
      core.addEventListener('cut', onCut);

      core[register]({ id: 'b', priority: 20, state: createCameraState() });
      core[advance](0); // blend created this tick
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated.mock.calls[0][0]).toMatchObject({ incoming: 'b', outgoing: 'a' });
      expect(onFinished).not.toHaveBeenCalled();

      core[advance](0.5); // mid-blend
      expect(onFinished).not.toHaveBeenCalled();

      core[advance](0.6); // past the 1s duration
      expect(onFinished).toHaveBeenCalledTimes(1);
      expect(onFinished.mock.calls[0][0]).toMatchObject({ liveId: 'b' });
      expect(onCut).not.toHaveBeenCalled();
    });

    it('a zero-length blend after the first camera fires blendCreated and cut, but not blendFinished', () => {
      const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 0 } });
      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0); // 'a' snaps live - the first-ever cut, not under test here

      const onCreated = vi.fn();
      const onFinished = vi.fn();
      const onCut = vi.fn();
      core.addEventListener('blendCreated', onCreated);
      core.addEventListener('blendFinished', onFinished);
      core.addEventListener('cut', onCut);

      core[register]({ id: 'b', priority: 20, state: createCameraState() });
      core[advance](0);

      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated.mock.calls[0][0]).toMatchObject({ incoming: 'b', outgoing: 'a' });
      expect(onCut).toHaveBeenCalledTimes(1);
      expect(onCut.mock.calls[0][0]).toMatchObject({ incoming: 'b', outgoing: 'a' });
      expect(onFinished).not.toHaveBeenCalled();
    });

    it("mid-blend interruption: the new blendCreated's outgoing is the just-interrupted TARGET, not the original camera", () => {
      const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 2 } });
      core[register]({ id: 'a', priority: 10, state: createCameraState() });
      core[advance](0); // 'a' live
      core[register]({ id: 'b', priority: 20, state: createCameraState() });
      core[advance](0.5); // blend a->b in progress, not finished

      const onCreated = vi.fn();
      core.addEventListener('blendCreated', onCreated);
      core[register]({ id: 'c', priority: 30, state: createCameraState() });
      core[advance](0.1); // interrupts a->b with a new blend toward c

      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onCreated.mock.calls[0][0]).toMatchObject({ incoming: 'c', outgoing: 'b' });
    });
  });
});

describe('Klipp — updatePriority', () => {
  it('can flip the winner, and ignores unknown ids', () => {
    const core = new Klipp();
    core[register]({ id: 'a', priority: 10, state: createCameraState() });
    core[register]({ id: 'b', priority: 20, state: createCameraState() });

    core[setPriority]('a', 30);
    expect(core.activeCameraId).toBe('a');
    core[setPriority]('nonexistent', 99);
    expect(core.activeCameraId).toBe('a');
  });

  it('a bare priority edit on the sole/still-winning camera does not touch liveId or start a blend', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    core[register]({ id: 'a', priority: 10, state: createCameraState() });
    core[advance](0); // 'a' snaps live
    expect(core.liveCameraId).toBe('a');
    expect(core.isBlending).toBe(false);

    core[setPriority]('a', 11); // same camera, still the only/winning one
    expect(core.activeCameraId).toBe('a');
    expect(core.liveCameraId).toBe('a'); // unchanged — updatePriority must not touch this
    expect(core.isBlending).toBe(false); // real bug: a full unregister+register cycle spuriously started one

    core[advance](0.1);
    expect(core.isBlending).toBe(false); // still no blend after a tick — confirms it wasn't just deferred
  });
});

describe('Klipp — tick(dt): blend lifecycle', () => {
  it('the first-ever camera snaps live immediately, no blend', () => {
    const core = new Klipp();
    const state = createCameraState();
    vec3.set(state.position, 1, 2, 3);
    core[register]({ id: 'a', priority: 10, state });

    const out = core[advance](0);

    expect(core.liveCameraId).toBe('a');
    expect(core.isBlending).toBe(false);
    expect(vec3.exactEquals(out.position, state.position)).toBe(true);
  });

  it('blends to a new winner over the configured time, the old one staying live until the end', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    core[register]({ id: 'a', priority: 10, state: stateAt(0) });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: stateAt(10) });

    for (const x of [2.5, 5, 7.5]) {
      expect(core[advance](0.25).position[0]).toBeCloseTo(x, 10);
      expect(core.isBlending).toBe(true);
      expect(core.liveCameraId).toBe('a');
    }

    expect(core[advance](0.25).position[0]).toBeCloseTo(10, 10);
    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('b');
  });

  it('a zero-length ("cut") blend resolves within the same tick it starts', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.cut, time: 0 } });
    core[register]({ id: 'a', priority: 10, state: createCameraState() });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: stateAt(5) });

    const out = core[advance](0.016);

    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('b');
    expect(out.position[0]).toBeCloseTo(5, 10);
  });

  it('the blend target is tracked LIVE — a mock Body that moves mid-blend pulls the output with it (a static mock would not catch this)', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    core[register]({ id: 'a', priority: 10, state: a });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: b });

    expect(core[advance](0.5).position[0]).toBeCloseTo(5, 10);

    // simulate a moving Body: its own update loop shifts its live state between ticks
    b.position[0] = 50;

    expect(core[advance](0.5).position[0]).toBeCloseTo(50, 10);
  });

  it('mid-blend interruption: a new winner blends from the CURRENT composited output, not from the original outgoing state', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    const c = stateAt(100);
    core[register]({ id: 'a', priority: 10, state: a });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: b });

    expect(core[advance](0.25).position[0]).toBeCloseTo(2.5, 10); // 25% of the way from a to b

    core[register]({ id: 'c', priority: 30, state: c });
    const interrupted = core[advance](0.5); // 50% of the way from the frozen 2.5 midpoint to c (x=100)

    expect(interrupted.position[0]).toBeCloseTo(2.5 + (100 - 2.5) * 0.5, 10);
    expect(interrupted.position[0]).not.toBeCloseTo(50, 1); // NOT a naive a(0)->c(100) blend
    expect(interrupted.position[0]).not.toBeCloseTo(100, 1); // NOT a snap straight to c
  });

  it('mid-blend interruption resolves Custom Blends against the interrupted blend\'s TARGET as "from", not the original outgoing camera', () => {
    const core = new Klipp({
      defaultBlend: { curve: BlendCurves.linear, time: 1 },
      customBlends: [{ from: 'b', to: 'c', blend: { curve: BlendCurves.cut, time: 0 } }],
    });
    core[register]({ id: 'a', priority: 10, state: createCameraState() });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: createCameraState() });
    core[advance](0.25); // interrupt while still blending a -> b

    core[register]({ id: 'c', priority: 30, state: stateAt(7) });
    const out = core[advance](0.016);

    // only matches because the interruption looked up the custom blend under from: 'b' (the
    // interrupted blend's target), not from: 'a' (the original outgoing camera) — otherwise the
    // default linear/1s blend would apply instead and this wouldn't resolve within one tick.
    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('c');
    expect(out.position[0]).toBeCloseTo(7, 10);
  });

  it("unregistering the steady (non-blending) live camera keeps the last composited output as the next blend's start", () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(3);
    const unregisterA = core[register]({ id: 'a', priority: 10, state: a });
    core[advance](0);
    expect(core.liveCameraId).toBe('a');

    unregisterA();
    core[register]({ id: 'b', priority: 5, state: stateAt(9) });

    expect(core.liveCameraId).toBeNull();
    const out = core[advance](0.5);
    expect(core.isBlending).toBe(true);
    expect(out.position[0]).toBeCloseTo(6, 10); // blends from a's last known position (3), not from 0
  });

  it('a Custom Blend keyed by `from` still matches after the outgoing camera unregisters first (the `active`-prop toggle pattern — real bug: unregistering nulled the id customBlends resolved "from" against, silently falling back to defaultBlend)', () => {
    const core = new Klipp({
      defaultBlend: { curve: BlendCurves.linear, time: 1 },
      customBlends: [{ from: 'a', to: 'b', blend: { curve: BlendCurves.cut, time: 0 } }],
    });
    const unregisterA = core[register]({ id: 'a', priority: 10, state: stateAt(0) });
    core[advance](0);

    unregisterA();
    core[register]({ id: 'b', priority: 5, state: stateAt(10) });

    const out = core[advance](0.016);
    expect(core.isBlending).toBe(false);
    expect(out.position[0]).toBeCloseTo(10, 10); // cut, not a sliver of the 1s default linear blend
  });

  it('unregistering the blend TARGET mid-flight re-blends from the current composited position — even if the recomputed winner happens to equal the stale liveId (real bug: it snapped instead)', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    core[register]({ id: 'a', priority: 10, state: a });
    core[advance](0); // 'a' snaps live

    const unregisterB = core[register]({ id: 'b', priority: 20, state: b });
    expect(core[advance](0.5).position[0]).toBeCloseTo(5, 10); // halfway through the a -> b blend

    unregisterB(); // 'b' vanishes mid-blend; 'a' — the OLD liveId — is the only candidate left

    const out = core[advance](0.5);
    // a naive fix would see activeId ('a') === the stale liveId ('a') and skip starting a new blend,
    // snapping straight to a's raw x=0 instead of continuing smoothly from the x=5 midpoint.
    expect(out.position[0]).toBeGreaterThan(0);
    expect(out.position[0]).toBeLessThan(5);
    expect(core.isBlending).toBe(true);
  });

  it('same fix, mirrored priorities and a MOVING fallback camera: toggling a higher-priority camera off mid-blend re-blends back to the lower-priority one, not a snap', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const main = stateAt(0); // lower priority, always registered, moves every frame (like an orbit)
    const main1 = stateAt(10); // higher priority, toggled on/off

    core[register]({ id: 'main', priority: 11, state: main });
    core[advance](0); // 'main' snaps live (main1 not registered yet)

    const unregisterMain1 = core[register]({ id: 'main1', priority: 12, state: main1 });
    main.position[0] = 1; // 'main' keeps moving in the background, unrelated to the blend
    expect(core[advance](0.5).position[0]).toBeCloseTo(5, 10); // halfway through the main -> main1 blend

    main.position[0] = 2; // moves again before the toggle-off
    unregisterMain1(); // main1 vanishes mid-blend; 'main' — the OLD liveId — is the only candidate left

    const out = core[advance](0.5);
    expect(out.position[0]).toBeGreaterThan(2); // blending FROM the x=5 midpoint TOWARD main's x=2
    expect(out.position[0]).toBeLessThan(5);
    expect(core.isBlending).toBe(true);
  });
});

describe('Klipp — setDefaultBlend/setCustomBlends', () => {
  it('setDefaultBlend takes effect on the NEXT transition, without touching an already in-progress blend', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 10 } });
    core[register]({ id: 'a', priority: 10, state: stateAt(0) });
    core[advance](0); // 'a' snaps live

    core[register]({ id: 'b', priority: 20, state: stateAt(10) });
    core[advance](1); // 1s into a 10s linear blend — barely moved

    core.setDefaultBlend({ curve: BlendCurves.cut, time: 0 });
    const midBlend = core[advance](0.1);
    expect(core.isBlending).toBe(true); // still using the ORIGINAL 10s blend, unaffected
    expect(midBlend.position[0]).toBeCloseTo(1.1, 10);

    core[register]({ id: 'c', priority: 30, state: stateAt(100) });
    const out = core[advance](0); // a NEW transition — this one uses the updated (instant cut) default
    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('c');
    expect(out.position[0]).toBeCloseTo(100, 10);
  });

  it('setDefaultBlend() with no argument resets to the built-in default (ease in/out, 2s)', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.cut, time: 0 } });
    core.setDefaultBlend();
    core[register]({ id: 'a', priority: 10, state: stateAt(0) });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: stateAt(10) });

    const out = core[advance](0); // 0s into the (now 2s) blend — should NOT have cut instantly
    expect(core.isBlending).toBe(true);
    expect(out.position[0]).toBeCloseTo(0, 10);
  });

  it('setCustomBlends replaces the list, and no argument clears it', () => {
    const cutsTo = (setup: (core: Klipp) => void) => {
      const core = new Klipp({
        defaultBlend: { curve: BlendCurves.linear, time: 10 },
        customBlends: [{ from: 'x', to: 'y', blend: { curve: BlendCurves.cut, time: 0 } }],
      });
      core[register]({ id: 'a', priority: 10, state: stateAt(0) });
      core[advance](0);
      setup(core);
      core[register]({ id: 'b', priority: 20, state: stateAt(10) });
      core[advance](0);
      return !core.isBlending;
    };

    expect(
      cutsTo((core) => core.setCustomBlends([{ from: 'a', to: 'b', blend: { curve: BlendCurves.cut, time: 0 } }])),
    ).toBe(true);
    expect(cutsTo((core) => core.setCustomBlends())).toBe(false);
  });
});

describe('Klipp — BlendHints', () => {
  function orbitingStateAt(position: Vec3): ReturnType<typeof createCameraState> {
    const state = createCameraState();
    vec3.copy(state.position, position);
    vec3.set(state.target, 0, 0, 0);
    state.hasTarget = true;
    return state;
  }

  it("a hint on the INCOMING camera alone is enough to shape the blend (the user's real case: two cameras that both look at the same origin point)", () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt([5, 5, 5]);
    const b = orbitingStateAt([0, 0, 5]);
    core[register]({ id: 'a', priority: 10, state: a });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: b, hints: BlendHints.sphericalPosition });

    const out = core[advance](0.5); // halfway through the 1s blend

    const radiusA = vec3.length(a.position);
    const radiusB = vec3.length(b.position);
    expect(vec3.length(out.position)).toBeCloseTo((radiusA + radiusB) / 2, 5);
  });

  it('a hint on the OUTGOING camera alone also shapes the blend (hints combine via OR, not just the incoming side)', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt([5, 5, 5]);
    const b = orbitingStateAt([0, 0, 5]);
    core[register]({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: b }); // no hint on the incoming side

    const out = core[advance](0.5);

    const radiusA = vec3.length(a.position);
    const radiusB = vec3.length(b.position);
    expect(vec3.length(out.position)).toBeCloseTo((radiusA + radiusB) / 2, 5);
  });

  it("the OUTGOING camera's hint survives it unregistering before the incoming one registers (the `active`-prop toggle pattern - real bug: its candidate entry, and hints with it, was already gone by the time tick() read them)", () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt([5, 5, 5]);
    const b = orbitingStateAt([0, 0, 5]);
    const unregisterA = core[register]({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
    core[advance](0);

    unregisterA();
    core[register]({ id: 'b', priority: 20, state: b }); // no hint of its own

    const out = core[advance](0.5);

    const radiusA = vec3.length(a.position);
    const radiusB = vec3.length(b.position);
    expect(vec3.length(out.position)).toBeCloseTo((radiusA + radiusB) / 2, 5);
  });

  it("updating the LIVE outgoing camera's hints takes effect on its NEXT transition - real bug: the captured customBlendFromHints stayed stale one transition behind, since it was only refreshed at transition time, not when a live camera's hints changed", () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt([5, 5, 5]);
    const b = orbitingStateAt([0, 0, 5]);
    core[register]({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
    core[advance](0); // 'a' goes live with sphericalPosition - captures customBlendFromHints

    core[setHints]('a', BlendHints.none); // toggled off while 'a' is still live, no transition yet
    core[register]({ id: 'b', priority: 20, state: b });

    const out = core[advance](0.5);

    const radiusA = vec3.length(a.position);
    const radiusB = vec3.length(b.position);
    expect(vec3.length(out.position)).not.toBeCloseTo((radiusA + radiusB) / 2, 1);
  });

  it("updating the LIVE outgoing camera's hints ALSO takes effect when it unregisters before the incoming one registers (the `active`-prop toggle pattern combined with a hints toggle - real bug: the stale snapshot was the ONLY hints source left once the candidate itself was gone)", () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt([5, 5, 5]);
    const b = orbitingStateAt([0, 0, 5]);
    const unregisterA = core[register]({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
    core[advance](0); // 'a' goes live with sphericalPosition - captures customBlendFromHints

    core[setHints]('a', BlendHints.none); // toggled off while 'a' is still live, no transition yet
    unregisterA(); // then 'a' unregisters BEFORE 'b' registers, same as the `active`-prop toggle pattern
    core[register]({ id: 'b', priority: 20, state: b });

    const out = core[advance](0.5);

    const radiusA = vec3.length(a.position);
    const radiusB = vec3.length(b.position);
    expect(vec3.length(out.position)).not.toBeCloseTo((radiusA + radiusB) / 2, 1);
  });

  it('without any hint, the same two cameras blend along a straight cartesian line instead', () => {
    const core = new Klipp({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt([5, 5, 5]);
    const b = orbitingStateAt([0, 0, 5]);
    core[register]({ id: 'a', priority: 10, state: a });
    core[advance](0);
    core[register]({ id: 'b', priority: 20, state: b });

    const out = core[advance](0.5);

    const radiusA = vec3.length(a.position);
    const radiusB = vec3.length(b.position);
    expect(vec3.length(out.position)).not.toBeCloseTo((radiusA + radiusB) / 2, 1);
  });
});

/** A `Klipp` that keeps every output it writes, standing in for a renderer's camera. */
class Recorder extends Klipp {
  readonly writes: CameraState[] = [];
  protected override write(result: CameraState): void {
    this.writes.push(copyCameraState(createCameraState(), result));
  }
}

/** A Body that puts the camera at a fixed point. */
const lock = (position: Vec3): CameraPiece => ({ update: (out) => void vec3.copy(out.position, position) });

function twoShots(options?: KlippOptions) {
  const klipp = new Recorder({ defaultBlend: { curve: BlendCurves.linear, time: 1 }, ...options });
  const left = klipp.addCamera('left', { priority: 10 });
  left.body = lock([-10, 0, 0]);
  const right = klipp.addCamera('right', { priority: 0 });
  right.body = lock([10, 0, 0]);
  return { klipp, left, right };
}

describe('Klipp — update(dt): the frame loop', () => {
  it('runs every camera, writes the winning shot when it changes, and blends to a new winner', () => {
    const { klipp, right } = twoShots();
    klipp.update(0.1);
    expect(klipp.writes.map((w) => w.position[0])).toEqual([-10]);

    right.priority = 20;
    klipp.update(0.5);
    klipp.update(0.5);
    expect(klipp.writes.map((w) => w.position[0])).toEqual([-10, 0, 10]);
  });

  it('shot holds the last written shot', () => {
    const { klipp, right } = twoShots();
    klipp.update(0.1);
    right.priority = 20;
    klipp.update(0.5);
    expect(klipp.shot).toEqual(klipp.writes.at(-1));
    expect(klipp.shot.position[0]).toBe(0);
  });

  it('returns true only while something moves or the output changed', () => {
    const { klipp, right } = twoShots();
    expect(klipp.update(0.1)).toBe(true);
    expect(klipp.update(0.1)).toBe(false);

    right.priority = 20;
    expect(klipp.update(0.1)).toBe(true);
    for (let i = 0; i < 20; i++) klipp.update(0.1);
    expect(klipp.update(0.1)).toBe(false);
  });

  it('writes nothing until a virtual camera goes live', () => {
    const klipp = new Recorder();
    const shot = klipp.addCamera('a', { active: false });
    shot.body = lock([5, 0, 0]);
    klipp.update(0.1);
    expect(klipp.writes).toEqual([]);

    shot.active = true;
    klipp.update(0.1);
    expect(klipp.writes.map((w) => w.position[0])).toEqual([5]);
  });

  it('standby keeps cameras updating without writing, and disabled stops everything', () => {
    for (const mode of ['standby', 'disabled'] as const) {
      const { klipp, left } = twoShots({ mode });
      klipp.update(0.1);
      expect(klipp.writes).toEqual([]);
      expect(left.state.position[0]).toBe(mode === 'standby' ? -10 : 0);
    }
  });

  it('runs registered updates before the cameras, and stops them once removed', () => {
    const { klipp, left } = twoShots();
    const order: string[] = [];
    const stop = klipp.registerUpdate(() => void order.push('update'));
    left.addNoise({ update: () => void order.push('camera') });
    klipp.update(0.1);
    stop();
    klipp.update(0.1);

    expect(order).toEqual(['update', 'camera', 'camera']);
  });

  it('a camera added to another Klipp moves there and keeps its state', () => {
    const first = new Klipp();
    const camera = first.addCamera('a');
    const initialCameraState = createCameraState();
    initialCameraState.fov = 35;
    const second = new Klipp({ initialCameraState });
    first.update(0.1);
    second.add(camera);

    expect(camera.klipp).toBe(second);
    expect(first.activeCameraId).toBeNull();
    expect(second.activeCameraId).toBe('a');
    expect(camera.state.fov).toBe(50);
  });

  it('warns when two cameras share a name, on add or on rename', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const klipp = new Klipp();
    klipp.addCamera('a');
    const b = klipp.addCamera('b');
    expect(warn).not.toHaveBeenCalled();

    klipp.addCamera('a');
    b.name = 'a';
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a"'));
    warn.mockRestore();
  });

  it('whileOnScreen starts once the blend into the camera finishes, and stops when another camera wins', () => {
    const { klipp, left, right } = twoShots();
    const calls: string[] = [];
    const stopWatching = klipp.whileOnScreen(right, () => {
      calls.push('start');
      return () => calls.push('stop');
    });

    klipp.update(0.1);
    right.priority = 20;
    klipp.update(0.5);
    expect(calls).toEqual([]);
    klipp.update(0.6);
    expect(calls).toEqual(['start']);

    left.priority = 30;
    expect(calls).toEqual(['start', 'stop']);

    right.priority = 40;
    klipp.update(0.1);
    klipp.update(1);
    stopWatching();
    expect(calls).toEqual(['start', 'stop', 'start', 'stop']);
  });

  it('whileOnScreen without waitForBlend starts as soon as the camera wins', () => {
    const { klipp, right } = twoShots();
    const start = vi.fn(() => () => {});
    klipp.update(0.1);
    klipp.whileOnScreen(right, start, { waitForBlend: false });

    right.priority = 20;
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a removed camera leaves the arbitration', () => {
    const { klipp, left } = twoShots();
    klipp.update(0.1);
    klipp.remove(left);
    klipp.update(0.1);
    expect(klipp.activeCameraId).toBe('right');
  });
});
