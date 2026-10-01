import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Klipp } from '../../src/three/Klipp';
import { HardLookAtAim } from '../../src/three/aim/HardLookAtAim';
import { FollowBody } from '../../src/three/body/FollowBody';
import { GroupFramingExtension } from '../../src/three/extension/GroupFramingExtension';
import { TargetGroup } from '../../src/three/extension/TargetGroup';

const setup = () => {
  const klipp = new Klipp(new PerspectiveCamera());
  return { klipp, camera: klipp.addCamera('a', { priority: 10 }) };
};

describe('VirtualCamera', () => {
  it('starts from the real camera, takes initialState in three.js shorthand, and eases its pieces in from there', () => {
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

    it('releases its slots when the camera is removed, and takes them again when it is added back', () => {
      const { klipp, camera } = setup();
      const player = new Object3D();
      const body = new FollowBody(player);
      camera.body = body;
      klipp.update(0.1);

      klipp.remove(camera);
      klipp.update(0.1);
      expect(klipp.targets.has(player)).toBe(false);

      klipp.add(camera);
      klipp.update(0.1);
      expect(body.targetSlot).not.toBeNull();
      expect(klipp.targets.has(player)).toBe(true);
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
