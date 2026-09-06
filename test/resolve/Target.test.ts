import { BoxGeometry, BufferGeometry, Line, Mesh, Object3D, Points, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveTargetPosition, resolveTargetRotation, resolveTargetSize } from '../../src/resolve/Target';

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

describe('resolveTargetSize', () => {
  it("auto-detects a Mesh geometry's bounding box size", () => {
    const mesh = new Mesh(new BoxGeometry(2, 4, 6));
    const out = new Vector3();

    expect(resolveTargetSize(out, mesh)).toBe(true);
    expect(out.x).toBeCloseTo(2, 5);
    expect(out.y).toBeCloseTo(4, 5);
    expect(out.z).toBeCloseTo(6, 5);
  });

  it("auto-detects a SkinnedMesh too - it inherits Mesh's isMesh flag", () => {
    const mesh = new SkinnedMesh(new BoxGeometry(2, 4, 6));
    const out = new Vector3();

    expect(resolveTargetSize(out, mesh)).toBe(true);
    expect(out.x).toBeCloseTo(2, 5);
  });

  it('auto-detects a Line geometry (real gap: Line has no isMesh flag, only isLine)', () => {
    const geometry = new BufferGeometry().setFromPoints([new Vector3(-1, 0, 0), new Vector3(1, 2, 3)]);
    const line = new Line(geometry);
    const out = new Vector3();

    expect(resolveTargetSize(out, line)).toBe(true);
    expect(out.x).toBeCloseTo(2, 5);
    expect(out.y).toBeCloseTo(2, 5);
    expect(out.z).toBeCloseTo(3, 5);
  });

  it('auto-detects a Points geometry (real gap: Points has no isMesh flag, only isPoints)', () => {
    const geometry = new BufferGeometry().setFromPoints([new Vector3(-2, -1, -1), new Vector3(2, 1, 1)]);
    const points = new Points(geometry);
    const out = new Vector3();

    expect(resolveTargetSize(out, points)).toBe(true);
    expect(out.x).toBeCloseTo(4, 5);
    expect(out.y).toBeCloseTo(2, 5);
    expect(out.z).toBeCloseTo(2, 5);
  });

  it('returns false and leaves "out" untouched for a plain Object3D (no geometry)', () => {
    const out = new Vector3(9, 9, 9);

    expect(resolveTargetSize(out, new Object3D())).toBe(false);
    expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
  });

  it('an explicit size wins over auto-detection', () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    const out = new Vector3();

    expect(resolveTargetSize(out, mesh, [10, 20, 30])).toBe(true);
    expect(out.equals(new Vector3(10, 20, 30))).toBe(true);
  });

  it('radius without size means "sphere, not a box" - returns false even with a real Mesh', () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    const out = new Vector3(9, 9, 9);

    expect(resolveTargetSize(out, mesh, undefined, 5)).toBe(false);
    expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
  });

  describe('dynamicSize', () => {
    // a raw vertex edit (no .scale()/.applyMatrix4()) is the one case three.js itself never keeps
    // boundingBox in sync for automatically - matches a SkinnedMesh's bind-pose-only limitation
    function deformFirstVertex(mesh: Mesh): void {
      const position = mesh.geometry.attributes.position;
      position.setX(0, position.getX(0) * 10);
      position.needsUpdate = true;
    }

    it('default (false): the FIRST computed bounding box is cached and reused - a later deformation goes unnoticed', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));
      const out = new Vector3();
      resolveTargetSize(out, mesh);

      deformFirstVertex(mesh);
      resolveTargetSize(out, mesh);

      expect(out.x).toBeCloseTo(2, 5);
    });

    it('true: recomputes every call, picking up the same deformation', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));
      const out = new Vector3();
      resolveTargetSize(out, mesh, undefined, undefined, true);

      deformFirstVertex(mesh);
      resolveTargetSize(out, mesh, undefined, undefined, true);

      expect(out.x).toBeGreaterThan(5);
    });
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
