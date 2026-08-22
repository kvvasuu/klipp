import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { isVector3Like, resolveVector3 } from '../../src/resolve/resolveVector3';

describe('resolveVector3', () => {
  it('copies a Vector3 instance', () => {
    const out = new Vector3();
    resolveVector3(out, new Vector3(1, 2, 3));
    expect(out.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  it('sets from a 3-tuple array', () => {
    const out = new Vector3();
    resolveVector3(out, [4, 5, 6]);
    expect(out.equals(new Vector3(4, 5, 6))).toBe(true);
  });

  it('sets from a readonly 3-tuple array', () => {
    const out = new Vector3();
    resolveVector3(out, [7, 8, 9] as const);
    expect(out.equals(new Vector3(7, 8, 9))).toBe(true);
  });

  it('broadcasts a plain number to all three axes', () => {
    const out = new Vector3();
    resolveVector3(out, 5);
    expect(out.equals(new Vector3(5, 5, 5))).toBe(true);
  });

  it('writes into "out" without allocating (same Vector3 instance) and returns it', () => {
    const out = new Vector3();
    const returned = resolveVector3(out, [1, 2, 3]);
    expect(returned).toBe(out);
  });

  describe('isVector3Like', () => {
    it('is true for a Vector3 instance, an array, and a plain number', () => {
      expect(isVector3Like(new Vector3())).toBe(true);
      expect(isVector3Like([1, 2, 3])).toBe(true);
      expect(isVector3Like(5)).toBe(true);
    });

    it('is false for an Object3D-shaped value or a ref-like object', () => {
      expect(isVector3Like({ isObject3D: true })).toBe(false);
      expect(isVector3Like({ current: null })).toBe(false);
    });
  });
});
