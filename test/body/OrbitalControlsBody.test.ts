import CameraControls from 'camera-controls';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { OrbitalControlsBody } from '../../src/body/OrbitalControlsBody';

describe('OrbitalControlsBody', () => {
  it('constructs a real, ready-to-use CameraControls instance', () => {
    const body = new OrbitalControlsBody(null);
    expect(body.controls).toBeDefined();
    expect(typeof body.controls.update).toBe('function');
  });

  it('impl lets a custom CameraControls subclass be constructed instead of the base class', () => {
    class CustomControls extends CameraControls {}
    const body = new OrbitalControlsBody(null, 1, 10, CustomControls);
    expect(body.controls).toBeInstanceOf(CustomControls);
  });

  it('starts at a real, non-zero distance from the target instead of coincident with it', () => {
    // regression: a fresh THREE.Camera starts at the origin, same as an unset target — without an
    // explicit initial distance, orbiting starts fully degenerate (camera AT the target, nothing visible)
    const target = new Vector3(0, 0, 0);
    const body = new OrbitalControlsBody(target, 1, 10);
    const out = createCameraState();
    body.update(out, 0.05);

    expect(out.position.distanceTo(target)).toBeCloseTo(10, 5);
  });

  it('initialDistance is only a starting point — dollying changes the live distance', () => {
    const target = new Vector3(0, 0, 0);
    const body = new OrbitalControlsBody(target, 1, 10);
    const out = createCameraState();

    body.controls.dollyTo(20, false);
    for (let i = 0; i < 5; i++) body.update(out, 0.05);

    expect(out.position.distanceTo(target)).toBeCloseTo(20, 3);
  });

  it('a null target is a no-op on the target — update() still runs without throwing', () => {
    const body = new OrbitalControlsBody(null);
    const out = createCameraState();
    expect(() => body.update(out, 0.1)).not.toThrow();
  });

  it('orbits so the camera ends up looking roughly toward the target', () => {
    const target = new Vector3(0, 0, -20);
    const body = new OrbitalControlsBody(target);
    const out = createCameraState();

    for (let i = 0; i < 30; i++) body.update(out, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = target.clone().sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99); // nearly parallel
  });

  it("re-orients when the target moves, tracking the target's WORLD position (parent transform included)", () => {
    const parent = new Object3D();
    parent.position.set(50, 0, 0);
    const child = new Object3D();
    child.position.set(0, 0, -10);
    parent.add(child);

    const body = new OrbitalControlsBody(child);
    const out = createCameraState();
    for (let i = 0; i < 30; i++) body.update(out, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = new Vector3(50, 0, -10).sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99);
  });

  it('syncs fov/near/far from out and aspect from the aspect field into the scratch camera', () => {
    const target = new Vector3(0, 0, -20);
    const body = new OrbitalControlsBody(target, 2);
    const out = createCameraState();
    out.fov = 35;
    out.near = 0.5;
    out.far = 500;

    expect(() => body.update(out, 0.05)).not.toThrow();
    // indirect check: the underlying camera picked up the values (accessible via controls.camera)
    expect(body.controls.camera.fov).toBe(35);
    expect(body.controls.camera.near).toBe(0.5);
    expect(body.controls.camera.far).toBe(500);
    expect((body.controls.camera as PerspectiveCamera).aspect).toBe(2);
  });

  it('never lets the target field itself get mutated — target/aspect are mutable fields', () => {
    const targetA = new Vector3(0, 0, -20);
    const targetB = new Vector3(30, 0, 0);
    const body = new OrbitalControlsBody(targetA);
    const out = createCameraState();
    for (let i = 0; i < 20; i++) body.update(out, 0.05);

    body.target = targetB;
    for (let i = 0; i < 20; i++) body.update(out, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardB = targetB.clone().sub(out.position).normalize();
    expect(forward.dot(towardB)).toBeGreaterThan(0.99);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerBody(body.update))', () => {
    const body = new OrbitalControlsBody(new Vector3(0, 0, -10));
    const { update } = body;
    const out = createCameraState();
    expect(() => update(out, 0.05)).not.toThrow();
  });

  it('two instances have fully independent orbit state (no shared scratch camera)', () => {
    const bodyA = new OrbitalControlsBody(new Vector3(0, 0, -10));
    const bodyB = new OrbitalControlsBody(new Vector3(20, 5, 0));
    const outA = createCameraState();
    const outB = createCameraState();

    for (let i = 0; i < 20; i++) {
      bodyA.update(outA, 0.05);
      bodyB.update(outB, 0.05);
    }

    expect(outA.position.equals(outB.position)).toBe(false);
  });

  it('a moving target drags the camera along with it, preserving the orbit offset (not frozen in world space)', () => {
    // regression: the first version used controls.setTarget(), which camera-controls' own source
    // documents as "an alias of setLookAt(), WITHOUT position change" — it only re-aims, leaving the
    // camera's world position frozen. controls.moveTo() shifts the target while leaving the internal
    // spherical (radius/azimuth/polar) offset untouched, so the camera translates by the same delta.
    const target = new Vector3(0, 0, -20);
    const body = new OrbitalControlsBody(target, 1, 10);
    const out = createCameraState();
    for (let i = 0; i < 60; i++) body.update(out, 0.05); // let camera-controls' own smoothTime settle

    const positionBeforeMove = out.position.clone();
    const distanceBeforeMove = out.position.distanceTo(target);

    target.set(30, 0, -20); // move the target by (30, 0, 0)
    for (let i = 0; i < 60; i++) body.update(out, 0.05); // settle again

    const moved = out.position.clone().sub(positionBeforeMove);
    expect(moved.x).toBeGreaterThan(25); // camera moved by roughly the same delta as the target
    expect(Math.abs(out.position.distanceTo(target) - distanceBeforeMove)).toBeLessThan(1); // offset preserved
  });
});
