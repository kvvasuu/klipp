import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BlendHints } from '../../src/core/blend/BlendHints';
import { LensExtension } from '../../src/core/extension/LensExtension';
import { Klipp } from '../../src/three/Klipp';
import { HardLookAtAim } from '../../src/three/aim/HardLookAtAim';
import { FollowBody } from '../../src/three/body/FollowBody';
import { HardLockToTargetBody } from '../../src/three/body/HardLockToTargetBody';
import { PositionComposerBody } from '../../src/three/body/PositionComposerBody';
import { GroupFramingExtension } from '../../src/three/extension/GroupFramingExtension';
import { TargetGroup } from '../../src/three/extension/TargetGroup';

const setup = () => {
  const klipp = new Klipp(new PerspectiveCamera());
  return { klipp, camera: klipp.addCamera('a', { priority: 10 }) };
};

describe('VirtualCamera', () => {
  it('runs its Body, Aim, Extensions and Noise every frame, and stops running a removed one', () => {
    const { klipp, camera } = setup();
    camera.body = new HardLockToTargetBody([1, 2, 3]);
    camera.aim = new HardLookAtAim([1, 2, -10]);
    const removeLens = camera.addExtension(new LensExtension({ fov: 30 }));
    const noise = vi.fn();
    const removeNoise = camera.addNoise({ update: noise });

    klipp.update(0.1);
    expect(camera.state.position).toEqual([1, 2, 3]);
    expect(camera.state.fov).toBe(30);
    expect(noise).toHaveBeenCalledOnce();

    removeLens();
    removeNoise();
    camera.state.fov = 50;
    klipp.update(0.1);
    expect(camera.state.fov).toBe(50);
    expect(noise).toHaveBeenCalledOnce();
  });

  it('replaces its Body through the property, and warns only when a second one is added with setBody', () => {
    const { klipp, camera } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    camera.body = new HardLockToTargetBody([1, 0, 0]);
    camera.body = new HardLockToTargetBody([2, 0, 0]);
    expect(warn).not.toHaveBeenCalled();

    const removeFirst = camera.setBody(new HardLockToTargetBody([3, 0, 0]));
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();

    removeFirst();
    expect(camera.body).toBeNull();
    klipp.update(0.1);
    expect(camera.state.position).toEqual([0, 0, 0]);
  });

  it('a removed Body that was already replaced leaves the new one in place', () => {
    const { klipp, camera } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const removeOld = camera.setBody(new HardLockToTargetBody([1, 0, 0]));
    camera.setBody(new HardLockToTargetBody([2, 0, 0]));
    warn.mockRestore();

    removeOld();
    klipp.update(0.1);
    expect(camera.state.position).toEqual([2, 0, 0]);
  });

  it('starts from the real camera, or from initialState, and eases its pieces in from there', () => {
    const real = new PerspectiveCamera(35);
    real.position.set(0, 0, 40);
    const klipp = new Klipp(real);
    expect(klipp.addCamera('plain').state.fov).toBe(35);

    const camera = klipp.addCamera('seeded', { initialState: { position: [0, 0, 100] } });
    expect(camera.state.position).toEqual([0, 0, 100]);
    camera.body = new FollowBody(new Vector3(0, 0, 0), { offset: [0, 0, 10], damping: 0.5 });
    klipp.update(0.016);
    expect(camera.state.position[2]).toBeLessThan(100);
    expect(camera.state.position[2]).toBeGreaterThan(10);
  });

  it('turning active back on starts it fresh, like a first activation', () => {
    const target = new Vector3(0, 0, 0);
    const { klipp, camera } = setup();
    camera.body = new HardLockToTargetBody(target, { damping: 0.5 });
    klipp.update(0.1);
    target.set(10, 0, 0);
    klipp.update(0.1);

    camera.active = false;
    target.set(-20, 0, 0);
    klipp.update(0.1);
    expect(camera.state.position[0]).toBeGreaterThan(0); // not updated while inactive
    camera.active = true;
    klipp.update(0.1);

    expect(camera.state.position).toEqual([-20, 0, 0]);
  });

  it('priority, hints and name reach the core while registered', () => {
    const { klipp, camera } = setup();
    const other = klipp.addCamera('b', { priority: 5 });
    klipp.update(0.1);
    expect(klipp.activeCameraId).toBe('a');

    camera.hints = BlendHints.sphericalPosition;
    expect(klipp.state.cameras.get('a')!.hints).toBe(BlendHints.sphericalPosition);

    other.priority = 20;
    expect(klipp.activeCameraId).toBe('b');
    other.name = 'renamed';
    expect(klipp.activeCameraId).toBe('renamed');
  });

  it('passes the viewport size on to pieces that frame by it', () => {
    const { klipp, camera } = setup();
    const body = new PositionComposerBody(new Vector3(0, 0, -10));
    const extension = new GroupFramingExtension(new TargetGroup([{ target: new Vector3(), radius: 1 }]));
    camera.body = body;
    camera.addExtension(extension);
    klipp.setSize(800, 400);
    klipp.update(0.1);

    expect(body.aspect).toBe(2);
    expect([extension.viewportWidth, extension.viewportHeight]).toEqual([800, 400]);
  });

  describe('target slots', () => {
    it('shares one slot between pieces reading the same object, and none for fixed points', () => {
      const { klipp, camera } = setup();
      const player = new Object3D();
      const body = new FollowBody(player);
      const aim = new HardLookAtAim(player);
      camera.body = body;
      camera.aim = aim;
      klipp.update(0.1);

      expect(body.targetSlot).not.toBeNull();
      expect(aim.targetSlot).toBe(body.targetSlot);
      body.target = [1, 2, 3];
      klipp.update(0.1);
      expect(body.targetSlot).toBeNull();
    });

    it('moves to the new slot when a target changes, and releases slots of removed pieces', () => {
      const { klipp, camera } = setup();
      const a = new Object3D();
      const b = new Object3D();
      const body = new FollowBody(a);
      camera.body = body;
      klipp.update(0.1);

      body.target = b;
      klipp.update(0.1);
      expect(body.targetSlot).toBe(klipp.targets.acquire(b));
      klipp.targets.release(b);
      expect(klipp.targets.has(a)).toBe(false);

      camera.body = null;
      klipp.update(0.1);
      expect(klipp.targets.has(b)).toBe(false);
    });

    it('keeps group member slots while the members stay the same, even in a new array', () => {
      const { klipp, camera } = setup();
      const a = new Object3D();
      const group = new TargetGroup([{ target: a }, { target: [1, 2, 3] }]);
      camera.addExtension(new GroupFramingExtension(group));
      klipp.update(0.1);
      const slots = group.memberSlots;
      expect([...slots.keys()]).toEqual([a]);

      group.members = [{ target: a, radius: 2 }, { target: [1, 2, 3] }];
      klipp.update(0.1);
      expect(group.memberSlots).toBe(slots);
    });
  });
});
