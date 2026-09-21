import { describe, expect, it } from 'vitest';
import { InputAxis } from '../../src/input/InputAxis';

// damping=0 (default) converges value onto the raw accumulated target near-instantly, but only once
// update() actually runs - a couple of frames guarantees full (epsilon-exact) convergence regardless of
// how large the jump was, without needing per-test tuning.
function settle(axis: InputAxis, frames = 3, dt = 0.016): void {
  for (let i = 0; i < frames; i++) axis.update(dt);
}

describe('InputAxis', () => {
  it('starts at the given value', () => {
    const axis = new InputAxis(3);
    expect(axis.value).toBe(3);
  });

  it('applyDelta adds to value', () => {
    const axis = new InputAxis(0);
    axis.applyDelta(5);
    axis.applyDelta(-2);
    settle(axis);
    expect(axis.value).toBe(3);
  });

  it('applyDelta(0) is a no-op, does not reset the idle timer', () => {
    const axis = new InputAxis(10, 0, null, false, { enabled: true, wait: 1, time: 1 });
    axis.update(0.9); // 0.9s idle - under wait, no recentering yet
    axis.applyDelta(0); // should NOT reset idle back to 0
    axis.update(0.2); // 1.1s idle total - past wait=1, recentering should engage this tick
    expect(axis.value).toBeLessThan(10); // moved toward center - proves applyDelta(0) didn't reset idle
  });

  describe('range', () => {
    it('clamps to range when not wrapping', () => {
      const axis = new InputAxis(0, 0, [-10, 10]);
      axis.applyDelta(50);
      settle(axis);
      expect(axis.value).toBe(10);
      axis.applyDelta(-100);
      settle(axis);
      expect(axis.value).toBe(-10);
    });

    it('wraps around range instead of clamping when wrap is true', () => {
      const axis = new InputAxis(170, 0, [-180, 180], true);
      axis.applyDelta(20); // 190 -> wraps to -170
      settle(axis);
      expect(axis.value).toBeCloseTo(-170, 5);
    });

    it('without range, value is unbounded', () => {
      const axis = new InputAxis(0, 0, null);
      axis.applyDelta(1e6);
      settle(axis);
      expect(axis.value).toBe(1e6);
    });
  });

  describe('damping', () => {
    it('0 (default) is an exact, instant chase - value fully tracks applyDelta within a frame or two', () => {
      const axis = new InputAxis(0);
      axis.applyDelta(30);
      settle(axis);
      expect(axis.value).toBe(30);
    });

    it('> 0 eases value toward the raw target gradually instead of snapping in one frame', () => {
      const axis = new InputAxis(0);
      axis.damping = 0.5;
      axis.applyDelta(100);
      axis.update(0.016);
      expect(axis.value).toBeGreaterThan(0);
      expect(axis.value).toBeLessThan(100);
    });

    it('a fast drag released mid-motion keeps easing toward wherever it last pointed - momentum, not an instant stop', () => {
      const axis = new InputAxis(0);
      axis.damping = 0.3;
      axis.applyDelta(50);
      axis.update(0.016); // value is still lagging behind the raw target here
      const midway = axis.value;
      expect(midway).toBeGreaterThan(0);
      expect(midway).toBeLessThan(50);

      // no further applyDelta - "released" - but value keeps closing the gap it built up while dragging
      axis.update(0.016);
      expect(axis.value).toBeGreaterThan(midway);
      expect(axis.value).toBeLessThan(50);
    });

    it('converges to the raw target over repeated ticks', () => {
      const axis = new InputAxis(0);
      axis.damping = 0.2;
      axis.applyDelta(20);
      settle(axis, 500);
      expect(axis.value).toBe(20); // enough ticks to cross the damper's own epsilon and snap exactly
    });

    it('takes the shortest wrapped path when chasing, not the long way around', () => {
      const axis = new InputAxis(170, 0, [-180, 180], true);
      axis.damping = 0.5;
      axis.applyDelta(20); // raw target wraps to -170 - shortest path from 170 is DOWN through +/-180
      axis.update(0.016);
      expect(axis.value).toBeGreaterThan(170); // moved toward the seam, not back down toward 0
    });

    it('maxSpeed clamps how fast value can close the gap', () => {
      const unclamped = new InputAxis(0);
      unclamped.damping = 1;
      unclamped.applyDelta(100);
      unclamped.update(0.1);

      const clamped = new InputAxis(0);
      clamped.damping = 1;
      clamped.maxSpeed = 10; // units/sec - much slower approach than the unclamped spring above
      clamped.applyDelta(100);
      clamped.update(0.1);

      expect(clamped.value).toBeGreaterThan(0);
      expect(clamped.value).toBeLessThan(unclamped.value);
    });

    it('maxSpeed still converges eventually, just slower', () => {
      const axis = new InputAxis(0);
      axis.damping = 1;
      axis.maxSpeed = 10;
      axis.applyDelta(100);
      settle(axis, 2000);
      expect(axis.value).toBe(100);
    });

    it('does not affect applyDelta itself - the raw accumulation and clamping/wrapping stay unchanged', () => {
      const axis = new InputAxis(0, 0, [-10, 10]);
      axis.damping = 1;
      axis.applyDelta(50);
      settle(axis, 2000); // even fully settled, damping never lets the raw target exceed range
      expect(axis.value).toBe(10);
    });
  });

  describe('recentering', () => {
    it('disabled by default - value stays put once input stops', () => {
      const axis = new InputAxis(5);
      axis.applyDelta(3); // value = 8
      for (let i = 0; i < 100; i++) axis.update(0.1);
      expect(axis.value).toBe(8);
    });

    it('does nothing before `wait` seconds of inactivity have passed', () => {
      const axis = new InputAxis(8, 0, null, false, { enabled: true, wait: 1, time: 0.5 });
      axis.update(0.5); // only 0.5s idle, wait is 1
      expect(axis.value).toBe(8);
    });

    it('eases value back toward center after `wait` seconds of inactivity', () => {
      const axis = new InputAxis(10, 0, null, false, { enabled: true, wait: 0.2, time: 0.5 });
      for (let i = 0; i < 50; i++) axis.update(0.05); // 2.5s total, well past wait

      expect(axis.value).toBeCloseTo(0, 1);
    });

    it('applyDelta activity resets the idle timer, interrupting an in-progress recenter', () => {
      const axis = new InputAxis(10, 0, null, false, { enabled: true, wait: 0.1, time: 0.5 });
      for (let i = 0; i < 10; i++) axis.update(0.05); // idle past wait, recentering engages, value starts moving
      const midway = axis.value;
      expect(midway).toBeLessThan(10); // confirms recentering was actually happening

      axis.applyDelta(1); // fresh input - idle timer resets
      axis.update(0.05); // well under `wait` again - no further recentering this tick
      expect(axis.value).toBeCloseTo(midway + 1, 5);
    });

    it('takes the shortest wrapped path back to center, not the long way around', () => {
      // center=0, wrap range [-180,180], starting at 170 - shortest path to 0 is DOWN through positive
      // numbers (distance 170), not up through the +/-180 seam (distance 190)
      const axis = new InputAxis(170, 0, [-180, 180], true, { enabled: true, wait: 0, time: 1 });
      axis.update(0.016);
      expect(axis.value).toBeLessThan(170);
      expect(axis.value).toBeGreaterThan(0); // moved toward 0 directly, not spiked toward +/-180 first
    });

    it('first-ever recenter eases gradually, does not snap straight to center', () => {
      const axis = new InputAxis(10, 0, null, false, { enabled: true, wait: 0, time: 1 });
      axis.update(0.016); // first update with recentering already due
      expect(axis.value).toBeGreaterThan(0);
      expect(axis.value).toBeLessThan(10); // eased, not teleported to 0 nor left untouched
    });
  });

  it('update is a bound instance method - safe to pass by reference', () => {
    const axis = new InputAxis(0);
    const { update } = axis;
    expect(() => update(0.016)).not.toThrow();
  });

  it('applyDelta is a bound instance method - safe to pass by reference', () => {
    const axis = new InputAxis(0);
    const { applyDelta } = axis;
    expect(() => applyDelta(1)).not.toThrow();
    settle(axis);
    expect(axis.value).toBe(1);
  });
});
