import { vec3, vec4 } from 'math';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { copyCameraState, createCameraState, mergeCameraState, type CameraState } from '../src/CameraState';
import { applyCameraState, copyCameraStateFromCamera } from '../src/three/camera';
import { toQuaternion, toTuple, toVector3 } from './tuples';

describe('copyCameraState', () => {
  it('copies values into "out" without replacing its Vector3/Quaternion instances', () => {
    const source: CameraState = {
      position: [1, 2, 3],
      quaternion: toTuple(new Quaternion(0.1, 0.2, 0.3, 0.9).normalize()),
      fov: 50,
      near: 0.1,
      far: 1000,
      viewOffset: [40, -20],
      target: [4, 5, 6],
      hasTarget: true,
      lookAtTarget: [7, 8, 9],
      hasLookAtTarget: true,
      referenceUp: toTuple(new Vector3(0.1, 0.9, 0.2).normalize()),
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
    expect(toVector3(out.position).equals(toVector3(source.position))).toBe(true);
    expect(toQuaternion(out.quaternion).equals(toQuaternion(source.quaternion))).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffset).toEqual([40, -20]);
    expect(toVector3(out.target).equals(toVector3(source.target))).toBe(true);
    expect(out.hasTarget).toBe(true);
    expect(toVector3(out.lookAtTarget).equals(toVector3(source.lookAtTarget))).toBe(true);
    expect(out.hasLookAtTarget).toBe(true);
    expect(toVector3(out.referenceUp).equals(toVector3(source.referenceUp))).toBe(true);
  });

  it('stays unchanged after the source is mutated — the actual "freeze" guarantee', () => {
    const source: CameraState = {
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
      fov: 50,
      near: 0.1,
      far: 1000,
      viewOffset: [40, -20],
      target: [4, 5, 6],
      hasTarget: true,
      lookAtTarget: [7, 8, 9],
      hasLookAtTarget: true,
      referenceUp: [0, 1, 0],
    };
    const out = createCameraState();
    copyCameraState(out, source);

    vec3.set(source.position, 99, 99, 99);
    vec4.set(source.quaternion, 0.5, 0.5, 0.5, 0.5);
    source.fov = 10;
    source.viewOffset[0] = 999;

    expect(toVector3(out.position).equals(new Vector3(1, 2, 3))).toBe(true);
    expect(toQuaternion(out.quaternion).equals(new Quaternion())).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffset).toEqual([40, -20]);
  });

  it('is safe when out and source are the same object (no-op)', () => {
    const state = createCameraState();
    vec3.set(state.position, 1, 2, 3);
    expect(() => copyCameraState(state, state)).not.toThrow();
    expect(toVector3(state.position).equals(new Vector3(1, 2, 3))).toBe(true);
  });
});

