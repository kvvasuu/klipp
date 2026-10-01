import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { RotateWithFollowTargetAim } from '../../../src/three/aim/RotateWithFollowTargetAim';

const rotationOf = (out: CameraState) => new Quaternion().fromArray(out.quaternion);

function rotatedTarget(x: number, y: number, z: number) {
  const target = new Object3D();
  target.rotation.set(x, y, z);
  return target;
}

/** Runs one update on a throwaway state, so the next update damps instead of snapping. */
function warmUp(aim: RotateWithFollowTargetAim): RotateWithFollowTargetAim {
  aim.update(createCameraState(), 0.016, false);
  return aim;
}

describe('RotateWithFollowTargetAim', () => {
  it("copies the target's world rotation", () => {
    const parent = new Object3D();
    parent.rotation.set(0, 0.5, 0);
    const target = rotatedTarget(0.3, 0.2, 0.1);
    parent.add(target);
    const out = createCameraState();

    new RotateWithFollowTargetAim(target).update(out, 0.1, false);

    expect(rotationOf(out).angleTo(target.getWorldQuaternion(new Quaternion()))).toBeLessThan(1e-9);
  });

  it('leaves out untouched for a target without rotation or without a target', () => {
    for (const target of [new Vector3(1, 2, 3), null]) {
      const out = createCameraState();
      new RotateWithFollowTargetAim(target).update(out, 0.1, false);
      expect(out.quaternion).toEqual([0, 0, 0, 1]);
    }
  });

  describe('damping', () => {
    it('eases toward the target rotation and converges', () => {
      const target = rotatedTarget(0.4, -1.2, 0.7);
      const aim = warmUp(new RotateWithFollowTargetAim(target, { damping: 0.3 }));
      const out = createCameraState();

      aim.update(out, 0.016, false);
      expect(rotationOf(out).angleTo(new Quaternion())).toBeGreaterThan(0);
      expect(rotationOf(out).angleTo(target.quaternion)).toBeGreaterThan(0.01);

      for (let i = 0; i < 300; i++) aim.update(out, 0.016, false);
      expect(rotationOf(out).angleTo(target.quaternion)).toBeLessThan(1e-3);
    });

    it('follows a steadily turning target smoothly, settling into a constant lag', () => {
      const target = new Object3D();
      const aim = new RotateWithFollowTargetAim(target, { damping: 0.2 });
      const out = createCameraState();
      const dt = 1 / 60;
      let largestStep = 0;
      const lags: number[] = [];

      for (let i = 1; i <= 600; i++) {
        target.rotation.set(0, 1.5 * dt * i, 0);
        const before = rotationOf(out);
        aim.update(out, dt, false);
        largestStep = Math.max(largestStep, before.angleTo(rotationOf(out)));
        if (i > 500) lags.push(rotationOf(out).angleTo(target.quaternion));
      }

      expect(largestStep).toBeLessThan(1.5 * dt * 5);
      expect(Math.abs(lags[lags.length - 1] - lags[0])).toBeLessThan(0.02);
    });

    it('maxSpeed caps how fast damping closes the gap', () => {
      const target = rotatedTarget(0, Math.PI / 2, 0);
      const gap = (maxSpeed: number) => {
        const aim = warmUp(new RotateWithFollowTargetAim(target, { damping: 1, maxSpeed }));
        const out = createCameraState();
        aim.update(out, 0.05, false);
        return rotationOf(out).angleTo(target.quaternion);
      };

      expect(gap(1)).toBeGreaterThan(gap(Infinity));
    });
  });

  it('justActivated snaps to a new target rotation from a stale one, where a plain update would ease', () => {
    const gap = (justActivated: boolean) => {
      const target = rotatedTarget(0, Math.PI / 2, 0);
      const aim = new RotateWithFollowTargetAim(target, { damping: 0.5 });
      const out = createCameraState();
      aim.update(out, 0.016, true);
      aim.update(out, 0.016, false);
      target.rotation.set(1.2, -0.5, 0.3);
      aim.update(out, 0.016, justActivated);
      return rotationOf(out).angleTo(target.quaternion);
    };

    expect(gap(true)).toBeLessThan(1e-9);
    expect(gap(false)).toBeGreaterThan(0.01);
  });

  describe('primeFrom', () => {
    it('makes the next activation ease from the primed rotation, once', () => {
      const target = rotatedTarget(0, Math.PI / 2, 0);
      const aim = new RotateWithFollowTargetAim(target, { damping: 0.5 });
      const out = createCameraState();
      aim.primeFrom(out.quaternion);

      aim.update(out, 0.016, true);
      expect(rotationOf(out).angleTo(new Quaternion())).toBeGreaterThan(0);
      expect(rotationOf(out).angleTo(target.quaternion)).toBeGreaterThan(0.01);

      target.rotation.set(1.2, -0.5, 0.3);
      aim.update(out, 0.016, true); // a later activation snaps as usual
      expect(rotationOf(out).angleTo(target.quaternion)).toBeLessThan(1e-9);
    });

    it('is used up even when the target is not resolved yet on that activation', () => {
      const aim = new RotateWithFollowTargetAim({ current: null }, { damping: 0.5 });
      const out = createCameraState();
      aim.primeFrom(out.quaternion);
      aim.update(out, 0.016, true);
      expect(out.quaternion).toEqual([0, 0, 0, 1]);

      const target = rotatedTarget(1.2, -0.5, 0.3);
      aim.target = target;
      aim.update(out, 0.016, true);
      expect(rotationOf(out).angleTo(target.quaternion)).toBeLessThan(1e-9);
    });
  });
});
