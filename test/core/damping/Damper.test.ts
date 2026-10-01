import { describe, expect, it } from 'vitest';
import { Damper, createDamperState, damp, resetDamper, type DampingConstant } from '../../../src/core/damping/Damper';

/** A damper that already used up its first-call snap. */
function warm(damping: DampingConstant = 0.5): Damper {
  const damper = new Damper();
  damper.update(0, 10, damping, 0.016);
  return damper;
}

describe('Damper', () => {
  it('snaps to the target on its first call and again after reset()', () => {
    const damper = new Damper();
    expect(damper.update(0, 10, 0.5, 0.016)).toBe(10);

    damper.update(0, 10, 0.5, 0.016);
    expect(damper.velocity).not.toBe(0);
    damper.reset();

    expect(damper.update(999, -50, 0.5, 0.016)).toBe(-50);
    expect(damper.velocity).toBe(0);
  });

  it('eases to the target without overshooting', () => {
    const damper = warm(0.3);
    let current = 0;

    for (let i = 0; i < 500; i++) {
      current = damper.update(current, 10, 0.3, 0.016);
      expect(current).toBeLessThanOrEqual(10);
    }

    expect(current).toBe(10);
  });

  it('lands exactly on the target within epsilon, and stays there at rest', () => {
    const damper = warm(1);
    damper.velocity = 3.7;

    expect(damper.update(10.00005, 10, 1, 0.016, Infinity, 1e-4)).toBe(10);
    expect(damper.velocity).toBe(0);
    expect(damper.update(10, 10, 1, 0.1)).toBe(10);
    expect(damper.velocity).toBe(0);
  });

  it('carries velocity between calls', () => {
    const moving = warm();
    moving.update(0, 10, 0.5, 0.05);
    expect(moving.update(0, 10, 0.5, 0.05)).not.toBeCloseTo(warm().update(0, 10, 0.5, 0.05), 5);
  });

  describe('maxSpeed', () => {
    it('caps how far one step can move', () => {
      expect(warm(1).update(0, 100, 1, 0.05, 2)).toBeLessThan(warm(1).update(0, 100, 1, 0.05));
    });

    it('still moves at its full rate with no damping (real bug: crawled near zero)', () => {
      expect(warm(0).update(0, 100, 0, 0.016, 1000)).toBeCloseTo(1000 * 0.016, 1);
    });
  });

  it('treats a negative dt as zero (real bug: it amplified instead of damping)', () => {
    const run = (dt: number) => {
      const damper = warm();
      damper.update(0, 10, 0.5, 0.016);
      return damper.update(5, 10, 0.5, dt);
    };

    expect(run(-1)).toBeCloseTo(run(0), 10);
  });

  describe('into/from damping', () => {
    it('uses "into" while the gap widens and "from" while it narrows', () => {
      const chase = (damping: DampingConstant) => {
        const damper = new Damper();
        let current = 0;
        for (let i = 0; i < 5; i++) current = damper.update(current, 10 + i, damping, 0.016);
        return current;
      };
      expect(Math.abs(14 - chase({ into: 0.05, from: 2 }))).toBeLessThan(Math.abs(14 - chase({ into: 2, from: 0.05 })));

      const damper = warm({ into: 2, from: 0.05 });
      let current = 0;
      for (let i = 0; i < 5; i++) current = damper.update(current, 10, { into: 2, from: 0.05 }, 0.016);
      expect(damper.update(current, current + 0.01, { into: 2, from: 0.02 }, 0.016)).toBeCloseTo(current + 0.01, 2);
    });

    it('with equal values behaves like a plain number', () => {
      const plain = warm(0.4);
      const split = warm({ into: 0.4, from: 0.4 });
      let a = 0;
      let b = 0;
      for (let i = 0; i < 50; i++) {
        a = plain.update(a, 10, 0.4, 0.016);
        b = split.update(b, 10, { into: 0.4, from: 0.4 }, 0.016);
      }
      expect(a).toBeCloseTo(b, 10);
    });
  });
});

describe('damp', () => {
  it('advances a state in place, matching the Damper class step for step', () => {
    const wrapper = new Damper();
    const state = createDamperState();
    const damping = { into: 0.3, from: 0.8 };
    let current = 0;

    for (let i = 0; i < 300; i++) {
      const target = Math.sin(i * 0.05) * 20;
      const dt = i % 3 === 0 ? 1 / 30 : 1 / 60;
      current = wrapper.update(current, target, damping, dt, 40);
      expect(damp(state, target, damping, dt, 40)).toBe(state);

      expect(state.value).toBe(current);
      expect(state.velocity).toBe(wrapper.velocity);
    }
  });

  it('snaps on the first call and after resetDamper', () => {
    const state = createDamperState(3);
    expect(damp(state, 10, 0.5, 0.016).value).toBe(10);

    state.value = 0;
    damp(state, 10, 0.5, 0.016);
    resetDamper(state);

    expect(damp(state, -50, 0.5, 0.016).value).toBe(-50);
    expect(state.velocity).toBe(0);
  });
});
