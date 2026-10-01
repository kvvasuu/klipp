import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { LensExtension } from '../../../src/core/extension/LensExtension';

describe('LensExtension', () => {
  it('overrides only the fields that are set', () => {
    const out = createCameraState();
    new LensExtension().update(out, 0.1, false);
    expect([out.fov, out.near, out.far]).toEqual([50, 0.1, 1000]);

    new LensExtension(75).update(out, 0.1, false);
    expect([out.fov, out.near, out.far]).toEqual([75, 0.1, 1000]);

    new LensExtension(60, 1, 500).update(out, 0.1, false);
    expect([out.fov, out.near, out.far]).toEqual([60, 1, 500]);
  });

  describe('damping', () => {
    it('is instant by default, and with damping snaps on the first update then eases', () => {
      const instant = new LensExtension(50);
      const instantOut = createCameraState();
      instant.update(instantOut, 0.1, false);
      instant.fov = 90;
      instant.update(instantOut, 0.1, false);
      expect(instantOut.fov).toBe(90);

      const damped = new LensExtension(50, undefined, undefined, 1);
      const out = createCameraState();
      damped.update(out, 0.1, false);
      expect(out.fov).toBe(50);

      damped.fov = 90;
      damped.update(out, 0.1, false);
      expect(out.fov).toBeGreaterThan(50);
      expect(out.fov).toBeLessThan(90);
    });

    it('damps each field on its own', () => {
      const extension = new LensExtension(50, 1, undefined, 1);
      const out = createCameraState();
      extension.update(out, 0.1, false);

      extension.fov = 90;
      extension.near = 5;
      extension.update(out, 0.1, false);

      expect(out.near).toBe(5);
      expect(out.fov).toBeLessThan(90);
    });

    it('keeps its own progress when something else resets out.fov every frame', () => {
      const extension = new LensExtension(50, undefined, undefined, 1);
      const out = createCameraState();
      extension.update(out, 0.1, false);

      extension.fov = 90;
      for (let i = 0; i < 5; i++) {
        out.fov = 35;
        extension.update(out, 0.1, false);
      }

      expect(out.fov).toBeGreaterThan(50);
    });

    it('each max speed caps its own field', () => {
      const step = (field: 'fov' | 'near' | 'far', maxSpeed: number) => {
        const speeds = [Infinity, Infinity, Infinity];
        speeds[['fov', 'near', 'far'].indexOf(field)] = maxSpeed;
        const extension = new LensExtension(50, 1, 10, 1, 1, 1, ...speeds);
        const out = createCameraState();
        extension.update(out, 0.1, false);
        extension[field] = 1000;
        extension.update(out, 0.1, false);
        return out[field];
      };

      for (const field of ['fov', 'near', 'far'] as const) {
        expect(step(field, 5)).toBeLessThan(step(field, Infinity));
      }
    });

    it('reports whether it is still moving', () => {
      const extension = new LensExtension(50, undefined, undefined, 0.3);
      const out = createCameraState();
      extension.update(out, 0.1, false);
      expect(extension.update(out, 0.1, false)).toBe(false);

      extension.fov = 90;
      expect(extension.update(out, 0.1, false)).toBe(true);
      for (let i = 0; i < 300; i++) extension.update(out, 0.1, false);
      expect(extension.update(out, 0.1, false)).toBe(false);

      expect(new LensExtension().update(out, 0.1, false)).toBe(false);
    });

    it('justActivated snaps to a changed value, where a plain update would ease', () => {
      const run = (justActivated: boolean) => {
        const extension = new LensExtension(50, undefined, undefined, 0.5);
        const out = createCameraState();
        extension.update(out, 0.1, true);
        extension.update(out, 0.1, false);
        extension.fov = 100;
        extension.update(out, 0.1, justActivated);
        return out.fov;
      };

      expect(run(true)).toBe(100);
      expect(run(false)).toBeLessThan(100);
    });
  });
});
