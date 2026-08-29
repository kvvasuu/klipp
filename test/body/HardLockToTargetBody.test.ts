import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { HardLockToTargetBody } from '../../src/body/HardLockToTargetBody';

describe('HardLockToTargetBody', () => {
  it("writes the target's WORLD position into out.position (accounting for a parent transform)", () => {
    const parent = new Object3D();
    parent.position.set(5, 0, 0);
    const target = new Object3D();
    target.position.set(2, 0, 0);
    parent.add(target);

    const body = new HardLockToTargetBody(target);
    const out = createCameraState();
    body.update(out, 0.1);

    expect(out.position.x).toBeCloseTo(7, 10);
  });

  it('target is a mutable field — reassigning it changes what gets tracked, no re-registration needed', () => {
    const a = new Object3D();
    a.position.set(1, 0, 0);
    const b = new Object3D();
    b.position.set(9, 0, 0);

    const body = new HardLockToTargetBody(a);
    const out = createCameraState();

    body.update(out, 0.1);
    expect(out.position.x).toBeCloseTo(1, 10);

    body.target = b;
    body.update(out, 0.1);
    expect(out.position.x).toBeCloseTo(9, 10);
  });

  it('accepts a plain Vector3 target, copied as-is', () => {
    const body = new HardLockToTargetBody(new Vector3(4, 5, 6));
    const out = createCameraState();

    body.update(out, 0.1);
    expect(out.position.equals(new Vector3(4, 5, 6))).toBe(true);
  });

  it('accepts a RefObject<Object3D | null> and tracks it live', () => {
    const object = new Object3D();
    object.position.set(3, 0, 0);
    const ref = { current: object };

    const body = new HardLockToTargetBody(ref);
    const out = createCameraState();
    body.update(out, 0.1);

    expect(out.position.x).toBeCloseTo(3, 10);
  });

  it('a ref whose .current is null is a no-op, not a crash', () => {
    const body = new HardLockToTargetBody({ current: null });
    const out = createCameraState();

    expect(() => body.update(out, 0.1)).not.toThrow();
    expect(out.position.x).toBe(0);
  });

  it('a null target is a no-op, not a crash', () => {
    const body = new HardLockToTargetBody(null);
    const out = createCameraState();

    expect(() => body.update(out, 0.1)).not.toThrow();
    expect(out.position.x).toBe(0);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerBody(body.update))', () => {
    const target = new Object3D();
    target.position.set(1, 2, 3);
    const body = new HardLockToTargetBody(target);
    const { update } = body; // detach from the instance, like a callback registration would

    const out = createCameraState();
    update(out, 0.1);

    expect(out.position.x).toBeCloseTo(1, 10);
  });

  describe('damping', () => {
    it('damping <= 0 (default) is an exact, instant lock — no smoothing at all', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0));
      const out = createCameraState();

      body.update(out, 0.016);

      expect(out.position.x).toBe(10);
    });

    it('the very first update() ever snaps directly to the target, even with damping > 0 — avoids flying in from (0,0,0)', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), 0.5);
      const out = createCameraState(); // starts at position (0,0,0)

      body.update(out, 0.016);

      expect(out.position.x).toBe(10);
    });

    it('damping > 0 catches up gradually instead of snapping in one frame', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), 0.5);
      const out = createCameraState(); // starts at position (0,0,0)

      body.update(out, 0.016); // consume the first-ever-update hard snap
      out.position.set(0, 0, 0); // move back away from target to genuinely exercise damping below
      body.update(out, 0.016);

      expect(out.position.x).toBeGreaterThan(0);
      expect(out.position.x).toBeLessThan(10);
    });

    it('converges to the target over repeated ticks with damping enabled', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 5, -3), 0.3);
      const out = createCameraState();

      for (let i = 0; i < 300; i++) {
        body.update(out, 0.016);
      }

      expect(out.position.x).toBeCloseTo(10, 2);
      expect(out.position.y).toBeCloseTo(5, 2);
      expect(out.position.z).toBeCloseTo(-3, 2);
    });

    it('damps each axis independently — a moved target still catches up per axis, not radially', () => {
      const target = new Vector3(10, 0, 0);
      const body = new HardLockToTargetBody(target, 0.5);
      const out = createCameraState();

      body.update(out, 0.1); // moving on X only
      expect(out.position.y).toBe(0); // untouched — no cross-axis coupling

      target.set(10, 10, 0); // Y now also has somewhere to go
      body.update(out, 0.1);
      expect(out.position.y).toBeGreaterThan(0);
    });

    it('damping is a mutable field — toggling it back to 0 snaps instantly on the next frame', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.05); // consume the first-ever-update hard snap
      out.position.set(0, 0, 0); // move back away from target to genuinely exercise damping below
      body.update(out, 0.05);
      expect(out.position.x).toBeGreaterThan(0);
      expect(out.position.x).toBeLessThan(10);

      body.damping = 0;
      body.update(out, 0.05);
      expect(out.position.x).toBe(10);
    });
  });

  describe('justActivated', () => {
    it('snaps straight to target even with a warmed-up damper and a stale out.position', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.016, true); // first-ever session: snaps, warms up the damper
      body.update(out, 0.016, false);

      // simulate a DIFFERENT, later session: out.position is frozen at wherever the FIRST session left
      // it, unrelated to the new target below — same shape as a VirtualCamera reactivating with a brand
      // new focus point after being inactive for a while
      body.target = new Vector3(-40, 12, 3);
      body.update(out, 0.016, true);

      expect(out.position.equals(new Vector3(-40, 12, 3))).toBe(true);
    });

    it('without justActivated, the same stale-state scenario eases instead of snapping (the bug this fixes)', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.016, true);
      body.update(out, 0.016, false);

      body.target = new Vector3(-40, 12, 3);
      body.update(out, 0.016, false); // no reactivation signal — damper treats this as a normal retarget

      expect(out.position.equals(new Vector3(-40, 12, 3))).toBe(false);
    });
  });
});
