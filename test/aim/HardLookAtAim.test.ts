import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { HardLookAtAim } from '../../src/aim/HardLookAtAim';

function expectQuaternionsClose(
  actual: { x: number; y: number; z: number; w: number },
  expected: { x: number; y: number; z: number; w: number },
) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
  expect(actual.w).toBeCloseTo(expected.w, 9);
}

describe('HardLookAtAim', () => {
  it('actually faces the target — forward direction (-Z) points from the eye TOWARD it, not away', () => {
    const eyePosition = new Vector3(6.8, 3, 4.1); // the exact regression case from the original bug
    const targetPosition = new Vector3(0, 0.5, 0);
    const target = new Object3D();
    target.position.copy(targetPosition);

    const aim = new HardLookAtAim(target);
    const out = createCameraState();
    out.position.copy(eyePosition);
    aim.update(out, 0.1);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = targetPosition.clone().sub(eyePosition).normalize();

    // a camera facing the wrong way (180° off) would score -1 here — this is exactly the bug that
    // slipped past a "matches Object3D.lookAt()" test in the earlier, pre-class version.
    expect(forward.dot(towardTarget)).toBeCloseTo(1, 9);
  });

  it("writes the target's world position and hasLookAtTarget onto out, for BlendHints' lookAt-rotation blend", () => {
    const target = new Object3D();
    target.position.set(5, -1, 0);
    const aim = new HardLookAtAim(target);
    const out = createCameraState();
    out.position.set(1, 2, 3);

    aim.update(out, 0.1);

    expect(out.hasLookAtTarget).toBe(true);
    expect(out.lookAtTarget.equals(new Vector3(5, -1, 0))).toBe(true);
  });

  it("matches THREE's own camera-convention lookAt (PerspectiveCamera.lookAt) for the same eye/target", () => {
    const target = new Object3D();
    target.position.set(5, -1, 0);
    const aim = new HardLookAtAim(target);

    const out = createCameraState();
    out.position.set(1, 2, 3);
    aim.update(out, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(1, 2, 3);
    reference.lookAt(5, -1, 0);

    expectQuaternionsClose(out.quaternion, reference.quaternion);
  });

  it("looks at the target's WORLD position, not its local position", () => {
    const parent = new Object3D();
    parent.position.set(10, 0, 0);
    const target = new Object3D();
    target.position.set(0, 0, -5);
    parent.add(target);

    const aim = new HardLookAtAim(target);
    const out = createCameraState();
    out.position.set(0, 0, 0);
    aim.update(out, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(0, 0, 0);
    reference.lookAt(10, 0, -5); // world position of the nested target, not its local (0,0,-5)

    expectQuaternionsClose(out.quaternion, reference.quaternion);
  });

  it('accepts a plain Vector3 target — no Object3D/ref required for a fixed point', () => {
    const aim = new HardLookAtAim(new Vector3(5, -1, 0));
    const out = createCameraState();
    out.position.set(1, 2, 3);
    aim.update(out, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(1, 2, 3);
    reference.lookAt(5, -1, 0);

    expectQuaternionsClose(out.quaternion, reference.quaternion);
  });

  it('target is a mutable field — reassigning it changes what gets looked at', () => {
    const a = new Object3D();
    a.position.set(0, 0, -5);
    const b = new Object3D();
    b.position.set(5, -1, 0);

    const aim = new HardLookAtAim(a);
    const out = createCameraState();
    out.position.set(1, 2, 3);
    aim.update(out, 0.1);

    aim.target = b;
    aim.update(out, 0.1);

    const reference = new PerspectiveCamera();
    reference.position.set(1, 2, 3);
    reference.lookAt(5, -1, 0);

    expectQuaternionsClose(out.quaternion, reference.quaternion);
  });

  it('a ref whose .current is null is a no-op, not a crash', () => {
    const aim = new HardLookAtAim({ current: null });
    const out = createCameraState();

    expect(() => aim.update(out, 0.1)).not.toThrow();
    expectQuaternionsClose(out.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  });

  it('a null target is a no-op, not a crash', () => {
    const aim = new HardLookAtAim(null);
    const out = createCameraState();

    expect(() => aim.update(out, 0.1)).not.toThrow();
    expectQuaternionsClose(out.quaternion, { x: 0, y: 0, z: 0, w: 1 });
  });
});
