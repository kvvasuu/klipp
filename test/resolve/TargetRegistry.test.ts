import { Object3D, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TargetRegistry } from '../../src/resolve/TargetRegistry';

function nestedTarget(): Object3D {
  const root = new Object3D();
  const middle = new Object3D();
  const leaf = new Object3D();
  root.add(middle);
  middle.add(leaf);
  root.position.set(1, 2, 3);
  root.rotation.set(0.3, -0.7, 0.1);
  middle.position.set(0.5, 0, -2);
  middle.scale.set(2, 1.5, 0.5);
  leaf.position.set(0.1, 0.2, 0.3);
  leaf.rotation.set(-0.2, 0.4, 0.9);
  return leaf;
}

describe('TargetRegistry', () => {
  it('returns the same slot for the same target', () => {
    const registry = new TargetRegistry();
    const target = new Object3D();

    expect(registry.acquire(target)).toBe(registry.acquire(target));
    expect(registry.acquire(new Object3D())).not.toBe(registry.acquire(target));
  });

  it('matches getWorldPosition/Quaternion/Scale exactly', () => {
    const registry = new TargetRegistry();
    const target = nestedTarget();
    const slot = registry.acquire(target);

    registry.refresh();

    expect(slot.valid).toBe(true);
    expect(slot.position).toEqual(target.getWorldPosition(new Vector3()).toArray());
    expect(slot.rotation).toEqual(target.getWorldQuaternion(new Quaternion()).toArray());
    expect(slot.scale).toEqual(target.getWorldScale(new Vector3()).toArray());
  });

  it('follows a moving target on every refresh', () => {
    const registry = new TargetRegistry();
    const target = new Object3D();
    const slot = registry.acquire(target);

    registry.refresh();
    target.position.set(4, 5, 6);
    registry.refresh();

    expect(slot.position).toEqual([4, 5, 6]);
  });

  it('keeps an entry while any reader holds it and drops it on the next refresh after the last release', () => {
    const registry = new TargetRegistry();
    const target = new Object3D();
    registry.acquire(target);
    registry.acquire(target);

    registry.release(target);
    registry.refresh();
    expect(registry.has(target)).toBe(true);

    registry.release(target);
    expect(registry.has(target)).toBe(true); // dropped lazily
    registry.refresh();
    expect(registry.has(target)).toBe(false);
  });

  it('a re-acquire before the next refresh keeps the same slot (StrictMode double effects)', () => {
    const registry = new TargetRegistry();
    const target = new Object3D();
    const slot = registry.acquire(target);

    registry.release(target);
    expect(registry.acquire(target)).toBe(slot);
    registry.refresh();
    expect(registry.has(target)).toBe(true);
  });

  it('reads a ref fresh every frame and marks the slot invalid while it is empty', () => {
    const registry = new TargetRegistry();
    const ref: { current: Object3D | null } = { current: null };
    const slot = registry.acquire(ref);

    registry.refresh();
    expect(slot.valid).toBe(false);

    const object = new Object3D();
    object.position.set(7, 8, 9);
    ref.current = object;
    registry.refresh();
    expect(slot.valid).toBe(true);
    expect(slot.position).toEqual([7, 8, 9]);

    ref.current = null;
    registry.refresh();
    expect(slot.valid).toBe(false);
  });

  it('ignores a release without a matching acquire', () => {
    const registry = new TargetRegistry();
    const target = new Object3D();
    registry.release(target);
    registry.acquire(target);
    registry.release(target);
    registry.release(target);

    expect(registry.acquire(target)).toBeDefined();
    registry.refresh();
    expect(registry.has(target)).toBe(true);
  });
});
