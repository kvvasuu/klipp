import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { BindingModes } from '../../src/body/BindingModes';
import { FollowBody } from '../../src/body/FollowBody';

describe('FollowBody', () => {
  it('with a Vector3 target (no rotation), the offset is applied as plain world space', () => {
    const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(1, 2, 3));
    const out = createCameraState();

    body.update(out, 0.1);
    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  it("writes the target's world position and hasTarget onto out, for BlendHints' sphericalPosition", () => {
    const body = new FollowBody(new Vector3(2, 3, 4), new Vector3(1, 0, 0));
    const out = createCameraState();

    body.update(out, 0.1);

    expect(out.hasTarget).toBe(true);
    expect(out.target.equals(new Vector3(2, 3, 4))).toBe(true);
  });

  it("accounts for the target's WORLD position (parent transform included)", () => {
    const parent = new Object3D();
    parent.position.set(5, 0, 0);
    const target = new Object3D();
    target.position.set(2, 0, 0);
    parent.add(target);

    const body = new FollowBody(target, new Vector3(0, 0, 0));
    const out = createCameraState();
    body.update(out, 0.1);

    expect(out.position.x).toBeCloseTo(7, 10);
  });

  it("rotates the offset INTO the target's world rotation (Lock To Target) instead of adding it raw", () => {
    const target = new Object3D();
    target.rotation.set(0, Math.PI / 2, 0); // turned 90° around Y

    const body = new FollowBody(target, new Vector3(0, 0, 10));
    const out = createCameraState();
    body.update(out, 0.1);

    // local +Z rotated 90° around Y lands on world +X, not world +Z
    expect(out.position.x).toBeCloseTo(10, 5);
    expect(out.position.z).toBeCloseTo(0, 5);
  });

  it("default offset sits BEHIND the target given three.js's -Z-forward convention", () => {
    const target = new Object3D(); // identity rotation faces world -Z
    const body = new FollowBody(target);
    const out = createCameraState();
    body.update(out, 0.1);

    // "behind" a -Z-facing object is +Z
    expect(out.position.z).toBeGreaterThan(0);
  });

  it('offset is a mutable field — reassigning it changes the followed offset live', () => {
    const target = new Vector3(0, 0, 0);
    const body = new FollowBody(target, new Vector3(1, 0, 0));
    const out = createCameraState();

    body.update(out, 0.1);
    expect(out.position.x).toBeCloseTo(1, 10);

    body.offset = new Vector3(5, 0, 0);
    body.update(out, 0.1);
    expect(out.position.x).toBeCloseTo(5, 10);
  });

  it('a ref whose .current is null is a no-op, not a crash', () => {
    const body = new FollowBody({ current: null });
    const out = createCameraState();

    expect(() => body.update(out, 0.1)).not.toThrow();
    expect(out.position.x).toBe(0);
  });

  it('a null target is a no-op, not a crash', () => {
    const body = new FollowBody(null);
    const out = createCameraState();

    expect(() => body.update(out, 0.1)).not.toThrow();
    expect(out.position.x).toBe(0);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerBody(body.update))', () => {
    const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(1, 2, 3));
    const { update } = body;

    const out = createCameraState();
    update(out, 0.1);

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  describe('damping', () => {
    it('damping <= 0 (default) is an exact, instant lock — no smoothing at all', () => {
      const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(10, 0, 0));
      const out = createCameraState();

      body.update(out, 0.016);
      expect(out.position.x).toBe(10);
    });

    it('the very first update() ever snaps directly to the desired position, even with damping > 0', () => {
      const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(10, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.016);
      expect(out.position.x).toBe(10);
    });

    it('damping > 0 catches up gradually instead of snapping in one frame, once warmed up', () => {
      const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(10, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.016); // consume the first-ever-update hard snap
      out.position.set(0, 0, 0); // move back away from target to genuinely exercise damping below
      body.update(out, 0.016);
      expect(out.position.x).toBeGreaterThan(0);
      expect(out.position.x).toBeLessThan(10);
    });

    it('converges to the desired position over repeated ticks with damping enabled', () => {
      const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(10, 5, -3), 0.3);
      const out = createCameraState();

      for (let i = 0; i < 300; i++) {
        body.update(out, 0.016);
      }

      expect(out.position.x).toBeCloseTo(10, 2);
      expect(out.position.y).toBeCloseTo(5, 2);
      expect(out.position.z).toBeCloseTo(-3, 2);
    });

    it('accepts an asymmetric {into, from} DampingConstant, same as Damper itself', () => {
      const body = new FollowBody(new Vector3(0, 0, 0), new Vector3(10, 0, 0), { into: 0.05, from: 2 });
      const out = createCameraState();

      body.update(out, 0.016); // consume the first-ever-update hard snap
      out.position.set(0, 0, 0); // move back away from target to genuinely exercise damping below
      expect(() => body.update(out, 0.016)).not.toThrow();
      expect(out.position.x).toBeGreaterThan(0);
      expect(out.position.x).toBeLessThan(10);
    });
  });

  describe('justActivated', () => {
    it('snaps straight to the desired position even with a warmed-up damper and a stale out.position', () => {
      // offset (0,0,0): desired position === target, keeping the expected values simple below
      const body = new FollowBody(new Vector3(10, 0, 0), new Vector3(0, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.016, true); // first-ever session: snaps, warms up the damper
      body.update(out, 0.016, false);

      // a later, unrelated session: out.position is frozen at wherever the FIRST session left it
      body.target = new Vector3(-40, 12, 3);
      body.update(out, 0.016, true);

      expect(out.position.equals(new Vector3(-40, 12, 3))).toBe(true);
    });

    it('without justActivated, the same stale-state scenario eases instead of snapping (the bug this fixes)', () => {
      const body = new FollowBody(new Vector3(10, 0, 0), new Vector3(0, 0, 0), 0.5);
      const out = createCameraState();

      body.update(out, 0.016, true);
      body.update(out, 0.016, false);

      body.target = new Vector3(-40, 12, 3);
      body.update(out, 0.016, false); // no reactivation signal — damper treats this as a normal retarget

      expect(out.position.equals(new Vector3(-40, 12, 3))).toBe(false);
    });
  });

  describe('bindingMode', () => {
    it('defaults to lockToTarget (unchanged behavior from before bindingMode existed)', () => {
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0);
      const body = new FollowBody(target, new Vector3(0, 0, 10));
      const out = createCameraState();

      body.update(out, 0.1);
      expect(out.position.x).toBeCloseTo(10, 5);
      expect(out.position.z).toBeCloseTo(0, 5);
    });

    it('worldSpace: offset is added raw, ignoring the target rotation entirely', () => {
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0);
      const body = new FollowBody(target, new Vector3(0, 0, 10), 0, BindingModes.worldSpace);
      const out = createCameraState();

      body.update(out, 0.1);
      expect(out.position.equals(new Vector3(0, 0, 10))).toBe(true);
    });

    it('lockToTargetWithWorldUp: only yaw is applied, pitch is ignored', () => {
      const target = new Object3D();
      const yaw = Math.PI / 3;
      target.rotateY(yaw);
      target.rotateX(0.6); // pitch, applied AFTER yaw in the target's own local frame

      const body = new FollowBody(target, new Vector3(0, 0, 10), 0, BindingModes.lockToTargetWithWorldUp);
      const out = createCameraState();
      body.update(out, 0.1);

      const yawOnly = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      const expected = new Vector3(0, 0, 10).applyQuaternion(yawOnly);
      expect(out.position.x).toBeCloseTo(expected.x, 5);
      expect(out.position.y).toBeCloseTo(expected.y, 5); // 0 — pitch had zero effect
      expect(out.position.z).toBeCloseTo(expected.z, 5);
    });

    it('lockToTargetNoRoll: adding roll afterward has ZERO effect on the followed position', () => {
      const target = new Object3D();
      target.rotateY(0.4);
      target.rotateX(0.5);

      const body = new FollowBody(target, new Vector3(0, 1, 8), 0, BindingModes.lockToTargetNoRoll);
      const out = createCameraState();
      body.update(out, 0.1);
      const beforeRoll = out.position.clone();

      target.rotateZ(1.2); // roll around the target's own forward axis
      body.update(out, 0.1);

      expect(out.position.x).toBeCloseTo(beforeRoll.x, 10);
      expect(out.position.y).toBeCloseTo(beforeRoll.y, 10);
      expect(out.position.z).toBeCloseTo(beforeRoll.z, 10);
    });

    it('...compared to lockToTarget on the SAME rotation sequence, which DOES react to roll', () => {
      const target = new Object3D();
      target.rotateY(0.4);
      target.rotateX(0.5);

      const body = new FollowBody(target, new Vector3(0, 1, 8)); // default: lockToTarget
      const out = createCameraState();
      body.update(out, 0.1);
      const beforeRoll = out.position.clone();

      target.rotateZ(1.2);
      body.update(out, 0.1);

      expect(out.position.equals(beforeRoll)).toBe(false);
    });

    describe('lockToTargetOnAssign', () => {
      it('captures the rotation once, on the first update, then ignores further target rotation', () => {
        const target = new Object3D();
        target.rotation.set(0, Math.PI / 2, 0);

        const body = new FollowBody(target, new Vector3(0, 0, 10), 0, BindingModes.lockToTargetOnAssign);
        const out = createCameraState();
        body.update(out, 0.1);
        const afterAssign = out.position.clone();

        target.rotation.set(0, 0, 0); // target keeps rotating — should now be ignored
        body.update(out, 0.1);

        expect(out.position.equals(afterAssign)).toBe(true);
      });

      it('re-locks when target is reassigned to a genuinely NEW object (identity change)', () => {
        const targetA = new Object3D();
        targetA.rotation.set(0, Math.PI / 2, 0);
        const targetB = new Object3D();
        targetB.position.set(5, 0, 0); // identity rotation

        const body = new FollowBody(targetA, new Vector3(0, 0, 10), 0, BindingModes.lockToTargetOnAssign);
        const out = createCameraState();
        body.update(out, 0.1);

        body.target = targetB;
        body.update(out, 0.1);

        // targetB's identity rotation is what got re-locked: offset lands unrotated, translated to targetB
        expect(out.position.x).toBeCloseTo(5, 5);
        expect(out.position.z).toBeCloseTo(10, 5);
      });
    });

    it('bindingMode is a mutable field', () => {
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0);
      const body = new FollowBody(target, new Vector3(0, 0, 10));
      const out = createCameraState();

      body.update(out, 0.1);
      expect(out.position.x).toBeCloseTo(10, 5); // lockToTarget: rotated

      body.bindingMode = BindingModes.worldSpace;
      body.update(out, 0.1);
      expect(out.position.equals(new Vector3(0, 0, 10))).toBe(true); // now raw, unrotated
    });
  });
});
