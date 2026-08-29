import { describe, expect, it } from 'vitest';
import { Damper } from '../../src/damping/Damper';

describe('Damper', () => {
  it('the very first update() call ever snaps directly to target, regardless of damping', () => {
    const damper = new Damper();
    const out = damper.update(0, 10, 0.5, 0.016);

    expect(out).toBe(10);
    expect(damper.velocity).toBe(0);
  });

  it('current already at target (on a warmed-up damper): returns target unchanged, velocity stays zero', () => {
    const damper = new Damper();
    damper.update(5, 5, 1, 0.1); // consume the first-call snap
    const out = damper.update(5, 5, 1, 0.1);

    expect(out).toBe(5);
    expect(damper.velocity).toBe(0);
  });

  it('converges to the target over repeated ticks', () => {
    const damper = new Damper();
    let current = damper.update(0, 10, 0.5, 0.016); // consume the first-call snap
    current = 0; // move back away from target to genuinely exercise gradual convergence below

    for (let i = 0; i < 200; i++) {
      current = damper.update(current, 10, 0.5, 0.016);
    }

    expect(current).toBeCloseTo(10, 2);
  });

  it('snaps exactly to target (and zeroes velocity) once within epsilon, instead of approaching forever', () => {
    const damper = new Damper();
    damper.update(0, 10, 1, 0.016); // consume the first-call snap
    damper.velocity = 3.7; // simulate mid-motion, non-zero velocity

    const out = damper.update(10.00005, 10, 1, 0.016, Infinity, 1e-4);

    expect(out).toBe(10);
    expect(damper.velocity).toBe(0);
  });

  it('never overshoots the target when starting at rest (critically damped, not oscillating)', () => {
    const damper = new Damper();
    const target = 10;
    damper.update(0, target, 0.3, 0.016); // consume the first-call snap, without building real velocity
    let current = 0; // move back away from target to genuinely exercise gradual convergence below

    for (let i = 0; i < 500; i++) {
      current = damper.update(current, target, 0.3, 0.016);
      expect(current).toBeLessThanOrEqual(target);
    }
  });

  it('maxSpeed clamps how far a single step can move, for the same gap and dt', () => {
    const unclampedDamper = new Damper();
    unclampedDamper.update(0, 100, 1, 0.05); // consume the first-call snap
    const unclamped = unclampedDamper.update(0, 100, 1, 0.05);

    const clampedDamper = new Damper();
    clampedDamper.update(0, 100, 1, 0.05, 2); // consume the first-call snap
    const clamped = clampedDamper.update(0, 100, 1, 0.05, 2); // maxSpeed = 2 units/sec

    expect(clamped).toBeLessThan(unclamped);
  });

  it('velocity persists across calls — a second call from the same spot differs from a fresh damper (motion has momentum)', () => {
    const warmedUp = new Damper();
    warmedUp.update(0, 10, 0.5, 0.05); // consume the first-call snap
    warmedUp.update(0, 10, 0.5, 0.05); // first real step: builds up non-zero velocity
    const secondStep = warmedUp.update(0, 10, 0.5, 0.05); // same current/target/dt as a fresh call

    const fresh = new Damper();
    fresh.update(0, 10, 0.5, 0.05); // consume the first-call snap
    const freshStep = fresh.update(0, 10, 0.5, 0.05);

    // identical current/target/dt, but the warmed-up damper carries velocity from its extra step, so
    // its output differs from a damper starting completely at rest
    expect(secondStep).not.toBeCloseTo(freshStep, 5);
  });

  describe('reset', () => {
    it('re-arms the first-call snap — the next update() returns target exactly, ignoring current', () => {
      const damper = new Damper();
      damper.update(0, 10, 0.5, 0.016); // consume the first-call snap
      damper.update(0, 10, 0.5, 0.016); // build up real velocity/history
      damper.reset();

      const out = damper.update(999, -50, 0.5, 0.016); // wildly different current/target than before

      expect(out).toBe(-50);
      expect(damper.velocity).toBe(0);
    });

    it('clears velocity and distance history, not just the snap flag', () => {
      const damper = new Damper();
      damper.update(0, 10, 0.5, 0.016);
      damper.update(0, 10, 0.5, 0.016);
      expect(damper.velocity).not.toBe(0);

      damper.reset();

      expect(damper.velocity).toBe(0);
    });
  });

  describe('asymmetric into/from damping', () => {
    it('a plain number behaves exactly as before (no into/from split)', () => {
      const withNumber = new Damper();
      const withEqualObject = new Damper();
      withNumber.update(0, 10, 0.4, 0.016); // consume the first-call snap
      withEqualObject.update(0, 10, { into: 0.4, from: 0.4 }, 0.016);
      let a = 0;
      let b = 0;

      for (let i = 0; i < 50; i++) {
        a = withNumber.update(a, 10, 0.4, 0.016);
        b = withEqualObject.update(b, 10, { into: 0.4, from: 0.4 }, 0.016);
      }

      expect(a).toBeCloseTo(b, 10);
    });

    it('uses "into" while the gap is widening (target running away) and "from" while it narrows', () => {
      const fastIntoSlowFrom = new Damper();
      const slowIntoFastFrom = new Damper();

      // target moves away from a stationary current for a few ticks — this is "widening"
      let a = 0;
      let b = 0;
      for (let i = 0; i < 5; i++) {
        a = fastIntoSlowFrom.update(a, 10 + i, { into: 0.05, from: 2 }, 0.016);
        b = slowIntoFastFrom.update(b, 10 + i, { into: 2, from: 0.05 }, 0.016);
      }

      // fast "into" catches up to the receding target much better than a slow one
      expect(Math.abs(10 + 4 - a)).toBeLessThan(Math.abs(10 + 4 - b));
    });

    it('switches to "from" once the gap starts narrowing again, even mid-motion', () => {
      const damper = new Damper();
      damper.update(0, 10, { into: 2, from: 0.05 }, 0.016); // consume the first-call snap
      let current = 0;

      // widen the gap first so "into" has been exercised
      for (let i = 0; i < 5; i++) {
        current = damper.update(current, 10, { into: 2, from: 0.05 }, 0.016);
      }
      const afterWidening = current;

      // now the target comes back toward current — gap narrows, "from" (fast) should apply
      current = damper.update(current, afterWidening + 0.01, { into: 2, from: 0.02 }, 0.016);

      // a fast "from" closes almost the entire remaining (tiny) gap in one step
      expect(current).toBeCloseTo(afterWidening + 0.01, 2);
    });
  });
});
