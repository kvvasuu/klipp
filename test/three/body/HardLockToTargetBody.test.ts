import { vec3 } from 'math';
import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { HardLockToTargetBody } from '../../../src/three/body/HardLockToTargetBody';

/** Runs one update so the next one damps instead of snapping, then moves the camera back to the origin. */
function warmUp(body: HardLockToTargetBody) {
  const out = createCameraState();
  body.update(out, 0.016, false);
  vec3.set(out.position, 0, 0, 0);
  return out;
}

describe('HardLockToTargetBody', () => {
  it("locks onto the target's world position and publishes it as out.target", () => {
    const target = new Object3D();
    target.position.set(2, 3, 4);
    const out = createCameraState();

    new HardLockToTargetBody(target).update(out, 0.1, false);

    expect(out.position).toEqual([2, 3, 4]);
    expect(out.target).toEqual([2, 3, 4]);
    expect(out.hasTarget).toBe(true);
  });

  it('leaves out untouched without a target', () => {
    const out = createCameraState();
    new HardLockToTargetBody(null).update(out, 0.1, false);
    expect(out.position).toEqual([0, 0, 0]);
  });

  describe('damping', () => {
    it('snaps on the very first update, then eases toward the target and converges', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 5, -3), { damping: 0.3 });
      const first = createCameraState();
      body.update(first, 0.016, false);
      expect(first.position).toEqual([10, 5, -3]);

      vec3.set(first.position, 0, 0, 0);
      body.update(first, 0.016, false);
      expect(first.position[0]).toBeGreaterThan(0);
      expect(first.position[0]).toBeLessThan(10);

      for (let i = 0; i < 300; i++) body.update(first, 0.016, false);
      expect(first.position[0]).toBeCloseTo(10, 2);
      expect(first.position[1]).toBeCloseTo(5, 2);
      expect(first.position[2]).toBeCloseTo(-3, 2);
    });

    it('publishes the damped position as out.target, not the raw target (real bug: blend hints read the lag as an orbit offset)', () => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), { damping: 0.5 });
      const out = warmUp(body);

      body.update(out, 0.016, false);

      expect(out.position[0]).toBeLessThan(10);
      expect(out.target).toEqual(out.position);
    });

    it('damps each axis on its own', () => {
      const target = new Vector3(10, 0, 0);
      const body = new HardLockToTargetBody(target, { damping: 0.5 });
      const out = createCameraState();

      body.update(out, 0.1, false);
      expect(out.position[1]).toBe(0);

      target.set(10, 10, 0);
      body.update(out, 0.1, false);
      expect(out.position[1]).toBeGreaterThan(0);
    });

    it('maxSpeed caps how fast damping closes the gap', () => {
      const run = (maxSpeed: number) => {
        const body = new HardLockToTargetBody(new Vector3(100, 0, 0), { damping: 1, maxSpeed });
        const out = warmUp(body);
        body.update(out, 0.05, false);
        return out.position[0];
      };

      expect(run(2)).toBeLessThan(run(Infinity));
    });
  });

  it('justActivated snaps to a new target from a stale position, where a plain update would ease', () => {
    const run = (justActivated: boolean) => {
      const body = new HardLockToTargetBody(new Vector3(10, 0, 0), { damping: 0.5 });
      const out = createCameraState();
      body.update(out, 0.016, true);
      body.update(out, 0.016, false);
      body.target = new Vector3(-40, 12, 3);
      body.update(out, 0.016, justActivated);
      return out.position;
    };

    expect(run(true)).toEqual([-40, 12, 3]);
    expect(run(false)).not.toEqual([-40, 12, 3]);
  });
});
