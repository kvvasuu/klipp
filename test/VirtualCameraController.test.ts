import { describe, expect, it, vi } from 'vitest';
import { createCameraState } from '../src/CameraState';
import { VirtualCameraController } from '../src/VirtualCameraController';

describe('VirtualCameraController', () => {
  it('runs Body then Aim then Noise, in that order, into the same CameraState', () => {
    const controller = new VirtualCameraController('a');
    controller.registerBody((out) => (out.fov = 10));
    controller.registerAim((out) => (out.fov *= 2));
    controller.registerNoise((out) => (out.fov += 1));

    const out = createCameraState();
    controller.update(out, 0.1);

    expect(out.fov).toBe(21); // (10 * 2) + 1 — only correct if strictly sequential
  });

  it('passes the actual dt through to every writer', () => {
    const controller = new VirtualCameraController('a');
    controller.registerBody((out, dt) => (out.position.x = dt * 10));

    const out = createCameraState();
    controller.update(out, 0.5);

    expect(out.position.x).toBeCloseTo(5, 10);
  });

  it('Noise writers stack — every registered one runs, not just the last', () => {
    const controller = new VirtualCameraController('a');
    controller.registerNoise((out) => (out.position.x += 1));
    controller.registerNoise((out) => (out.position.x += 10));

    const out = createCameraState();
    controller.update(out, 0.1);

    expect(out.position.x).toBe(11);
  });

  it('a missing Body/Aim is a no-op, not a crash', () => {
    const controller = new VirtualCameraController('a');
    const out = createCameraState();

    expect(() => controller.update(out, 0.1)).not.toThrow();
  });

  it('the unregister function returned by registerBody/registerAim/registerNoise stops that writer', () => {
    const controller = new VirtualCameraController('a');
    const unregisterBody = controller.registerBody((out) => (out.position.x += 1));
    const unregisterNoise = controller.registerNoise((out) => (out.position.x += 100));

    const out = createCameraState();
    controller.update(out, 0.1);
    expect(out.position.x).toBe(101);

    unregisterBody();
    unregisterNoise();
    controller.update(out, 0.1);
    expect(out.position.x).toBe(101); // unchanged — neither writer runs anymore
  });

  it('unregistering a STALE writer (already replaced by a newer one) does not remove the new one', () => {
    const controller = new VirtualCameraController('a');
    const unregisterFirst = controller.registerBody((out) => (out.position.x = 1));
    controller.registerBody((out) => (out.position.x = 2));

    unregisterFirst(); // stale — the second registration already replaced it

    const out = createCameraState();
    controller.update(out, 0.1);
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
    expect(controller.update(out, 0.1)).toBe(false);
  });

  it('a writer that leaks a non-boolean truthy return (e.g. an expression-bodied assignment arrow like ' +
    '`(out) => (out.position.x = dt)`) is NOT read as "still active" — only a literal `true` counts', () => {
    const controller = new VirtualCameraController('a');
    // deliberately the exact accidental shape this guards against: no braces, so the arrow's value IS
    // the assignment's result (a number), even though its declared type is `void`
    controller.registerBody((out, dt) => (out.position.x = dt));

    const out = createCameraState();
    expect(controller.update(out, 0.1)).toBe(false);
  });

  it('true if the Body, the Aim, or ANY stacked Noise writer reports still being active', () => {
    const bodyActive = new VirtualCameraController('body');
    bodyActive.registerBody(() => true);
    expect(bodyActive.update(createCameraState(), 0.1)).toBe(true);

    const aimActive = new VirtualCameraController('aim');
    aimActive.registerAim(() => true);
    expect(aimActive.update(createCameraState(), 0.1)).toBe(true);

    const noiseActive = new VirtualCameraController('noise');
    noiseActive.registerNoise(() => false);
    noiseActive.registerNoise(() => true); // second one reports active — must not be short-circuited away
    expect(noiseActive.update(createCameraState(), 0.1)).toBe(true);
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

    it('does NOT warn for a single Body/Aim, or for stacked Noise', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const controller = new VirtualCameraController('a');

      controller.registerBody(() => {});
      controller.registerAim(() => {});
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
});