describe('mergeCameraState', () => {
  it('overwrites only the fields present in "partial", leaving the rest untouched', () => {
    const out = createCameraState();
    out.fov = 50;
    out.near = 0.1;

    const returned = mergeCameraState(out, { position: [5, 20, 5], fov: 90 });

    expect(returned).toBe(out);
    expect(toVector3(out.position).equals(new Vector3(5, 20, 5))).toBe(true);
    expect(out.fov).toBe(90);
    expect(out.near).toBe(0.1); // untouched
  });

  it('overwrites referenceUp when present in "partial"', () => {
    const out = createCameraState();

    mergeCameraState(out, { referenceUp: [1, 0, 0] });

    expect(toVector3(out.referenceUp).equals(new Vector3(1, 0, 0))).toBe(true);
  });

  it(".copy()s Vector3/Quaternion fields instead of aliasing the caller's own instance", () => {
    const out = createCameraState();
    const outPosition = out.position;
    const callerPosition = new Vector3(1, 2, 3);

    mergeCameraState(out, { position: toTuple(callerPosition) });

    expect(out.position).toBe(outPosition); // same instance, mutated in place
    expect(out.position).not.toBe(callerPosition);

    callerPosition.set(99, 99, 99);
    expect(toVector3(out.position).equals(new Vector3(1, 2, 3))).toBe(true); // unaffected by the caller's own mutation
  });

  it("copies viewOffset element-wise instead of aliasing the caller's own array", () => {
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
    vec3.set(out.position, 1, 2, 3);
    out.fov = 70;

    mergeCameraState(out, {});

    expect(toVector3(out.position).equals(new Vector3(1, 2, 3))).toBe(true);
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

    expect(toVector3(out.position).equals(camera.position)).toBe(true);
    expect(toQuaternion(out.quaternion).equals(camera.quaternion)).toBe(true);
    expect(out.fov).toBe(60);
    expect(out.near).toBe(0.5);
    expect(out.far).toBe(500);
  });

  it('normalizes an active setViewOffset back to viewOffset\'s [-1, 1]-ish convention, X negated (real bug: raw offsetX shifts a fixed point LEFT for a positive value, backwards from screenPosition\'s "+X = right")', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    camera.setViewOffset(800, 600, 80, -60, 800, 600);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);

    expect(out.viewOffset).toEqual([-0.2, -0.2]); // -80 / (800 / 2), -60 / (600 / 2) - Y unchanged, already agreed
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

  it('resets referenceUp to world up - a real camera has no opinion on it', () => {
    const camera = new PerspectiveCamera(60, 1, 0.5, 500);
    const out = createCameraState();
    vec3.set(out.referenceUp, 1, 0, 0);

    copyCameraStateFromCamera(out, camera);

    expect(toVector3(out.referenceUp).equals(new Vector3(0, 1, 0))).toBe(true);
  });

  it('the snapshot is independent of the camera going on to move — freezable mid-blend', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(1, 1, 1);

    const out = createCameraState();
    copyCameraStateFromCamera(out, camera);
    camera.position.set(50, 50, 50);
    camera.fov = 90;

    expect(toVector3(out.position).equals(new Vector3(1, 1, 1))).toBe(true);
    expect(out.fov).toBe(50);
  });
});

describe('applyCameraState', () => {
  it('writes position/quaternion/fov/near/far from "state" onto a real camera', () => {
    const state: CameraState = {
      position: [3, 4, 5],
      quaternion: toTuple(new Quaternion(0.1, 0.2, 0.3, 0.9).normalize()),
      fov: 60,
      near: 0.5,
      far: 500,
      viewOffset: [0, 0],
    };
    const camera = new PerspectiveCamera();

    applyCameraState(camera, state, 800, 600);

    expect(camera.position.equals(toVector3(state.position))).toBe(true);
    expect(camera.quaternion.equals(toQuaternion(state.quaternion))).toBe(true);
    expect(camera.fov).toBe(60);
    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(500);
  });

  it('round-trips through copyCameraStateFromCamera unchanged', () => {
    const state = createCameraState();
    vec3.set(state.position, 1, 2, 3);
    new Quaternion(0.1, 0.2, 0.3, 0.9).normalize().toArray(state.quaternion);
    state.fov = 70;
    state.viewOffset[0] = 0.5;
    state.viewOffset[1] = -0.25;

    const camera = new PerspectiveCamera();
    applyCameraState(camera, state, 800, 600);

    const readBack = createCameraState();
    copyCameraStateFromCamera(readBack, camera);

    expect(toVector3(readBack.position).equals(toVector3(state.position))).toBe(true);
    expect(toQuaternion(readBack.quaternion).equals(toQuaternion(state.quaternion))).toBe(true);
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

  it("a positive viewOffset[0] visually shifts a fixed point toward the RIGHT of the frame, matching screenPosition's convention (real bug: raw setViewOffset does the opposite)", () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 1000);
    const state = createCameraState(); // default position (0,0,0), identity rotation - facing -Z
    state.viewOffset[0] = 0.3;

    applyCameraState(camera, state, 800, 600);
    camera.updateMatrixWorld(true);

    const projected = new Vector3(0, 0, -10).project(camera); // dead ahead
    expect(projected.x).toBeGreaterThan(0);
  });
});
