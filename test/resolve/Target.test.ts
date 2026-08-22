import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveTargetPosition, resolveTargetRotation } from '../../src/resolve/Target';

describe('resolveTargetPosition', () => {
  it('copies a Vector3 target as-is (already world-space) and returns true', () => {
    const out = new Vector3();
    const resolved = resolveTargetPosition(out, new Vector3(1, 2, 3));

    expect(resolved).toBe(true);
    expect(out.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  it('resolves a plain Object3D via its WORLD position, accounting for a parent transform', () => {
    const parent = new Object3D();
    parent.position.set(10, 0, 0);
    const child = new Object3D();
    child.position.set(1, 2, 3);
    parent.add(child);

    const out = new Vector3();
    const resolved = resolveTargetPosition(out, child);

    expect(resolved).toBe(true);
    expect(out.equals(new Vector3(11, 2, 3))).toBe(true);
  });

  it('resolves a RefObject<Object3D> via .current', () => {
    const object = new Object3D();
    object.position.set(4, 5, 6);
    const ref = { current: object };

    const out = new Vector3();
    const resolved = resolveTargetPosition(out, ref);

    expect(resolved).toBe(true);
    expect(out.equals(new Vector3(4, 5, 6))).toBe(true);
  });

  it('returns false and leaves "out" untouched for a ref whose .current is null', () => {
    const out = new Vector3(9, 9, 9);
    const resolved = resolveTargetPosition(out, { current: null });

    expect(resolved).toBe(false);
    expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
  });

  it("resolves r3f's [x,y,z] shorthand", () => {
    const out = new Vector3();
    const resolved = resolveTargetPosition(out, [1, 2, 3]);

    expect(resolved).toBe(true);
    expect(out.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  it("resolves r3f's plain-number shorthand (broadcast to all three axes)", () => {
    const out = new Vector3();
    const resolved = resolveTargetPosition(out, 5);

    expect(resolved).toBe(true);
    expect(out.equals(new Vector3(5, 5, 5))).toBe(true);
  });

  it('returns false and leaves "out" untouched for a null target', () => {
    const out = new Vector3(9, 9, 9);
    const resolved = resolveTargetPosition(out, null);

    expect(resolved).toBe(false);
    expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
  });

  it('returns false and leaves "out" untouched for an undefined target', () => {
    const out = new Vector3(9, 9, 9);
    const resolved = resolveTargetPosition(out, undefined);

    expect(resolved).toBe(false);
    expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
  });
});

describe('resolveTargetRotation', () => {
  it('returns false and leaves "out" untouched for a Vector3 target (no rotation to give)', () => {
    const out = new Quaternion(1, 2, 3, 4);
    const resolved = resolveTargetRotation(out, new Vector3(1, 2, 3));

    expect(resolved).toBe(false);
    expect(out.equals(new Quaternion(1, 2, 3, 4))).toBe(true);
  });

  it('resolves a plain Object3D via its WORLD rotation, accounting for a parent transform', () => {
    const parent = new Object3D();
    parent.rotation.set(0, Math.PI / 2, 0);
    const child = new Object3D();
    child.rotation.set(0, Math.PI / 4, 0);
    parent.add(child);
    parent.updateMatrixWorld(true);

    const out = new Quaternion();
    const resolved = resolveTargetRotation(out, child);

    const expected = new Quaternion().setFromEuler(child.rotation).premultiply(parent.quaternion);
    expect(resolved).toBe(true);
    expect(out.angleTo(expected)).toBeLessThan(1e-6);
  });

  it('resolves a RefObject<Object3D> via .current', () => {
    const object = new Object3D();
    object.rotation.set(0, Math.PI / 3, 0);
    const ref = { current: object };

    const out = new Quaternion();
    const resolved = resolveTargetRotation(out, ref);

    expect(resolved).toBe(true);
    expect(out.angleTo(new Quaternion().setFromEuler(object.rotation))).toBeLessThan(1e-6);
  });

  it('returns false and leaves "out" untouched for a ref whose .current is null', () => {
    const out = new Quaternion(1, 2, 3, 4);
    const resolved = resolveTargetRotation(out, { current: null });

    expect(resolved).toBe(false);
    expect(out.equals(new Quaternion(1, 2, 3, 4))).toBe(true);
  });

  it("returns false for r3f's [x,y,z] shorthand (no rotation to give)", () => {
    const out = new Quaternion(1, 2, 3, 4);
    const resolved = resolveTargetRotation(out, [1, 2, 3]);

    expect(resolved).toBe(false);
    expect(out.equals(new Quaternion(1, 2, 3, 4))).toBe(true);
  });

  it("returns false for r3f's plain-number shorthand (no rotation to give)", () => {
    const out = new Quaternion(1, 2, 3, 4);
    const resolved = resolveTargetRotation(out, 5);

    expect(resolved).toBe(false);
    expect(out.equals(new Quaternion(1, 2, 3, 4))).toBe(true);
  });

  it('returns false and leaves "out" untouched for a null target', () => {
    const out = new Quaternion(1, 2, 3, 4);
    const resolved = resolveTargetRotation(out, null);

    expect(resolved).toBe(false);
    expect(out.equals(new Quaternion(1, 2, 3, 4))).toBe(true);
  });

  it('returns false and leaves "out" untouched for an undefined target', () => {
    const out = new Quaternion(1, 2, 3, 4);
    const resolved = resolveTargetRotation(out, undefined);

    expect(resolved).toBe(false);
    expect(out.equals(new Quaternion(1, 2, 3, 4))).toBe(true);
  });
});
