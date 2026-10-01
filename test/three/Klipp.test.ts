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
  it('drives a PerspectiveCamera from the winning shot, lens included, and blends to a new winner', () => {
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

  it('writes the view offset in pixels of the size it was given', () => {
    const camera = new PerspectiveCamera();
    const klipp = new Klipp(camera);
    klipp.setSize(1280, 800);
    klipp.addCamera('a').addExtension({
      update: (out) => {
        out.viewOffset[0] = 0.5;
        out.viewOffset[1] = -0.3;
      },
    });
    klipp.update(0.1);

    expect(camera.view).toMatchObject({ enabled: true, offsetX: -320, offsetY: -120 });
  });

  it("a new Klipp on the same camera starts from the camera's original pose, not the last shot (real bug: switching scenes carried it over)", () => {
    const camera = new PerspectiveCamera();
    camera.position.set(1, 2, 3);
    const first = new Klipp(camera);
    first.addCamera('a').body = new HardLockToTargetBody([10, 20, 30]);
    first.update(0.1);
    expect(camera.position.toArray()).toEqual([10, 20, 30]);

    expect(new Klipp(camera).addCamera('b').state.position).toEqual([1, 2, 3]);
  });
});
