import { vec3 } from 'math';
import type { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createCameraState } from '../../src/core/CameraState';
import { CameraFrustumHelperThree } from '../../src/three/CameraFrustumHelperThree';

describe('CameraFrustumHelperThree', () => {
  it('follows the state, with far cut to maxDistance', () => {
    const helper = new CameraFrustumHelperThree(2);
    const state = createCameraState();
    vec3.set(state.position, 1, 2, 3);
    state.fov = 35;
    state.far = 1000;
    helper.sync(state, 1.5);

    const camera = helper.camera as PerspectiveCamera;
    expect(camera.position.toArray()).toEqual([1, 2, 3]);
    expect(camera.fov).toBe(35);
    expect(camera.far).toBe(2);
    expect(camera.aspect).toBe(1.5);
  });

  it('redraws only when the pose or lens changed', () => {
    const helper = new CameraFrustumHelperThree();
    const update = vi.spyOn(helper, 'update');
    const state = createCameraState();

    helper.sync(state, 1);
    helper.sync(state, 1);
    expect(update).toHaveBeenCalledTimes(1);

    state.position[0] = 5;
    helper.sync(state, 1);
    helper.sync(state, 2);
    expect(update).toHaveBeenCalledTimes(3);
  });
});
