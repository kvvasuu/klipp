import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyCameraState,
  copyCameraState,
  copyCameraStateFromCamera,
  createCameraState,
  mergeCameraState,
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
      viewOffset: [40, -20],
      target: new Vector3(4, 5, 6),
      hasTarget: true,
      lookAtTarget: new Vector3(7, 8, 9),
      hasLookAtTarget: true,
    };
    const out = createCameraState();
    const outPosition = out.position;
    const outQuaternion = out.quaternion;
    const outViewOffset = out.viewOffset;

    const returned = copyCameraState(out, source);

    expect(returned).toBe(out);
    expect(out.position).toBe(outPosition); // same instance, mutated in place — no allocation
    expect(out.quaternion).toBe(outQuaternion);
    expect(out.viewOffset).toBe(outViewOffset); // same array, mutated element-wise — no allocation
    expect(out.position.equals(source.position)).toBe(true);
    expect(out.quaternion.equals(source.quaternion)).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffset).toEqual([40, -20]);
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
      viewOffset: [40, -20],
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
    source.viewOffset[0] = 999;

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
    expect(out.quaternion.equals(new Quaternion())).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffset).toEqual([40, -20]);
  });

  it('is safe when out and source are the same object (no-op)', () => {
    const state = createCameraState();
    state.position.set(1, 2, 3);
    expect(() => copyCameraState(state, state)).not.toThrow();
    expect(state.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });
});

describe('mergeCameraState', () => {
  it('overwrites only the fields present in "partial", leaving the rest untouched', () => {
    const out = createCameraState();
    out.fov = 50;
    out.near = 0.1;

    const returned = mergeCameraState(out, { position: new Vector3(5, 20, 5), fov: 90 });

    expect(returned).toBe(out);
    expect(out.position.equals(new Vector3(5, 20, 5))).toBe(true);
    expect(out.fov).toBe(90);
    expect(out.near).toBe(0.1); // untouched
  });

  it('.copy()s Vector3/Quaternion fields instead of aliasing the caller\'s own instance', () => {
    const out = createCameraState();
    const outPosition = out.position;
    const callerPosition = new Vector3(1, 2, 3);

    mergeCameraState(out, { position: callerPosition });

    expect(out.position).toBe(outPosition); // same instance, mutated in place
    expect(out.position).not.toBe(callerPosition);

    callerPosition.set(99, 99, 99);
    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true); // unaffected by the caller's own mutation
  });

  it('copies viewOffset element-wise instead of aliasing the caller\'s own array', () => {
    const out = createCameraState();
    const outViewOffset = out.viewOffset;
    const callerViewOffset: [number, number] = [40, -20];

    mergeCameraState(out, { viewOffset: callerViewOffset });

    expect(out.viewOffset).toBe(outViewOffset); // same array, mutated in place
    expect(out.viewOffset).not.toBe(callerViewOffset);
    expect(out.viewOffset).toEqual([40, -20]);

    callerViewOffset[0] = 999;
    expect(out.viewOffset[0]).toBe(40); // unaffected by the caller's own mutation
  });

  it('an empty partial changes nothing', () => {
    const out = createCameraState();
    out.position.set(1, 2, 3);
    out.fov = 70;

    mergeCameraState(out, {});

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
    expect(out.fov).toBe(70);
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

  it('normalizes an active setViewOffset back to viewOffset\'s [-1, 1]-ish convention (same sign)', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.setViewOffset(800, 600, 80, -60, 800, 600);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffset).toEqual([0.2, -0.2]); // 80 / (800 / 2), -60 / (600 / 2)
  });

  it('viewOffset defaults to [0, 0] when no view offset is active', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffset).toEqual([0, 0]);
  });

  it('viewOffset reads as [0, 0] after clearViewOffset, even though camera.view still exists', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.setViewOffset(800, 600, 40, -20, 800, 600);
    camera.clearViewOffset();

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffset).toEqual([0, 0]);
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
      viewOffset: [0, 0],
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
    state.viewOffset[0] = 0.5;
    state.viewOffset[1] = -0.25;

    const camera = new PerspectiveCamera();
    applyCameraState(camera, state, 800, 600);

    const readBack = createCameraState();
    copyCameraStateFromCamera(readBack, camera);

    expect(readBack.position.equals(state.position)).toBe(true);
    expect(readBack.quaternion.equals(state.quaternion)).toBe(true);
    expect(readBack.fov).toBe(70);
    expect(readBack.viewOffset).toEqual([0.5, -0.25]);
  });

  it('calls clearViewOffset when viewOffset is [0, 0], even if a previous call had set one', () => {
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
