import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCameraState } from '../src/CameraState';
import { BlendCurves } from '../src/blend/BlendCurves';
import { BlendHints } from '../src/blend/BlendHints';
import { KlippCore } from '../src/KlippCore';

function stateAt(x: number): ReturnType<typeof createCameraState> {
  const state = createCameraState();
  state.position.set(x, 0, 0);
  return state;
}

describe('KlippCore — registry & priority arbitration', () => {
  it('has no active camera before anything registers', () => {
    const core = new KlippCore();
    expect(core.activeCameraId).toBeNull();
    expect(core.activeState).toBeNull();
  });

  it('hasEverActivated distinguishes "never activated" from "was live, now forgotten mid-blend" — unlike liveCameraId, it stays true through the latter', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    expect(core.hasEverActivated).toBe(false);

    const unregisterA = core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
    core.tick(0); // 'a' snaps live
    expect(core.hasEverActivated).toBe(true);

    unregisterA(); // forgotten — liveCameraId goes null, but hasEverActivated must not
    expect(core.liveCameraId).toBeNull();
    expect(core.hasEverActivated).toBe(true);
  });

  it('a single registered camera becomes active', () => {
    const core = new KlippCore();
    const state = createCameraState();
    core.registerCamera({ id: 'a', priority: 10, state });
    expect(core.activeCameraId).toBe('a');
    expect(core.isActive('a')).toBe(true);
  });

  it("exposes a live reference to the active camera's state (not a copy)", () => {
    const core = new KlippCore();
    const state = createCameraState();
    core.registerCamera({ id: 'a', priority: 10, state });

    expect(core.activeState).toBe(state);
    state.position.set(1, 2, 3);
    expect(core.activeState?.position.equals(state.position)).toBe(true);
  });

  it('highest priority wins', () => {
    const core = new KlippCore();
    core.registerCamera({ id: 'low', priority: 10, state: createCameraState() });
    core.registerCamera({ id: 'high', priority: 20, state: createCameraState() });
    expect(core.activeCameraId).toBe('high');
  });

  it('registering a lower-priority camera does not steal the win', () => {
    const core = new KlippCore();
    core.registerCamera({ id: 'high', priority: 20, state: createCameraState() });
    core.registerCamera({ id: 'low', priority: 10, state: createCameraState() });
    expect(core.activeCameraId).toBe('high');
  });

  it('tie on priority: the most recently registered camera wins', () => {
    const core = new KlippCore();
    core.registerCamera({ id: 'first', priority: 10, state: createCameraState() });
    core.registerCamera({ id: 'second', priority: 10, state: createCameraState() });
    expect(core.activeCameraId).toBe('second');
  });

  it('unregistering the winner falls back to the next-highest camera', () => {
    const core = new KlippCore();
    core.registerCamera({ id: 'low', priority: 10, state: createCameraState() });
    const unregisterHigh = core.registerCamera({ id: 'high', priority: 20, state: createCameraState() });
    expect(core.activeCameraId).toBe('high');

    unregisterHigh();
    expect(core.activeCameraId).toBe('low');
  });

  it('unregistering the last camera leaves no active winner', () => {
    const core = new KlippCore();
    const unregister = core.registerCamera({ id: 'only', priority: 10, state: createCameraState() });
    unregister();
    expect(core.activeCameraId).toBeNull();
    expect(core.activeState).toBeNull();
  });

  it('an empty-string id is still a valid active camera', () => {
    const core = new KlippCore();
    const state = createCameraState();
    core.registerCamera({ id: '', priority: 10, state });
    expect(core.activeCameraId).toBe('');
    expect(core.activeState).toBe(state);
  });

  it("re-registering the same id: the older registration's unregister must not tear down the newer one", () => {
    const core = new KlippCore();
    const first = core.registerCamera({ id: 'main', priority: 10, state: createCameraState() });
    const secondState = createCameraState();
    core.registerCamera({ id: 'main', priority: 10, state: secondState });

    first(); // stale cleanup from the first, already-overwritten registration
    expect(core.activeCameraId).toBe('main');
    expect(core.activeState).toBe(secondState);
  });

  describe('subscribeActiveId', () => {
    it('notifies subscribers when the priority winner actually changes', () => {
      const core = new KlippCore();
      const listener = vi.fn();
      core.subscribeActiveId(listener);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() }); // null -> 'a'
      expect(listener).toHaveBeenCalledTimes(1);

      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() }); // 'a' -> 'b'
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('does NOT notify when recompute() runs but the winner stays the same', () => {
      const core = new KlippCore();
      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      const listener = vi.fn();
      core.subscribeActiveId(listener);

      // registering a lower-priority camera re-arbitrates but 'a' keeps winning — no-op for the winner
      core.registerCamera({ id: 'b', priority: 5, state: createCameraState() });
      expect(listener).not.toHaveBeenCalled();
    });

    it('the returned unsubscribe function stops further notifications', () => {
      const core = new KlippCore();
      const listener = vi.fn();
      const unsubscribe = core.subscribeActiveId(listener);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
      expect(listener).toHaveBeenCalledTimes(1); // still 1 — no further calls after unsubscribing
    });
  });

  describe('subscribeLiveId', () => {
    it('notifies once when the very first camera snaps live', () => {
      const core = new KlippCore();
      const listener = vi.fn();
      core.subscribeLiveId(listener);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      core.tick(0);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(core.isLive('a')).toBe(true);
    });

    it('does NOT notify while a blend is in progress — only once it actually finishes', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      core.tick(0); // 'a' snaps live

      const listener = vi.fn();
      core.subscribeLiveId(listener);
      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() }); // 'b' now wins

      core.tick(0.5); // mid-blend
      expect(listener).not.toHaveBeenCalled();
      expect(core.isLive('a')).toBe(true); // still 'a' — blend hasn't finished

      core.tick(0.6); // pushes elapsed past the 1s blend duration
      expect(listener).toHaveBeenCalledTimes(1);
      expect(core.isLive('b')).toBe(true);
    });

    it('the returned unsubscribe function stops further notifications', () => {
      // zero-time blend = instant, so a single tick(0) after registering 'b' genuinely flips liveId —
      // proves the listener was skipped because it unsubscribed, not because nothing actually changed
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 0 } });
      const listener = vi.fn();
      const unsubscribe = core.subscribeLiveId(listener);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      core.tick(0);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
      core.tick(0);
      expect(core.isLive('b')).toBe(true); // liveId DID change...
      expect(listener).toHaveBeenCalledTimes(1); // ...but still 1 — no further calls after unsubscribing
    });
  });
});

