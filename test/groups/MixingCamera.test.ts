import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { MixingCamera, type MixingCameraSlot } from '../../src/groups/MixingCamera';

function slot(cameraId: string, x: number, fov: number, weight: number, angleDegrees = 0): MixingCameraSlot {
  const state = createCameraState();
  state.position.set(x, 0, 0);
  state.fov = fov;
  state.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), (angleDegrees * Math.PI) / 180);
  return { cameraId, state, weight };
}

describe('MixingCamera', () => {
  it('rejects an empty slot list', () => {
    expect(() => new MixingCamera([])).toThrow();
  });

  it('rejects more than 8 slots', () => {
    const slots = Array.from({ length: 9 }, (_, i) => slot(`c${i}`, 0, 50, 1));
    expect(() => new MixingCamera(slots)).toThrow();
  });

  it('a single weighted slot produces its exact state', () => {
    const mixer = new MixingCamera([slot('a', 5, 60, 1)]);
    const out = mixer.tick();
    expect(out.position.x).toBe(5);
    expect(out.fov).toBe(60);
  });

  it('equal weights average position/fov exactly, and slerp quaternions to the midpoint', () => {
    const mixer = new MixingCamera([slot('a', 0, 40, 0.5, 0), slot('b', 10, 60, 0.5, 90)]);
    const out = mixer.tick();

    expect(out.position.x).toBeCloseTo(5, 10);
    expect(out.fov).toBeCloseTo(50, 10);

    const expectedQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4); // 45°
    expect(out.quaternion.x).toBeCloseTo(expectedQuat.x, 10);
    expect(out.quaternion.y).toBeCloseTo(expectedQuat.y, 10);
    expect(out.quaternion.z).toBeCloseTo(expectedQuat.z, 10);
    expect(out.quaternion.w).toBeCloseTo(expectedQuat.w, 10);
  });

  it('unequal weights bias both the linear average and the quaternion slerp toward the heavier slot', () => {
    const mixer = new MixingCamera([slot('a', 0, 0, 3, 0), slot('b', 100, 0, 1, 90)]);
    const out = mixer.tick();

    expect(out.position.x).toBeCloseTo(25, 10); // 3/4 * 0 + 1/4 * 100

    const expectedQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 8); // 22.5°
    expect(out.quaternion.y).toBeCloseTo(expectedQuat.y, 10);
    expect(out.quaternion.w).toBeCloseTo(expectedQuat.w, 10);
  });

  it('a zero-weight slot contributes nothing', () => {
    const mixer = new MixingCamera([slot('a', 0, 0, 1), slot('b', 999, 0, 0)]);
    const out = mixer.tick();
    expect(out.position.x).toBe(0);
  });

  it('all weights zero (or negative) freezes the previous output instead of dividing by zero', () => {
    const a = slot('a', 10, 0, 1);
    const mixer = new MixingCamera([a]);
    mixer.tick();

    a.weight = 0;
    const out = mixer.tick();
    expect(out.position.x).toBe(10); // unchanged, not NaN
    expect(Number.isNaN(out.position.x)).toBe(false);
  });

  it('weight is a mutable field — re-ticking after mutating it reflects the new mix', () => {
    const a = slot('a', 0, 0, 1);
    const b = slot('b', 10, 0, 0);
    const mixer = new MixingCamera([a, b]);
    expect(mixer.tick().position.x).toBeCloseTo(0, 10);

    a.weight = 0;
    b.weight = 1;
    expect(mixer.tick().position.x).toBeCloseTo(10, 10);
  });

  it('slot state is a live reference — a mock camera that moves is picked up on the next tick', () => {
    const a = slot('a', 0, 0, 1);
    const mixer = new MixingCamera([a]);
    expect(mixer.tick().position.x).toBe(0);

    a.state.position.x = 42;
    expect(mixer.tick().position.x).toBe(42);
  });

  it('a negative weight is ignored, not subtracted', () => {
    const mixer = new MixingCamera([slot('a', 10, 50, 2), slot('b', 999, 999, -1)]);
    const out = mixer.tick();
    expect(out.position.x).toBe(10); // b excluded entirely: share of a is 2/2 = 1, not 2/(2-1) = 2
    expect(out.fov).toBe(50);
  });
});
