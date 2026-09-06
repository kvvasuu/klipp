import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { LensExtension } from '../../src/extension/LensExtension';

describe('LensExtension', () => {
  it('no-op (out untouched) when fov/near/far are all left undefined', () => {
    const extension = new LensExtension();
    const out = createCameraState();
    out.fov = 50;
    out.near = 0.1;
    out.far = 1000;

    extension.update(out, 0.1);

    expect(out.fov).toBe(50);
    expect(out.near).toBe(0.1);
    expect(out.far).toBe(1000);
  });

  it('overrides only the fields that are defined, leaving the rest untouched', () => {
    const extension = new LensExtension(75);
    const out = createCameraState();
    out.fov = 50;
    out.near = 0.1;
    out.far = 1000;

    extension.update(out, 0.1);

    expect(out.fov).toBe(75);
    expect(out.near).toBe(0.1);
    expect(out.far).toBe(1000);
  });

  it('overrides fov/near/far together', () => {
    const extension = new LensExtension(75, 1, 500);
    const out = createCameraState();

    extension.update(out, 0.1);

    expect(out.fov).toBe(75);
    expect(out.near).toBe(1);
    expect(out.far).toBe(500);
  });

  describe('damping', () => {
    it('damping=0 (default) stays perfectly instant, even across repeated changes', () => {
      const extension = new LensExtension(50);
      const out = createCameraState();

      extension.update(out, 0.1);
      extension.fov = 90;
      extension.update(out, 0.1);

      expect(out.fov).toBe(90); // fully caught up in a single step
    });

    it('the first-ever update still snaps hard, matching the rest of klipp\'s damping convention', () => {
      const extension = new LensExtension(90, undefined, undefined, 1); // fovDamping = 1s
      const out = createCameraState();

      extension.update(out, 0.1);

      expect(out.fov).toBe(90); // no lag on the very first frame
    });

    it('a SUBSEQUENT change eases in over time instead of snapping instantly', () => {
      const extension = new LensExtension(50, undefined, undefined, 1); // fovDamping = 1s
      const out = createCameraState();

      extension.update(out, 0.1); // first-ever call snaps
      extension.fov = 90;
      extension.update(out, 0.1); // one small step toward 90

      expect(out.fov).toBeGreaterThan(50);
      expect(out.fov).toBeLessThan(90);
    });

    it('each field damps independently - near can snap instantly while fov is still easing', () => {
      const extension = new LensExtension(50, 1, undefined, 1); // fovDamping = 1s, nearDamping = 0
      const out = createCameraState();

      extension.update(out, 0.1); // first-ever call snaps both
      extension.fov = 90;
      extension.near = 5;
      extension.update(out, 0.1);

      expect(out.near).toBe(5); // nearDamping = 0, always instant
      expect(out.fov).toBeLessThan(90); // fovDamping = 1s, still catching up
    });

    it('keeps making progress even when something ELSE resets out.fov every frame before it runs', () => {
      const extension = new LensExtension(50, undefined, undefined, 1); // fovDamping = 1s
      const out = createCameraState();
      out.fov = 35; // stand-in for some other writer's own fov value

      extension.update(out, 0.1); // first-ever call snaps to 50 regardless
      const afterFirst = out.fov;

      extension.fov = 90;
      for (let i = 0; i < 5; i++) {
        out.fov = 35; // simulates something else stomping out.fov back every frame
        extension.update(out, 0.1);
      }

      // if damping incorrectly read its "current" value FROM out.fov (stomped back to 35 every frame),
      // every step would restart from the same spot and net progress would be ~0
      expect(out.fov).toBeGreaterThan(afterFirst);
    });
  });

  describe('return value (stillInFlight, frameloop="demand" plateau safety / settle detection)', () => {
    it('damping <= 0 (default): always false - an instant snap is never "in flight"', () => {
      const extension = new LensExtension(50);
      const out = createCameraState();

      expect(extension.update(out, 0.1)).toBe(false);
      extension.fov = 90;
      expect(extension.update(out, 0.1)).toBe(false);
    });

    it('damping > 0: true while fov is still catching up, false once converged', () => {
      const extension = new LensExtension(50, undefined, undefined, 0.3);
      const out = createCameraState();

      extension.update(out, 0.1); // first-ever call snaps exactly
      expect(extension.update(out, 0.1)).toBe(false);

      extension.fov = 90; // real ground to cover now
      expect(extension.update(out, 0.1)).toBe(true);

      for (let i = 0; i < 300; i++) extension.update(out, 0.1); // run it out to convergence
      expect(extension.update(out, 0.1)).toBe(false);
    });

    it('false when fov/near/far are all undefined - nothing is animating', () => {
      const extension = new LensExtension();
      const out = createCameraState();

      expect(extension.update(out, 0.1)).toBe(false);
    });
  });

  describe('justActivated', () => {
    it('snaps fov straight to the correct value even with a warmed-up damper', () => {
      const extension = new LensExtension(50, undefined, undefined, 0.5);
      const out = createCameraState();

      extension.update(out, 0.1, true); // first-ever session: snaps, warms up the damper
      extension.update(out, 0.1, false);

      // a later, unrelated session: fov changed drastically while inactive
      extension.fov = 100;
      extension.update(out, 0.1, true);

      expect(out.fov).toBe(100);
    });

    it('without justActivated, the same scenario eases instead of snapping (the bug this fixes)', () => {
      const extension = new LensExtension(50, undefined, undefined, 0.5);
      const out = createCameraState();

      extension.update(out, 0.1, true);
      extension.update(out, 0.1, false);

      extension.fov = 100;
      extension.update(out, 0.1, false);

      expect(out.fov).toBeLessThan(100);
    });
  });
});
