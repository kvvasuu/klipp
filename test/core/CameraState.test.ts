import { quat, vec3, vec4 } from 'math';
import { describe, expect, it } from 'vitest';
import { copyCameraState, createCameraState, mergeCameraState, type CameraState } from '../../src/core/CameraState';

describe('copyCameraState', () => {
  it('copies values into "out" without replacing its arrays', () => {
    const source: CameraState = {
      position: [1, 2, 3],
      quaternion: quat.normalize(quat.create(), [0.1, 0.2, 0.3, 0.9]),
      fov: 50,
      near: 0.1,
      far: 1000,
      viewOffset: [40, -20],
      target: [4, 5, 6],
      hasTarget: true,
      lookAtTarget: [7, 8, 9],
      hasLookAtTarget: true,
      referenceUp: vec3.normalize(vec3.create(), [0.1, 0.9, 0.2]),
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
    expect(vec3.exactEquals(out.position, source.position)).toBe(true);
    expect(vec4.exactEquals(out.quaternion, source.quaternion)).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffset).toEqual([40, -20]);
    expect(vec3.exactEquals(out.target, source.target)).toBe(true);
    expect(out.hasTarget).toBe(true);
    expect(vec3.exactEquals(out.lookAtTarget, source.lookAtTarget)).toBe(true);
    expect(out.hasLookAtTarget).toBe(true);
    expect(vec3.exactEquals(out.referenceUp, source.referenceUp)).toBe(true);
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

    expect(vec3.exactEquals(out.position, [1, 2, 3])).toBe(true);
    expect(vec4.exactEquals(out.quaternion, [0, 0, 0, 1])).toBe(true);
    expect(out.fov).toBe(50);
    expect(out.viewOffset).toEqual([40, -20]);
  });

  it('is safe when out and source are the same object (no-op)', () => {
    const state = createCameraState();
    vec3.set(state.position, 1, 2, 3);
    expect(() => copyCameraState(state, state)).not.toThrow();
    expect(vec3.exactEquals(state.position, [1, 2, 3])).toBe(true);
  });
});

describe('mergeCameraState', () => {
  it('overwrites only the fields present in "partial", leaving the rest untouched', () => {
    const out = createCameraState();
    out.fov = 50;
    out.near = 0.1;

    const returned = mergeCameraState(out, { position: [5, 20, 5], fov: 90 });

    expect(returned).toBe(out);
    expect(vec3.exactEquals(out.position, [5, 20, 5])).toBe(true);
    expect(out.fov).toBe(90);
    expect(out.near).toBe(0.1); // untouched
  });

  it('overwrites referenceUp when present in "partial"', () => {
    const out = createCameraState();

    mergeCameraState(out, { referenceUp: [1, 0, 0] });

    expect(vec3.exactEquals(out.referenceUp, [1, 0, 0])).toBe(true);
  });

  it("copies vector fields instead of aliasing the caller's own arrays", () => {
    const out = createCameraState();
    const outPosition = out.position;
    const callerPosition: [number, number, number] = [1, 2, 3];

    mergeCameraState(out, { position: callerPosition });

    expect(out.position).toBe(outPosition); // same array, mutated in place
    expect(out.position).not.toBe(callerPosition);

    callerPosition[0] = 99;
    expect(out.position).toEqual([1, 2, 3]); // unaffected by the caller's own mutation
  });

  it('merges quaternion, lens, targets and their flags', () => {
    const out = createCameraState();

    mergeCameraState(out, {
      quaternion: [0, 1, 0, 0],
      near: 0.5,
      far: 200,
      target: [1, 2, 3],
      hasTarget: true,
      lookAtTarget: [4, 5, 6],
      hasLookAtTarget: true,
    });

    expect(out.quaternion).toEqual([0, 1, 0, 0]);
    expect(out.near).toBe(0.5);
    expect(out.far).toBe(200);
    expect(out.target).toEqual([1, 2, 3]);
    expect(out.hasTarget).toBe(true);
    expect(out.lookAtTarget).toEqual([4, 5, 6]);
    expect(out.hasLookAtTarget).toBe(true);
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

    expect(vec3.exactEquals(out.position, [1, 2, 3])).toBe(true);
    expect(out.fov).toBe(70);
  });
});
