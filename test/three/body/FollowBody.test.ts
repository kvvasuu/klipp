import { vec3, type Vec3 } from 'math';
import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BindingModes, type BindingMode } from '../../../src/core/body/BindingModes';
import { createCameraState } from '../../../src/core/CameraState';
import { FollowBody } from '../../../src/three/body/FollowBody';

/** `v` rotated by `rotation`, as a tuple. */
const rotated = (v: Vec3, rotation: Quaternion): Vec3 => new Vector3(...v).applyQuaternion(rotation).toArray() as Vec3;

function expectVec3Close(actual: Vec3, expected: Vec3) {
  for (let i = 0; i < 3; i++) expect(actual[i]).toBeCloseTo(expected[i], 8);
}

/** Runs one update so the next one damps instead of snapping, then moves the camera back to the origin. */
function warmUp(body: FollowBody) {
  const out = createCameraState();
  body.update(out, 0.016, false);
  vec3.set(out.position, 0, 0, 0);
  return out;
}

describe('FollowBody', () => {
  it('sits at the offset from the target and publishes the target as out.target', () => {
    const out = createCameraState();
    new FollowBody(new Vector3(2, 3, 4), [1, 2, 3]).update(out, 0.1, false);

    expect(out.position).toEqual([3, 5, 7]);
    expect(out.target).toEqual([2, 3, 4]);
    expect(out.hasTarget).toBe(true);
  });

  it('leaves out untouched without a target', () => {
    const out = createCameraState();
    new FollowBody(null).update(out, 0.1, false);
    expect(out.position).toEqual([0, 0, 0]);
  });

  describe('damping', () => {
    it('snaps on the very first update, then eases toward the offset position and converges', () => {
      const body = new FollowBody(new Vector3(), [10, 5, -3], 0.3);
      const out = createCameraState();
      body.update(out, 0.016, false);
      expect(out.position).toEqual([10, 5, -3]);

      vec3.set(out.position, 0, 0, 0);
      body.update(out, 0.016, false);
      expect(out.position[0]).toBeGreaterThan(0);
      expect(out.position[0]).toBeLessThan(10);

      for (let i = 0; i < 300; i++) body.update(out, 0.016, false);
      expectVec3Close(out.position, [10, 5, -3]);
    });

    it('keeps out.target exactly offset away from the damped position (real bug: the lag distorted the offset blend hints read)', () => {
      const target = new Vector3();
      const body = new FollowBody(target, [0, 0, 10], 0.5);
      const out = createCameraState();
      body.update(out, 0.016, false);

      target.set(20, 0, 0);
      body.update(out, 0.016, false);

      expect(out.position[0]).toBeLessThan(20);
      expectVec3Close(vec3.subtract(vec3.create(), out.position, out.target), [0, 0, 10]);
    });

    it('maxSpeed caps how fast damping closes the gap', () => {
      const run = (maxSpeed: number) => {
        const body = new FollowBody(new Vector3(), [100, 0, 0], 1, BindingModes.lockToTarget, maxSpeed);
        const out = warmUp(body);
        body.update(out, 0.05, false);
        return out.position[0];
      };

      expect(run(2)).toBeLessThan(run(Infinity));
    });
  });

  it('justActivated snaps to a new target from a stale position, where a plain update would ease', () => {
    const run = (justActivated: boolean) => {
      const body = new FollowBody(new Vector3(10, 0, 0), [0, 0, 0], 0.5);
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

  it('primeFrom makes the next activation ease from the primed position, once', () => {
    const body = new FollowBody(new Vector3(), [0, 0, 0], 0.5);
    const out = createCameraState();
    vec3.set(out.position, -50, 0, 0);
    body.primeFrom(out.position);

    body.update(out, 0.016, true);
    expect(out.position[0]).toBeGreaterThan(-50);
    expect(out.position[0]).toBeLessThan(0);

    body.target = new Vector3(-40, 12, 3);
    body.update(out, 0.016, true); // a later activation snaps as usual
    expect(out.position).toEqual([-40, 12, 3]);
  });

  describe('bindingMode', () => {
    /** A target yawed, pitched and rolled, so every mode has something to ignore. */
    function tiltedTarget() {
      const target = new Object3D();
      target.rotateY(0.4);
      target.rotateX(0.5);
      target.rotateZ(1.1);
      return target;
    }

    function follow(target: Object3D, bindingMode?: BindingMode) {
      const body = new FollowBody(target, [0, 1, 8], 0, bindingMode);
      const out = createCameraState();
      body.update(out, 0.1, false);
      return { body, out };
    }

    it('lockToTarget (default) turns the offset and up with the full rotation, roll included', () => {
      const target = tiltedTarget();
      const { out } = follow(target);
      expectVec3Close(out.position, rotated([0, 1, 8], target.quaternion));
      expectVec3Close(out.referenceUp, rotated([0, 1, 0], target.quaternion));
    });

    it('the default offset sits behind a -Z facing target', () => {
      const out = createCameraState();
      new FollowBody(new Object3D()).update(out, 0.1, false);
      expect(out.position[2]).toBeGreaterThan(0);
    });

    it('worldSpace ignores the target rotation', () => {
      const { out } = follow(tiltedTarget(), BindingModes.worldSpace);
      expect(out.position).toEqual([0, 1, 8]);
      expect(out.referenceUp).toEqual([0, 1, 0]);
    });

    it('lockToTargetWithWorldUp follows yaw only', () => {
      const target = tiltedTarget();
      const { out } = follow(target, BindingModes.lockToTargetWithWorldUp);
      expectVec3Close(out.position, rotated([0, 1, 8], new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4)));
      expectVec3Close(out.referenceUp, [0, 1, 0]);
    });

    it('lockToTargetNoRoll ignores roll', () => {
      const target = new Object3D();
      target.rotateY(0.4);
      target.rotateX(0.5);
      const { body, out } = follow(target, BindingModes.lockToTargetNoRoll);
      const position = vec3.clone(out.position);
      const up = vec3.clone(out.referenceUp);

      target.rotateZ(1.2);
      body.update(out, 0.1, false);

      expectVec3Close(out.position, position);
      expectVec3Close(out.referenceUp, up);
    });

    it('lockToTargetOnAssign keeps the rotation from when the target was assigned, until a new target', () => {
      const target = tiltedTarget();
      const { body, out } = follow(target, BindingModes.lockToTargetOnAssign);
      const position = vec3.clone(out.position);
      const up = vec3.clone(out.referenceUp);

      target.rotation.set(0, 0, 0);
      body.update(out, 0.1, false);
      expectVec3Close(out.position, position);
      expectVec3Close(out.referenceUp, up);

      const next = new Object3D();
      next.position.set(5, 0, 0);
      body.target = next;
      body.update(out, 0.1, false);
      expectVec3Close(out.position, [5, 1, 8]);
    });
  });
});
