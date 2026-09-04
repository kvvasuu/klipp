import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { QuaternionDamper } from '../../src/damping/QuaternionDamper';

describe('QuaternionDamper', () => {
  it('damping <= 0 (default) is an exact, instant match — no smoothing at all', () => {
    const damper = new QuaternionDamper();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const out = new Quaternion();

    damper.update(out, target, 0, 0.016);
    expect(out.angleTo(target)).toBeLessThan(1e-9);
  });

  it('the very first update() call ever snaps directly to target, even with damping > 0', () => {
    const damper = new QuaternionDamper();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const out = new Quaternion();

    damper.update(out, target, 0.5, 0.016);
    expect(out.angleTo(target)).toBeLessThan(1e-9);
  });

  it('damping > 0 catches up gradually instead of snapping in one frame, once warmed up', () => {
    const damper = new QuaternionDamper();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const out = new Quaternion();

    damper.update(out, target, 0.5, 0.016); // consume the first-call snap
    out.identity(); // move back away from target to genuinely exercise gradual convergence below

    damper.update(out, target, 0.5, 0.016);
    expect(out.angleTo(new Quaternion())).toBeGreaterThan(0);
    expect(out.angleTo(target)).toBeGreaterThan(0.01);
  });

  it('converges to a static target over repeated ticks with damping enabled', () => {
    const damper = new QuaternionDamper();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0.3, 1, -0.2).normalize(), 1.7);
    const out = new Quaternion();

    for (let i = 0; i < 300; i++) damper.update(out, target, 0.3, 0.016);

    expect(out.angleTo(target)).toBeLessThan(1e-3);
  });

  it('never jumps suddenly while tracking a continuously-rotating target', () => {
    const damper = new QuaternionDamper();
    const out = new Quaternion();
    const target = new Quaternion();

    const dt = 1 / 60;
    const angularSpeed = 1.5;
    let elapsed = 0;
    let maxStepAngle = 0;

    for (let i = 0; i < 300; i++) {
      elapsed += dt;
      target.setFromAxisAngle(new Vector3(0, 1, 0), angularSpeed * elapsed);
      const before = out.clone();

      damper.update(out, target, 0.3, dt);

      const stepAngle = before.angleTo(out);
      if (stepAngle > maxStepAngle) maxStepAngle = stepAngle;
    }

    expect(maxStepAngle).toBeLessThan(angularSpeed * dt * 5);
  });

  it('accepts an asymmetric {into, from} DampingConstant, same as Damper itself', () => {
    const damper = new QuaternionDamper();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1);
    const out = new Quaternion();

    expect(() => damper.update(out, target, { into: 0.05, from: 2 }, 0.016)).not.toThrow();
    expect(out.angleTo(new Quaternion())).toBeGreaterThan(0);
  });

  it('writes into "out" and returns it (no allocation)', () => {
    const damper = new QuaternionDamper();
    const target = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1);
    const out = new Quaternion();

    const returned = damper.update(out, target, 0, 0.016);
    expect(returned).toBe(out);
  });

  it('reset() re-arms the first-call snap', () => {
    const damper = new QuaternionDamper();
    const firstTarget = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const out = new Quaternion();

    damper.update(out, firstTarget, 0.5, 0.016); // consume the first-call snap
    out.identity();
    damper.update(out, firstTarget, 0.5, 0.016); // build up real velocity/history
    damper.reset();

    out.setFromAxisAngle(new Vector3(1, 0, 0), 2); // a stale orientation unrelated to the next target
    const newTarget = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.4);
    damper.update(out, newTarget, 0.5, 0.016);

    expect(out.angleTo(newTarget)).toBeLessThan(1e-9);
  });

  it('a reset() whose next update() is already ON target consumes the armed snap there — it does not keep it armed for whatever moves NEXT', () => {
    const damper = new QuaternionDamper();
    const settled = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
    const out = settled.clone();

    // the reactivation case: a <VirtualCamera> going active again while its stored rotation is still
    // correct, e.g. re-focusing the same point
    damper.reset();
    damper.update(out, settled, 0.5, 1 / 60);
    expect(out.angleTo(settled)).toBeLessThan(1e-9);

    const moved = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2 + 1);
    damper.update(out, moved, 0.5, 1 / 60);

    expect(out.angleTo(settled)).toBeLessThan(0.1); // barely left where it was
    expect(out.angleTo(moved)).toBeGreaterThan(0.5); // nowhere near the new target yet
  });
});
