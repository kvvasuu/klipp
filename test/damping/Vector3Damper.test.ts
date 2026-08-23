import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Vector3Damper } from '../../src/damping/Vector3Damper';

describe('Vector3Damper', () => {
  it('damping <= 0 (default) is an exact, instant lock — no smoothing at all', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();

    damper.update(out, new Vector3(10, -5, 2), 0, 0.016);
    expect(out.equals(new Vector3(10, -5, 2))).toBe(true);
  });

  it('the very first update() call ever snaps directly to target, even with damping > 0', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();

    damper.update(out, new Vector3(10, -5, 2), 0.5, 0.016);
    expect(out.equals(new Vector3(10, -5, 2))).toBe(true);
  });

  it('damping > 0 catches up gradually instead of snapping in one frame', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();

    damper.update(out, new Vector3(10, 0, 0), 0.5, 0.016); // consume the first-call snap
    out.set(0, 0, 0); // move back away from target to genuinely exercise gradual convergence below
    damper.update(out, new Vector3(10, 0, 0), 0.5, 0.016);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(10);
  });

  it('damps each axis independently — a moved target still catches up per axis, not radially', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();
    const target = new Vector3(10, 0, 0);

    damper.update(out, target, 0.5, 0.1);
    expect(out.y).toBe(0); // untouched — no cross-axis coupling

    target.set(10, 10, 0);
    damper.update(out, target, 0.5, 0.1);
    expect(out.y).toBeGreaterThan(0);
  });

  it('converges to the target over repeated ticks', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();
    const target = new Vector3(10, 5, -3);

    for (let i = 0; i < 300; i++) {
      damper.update(out, target, 0.3, 0.016);
    }

    expect(out.x).toBeCloseTo(10, 2);
    expect(out.y).toBeCloseTo(5, 2);
    expect(out.z).toBeCloseTo(-3, 2);
  });

  it('accepts an asymmetric {into, from} DampingConstant, same as Damper itself', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();

    damper.update(out, new Vector3(10, 0, 0), { into: 0.05, from: 2 }, 0.016); // consume the first-call snap
    out.set(0, 0, 0);
    expect(() => damper.update(out, new Vector3(10, 0, 0), { into: 0.05, from: 2 }, 0.016)).not.toThrow();
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(10);
  });

  it('writes into "out" and returns it (no allocation)', () => {
    const damper = new Vector3Damper();
    const out = new Vector3();

    const returned = damper.update(out, new Vector3(1, 2, 3), 0, 0.016);
    expect(returned).toBe(out);
  });
});
