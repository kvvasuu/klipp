import { describe, expect, it } from 'vitest';
import { createVector3DamperState, dampVector3, resetVector3Damper } from '../../../src/core/damping/dampVector3';

describe('dampVector3', () => {
  it('snaps on the first call, after a reset and with damping 0', () => {
    const state = createVector3DamperState();
    expect(dampVector3(state, [0, 0, 0], [10, -5, 2], 0.5, 0.016)).toEqual([10, -5, 2]);

    dampVector3(state, [0, 0, 0], [10, 0, 0], 0.5, 0.016);
    resetVector3Damper(state);
    expect(dampVector3(state, [999, -999, 999], [1, 2, 3], 0.5, 0.016)).toEqual([1, 2, 3]);

    expect(dampVector3(createVector3DamperState(), [0, 0, 0], [10, -5, 2], 0, 0.016)).toEqual([10, -5, 2]);
  });

  it('eases each axis on its own and settles on the target', () => {
    const state = createVector3DamperState();
    const out = dampVector3(state, [0, 0, 0], [10, 0, 0], 0.5, 0.1);

    dampVector3(state, out, [10, 10, 0], 0.5, 0.1);
    expect(out[0]).toBe(10);
    expect(out[1]).toBeGreaterThan(0);
    expect(out[1]).toBeLessThan(10);

    for (let i = 0; i < 300; i++) dampVector3(state, out, [10, 5, -3], 0.3, 0.016);
    expect(out.map((v) => +v.toFixed(2))).toEqual([10, 5, -3]);
  });

  it('maxSpeed caps how far one step moves', () => {
    const step = (maxSpeed?: number) => {
      const state = createVector3DamperState();
      dampVector3(state, [0, 0, 0], [100, 0, 0], 1, 0.05, maxSpeed);
      return dampVector3(state, [0, 0, 0], [100, 0, 0], 1, 0.05, maxSpeed)[0];
    };

    expect(step(2)).toBeLessThan(step());
  });
});
