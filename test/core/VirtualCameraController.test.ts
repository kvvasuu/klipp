import { describe, expect, it, vi } from 'vitest';
import { createCameraState } from '../../src/core/CameraState';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { KlippCore } from '../../src/core/KlippCore';
import { VirtualCameraController } from '../../src/core/VirtualCameraController';

describe('VirtualCameraController', () => {
  it('runs Body, Aim, Extension and Noise in that order, with dt, into the same state', () => {
    const controller = new VirtualCameraController('a');
    const out = createCameraState();
    controller.update(out, 0.1, false); // nothing registered yet

    controller.registerBody((state, dt) => {
      state.fov = dt * 20;
    });
    controller.registerAim((state) => {
      state.fov *= 2;
    });
    controller.registerExtension((state) => {
      state.fov += 100;
    });
    controller.registerNoise((state) => {
      state.fov += 1;
    });
    controller.update(out, 0.5, false);

    expect(out.fov).toBe(121); // ((10 * 2) + 100) + 1
  });

  it('stacks Extensions and Noise, and each unregister stops its writer', () => {
    const controller = new VirtualCameraController('a');
    const out = createCameraState();
    const stops = [
      controller.registerBody((state) => {
        state.position[0] += 1;
      }),
      controller.registerExtension((state) => {
        state.position[0] += 10;
      }),
      controller.registerExtension((state) => {
        state.position[0] += 100;
      }),
      controller.registerNoise((state) => {
        state.position[0] += 1000;
      }),
      controller.registerNoise((state) => {
        state.position[0] += 10000;
      }),
    ];

    controller.update(out, 0.1, false);
    expect(out.position[0]).toBe(11111);

    for (const stop of stops) stop();
    controller.update(out, 0.1, false);
    expect(out.position[0]).toBe(11111);
  });

  it('unregistering a STALE writer (already replaced by a newer one) does not remove the new one', () => {
    const controller = new VirtualCameraController('a');
    const unregisterFirst = controller.registerBody((out) => {
      out.position[0] = 1;
    });
    controller.registerBody((out) => {
      out.position[0] = 2;
    });

    unregisterFirst(); // stale — the second registration already replaced it

    const out = createCameraState();
    controller.update(out, 0.1, false);
    expect(out.position[0]).toBe(2);
  });

  it(
    'a writer that leaks a non-boolean truthy return (e.g. an expression-bodied assignment arrow like ' +
      '`(out) => (out.position.x = dt)`) is NOT read as "still active" — only a literal `true` counts',
    () => {
      const controller = new VirtualCameraController('a');
      // deliberately the exact accidental shape this guards against: no braces, so the arrow's value IS
      // the assignment's result (a number), even though its declared type is `void`
      controller.registerBody((out, dt) => {
        out.position[0] = dt;
      });

      const out = createCameraState();
      expect(controller.update(out, 0.1, false)).toBe(false);
    },
  );

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
    it('warns when a second Body or Aim replaces the first', () => {
      for (const [register, message] of [
        ['registerBody', /already has a Body registered/],
        ['registerAim', /already has an Aim registered/],
      ] as const) {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const controller = new VirtualCameraController('cam');
        controller[register](() => {});
        controller[register](() => {});

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(message));
        warn.mockRestore();
      }
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
