import { describe, expect, it, vi } from 'vitest';
import { createCameraState } from '../src/CameraState';
import { BlendCurves } from '../src/blend/BlendCurves';
import { KlippCore } from '../src/KlippCore';
import { VirtualCameraController } from '../src/VirtualCameraController';

describe('VirtualCameraController', () => {
  it('runs Body then Aim then Extension then Noise, in that order, into the same CameraState', () => {
    const controller = new VirtualCameraController('a');
    controller.registerBody((out) => (out.fov = 10));
    controller.registerAim((out) => (out.fov *= 2));
    controller.registerExtension((out) => (out.fov += 100));
    controller.registerNoise((out) => (out.fov += 1));

    const out = createCameraState();
    controller.update(out, 0.1, false);

    expect(out.fov).toBe(121); // ((10 * 2) + 100) + 1 — only correct if strictly sequential
  });

  it('passes the actual dt through to every writer', () => {
    const controller = new VirtualCameraController('a');
    controller.registerBody((out, dt) => (out.position.x = dt * 10));

    const out = createCameraState();
    controller.update(out, 0.5, false);

    expect(out.position.x).toBeCloseTo(5, 10);
  });

  it('Noise writers stack — every registered one runs, not just the last', () => {
    const controller = new VirtualCameraController('a');
    controller.registerNoise((out) => (out.position.x += 1));
    controller.registerNoise((out) => (out.position.x += 10));

    const out = createCameraState();
    controller.update(out, 0.1, false);

    expect(out.position.x).toBe(11);
  });

  it('Extension writers stack — every registered one runs, not just the last', () => {
    const controller = new VirtualCameraController('a');
    controller.registerExtension((out) => (out.position.x += 1));
    controller.registerExtension((out) => (out.position.x += 10));

    const out = createCameraState();
    controller.update(out, 0.1, false);

    expect(out.position.x).toBe(11);
  });

  it('the unregister function returned by registerExtension stops that writer', () => {
    const controller = new VirtualCameraController('a');
    const unregister = controller.registerExtension((out) => (out.position.x += 100));

    const out = createCameraState();
    controller.update(out, 0.1, false);
    expect(out.position.x).toBe(100);

    unregister();
    controller.update(out, 0.1, false);
    expect(out.position.x).toBe(100); // unchanged — the extension no longer runs
  });

  it('a missing Body/Aim is a no-op, not a crash', () => {
    const controller = new VirtualCameraController('a');
    const out = createCameraState();

    expect(() => controller.update(out, 0.1, false)).not.toThrow();
  });

  it('the unregister function returned by registerBody/registerAim/registerNoise stops that writer', () => {
    const controller = new VirtualCameraController('a');
    const unregisterBody = controller.registerBody((out) => (out.position.x += 1));
    const unregisterNoise = controller.registerNoise((out) => (out.position.x += 100));

    const out = createCameraState();
    controller.update(out, 0.1, false);
    expect(out.position.x).toBe(101);

    unregisterBody();
    unregisterNoise();
    controller.update(out, 0.1, false);
    expect(out.position.x).toBe(101); // unchanged — neither writer runs anymore
  });

  it('unregistering a STALE writer (already replaced by a newer one) does not remove the new one', () => {
    const controller = new VirtualCameraController('a');
    const unregisterFirst = controller.registerBody((out) => (out.position.x = 1));
    controller.registerBody((out) => (out.position.x = 2));

    unregisterFirst(); // stale — the second registration already replaced it

    const out = createCameraState();
    controller.update(out, 0.1, false);
    expect(out.position.x).toBe(2);
  });

  it('false when no writer reports being active — most Body/Aim/Noise return void, treated as not-active', () => {
    const controller = new VirtualCameraController('a');
    controller.registerBody((out) => {
      out.position.x = 1;
    });
    controller.registerAim(() => {});
    controller.registerNoise(() => {});

    const out = createCameraState();
    expect(controller.update(out, 0.1, false)).toBe(false);
  });

  it('a writer that leaks a non-boolean truthy return (e.g. an expression-bodied assignment arrow like ' +
    '`(out) => (out.position.x = dt)`) is NOT read as "still active" — only a literal `true` counts', () => {
    const controller = new VirtualCameraController('a');
    // deliberately the exact accidental shape this guards against: no braces, so the arrow's value IS
    // the assignment's result (a number), even though its declared type is `void`
    controller.registerBody((out, dt) => (out.position.x = dt));

    const out = createCameraState();
    expect(controller.update(out, 0.1, false)).toBe(false);
  });

  it('true if the Body, the Aim, or ANY stacked Extension/Noise writer reports still being active', () => {
    const bodyActive = new VirtualCameraController('body');
    bodyActive.registerBody(() => true);
    expect(bodyActive.update(createCameraState(), 0.1, false)).toBe(true);

    const aimActive = new VirtualCameraController('aim');
    aimActive.registerAim(() => true);
    expect(aimActive.update(createCameraState(), 0.1, false)).toBe(true);

    const extensionActive = new VirtualCameraController('extension');
    extensionActive.registerExtension(() => false);
    extensionActive.registerExtension(() => true); // second one active — must not be short-circuited away
    expect(extensionActive.update(createCameraState(), 0.1, false)).toBe(true);

    const noiseActive = new VirtualCameraController('noise');
    noiseActive.registerNoise(() => false);
    noiseActive.registerNoise(() => true); // second one reports active — must not be short-circuited away
    expect(noiseActive.update(createCameraState(), 0.1, false)).toBe(true);
  });

  describe('justActivated', () => {
    it('is forwarded unchanged to Body, Aim, every Extension, and every Noise writer', () => {
      const controller = new VirtualCameraController('a');
      const seen: boolean[] = [];
      controller.registerBody((_out, _dt, justActivated) => void seen.push(justActivated));
      controller.registerAim((_out, _dt, justActivated) => void seen.push(justActivated));
      controller.registerExtension((_out, _dt, justActivated) => void seen.push(justActivated));
      controller.registerNoise((_out, _dt, justActivated) => void seen.push(justActivated));

      controller.update(createCameraState(), 0.1, true);
      controller.update(createCameraState(), 0.1, false);

      expect(seen).toEqual([true, true, true, true, false, false, false, false]);
    });
  });

  describe('double-registration dev warning', () => {
    it('warns when a second Body registers on top of an existing one', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraController('a');

      controller.registerBody(() => {});
      controller.registerBody(() => {});

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/already has a Body registered/));
      warn.mockRestore();
    });

    it('warns when a second Aim registers on top of an existing one', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraController('a');

      controller.registerAim(() => {});
      controller.registerAim(() => {});

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/already has an Aim registered/));
      warn.mockRestore();
    });

    it('does NOT warn for a single Body/Aim, or for stacked Extension/Noise', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraController('a');

      controller.registerBody(() => {});
      controller.registerAim(() => {});
      controller.registerExtension(() => {});
      controller.registerExtension(() => {});
      controller.registerNoise(() => {});
      controller.registerNoise(() => {});
      controller.registerNoise(() => {});

      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('the warning message includes the current name, even if it changed after construction', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraController('original');
      controller.name = 'renamed';

      controller.registerBody(() => {});
      controller.registerBody(() => {});

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('name="renamed"'));
      warn.mockRestore();
    });
  });

  describe('trackEvents', () => {
    it('re-dispatches activated only when this camera is the incoming one', () => {
      const core = new KlippCore();
      const a = new VirtualCameraController('a');
      const b = new VirtualCameraController('b');
      a.trackEvents(core);
      b.trackEvents(core);
      const onA = vi.fn();
      const onB = vi.fn();
      a.addEventListener('activated', onA);
      b.addEventListener('activated', onB);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      expect(onA).toHaveBeenCalledTimes(1);
      expect(onA.mock.calls[0][0]).toMatchObject({ incoming: 'a', outgoing: null });
      expect(onB).not.toHaveBeenCalled();

      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
      expect(onB).toHaveBeenCalledTimes(1);
      expect(onB.mock.calls[0][0]).toMatchObject({ incoming: 'b', outgoing: 'a' });
      expect(onA).toHaveBeenCalledTimes(1); // still 1 — 'a' losing arbitration isn't ITS activation
    });

    it('re-dispatches deactivated only for the camera whose blend out just finished', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 0 } });
      const a = new VirtualCameraController('a');
      a.trackEvents(core);
      const onDeactivated = vi.fn();
      a.addEventListener('deactivated', onDeactivated);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      core.tick(0); // 'a' snaps live
      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
      core.tick(0); // zero-time default blend — finishes immediately

      expect(onDeactivated).toHaveBeenCalledTimes(1);
      expect(onDeactivated.mock.calls[0][0]).toMatchObject({ outgoing: 'a' });
    });

    it('the returned unsubscribe function stops further re-dispatching', () => {
      const core = new KlippCore();
      const a = new VirtualCameraController('a');
      const untrack = a.trackEvents(core);
      const onActivated = vi.fn();
      a.addEventListener('activated', onActivated);

      untrack();
      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      expect(onActivated).not.toHaveBeenCalled();
    });

    it('filters by the CURRENT name, even if it changed after trackEvents was called', () => {
      const core = new KlippCore();
      const controller = new VirtualCameraController('original');
      controller.trackEvents(core);
      const onActivated = vi.fn();
      controller.addEventListener('activated', onActivated);

      controller.name = 'renamed';
      core.registerCamera({ id: 'renamed', priority: 10, state: createCameraState() });
      expect(onActivated).toHaveBeenCalledTimes(1);
    });

    it('re-dispatches blendCreated/cut to BOTH sides of the transition', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const a = new VirtualCameraController('a');
      const b = new VirtualCameraController('b');
      const c = new VirtualCameraController('c');
      a.trackEvents(core);
      b.trackEvents(core);
      c.trackEvents(core);
      const onA = vi.fn();
      const onB = vi.fn();
      const onC = vi.fn();
      a.addEventListener('blendCreated', onA);
      b.addEventListener('blendCreated', onB);
      c.addEventListener('blendCreated', onC);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      core.tick(0); // 'a' snaps live - first-ever, not a real blend
      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
      core.tick(0); // blend a -> b created

      expect(onA).toHaveBeenCalledTimes(1);
      expect(onB).toHaveBeenCalledTimes(1);
      expect(onC).not.toHaveBeenCalled();
    });

    it('re-dispatches blendFinished only to the camera that just settled live', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const a = new VirtualCameraController('a');
      const b = new VirtualCameraController('b');
      a.trackEvents(core);
      b.trackEvents(core);
      const onA = vi.fn();
      const onB = vi.fn();
      a.addEventListener('blendFinished', onA);
      b.addEventListener('blendFinished', onB);

      core.registerCamera({ id: 'a', priority: 10, state: createCameraState() });
      core.tick(0);
      core.registerCamera({ id: 'b', priority: 20, state: createCameraState() });
      core.tick(1.1); // blend a -> b finishes

      expect(onA).not.toHaveBeenCalled();
      expect(onB).toHaveBeenCalledTimes(1);
    });
  });
});
