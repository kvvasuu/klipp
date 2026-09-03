import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyCameraState,
  copyCameraState,
  copyCameraStateFromCamera,
  createCameraState,
  type CameraState,
} from '../src/CameraState';

describe('copyCameraState', () => {
  it('copies values into "out" without replacing its Vector3/Quaternion instances', () => {
    const source: CameraState = {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(0.1, 0.2, 0.3, 0.9).normalize(),
      fov: 50,
      near: 0.1,
      far: 1000,
      viewOffsetX: 40,
      viewOffsetY: -20,
      target: new Vector3(4, 5, 6),
      hasTarget: true,
      lookAtTarget: new Vector3(7, 8, 9),
      hasLookAtTarget: true,
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
    expect(out.viewOffsetX).toBe(40);
    expect(out.viewOffsetY).toBe(-20);
    expect(out.target.equals(source.target)).toBe(true);
    expect(out.hasTarget).toBe(true);
    expect(out.lookAtTarget.equals(source.lookAtTarget)).toBe(true);
    expect(out.hasLookAtTarget).toBe(true);
  });

  it('stays unchanged after the source is mutated — the actual "freeze" guarantee', () => {
    const source: CameraState = {
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(),
      fov: 50,
      near: 0.1,
      far: 1000,
      viewOffsetX: 40,
      viewOffsetY: -20,
      target: new Vector3(4, 5, 6),
      hasTarget: true,
      lookAtTarget: new Vector3(7, 8, 9),
      hasLookAtTarget: true,
    };
    const out = createCameraState();
    copyCameraState(out, source);

    source.position.set(99, 99, 99);
    source.quaternion.set(0.5, 0.5, 0.5, 0.5);
    source.fov = 10;
    source.viewOffsetX = 999;

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
    expect(out.quaternion.equals(new Quaternion())).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffsetX).toBe(40);
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

  it('reads an active setViewOffset from the camera, in the SAME sign convention setViewOffset takes', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.setViewOffset(800, 600, 40, -20, 800, 600);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffsetX).toBe(40);
    expect(out.viewOffsetY).toBe(-20);
  });

  it('viewOffsetX/Y default to 0 when no view offset is active', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffsetX).toBe(0);
    expect(out.viewOffsetY).toBe(0);
  });

  it('viewOffsetX/Y read as 0 after clearViewOffset, even though camera.view still exists', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.setViewOffset(800, 600, 40, -20, 800, 600);
    camera.clearViewOffset();

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffsetX).toBe(0);
    expect(out.viewOffsetY).toBe(0);
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

describe('applyCameraState', () => {
  it('writes position/quaternion/fov/near/far from "state" onto a real camera', () => {
    const state: CameraState = {
      position: new Vector3(3, 4, 5),
      quaternion: new Quaternion(0.1, 0.2, 0.3, 0.9).normalize(),
      fov: 60,
      near: 0.5,
      far: 500,
      viewOffsetX: 0,
      viewOffsetY: 0,
    };
    const camera = new PerspectiveCamera();

    applyCameraState(camera, state, 800, 600);

    expect(camera.position.equals(state.position)).toBe(true);
    expect(camera.quaternion.equals(state.quaternion)).toBe(true);
    expect(camera.fov).toBe(60);
    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(500);
  });

  it('round-trips through copyCameraStateFromCamera unchanged', () => {
    const state = createCameraState();
    state.position.set(1, 2, 3);
    state.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    state.fov = 70;
    state.viewOffsetX = 40;
    state.viewOffsetY = -20;

    const camera = new PerspectiveCamera();
    applyCameraState(camera, state, 800, 600);

    const readBack = createCameraState();
    copyCameraStateFromCamera(readBack, camera);

    expect(readBack.position.equals(state.position)).toBe(true);
    expect(readBack.quaternion.equals(state.quaternion)).toBe(true);
    expect(readBack.fov).toBe(70);
    expect(readBack.viewOffsetX).toBe(40);
    expect(readBack.viewOffsetY).toBe(-20);
  });

  it('calls clearViewOffset when viewOffsetX/Y are both 0, even if a previous call had set one', () => {
    const state = createCameraState();
    const camera = new PerspectiveCamera();
    camera.setViewOffset(800, 600, 40, -20, 800, 600);

    applyCameraState(camera, state, 800, 600);

    expect(camera.view?.enabled).toBe(false);
  });

  it('updates the projection matrix so fov changes take effect immediately', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    const before = camera.projectionMatrix.clone();

    const state = createCameraState();
    state.fov = 90;
    applyCameraState(camera, state, 800, 600);

    expect(camera.projectionMatrix.equals(before)).toBe(false);
  });
});