describe('KlippCore — updatePriority', () => {
  it('updates the priority and can flip the winner', () => {
    const core = new KlippCore();
    core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
    core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
    expect(core.activeCameraId).toBe('b');

    core.updatePriority('a', 30);
    expect(core.activeCameraId).toBe('a');
  });

  it('a bare priority edit on the sole/still-winning camera does not touch liveId or start a blend', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
    core.tick(0); // 'a' snaps live
    expect(core.liveCameraId).toBe('a');
    expect(core.isBlending).toBe(false);

    core.updatePriority('a', 11); // same camera, still the only/winning one
    expect(core.activeCameraId).toBe('a');
    expect(core.liveCameraId).toBe('a'); // unchanged — updatePriority must not touch this
    expect(core.isBlending).toBe(false); // real bug: a full unregister+register cycle spuriously started one

    core.tick(0.1);
    expect(core.isBlending).toBe(false); // still no blend after a tick — confirms it wasn't just deferred
  });

  it('does nothing for an id that was never registered (or already unregistered)', () => {
    const core = new KlippCore();
    core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });

    expect(() => core.updatePriority('nonexistent', 99)).not.toThrow();
    expect(core.activeCameraId).toBe('a');
  });
});

describe('KlippCore — tick(dt): blend lifecycle', () => {
  it('the first-ever camera snaps live immediately, no blend', () => {
    const core = new KlippCore();
    const state = createCameraState();
    state.position.set(1, 2, 3);
    core.registerCamera({ id: 'a', priority: 10, state });

    const out = core.tick(0);

    expect(core.liveCameraId).toBe('a');
    expect(core.isBlending).toBe(false);
    expect(out.position.equals(state.position)).toBe(true);
  });

  it('a new, higher-priority camera blends in over the configured time, not an instant cut', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0);

    core.registerCamera({ id: 'b', priority: 20, state: b });

    expect(core.tick(0.25).position.x).toBeCloseTo(2.5, 10);
    expect(core.isBlending).toBe(true);
    expect(core.liveCameraId).toBe('a');

    expect(core.tick(0.25).position.x).toBeCloseTo(5, 10);
    expect(core.tick(0.25).position.x).toBeCloseTo(7.5, 10);

    const final = core.tick(0.25);
    expect(final.position.x).toBeCloseTo(10, 10);
    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('b');
  });

  it('the outgoing camera stays live (keeps feeding the output) until its blend finishes', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 10 } });
    core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });

    core.tick(0.1);
    expect(core.liveCameraId).toBe('a');
    expect(core.isBlending).toBe(true);

    core.tick(0.1);
    expect(core.liveCameraId).toBe('a');
  });

  it('a zero-length ("cut") blend resolves within the same tick it starts', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.cut, time: 0 } });
    core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: stateAt(5) });

    const out = core.tick(0.016);

    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('b');
    expect(out.position.x).toBeCloseTo(5, 10);
  });

  it('the blend target is tracked LIVE — a mock Body that moves mid-blend pulls the output with it (a static mock would not catch this)', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: b });

    expect(core.tick(0.5).position.x).toBeCloseTo(5, 10);

    // simulate a moving Body: its own update loop shifts its live state between ticks
    b.position.x = 50;

    expect(core.tick(0.5).position.x).toBeCloseTo(50, 10);
  });

  it('mid-blend interruption: a new winner blends from the CURRENT composited output, not from the original outgoing state', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    const c = stateAt(100);
    core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: b });

    expect(core.tick(0.25).position.x).toBeCloseTo(2.5, 10); // 25% of the way from a to b

    core.registerCamera({ id: 'c', priority: 30, state: c });
    const interrupted = core.tick(0.5); // 50% of the way from the frozen 2.5 midpoint to c (x=100)

    expect(interrupted.position.x).toBeCloseTo(2.5 + (100 - 2.5) * 0.5, 10);
    expect(interrupted.position.x).not.toBeCloseTo(50, 1); // NOT a naive a(0)->c(100) blend
    expect(interrupted.position.x).not.toBeCloseTo(100, 1); // NOT a snap straight to c
  });

  it('mid-blend interruption resolves Custom Blends against the interrupted blend\'s TARGET as "from", not the original outgoing camera', () => {
    const core = new KlippCore({
      defaultBlend: { curve: BlendCurves.linear, time: 1 },
      customBlends: [{ from: 'b', to: 'c', blend: { curve: BlendCurves.cut, time: 0 } }],
    });
    core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
    core.tick(0.25); // interrupt while still blending a -> b

    core.registerCamera({ id: 'c', priority: 30, state: stateAt(7) });
    const out = core.tick(0.016);

    // only matches because the interruption looked up the custom blend under from: 'b' (the
    // interrupted blend's target), not from: 'a' (the original outgoing camera) — otherwise the
    // default linear/1s blend would apply instead and this wouldn't resolve within one tick.
    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('c');
    expect(out.position.x).toBeCloseTo(7, 10);
  });

  it("unregistering the steady (non-blending) live camera keeps the last composited output as the next blend's start", () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(3);
    const unregisterA = core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0);
    expect(core.liveCameraId).toBe('a');

    unregisterA();
    core.registerCamera({ id: 'b', priority: 5, state: stateAt(9) });

    expect(core.liveCameraId).toBeNull();
    const out = core.tick(0.5);
    expect(core.isBlending).toBe(true);
    expect(out.position.x).toBeCloseTo(6, 10); // blends from a's last known position (3), not from 0
  });

  it('a Custom Blend keyed by `from` still matches after the outgoing camera unregisters first (the `active`-prop toggle pattern — real bug: unregistering nulled the id customBlends resolved "from" against, silently falling back to defaultBlend)', () => {
    const core = new KlippCore({
      defaultBlend: { curve: BlendCurves.linear, time: 1 },
      customBlends: [{ from: 'a', to: 'b', blend: { curve: BlendCurves.cut, time: 0 } }],
    });
    const unregisterA = core.registerCamera({ id: 'a', priority: 10, state: stateAt(0) });
    core.tick(0);

    unregisterA();
    core.registerCamera({ id: 'b', priority: 5, state: stateAt(10) });

    const out = core.tick(0.016);
    expect(core.isBlending).toBe(false);
    expect(out.position.x).toBeCloseTo(10, 10); // cut, not a sliver of the 1s default linear blend
  });

  it('unregistering the blend TARGET mid-flight re-blends from the current composited position — even if the recomputed winner happens to equal the stale liveId (real bug: it snapped instead)', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = stateAt(0);
    const b = stateAt(10);
    core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0); // 'a' snaps live

    const unregisterB = core.registerCamera({ id: 'b', priority: 20, state: b });
    expect(core.tick(0.5).position.x).toBeCloseTo(5, 10); // halfway through the a -> b blend

    unregisterB(); // 'b' vanishes mid-blend; 'a' — the OLD liveId — is the only candidate left

    const out = core.tick(0.5);
    // a naive fix would see activeId ('a') === the stale liveId ('a') and skip starting a new blend,
    // snapping straight to a's raw x=0 instead of continuing smoothly from the x=5 midpoint.
    expect(out.position.x).toBeGreaterThan(0);
    expect(out.position.x).toBeLessThan(5);
    expect(core.isBlending).toBe(true);
  });

  it('same fix, mirrored priorities and a MOVING fallback camera: toggling a higher-priority camera off mid-blend re-blends back to the lower-priority one, not a snap', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const main = stateAt(0); // lower priority, always registered, moves every frame (like an orbit)
    const main1 = stateAt(10); // higher priority, toggled on/off

    core.registerCamera({ id: 'main', priority: 11, state: main });
    core.tick(0); // 'main' snaps live (main1 not registered yet)

    const unregisterMain1 = core.registerCamera({ id: 'main1', priority: 12, state: main1 });
    main.position.x = 1; // 'main' keeps moving in the background, unrelated to the blend
    expect(core.tick(0.5).position.x).toBeCloseTo(5, 10); // halfway through the main -> main1 blend

    main.position.x = 2; // moves again before the toggle-off
    unregisterMain1(); // main1 vanishes mid-blend; 'main' — the OLD liveId — is the only candidate left

    const out = core.tick(0.5);
    expect(out.position.x).toBeGreaterThan(2); // blending FROM the x=5 midpoint TOWARD main's x=2
    expect(out.position.x).toBeLessThan(5);
    expect(core.isBlending).toBe(true);
  });
});

