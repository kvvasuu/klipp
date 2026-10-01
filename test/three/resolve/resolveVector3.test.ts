import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { isVector3Like, resolveVector3 } from '../../../src/three/resolve/resolveVector3';

describe('resolveVector3', () => {
  it('resolves a Vector3, a tuple, or a number broadcast to all three axes', () => {
    expect(resolveVector3(new Vector3(), new Vector3(1, 2, 3)).toArray()).toEqual([1, 2, 3]);
    expect(resolveVector3(new Vector3(), [4, 5, 6]).toArray()).toEqual([4, 5, 6]);
    expect(resolveVector3(new Vector3(), 5).toArray()).toEqual([5, 5, 5]);
  });

  it('isVector3Like tells points from objects and refs', () => {
    expect([new Vector3(), [1, 2, 3], 5].map(isVector3Like)).toEqual([true, true, true]);
    expect([{ isObject3D: true }, { current: null }].map(isVector3Like)).toEqual([false, false]);
  });
});
