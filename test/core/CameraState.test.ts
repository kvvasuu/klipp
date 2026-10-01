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
  it('overwrites exactly the fields present in the partial', () => {
    const out = createCameraState();
    expect(mergeCameraState(out, {})).toEqual(createCameraState());

    const partial = {
      position: [5, 20, 5] as [number, number, number],
      quaternion: [0, 1, 0, 0] as [number, number, number, number],
      fov: 90,
      near: 0.5,
      far: 200,
      target: [1, 2, 3] as [number, number, number],
      hasTarget: true,
      lookAtTarget: [4, 5, 6] as [number, number, number],
      hasLookAtTarget: true,
      referenceUp: [1, 0, 0] as [number, number, number],
    };
    expect(mergeCameraState(out, partial)).toBe(out);

    expect(out).toMatchObject(partial);
    expect(out.viewOffset).toEqual([0, 0]);
  });

  it("copies into its own arrays, never keeping the caller's", () => {
    const out = createCameraState();
    const own = [out.position, out.viewOffset];
    const position: [number, number, number] = [1, 2, 3];
    const viewOffset: [number, number] = [40, -20];

    mergeCameraState(out, { position, viewOffset });
    position[0] = 99;
    viewOffset[0] = 999;

    expect([out.position, out.viewOffset]).toEqual([
      [1, 2, 3],
      [40, -20],
    ]);
    expect(out.position).toBe(own[0]);
    expect(out.viewOffset).toBe(own[1]);
  });
});