describe('KlippCore — setDefaultBlend/setCustomBlends', () => {
  it('setDefaultBlend takes effect on the NEXT transition, without touching an already in-progress blend', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 10 } });
    core.registerCamera({ id: 'a', priority: 10, state: stateAt(0) });
    core.tick(0); // 'a' snaps live

    core.registerCamera({ id: 'b', priority: 20, state: stateAt(10) });
    core.tick(1); // 1s into a 10s linear blend — barely moved

    core.setDefaultBlend({ curve: BlendCurves.cut, time: 0 });
    const midBlend = core.tick(0.1);
    expect(core.isBlending).toBe(true); // still using the ORIGINAL 10s blend, unaffected
    expect(midBlend.position.x).toBeCloseTo(1.1, 10);

    core.registerCamera({ id: 'c', priority: 30, state: stateAt(100) });
    const out = core.tick(0); // a NEW transition — this one uses the updated (instant cut) default
    expect(core.isBlending).toBe(false);
    expect(core.liveCameraId).toBe('c');
    expect(out.position.x).toBeCloseTo(100, 10);
  });

  it('setDefaultBlend() with no argument resets to the built-in default (ease in/out, 2s)', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.cut, time: 0 } });
    core.setDefaultBlend();
    core.registerCamera({ id: 'a', priority: 10, state: stateAt(0) });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: stateAt(10) });

    const out = core.tick(0); // 0s into the (now 2s) blend — should NOT have cut instantly
    expect(core.isBlending).toBe(true);
    expect(out.position.x).toBeCloseTo(0, 10);
  });

  it('setCustomBlends replaces the list — a from/to pair resolves against the NEW list on the next transition', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 10 } });
    core.registerCamera({ id: 'a', priority: 10, state: stateAt(0) });
    core.tick(0);

    core.setCustomBlends([{ from: 'a', to: 'b', blend: { curve: BlendCurves.cut, time: 0 } }]);
    core.registerCamera({ id: 'b', priority: 20, state: stateAt(10) });
    const out = core.tick(0); // custom blend applies: instant cut, not the 10s default

    expect(core.isBlending).toBe(false);
    expect(out.position.x).toBeCloseTo(10, 10);
  });

  it('setCustomBlends() with no argument clears the list, falling back to defaultBlend', () => {
    const core = new KlippCore({
      defaultBlend: { curve: BlendCurves.linear, time: 10 },
      customBlends: [{ from: 'a', to: 'b', blend: { curve: BlendCurves.cut, time: 0 } }],
    });
    core.registerCamera({ id: 'a', priority: 10, state: stateAt(0) });
    core.tick(0);

    core.setCustomBlends();
    core.registerCamera({ id: 'b', priority: 20, state: stateAt(10) });
    const out = core.tick(0); // no more custom blend — falls back to the 10s linear default

    expect(core.isBlending).toBe(true);
    expect(out.position.x).toBeCloseTo(0, 10);
  });
});

