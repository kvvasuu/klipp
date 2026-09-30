import { vec3 } from 'math';
import { Matrix4, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { HardLookAtAim } from '../../../src/three/aim/HardLookAtAim';

describe('HardLookAtAim', () => {
  it('faces the target, not away from it (real bug: a 180° flip passed a lookAt comparison)', () => {
    const target = new Object3D();
    target.position.set(0, 0.5, 0);
    const out = createCameraState();
    vec3.set(out.position, 6.8, 3, 4.1);

    new HardLookAtAim(target).update(out, 0.1);

    const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(out.quaternion));
    const toTarget = new Vector3(0, 0.5, 0).sub(new Vector3(6.8, 3, 4.1)).normalize();
    expect(forward.dot(toTarget)).toBeCloseTo(1, 9);
  });

  it("matches three.js camera lookAt and publishes the target's world position", () => {
    const parent = new Object3D();
    parent.position.set(4, 0, 0);
    const target = new Object3D();
    target.position.set(1, -1, 0);
    parent.add(target);
    const out = createCameraState();
    vec3.set(out.position, 1, 2, 3);

    new HardLookAtAim(target).update(out, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(1, 2, 3);
    reference.lookAt(5, -1, 0);
    expect(new Quaternion().fromArray(out.quaternion).angleTo(reference.quaternion)).toBeLessThan(1e-6);
    expect(out.hasLookAtTarget).toBe(true);
    expect(out.lookAtTarget).toEqual([5, -1, 0]);
  });

  it('uses out.referenceUp instead of world up', () => {
    const out = createCameraState();
    vec3.set(out.position, 1, 2, 3);
    const up = new Vector3(1, 1, 0).normalize();
    up.toArray(out.referenceUp);

    new HardLookAtAim(new Vector3(5, -1, 0)).update(out, 0.1);

    const expected = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(new Vector3(1, 2, 3), new Vector3(5, -1, 0), up),
    );
    expect(new Quaternion().fromArray(out.quaternion).angleTo(expected)).toBeLessThan(1e-6);
  });

  it('leaves out untouched without a target', () => {
    const out = createCameraState();
    new HardLookAtAim(null).update(out, 0.1);
    expect(out.quaternion).toEqual([0, 0, 0, 1]);
  });
});
