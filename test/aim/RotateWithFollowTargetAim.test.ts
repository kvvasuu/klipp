import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { RotateWithFollowTargetAim } from '../../src/aim/RotateWithFollowTargetAim';

function expectQuaternionsClose(actual: Quaternion, expected: Quaternion, precision = 9) {
  expect(actual.angleTo(expected)).toBeLessThan(10 ** -precision);
}

describe('RotateWithFollowTargetAim', () => {
  it("copies the target's WORLD rotation 1:1 (damping <= 0, default)", () => {
    const target = new Object3D();
    target.rotation.set(0.3, 1.1, -0.4);

    const aim = new RotateWithFollowTargetAim(target);
    const out = createCameraState();
    aim.update(out, 0.1);

    expectQuaternionsClose(out.quaternion, new Quaternion().setFromEuler(target.rotation));
  });

  it("copies the target's WORLD rotation, accounting for a parent transform", () => {
    const parent = new Object3D();
    parent.rotation.set(0, Math.PI / 2, 0);
    const target = new Object3D();
    target.rotation.set(0, Math.PI / 4, 0);
    parent.add(target);
    parent.updateMatrixWorld(true);

    const aim = new RotateWithFollowTargetAim(target);
    const out = createCameraState();
    aim.update(out, 0.1);

    const expected = new Quaternion().setFromEuler(target.rotation).premultiply(parent.quaternion);
    expectQuaternionsClose(out.quaternion, expected);
  });

  it('a fixed-point target (no rotation to give) is a no-op', () => {
    const aim = new RotateWithFollowTargetAim(new Vector3(1, 2, 3));
    const out = createCameraState();
    aim.update(out, 0.1);

    expectQuaternionsClose(out.quaternion, new Quaternion());
  });

  it('a ref whose .current is null is a no-op, not a crash', () => {
    const aim = new RotateWithFollowTargetAim({ current: null });
    const out = createCameraState();

    expect(() => aim.update(out, 0.1)).not.toThrow();
    expectQuaternionsClose(out.quaternion, new Quaternion());
  });

  it('a null target is a no-op, not a crash', () => {
    const aim = new RotateWithFollowTargetAim(null);
    const out = createCameraState();

    expect(() => aim.update(out, 0.1)).not.toThrow();
    expectQuaternionsClose(out.quaternion, new Quaternion());
  });

  it('target is a mutable field — reassigning it changes what gets copied', () => {
    const a = new Object3D();
    a.rotation.set(0, 1, 0);
    const b = new Object3D();
    b.rotation.set(0, -1, 0.5);

    const aim = new RotateWithFollowTargetAim(a);
    const out = createCameraState();
    aim.update(out, 0.1);

    aim.target = b;
    aim.update(out, 0.1);

    expectQuaternionsClose(out.quaternion, new Quaternion().setFromEuler(b.rotation));
  });

  describe('damping', () => {
    it('damping > 0 catches up gradually instead of snapping in one frame', () => {
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0);

      const aim = new RotateWithFollowTargetAim(target, 0.5);
      aim.update(createCameraState(), 0.016); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();
      aim.update(out, 0.016);

      const targetQuaternion = new Quaternion().setFromEuler(target.rotation);
      expect(out.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0); // moved off identity
      expect(out.quaternion.angleTo(targetQuaternion)).toBeGreaterThan(0.01); // but not there yet
    });

    it('converges to a static target over repeated ticks with damping enabled', () => {
      const target = new Object3D();
      target.rotation.set(0.4, -1.2, 0.7);
      const targetQuaternion = new Quaternion().setFromEuler(target.rotation);

      const aim = new RotateWithFollowTargetAim(target, 0.3);
      const out = createCameraState();

      for (let i = 0; i < 300; i++) aim.update(out, 0.016);

      expectQuaternionsClose(out.quaternion, targetQuaternion, 3);
    });

    it('never jumps suddenly while tracking a continuously-rotating target (steady angular speed, no reversal)', () => {
      const target = new Object3D();
      const aim = new RotateWithFollowTargetAim(target, 0.3);
      const out = createCameraState();

      const dt = 1 / 60;
      const angularSpeed = 1.5; // rad/s around Y — a fast, steady sweep
      let elapsed = 0;
      let maxStepAngle = 0;

      for (let i = 0; i < 300; i++) {
        elapsed += dt;
        target.rotation.set(0, angularSpeed * elapsed, 0);
        const before = out.quaternion.clone();

        aim.update(out, dt);

        const stepAngle = before.angleTo(out.quaternion);
        if (stepAngle > maxStepAngle) maxStepAngle = stepAngle;
      }

      // a per-step jump anywhere near this size would mean the damping broke continuity — a smoothly
      // tracking camera should never move further in one 1/60s tick than the raw target itself does
      // (angularSpeed * dt), plus generous slack for the spring's own catch-up motion
      expect(maxStepAngle).toBeLessThan(angularSpeed * dt * 5);
    });

    it('settles into a roughly constant lag behind a target rotating at constant angular speed', () => {
      const target = new Object3D();
      const aim = new RotateWithFollowTargetAim(target, 0.2);
      const out = createCameraState();

      const dt = 1 / 60;
      const angularSpeed = 1;
      let elapsed = 0;
      const lags: number[] = [];

      for (let i = 0; i < 600; i++) {
        elapsed += dt;
        target.rotation.set(0, angularSpeed * elapsed, 0);
        aim.update(out, dt);
        if (i >= 500) lags.push(out.quaternion.angleTo(new Quaternion().setFromEuler(target.rotation)));
      }

      // once settled (last 100 of 600 ticks), the lag should be roughly constant, not still drifting
      const first = lags[0];
      const last = lags[lags.length - 1];
      expect(Math.abs(last - first)).toBeLessThan(0.02);
    });

    it('accepts an asymmetric {into, from} DampingConstant, same as Damper itself', () => {
      const target = new Object3D();
      target.rotation.set(0, 1, 0);

      const aim = new RotateWithFollowTargetAim(target, { into: 0.05, from: 2 });
      const out = createCameraState();

      expect(() => aim.update(out, 0.016)).not.toThrow();
      expect(out.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0);
    });

    it('damping is a mutable field — toggling it back to 0 snaps instantly on the next frame', () => {
      const target = new Object3D();
      target.rotation.set(0, 1, 0);
      const targetQuaternion = new Quaternion().setFromEuler(target.rotation);

      const aim = new RotateWithFollowTargetAim(target, 0.5);
      aim.update(createCameraState(), 0.05); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();
      aim.update(out, 0.05);
      expect(out.quaternion.angleTo(targetQuaternion)).toBeGreaterThan(0);

      aim.damping = 0;
      aim.update(out, 0.05);
      expectQuaternionsClose(out.quaternion, targetQuaternion);
    });
  });

  describe('justActivated', () => {
    it('snaps straight to the target rotation even with a warmed-up damper and a stale out.quaternion', () => {
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0); // off-axis, so warm-up below exercises real damping

      const aim = new RotateWithFollowTargetAim(target, 0.5);
      const out = createCameraState();

      aim.update(out, 0.016, true); // first-ever session: snaps, warms up the damper
      aim.update(out, 0.016, false);

      // a later, unrelated session: out.quaternion is frozen at wherever the FIRST session left it
      target.rotation.set(1.2, -0.5, 0.3);
      const newTargetQuaternion = new Quaternion().setFromEuler(target.rotation);
      aim.update(out, 0.016, true);

      expectQuaternionsClose(out.quaternion, newTargetQuaternion);
    });

    it('without justActivated, the same stale-state scenario eases instead of snapping (the bug this fixes)', () => {
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0);

      const aim = new RotateWithFollowTargetAim(target, 0.5);
      const out = createCameraState();

      aim.update(out, 0.016, true);
      aim.update(out, 0.016, false);

      target.rotation.set(1.2, -0.5, 0.3);
      const newTargetQuaternion = new Quaternion().setFromEuler(target.rotation);
      aim.update(out, 0.016, false); // no reactivation signal — damps from the stale orientation instead

      expect(out.quaternion.angleTo(newTargetQuaternion)).toBeGreaterThan(0.01);
    });
  });
});