describe('KlippCore — BlendHints', () => {
  function orbitingStateAt(position: Vector3): ReturnType<typeof createCameraState> {
    const state = createCameraState();
    state.position.copy(position);
    state.target.set(0, 0, 0);
    state.hasTarget = true;
    return state;
  }

  it("a hint on the INCOMING camera alone is enough to shape the blend (the user's real case: two cameras that both look at the same origin point)", () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt(new Vector3(5, 5, 5));
    const b = orbitingStateAt(new Vector3(0, 0, 5));
    core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: b, hints: BlendHints.sphericalPosition });

    const out = core.tick(0.5); // halfway through the 1s blend

    const radiusA = a.position.length();
    const radiusB = b.position.length();
    expect(out.position.length()).toBeCloseTo((radiusA + radiusB) / 2, 5);
  });

  it("a hint on the OUTGOING camera alone also shapes the blend (hints combine via OR, not just the incoming side)", () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt(new Vector3(5, 5, 5));
    const b = orbitingStateAt(new Vector3(0, 0, 5));
    core.registerCamera({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: b }); // no hint on the incoming side

    const out = core.tick(0.5);

    const radiusA = a.position.length();
    const radiusB = b.position.length();
    expect(out.position.length()).toBeCloseTo((radiusA + radiusB) / 2, 5);
  });

  it("the OUTGOING camera's hint survives it unregistering before the incoming one registers (the `active`-prop toggle pattern - real bug: its candidate entry, and hints with it, was already gone by the time tick() read them)", () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt(new Vector3(5, 5, 5));
    const b = orbitingStateAt(new Vector3(0, 0, 5));
    const unregisterA = core.registerCamera({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
    core.tick(0);

    unregisterA();
    core.registerCamera({ id: 'b', priority: 20, state: b }); // no hint of its own

    const out = core.tick(0.5);

    const radiusA = a.position.length();
    const radiusB = b.position.length();
    expect(out.position.length()).toBeCloseTo((radiusA + radiusB) / 2, 5);
  });

  it('without any hint, the same two cameras blend along a straight cartesian line instead', () => {
    const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    const a = orbitingStateAt(new Vector3(5, 5, 5));
    const b = orbitingStateAt(new Vector3(0, 0, 5));
    core.registerCamera({ id: 'a', priority: 10, state: a });
    core.tick(0);
    core.registerCamera({ id: 'b', priority: 20, state: b });

    const out = core.tick(0.5);

    const radiusA = a.position.length();
    const radiusB = b.position.length();
    expect(out.position.length()).not.toBeCloseTo((radiusA + radiusB) / 2, 1);
  });
});
