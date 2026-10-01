import { vec3 } from 'math';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/core/CameraState';
import { applyCameraState, copyCameraStateFromCamera } from '../../src/three/camera';
import { toQuaternion, toVector3 } from '../tuples';

describe('copyCameraStateFromCamera', () => {
  it('copies transform and lens, and clears what a real camera has no opinion on', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.position.set(3, 4, 5);
    camera.lookAt(0, 0, 0);
    const out = createCameraState();
    Object.assign(out, { hasTarget: true, hasLookAtTarget: true });
    vec3.set(out.referenceUp, 1, 0, 0);

    copyCameraStateFromCamera(out, camera);
    camera.position.set(50, 50, 50);

    expect(out.position).toEqual([3, 4, 5]);
    expect(toQuaternion(out.quaternion).equals(camera.quaternion)).toBe(true);
    expect(out).toMatchObject({ fov: 60, near: 0.5, far: 500, hasTarget: false, hasLookAtTarget: false });
    expect(out.referenceUp).toEqual([0, 1, 0]);
  });

  it("reads viewOffset in screenPosition's convention, +X right (real bug: three's offsetX points left), and as zero once cleared", () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    const read = () => [...copyCameraStateFromCamera(createCameraState(), camera).viewOffset];

    expect(read()).toEqual([0, 0]);
    camera.setViewOffset(800, 600, 80, -60, 800, 600);
    expect(read()).toEqual([-0.2, -0.2]);
    camera.clearViewOffset();
    expect(read()).toEqual([0, 0]);
  });
});

describe('applyCameraState', () => {
  it('writes transform and lens, and updates the projection matrix', () => {
    const state = createCameraState();
    vec3.set(state.position, 3, 4, 5);
    new Quaternion(0.1, 0.2, 0.3, 0.9).normalize().toArray(state.quaternion);
    Object.assign(state, { fov: 90, near: 0.5, far: 500 });
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    const projection = camera.projectionMatrix.clone();

    applyCameraState(camera, state, 800, 600);

    expect(camera.position.equals(toVector3(state.position))).toBe(true);
    expect(camera.quaternion.equals(toQuaternion(state.quaternion))).toBe(true);
    expect([camera.fov, camera.near, camera.far]).toEqual([90, 0.5, 500]);
    expect(camera.projectionMatrix.equals(projection)).toBe(false);
  });

  it('a positive viewOffset[0] shifts the frame so a point ahead lands right of center (real bug: raw setViewOffset does the opposite), and [0, 0] clears it', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    const state = createCameraState();
    state.viewOffset[0] = 0.3;

    applyCameraState(camera, state, 800, 600);
    camera.updateMatrixWorld(true);
    expect(new Vector3(0, 0, -10).project(camera).x).toBeGreaterThan(0);

    state.viewOffset[0] = 0;
    applyCameraState(camera, state, 800, 600);
    expect(camera.view?.enabled).toBe(false);
  });

  it('round-trips through copyCameraStateFromCamera', () => {
    const state = createCameraState();
    vec3.set(state.position, 1, 2, 3);
    new Quaternion(0.1, 0.2, 0.3, 0.9).normalize().toArray(state.quaternion);
    state.fov = 70;
    state.viewOffset[0] = 0.5;
    state.viewOffset[1] = -0.25;
    const camera = new PerspectiveCamera();

    applyCameraState(camera, state, 800, 600);
    const readBack = copyCameraStateFromCamera(createCameraState(), camera);

    expect(readBack.position).toEqual([1, 2, 3]);
    expect(toQuaternion(readBack.quaternion).equals(toQuaternion(state.quaternion))).toBe(true);
    expect(readBack.fov).toBe(70);
    expect(readBack.viewOffset).toEqual([0.5, -0.25]);
  });
});
