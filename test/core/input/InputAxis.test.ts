import { describe, expect, it } from 'vitest';
import { InputAxis } from '../../../src/core/input/InputAxis';

/** A few updates, enough for an undamped axis to land exactly on its target. */
function settle(axis: InputAxis, frames = 3, dt = 0.016): void {
  for (let i = 0; i < frames; i++) axis.update(dt);
}

const recentering = (wait: number, time: number) => ({ enabled: true, wait, time });

describe('InputAxis', () => {
  it('adds deltas to its value, unbounded without a range', () => {
    const axis = new InputAxis({ value: 3 });
    axis.applyDelta(1e6);
    axis.applyDelta(-2);
    settle(axis);
    expect(axis.value).toBe(1e6 + 1);
  });

  it('clamps to its range, even while damping', () => {
    const axis = new InputAxis({ value: 0, center: 0, range: [-10, 10] });
    axis.damping = 1;
    axis.applyDelta(50);
    settle(axis, 2000);
    expect(axis.value).toBe(10);

    axis.applyDelta(-100);
    settle(axis, 2000);
    expect(axis.value).toBe(-10);
  });

  describe('damping', () => {
    it('eases toward the target, keeps going after input stops, and converges', () => {
      const axis = new InputAxis({ value: 0 });
      axis.damping = 0.3;
      axis.applyDelta(50);

      axis.update(0.016);
      const partway = axis.value;
      expect(partway).toBeGreaterThan(0);
      expect(partway).toBeLessThan(50);

      axis.update(0.016);
      expect(axis.value).toBeGreaterThan(partway);

      settle(axis, 500);
      expect(axis.value).toBe(50);
    });

    it('maxSpeed caps the approach and still converges', () => {
      const run = (maxSpeed: number) => {
        const axis = new InputAxis({ value: 0 });
        axis.damping = 1;
        axis.maxSpeed = maxSpeed;
        axis.applyDelta(100);
        axis.update(0.1);
        return axis;
      };

      const capped = run(10);
      expect(capped.value).toBeGreaterThan(0);
      expect(capped.value).toBeLessThan(run(Infinity).value);
      settle(capped, 2000);
      expect(capped.value).toBe(100);
    });

    it('reset() makes the next update snap to the target', () => {
      const axis = new InputAxis({ value: 0 });
      axis.damping = 0.5;
      axis.applyDelta(100);
      axis.update(0.016);
      expect(axis.value).toBeLessThan(100);

      axis.reset();
      axis.update(0.016);

      expect(axis.value).toBe(100);
    });
  });

  describe('wrap', () => {
    it('lets a drag run past the seam, and normalize() folds it back to the same angle', () => {
      const axis = new InputAxis({ value: 170, center: 0, range: [-180, 180], wrap: true });
      axis.applyDelta(20);
      settle(axis);
      expect(axis.value).toBeCloseTo(190, 5);

      axis.normalize();
      expect(axis.value).toBeCloseTo(-170, 5);
    });

    it('normalize() leaves a non-wrapping or unranged axis alone', () => {
      const clamped = new InputAxis({ value: 5, center: 0, range: [-10, 10] });
      clamped.normalize();
      expect(clamped.value).toBe(5);

      const unranged = new InputAxis({ value: 400, center: 0, range: null, wrap: true });
      unranged.normalize();
      expect(unranged.value).toBe(400);
    });

    it('autoNormalize folds back once settled, but never mid-drag', () => {
      const settled = new InputAxis({ value: 170, center: 0, range: [-180, 180], wrap: true });
      settled.autoNormalize = true;
      settled.applyDelta(20);
      settle(settled);
      expect(settled.value).toBeCloseTo(-170, 5);

      for (const autoNormalize of [false, true]) {
        const dragging = new InputAxis({ value: 0, center: 0, range: [-180, 180], wrap: true });
        dragging.autoNormalize = autoNormalize;
        dragging.damping = 0.5;
        dragging.applyDelta(-270);
        dragging.update(0.016);
        const first = dragging.value;
        for (let i = 0; i < 10; i++) dragging.update(0.016);
        expect(dragging.value).toBeLessThan(first); // still heading for -270, not the +90 shortcut
      }
    });
  });

  describe('recentering', () => {
    it('is off by default', () => {
      const axis = new InputAxis({ value: 5 });
      axis.applyDelta(3);
      for (let i = 0; i < 100; i++) axis.update(0.1);
      expect(axis.value).toBe(8);
    });

    it('eases back to center after `wait` seconds without input, gradually from the first frame', () => {
      const axis = new InputAxis({
        value: 10,
        center: 0,
        range: null,
        wrap: false,
        recentering: recentering(0.2, 0.5),
      });
      axis.update(0.1);
      expect(axis.value).toBe(10);

      axis.update(0.15);
      expect(axis.value).toBeGreaterThan(0);
      expect(axis.value).toBeLessThan(10);

      for (let i = 0; i < 50; i++) axis.update(0.05);
      expect(axis.value).toBeCloseTo(0, 1);
    });

    it('any real delta restarts the wait, but a zero delta does not', () => {
      const axis = new InputAxis({ value: 10, center: 0, range: null, wrap: false, recentering: recentering(1, 1) });
      axis.update(0.9);
      axis.applyDelta(0);
      axis.update(0.2);
      expect(axis.value).toBeLessThan(10);

      const moving = axis.value;
      axis.applyDelta(1);
      axis.update(0.05);
      expect(axis.value).toBeCloseTo(moving + 1, 5);
    });

    it('with no wait, still follows a delta from the same frame', () => {
      const axis = new InputAxis({ value: 0, center: 0, range: null, wrap: false, recentering: recentering(0, 1) });
      axis.applyDelta(5);
      axis.update(0.016);
      expect(axis.value).toBeGreaterThan(0);
    });

    it('takes the short way back across the wrap seam', () => {
      // center -170 is 20 degrees away through the seam, 340 the other way
      const axis = new InputAxis({
        value: 170,
        center: -170,
        range: [-180, 180],
        wrap: true,
        recentering: recentering(0, 1),
      });
      axis.update(0.016);
      expect(axis.value).toBeGreaterThan(170);
    });

    it('waits while held, counting the wait only from release', () => {
      const axis = new InputAxis({
        value: 10,
        center: 0,
        range: null,
        wrap: false,
        recentering: recentering(0.2, 0.5),
      });
      axis.held = true;
      for (let i = 0; i < 50; i++) axis.update(0.1);
      expect(axis.value).toBe(10);

      axis.held = false;
      axis.update(0.1);
      expect(axis.value).toBe(10);

      for (let i = 0; i < 50; i++) axis.update(0.1);
      expect(axis.value).toBeCloseTo(0, 1);
    });
  });
});
