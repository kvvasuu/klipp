import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { PanTiltAim } from '../../src/aim/PanTiltAim';

function decompose(quaternion: { x: number; y: number; z: number; w: number }) {
  const euler = new Euler(0, 0, 0, 'YXZ');
  euler.setFromQuaternion(quaternion as never, 'YXZ');
  return { pitchDeg: (euler.x * 180) / Math.PI, yawDeg: (euler.y * 180) / Math.PI };
}

// InputAxis's own damping (default 0) converges value near-instantly but only over a couple of real
// update() ticks - settling both axes first keeps these tests about the rotation math, not convergence
// timing (already covered by InputAxis's own tests).
function settleAxes(aim: PanTiltAim, frames = 5, dt = 0.016): void {
  for (let i = 0; i < frames; i++) {
    aim.pan.update(dt);
    aim.tilt.update(dt);
  }
}

describe('PanTiltAim', () => {
  it('starts at identity rotation - pan/tilt both 0', () => {
    const aim = new PanTiltAim();
    const out = createCameraState();
    aim.update(out, 0.016);

    const { pitchDeg, yawDeg } = decompose(out.quaternion);
    expect(pitchDeg).toBeCloseTo(0, 5);
    expect(yawDeg).toBeCloseTo(0, 5);
  });

  it('pan.applyDelta rotates yaw by that many degrees (positive pan = turn right = negative Euler yaw)', () => {
    const aim = new PanTiltAim();
    aim.pan.applyDelta(30);
    settleAxes(aim);
    const out = createCameraState();
    aim.update(out, 0.016);

    const { yawDeg, pitchDeg } = decompose(out.quaternion);
    expect(yawDeg).toBeCloseTo(-30, 4);
    expect(pitchDeg).toBeCloseTo(0, 5);
  });

  it('tilt.applyDelta rotates pitch by that many degrees (positive tilt = look up = negative Euler pitch)', () => {
    const aim = new PanTiltAim();
    aim.tilt.applyDelta(20);
    settleAxes(aim);
    const out = createCameraState();
    aim.update(out, 0.016);

    const { pitchDeg, yawDeg } = decompose(out.quaternion);
    expect(pitchDeg).toBeCloseTo(-20, 4);
    expect(yawDeg).toBeCloseTo(0, 5);
  });

  it('pan and tilt compose independently', () => {
    const aim = new PanTiltAim();
    aim.pan.applyDelta(45);
    aim.tilt.applyDelta(-15);
    settleAxes(aim);
    const out = createCameraState();
    aim.update(out, 0.016);

    const { pitchDeg, yawDeg } = decompose(out.quaternion);
    expect(yawDeg).toBeCloseTo(-45, 4);
    expect(pitchDeg).toBeCloseTo(15, 4);
  });

  it('pan.normalize() folds an accumulated turn back inside +/-180 without changing the facing', () => {
    const aim = new PanTiltAim();
    aim.pan.applyDelta(170);
    aim.pan.applyDelta(20); // settles at 190, outside +/-180
    settleAxes(aim);

    aim.pan.normalize();

    expect(aim.pan.value).toBeCloseTo(-170, 5); // 190 mod 360, same physical angle
  });

  it('tilt clamps - never flips past straight up/down', () => {
    const aim = new PanTiltAim();
    const [min, max] = aim.tilt.range!;

    aim.tilt.applyDelta(max - aim.tilt.value + 50); // well past the limit
    settleAxes(aim);
    expect(aim.tilt.value).toBe(max);

    aim.tilt.applyDelta(min - aim.tilt.value - 50);
    settleAxes(aim);
    expect(aim.tilt.value).toBe(min);
  });

  it('update() advances recentering on both axes when enabled', () => {
    const aim = new PanTiltAim();
    aim.pan.applyDelta(90);
    aim.pan.recentering = { enabled: true, wait: 0, time: 0.5 };
    const out = createCameraState();

    for (let i = 0; i < 100; i++) aim.update(out, 0.05); // well past wait, recentering should engage

    expect(aim.pan.value).toBeCloseTo(0, 1);
  });

  it('update is a bound instance method - safe to pass by reference (e.g. slots.registerAim(aim.update))', () => {
    const aim = new PanTiltAim();
    const { update } = aim;
    const out = createCameraState();
    expect(() => update(out, 0.016)).not.toThrow();
  });

  describe('target', () => {
    it("unset accounts for a non-standard referenceUp, same as Cinemachine's world fallback", () => {
      const aim = new PanTiltAim();
      aim.pan.applyDelta(90);
      settleAxes(aim);
      const out = createCameraState();
      out.referenceUp.set(0, 0, 1); // scene tilted 90° - "up" is world +Z, not +Y

      aim.update(out, 0.016);

      // forward (0,0,-1) rotated 90° yaw around the TILTED up axis - sanity check via dot products
      // rather than decompose(), which assumes a +Y-up Euler frame that no longer applies here
      const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
      expect(forward.dot(new Vector3(0, 0, -1))).toBeCloseTo(0, 4); // no longer facing the old forward
      expect(Math.abs(forward.y)).toBeLessThan(1e-4); // stayed level relative to the tilted horizon
    });

    it('rotates pan/tilt relative to the target, not world axes', () => {
      const aim = new PanTiltAim();
      const target = new Object3D();
      target.rotation.set(0, Math.PI / 2, 0); // target itself faces +X
      target.updateMatrixWorld();
      aim.target = target;

      const out = createCameraState();
      aim.update(out, 0.016); // pan/tilt both 0 - should just inherit the target's own facing

      const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
      const targetForward = new Vector3(0, 0, -1).applyQuaternion(target.quaternion);
      expect(forward.dot(targetForward)).toBeCloseTo(1, 4);
    });

    it('falls back to world when a ref target is not mounted yet - same fallback as Cinemachine for a missing target', () => {
      const aim = new PanTiltAim();
      aim.target = { current: null };

      const out = createCameraState();
      expect(() => aim.update(out, 0.016)).not.toThrow();

      const { pitchDeg, yawDeg } = decompose(out.quaternion);
      expect(pitchDeg).toBeCloseTo(0, 5);
      expect(yawDeg).toBeCloseTo(0, 5);
    });
  });

  describe('setFromRotation', () => {
    it('round-trips through update() - decomposes back to the same pan/tilt that produced the rotation', () => {
      const source = new PanTiltAim();
      source.pan.applyDelta(40);
      source.tilt.applyDelta(-15);
      settleAxes(source);
      const out = createCameraState();
      source.update(out, 0.016);

      const recovered = new PanTiltAim();
      recovered.setFromRotation(out.quaternion, out.referenceUp);
      settleAxes(recovered);

      expect(recovered.pan.value).toBeCloseTo(40, 4);
      expect(recovered.tilt.value).toBeCloseTo(-15, 4);
    });

    it('round-trips against a non-standard referenceUp', () => {
      const referenceUp = new Vector3(0, 0, 1).normalize();
      const source = new PanTiltAim();
      source.pan.applyDelta(-70);
      source.tilt.applyDelta(25);
      settleAxes(source);
      const out = createCameraState();
      out.referenceUp.copy(referenceUp);
      source.update(out, 0.016);

      const recovered = new PanTiltAim();
      recovered.setFromRotation(out.quaternion, referenceUp);
      settleAxes(recovered);

      expect(recovered.pan.value).toBeCloseTo(-70, 4);
      expect(recovered.tilt.value).toBeCloseTo(25, 4);
    });

    it('round-trips against a target reference frame, given a referenceUp aligned to the target', () => {
      const target = new Object3D();
      target.rotation.set(0.3, Math.PI / 2, 0);
      target.updateMatrixWorld();
      const referenceUp = new Vector3(0, 1, 0).applyQuaternion(target.quaternion);

      const source = new PanTiltAim();
      source.target = target;
      source.pan.applyDelta(20);
      source.tilt.applyDelta(-10);
      settleAxes(source);
      const out = createCameraState();
      out.referenceUp.copy(referenceUp);
      source.update(out, 0.016);

      const recovered = new PanTiltAim();
      recovered.target = target;
      recovered.setFromRotation(out.quaternion, referenceUp);
      settleAxes(recovered);

      expect(recovered.pan.value).toBeCloseTo(20, 4);
      expect(recovered.tilt.value).toBeCloseTo(-10, 4);
    });

    it('a rotation matching the reference frame exactly decomposes to pan=0, tilt=0', () => {
      const target = new Object3D();
      target.rotation.set(0.3, Math.PI / 2, 0);
      target.updateMatrixWorld();

      const aim = new PanTiltAim();
      aim.target = target;
      aim.setFromRotation(target.quaternion, new Vector3(0, 1, 0));
      settleAxes(aim);

      expect(aim.pan.value).toBeCloseTo(0, 4);
      expect(aim.tilt.value).toBeCloseTo(0, 4);
    });

    it('actually feeds into the next update() - not just the axes in isolation', () => {
      const source = new PanTiltAim();
      source.pan.applyDelta(55);
      source.tilt.applyDelta(12);
      settleAxes(source);
      const sourceOut = createCameraState();
      source.update(sourceOut, 0.016);

      const recovered = new PanTiltAim();
      recovered.setFromRotation(sourceOut.quaternion, sourceOut.referenceUp);
      settleAxes(recovered);
      const recoveredOut = createCameraState();
      recovered.update(recoveredOut, 0.016);

      expect(recoveredOut.quaternion.angleTo(sourceOut.quaternion)).toBeLessThan(1e-3);
    });
  });
});
