import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { copyCameraState, copyCameraStateFromCamera, createCameraState, type CameraState } from '../src/CameraState';

describe('copyCameraState', () => {
  it('copies values into "out" without replacing its Vector3/Quaternion instances', () => {
    const source: CameraState = {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(0.1, 0.2, 0.3, 0.9).normalize(),
      fov: 50,
      near: 0.1,
      far: 1000,
    };
    const out = createCameraState();
    const outPosition = out.position;
    const outQuaternion = out.quaternion;

    const returned = copyCameraState(out, source);

    expect(returned).toBe(out);
    expect(out.position).toBe(outPosition); // same instance, mutated in place — no allocation
    expect(out.quaternion).toBe(outQuaternion);
    expect(out.position.equals(source.position)).toBe(true);
    expect(out.quaternion.equals(source.quaternion)).toBe(true);
    expect(out.fov).toBe(50);
  });

  it('stays unchanged after the source is mutated — the actual "freeze" guarantee', () => {
    const source: CameraState = {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(),
      fov: 50,
      near: 0.1,
      far: 1000,
    };
    const out = createCameraState();
    copyCameraState(out, source);

    source.position.set(99, 99, 99);
    source.quaternion.set(0.5, 0.5, 0.5, 0.5);
    source.fov = 10;

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
    expect(out.quaternion.equals(new Quaternion())).toBe(true);
    expect(out.fov).toBe(50);
  });

  it('is safe when out and source are the same object (no-op)', () => {
    const state = createCameraState();
    state.position.set(1, 2, 3);
    expect(() => copyCameraState(state, state)).not.toThrow();
    expect(state.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });
});

describe('copyCameraStateFromCamera', () => {
  it('reads position/quaternion/fov/near/far from a live camera into "out"', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.position.set(3, 4, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.position.equals(camera.position)).toBe(true);
    expect(out.quaternion.equals(camera.quaternion)).toBe(true);
    expect(out.fov).toBe(60);
    expect(out.near).toBe(0.5);
    expect(out.far).toBe(500);
  });

  it('the snapshot is independent of the camera going on to move — freezable mid-blend', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(1, 1, 1);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);
    camera.position.set(50, 50, 50);
    camera.fov = 90;

    expect(out.position.equals(new Vector3(1, 1, 1))).toBe(true);
    expect(out.fov).toBe(50);
  });
});
