import { BoxGeometry, BufferGeometry, Line, Mesh, Object3D, Points, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveTargetPosition, resolveTargetRotation, resolveTargetSize } from '../../../src/three/resolve/Target';

const unresolved = [null, undefined, { current: null }];

describe('resolveTargetPosition', () => {
  it('resolves every target form to a world position', () => {
    const parent = new Object3D();
    parent.position.set(10, 0, 0);
    const child = new Object3D();
    child.position.set(1, 2, 3);
    parent.add(child);

    const cases = [
      [new Vector3(1, 2, 3), [1, 2, 3]],
      [child, [11, 2, 3]],
      [{ current: child }, [11, 2, 3]],
      [
        [1, 2, 3],
        [1, 2, 3],
      ],
      [5, [5, 5, 5]],
    ] as const;

    for (const [target, expected] of cases) {
      const out = new Vector3();
      expect(resolveTargetPosition(out, target)).toBe(true);
      expect(out.toArray()).toEqual(expected);
    }
  });

  it('returns false and leaves "out" untouched for null, undefined or an empty ref', () => {
    for (const target of unresolved) {
      const out = new Vector3(9, 9, 9);
      expect(resolveTargetPosition(out, target)).toBe(false);
      expect(out.toArray()).toEqual([9, 9, 9]);
    }
  });
});

describe('resolveTargetSize', () => {
  it('reads the world-scaled bounding box of a Mesh, SkinnedMesh, Line or Points (real gap: Line and Points have no isMesh)', () => {
    const scaled = new Mesh(new BoxGeometry(2, 4, 6));
    scaled.scale.set(2, 1, 0.5);
    const lineGeometry = new BufferGeometry().setFromPoints([new Vector3(-1, 0, 0), new Vector3(1, 2, 3)]);
    const cases = [
      [new Mesh(new BoxGeometry(2, 4, 6)), [2, 4, 6]],
      [scaled, [4, 4, 3]],
      [new SkinnedMesh(new BoxGeometry(2, 4, 6)), [2, 4, 6]],
      [new Line(lineGeometry), [2, 2, 3]],
      [new Points(lineGeometry), [2, 2, 3]],
    ] as const;

    for (const [object, [x, y, z]] of cases) {
      const out = new Vector3();
      expect(resolveTargetSize(out, object)).toBe(true);
      expect(out.x).toBeCloseTo(x, 5);
      expect(out.y).toBeCloseTo(y, 5);
      expect(out.z).toBeCloseTo(z, 5);
    }
  });

  it('prefers an explicit size, and returns false without geometry or when only a radius is given', () => {
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    const out = new Vector3(9, 9, 9);

    expect(resolveTargetSize(out, new Object3D())).toBe(false);
    expect(resolveTargetSize(out, mesh, undefined, 5)).toBe(false);
    expect(out.toArray()).toEqual([9, 9, 9]);

    expect(resolveTargetSize(out, mesh, [10, 20, 30])).toBe(true);
    expect(out.toArray()).toEqual([10, 20, 30]);
  });

  it('caches the first bounding box, unless dynamicSize recomputes it every call', () => {
    // a raw vertex edit is the one change three.js never syncs into boundingBox, like a SkinnedMesh pose
    const deformedWidth = (dynamicSize: boolean) => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));
      const out = new Vector3();
      resolveTargetSize(out, mesh, undefined, undefined, dynamicSize);
      const position = mesh.geometry.attributes.position;
      position.setX(0, position.getX(0) * 10);
      position.needsUpdate = true;
      resolveTargetSize(out, mesh, undefined, undefined, dynamicSize);
      return out.x;
    };

    expect(deformedWidth(false)).toBeCloseTo(2, 5);
    expect(deformedWidth(true)).toBeGreaterThan(5);
  });
});

describe('resolveTargetRotation', () => {
  it('resolves an Object3D or a ref to it to its world rotation', () => {
    const parent = new Object3D();
    parent.rotation.set(0, Math.PI / 2, 0);
    const child = new Object3D();
    child.rotation.set(0, Math.PI / 4, 0);
    parent.add(child);
    const expected = new Quaternion().setFromEuler(child.rotation).premultiply(parent.quaternion);

    for (const target of [child, { current: child }]) {
      const out = new Quaternion();
      expect(resolveTargetRotation(out, target)).toBe(true);
      expect(out.angleTo(expected)).toBeLessThan(1e-6);
    }
  });

  it('returns false and leaves "out" untouched for points, null, undefined or an empty ref', () => {
    for (const target of [new Vector3(1, 2, 3), [1, 2, 3] as const, 5, ...unresolved]) {
      const out = new Quaternion(1, 2, 3, 4);
      expect(resolveTargetRotation(out, target)).toBe(false);
      expect(out.toArray()).toEqual([1, 2, 3, 4]);
    }
  });
});
