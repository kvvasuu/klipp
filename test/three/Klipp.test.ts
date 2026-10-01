import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { LensExtension } from '../../src/core/extension/LensExtension';
import { Klipp } from '../../src/three/Klipp';
import { HardLookAtAim } from '../../src/three/aim/HardLookAtAim';
import { HardLockToTargetBody } from '../../src/three/body/HardLockToTargetBody';

function scene(options?: ConstructorParameters<typeof Klipp>[1]) {
  const camera = new PerspectiveCamera(50);
  const klipp = new Klipp(camera, { defaultBlend: { curve: BlendCurves.linear, time: 1 }, ...options });
  const left = klipp.addCamera('left', { priority: 10 });
  left.body = new HardLockToTargetBody([-10, 0, 0]);
  const right = klipp.addCamera('right', { priority: 0 });
  right.body = new HardLockToTargetBody([10, 0, 0]);
  return { camera, klipp, left, right };
}

describe('Klipp', () => {
  it('drives the camera from the winning shot and blends to a new winner', () => {
    const { camera, klipp, right } = scene();
    right.aim = new HardLookAtAim([10, 0, -10]);
    right.addExtension(new LensExtension({ fov: 30 }));
    klipp.update(0.1);
    expect(camera.position.x).toBe(-10);

    right.priority = 20;
    klipp.update(0.5);
    expect(camera.position.x).toBeCloseTo(0, 5);
    klipp.update(0.5);
    expect(camera.position.x).toBe(10);
    expect(camera.fov).toBe(30);
  });

  it('update returns true only while something moves or the camera changed', () => {
    const { klipp, right } = scene();
    expect(klipp.update(0.1)).toBe(true); // first write
    expect(klipp.update(0.1)).toBe(false);

    right.priority = 20;
    expect(klipp.update(0.1)).toBe(true);
    for (let i = 0; i < 20; i++) klipp.update(0.1);
    expect(klipp.update(0.1)).toBe(false);
  });

  it('leaves the camera alone until a virtual camera goes live', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const klipp = new Klipp(camera);
    const shot = klipp.addCamera('a', { active: false });
    shot.body = new HardLockToTargetBody([5, 0, 0]);
    klipp.update(0.1);
    expect(camera.position.toArray()).toEqual([1, 2, 3]);

    shot.active = true;
    klipp.update(0.1);
    expect(camera.position.toArray()).toEqual([5, 0, 0]);
  });

  it('standby keeps cameras updating without writing the camera, and disabled stops everything', () => {
    for (const mode of ['standby', 'disabled'] as const) {
      const { camera, klipp, left } = scene({ mode });
      klipp.update(0.1);
      expect(camera.position.x).toBe(0);
      expect(left.state.position[0]).toBe(mode === 'standby' ? -10 : 0);
    }
  });

  it('runs registered updates before the cameras, and stops them once removed', () => {
    const { klipp, left } = scene();
    const order: string[] = [];
    const stop = klipp.registerUpdate(() => void order.push('update'));
    left.addNoise({ update: () => void order.push('camera') });
    klipp.update(0.1);
    stop();
    klipp.update(0.1);

    expect(order).toEqual(['update', 'camera', 'camera']);
  });

  it('a removed camera leaves the arbitration', () => {
    const { klipp, left } = scene();
    klipp.update(0.1);
    klipp.remove(left);
    klipp.update(0.1);
    expect(klipp.activeCameraId).toBe('right');
  });
});
