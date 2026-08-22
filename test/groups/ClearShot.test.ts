import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { BlendCurves } from '../../src/blend/BlendCurves';
import { ClearShot, type ClearShotCandidate } from '../../src/groups/ClearShot';

function candidateAt(cameraId: string, x: number, priority: number): ClearShotCandidate {
  const state = createCameraState();
  state.position.set(x, 0, 0);
  return { cameraId, state, priority };
}

describe('ClearShot', () => {
  it('rejects an empty candidate list', () => {
    expect(() => new ClearShot([], { evaluator: () => 0 })).toThrow();
  });

  it('picks the highest QUALITY, not the highest priority', () => {
    const a = candidateAt('a', 0, 100); // higher priority, worse quality
    const b = candidateAt('b', 10, 1);
    const quality: Record<string, number> = { a: 1, b: 5 };
    const clearShot = new ClearShot([a, b], { evaluator: (c) => quality[c.cameraId] });

    clearShot.tick(0);
    expect(clearShot.liveCameraId).toBe('b');
  });

  it('priority breaks a quality tie', () => {
    const a = candidateAt('a', 0, 10);
    const b = candidateAt('b', 10, 20);
    const clearShot = new ClearShot([a, b], { evaluator: () => 5 });

    clearShot.tick(0);
    expect(clearShot.liveCameraId).toBe('b');
  });

  it('a full tie (quality AND priority) is broken by list order by default', () => {
    const a = candidateAt('a', 0, 10);
    const b = candidateAt('b', 10, 10);
    const clearShot = new ClearShot([a, b], { evaluator: () => 5 });

    clearShot.tick(0);
    expect(clearShot.liveCameraId).toBe('a');
  });

  it('randomizeChoice picks among full ties via the injected RNG instead of list order', () => {
    const a = candidateAt('a', 0, 10);
    const b = candidateAt('b', 10, 10);

    const pickB = new ClearShot([a, b], { evaluator: () => 5, randomizeChoice: true, random: () => 0 });
    pickB.tick(0);
    expect(pickB.liveCameraId).toBe('b');

    const pickA = new ClearShot([a, b], { evaluator: () => 5, randomizeChoice: true, random: () => 0.99 });
    pickA.tick(0);
    expect(pickA.liveCameraId).toBe('a');
  });

  it('the very first activation snaps immediately, ignoring activateAfter/minDuration', () => {
    const a = candidateAt('a', 5, 0);
    const clearShot = new ClearShot([a], { evaluator: () => 1, activateAfter: 1000, minDuration: 1000 });

    const out = clearShot.tick(0);
    expect(clearShot.liveCameraId).toBe('a');
    expect(out.position.x).toBe(5);
  });

  it('activateAfter debounces a new best: it must stay the best continuously before switching', () => {
    const a = candidateAt('a', 0, 0);
    const b = candidateAt('b', 10, 0);
    const quality: Record<string, number> = { a: 5, b: 1 };
    const clearShot = new ClearShot([a, b], {
      evaluator: (c) => quality[c.cameraId],
      activateAfter: 1,
      defaultBlend: { curve: BlendCurves.cut, time: 0 },
    });
    clearShot.tick(0);
    expect(clearShot.liveCameraId).toBe('a');

    quality.b = 10; // 'b' becomes the raw best
    clearShot.tick(0.6);
    expect(clearShot.liveCameraId).toBe('a'); // not yet — still debouncing
    expect(clearShot.pendingCameraId).toBe('b');

    clearShot.tick(0.6);
    expect(clearShot.liveCameraId).toBe('a'); // 1.2s elapsed total, but only 0.6s counted toward the debounce so far
  });

  it("activateAfter's debounce timer resets if the raw best reverts before committing", () => {
    const a = candidateAt('a', 0, 0);
    const b = candidateAt('b', 10, 0);
    const quality: Record<string, number> = { a: 5, b: 1 };
    const clearShot = new ClearShot([a, b], {
      evaluator: (c) => quality[c.cameraId],
      activateAfter: 1,
      defaultBlend: { curve: BlendCurves.cut, time: 0 },
    });
    clearShot.tick(0);

    quality.b = 10;
    clearShot.tick(0.6);
    clearShot.tick(0.6); // 'b' has been pending for 0.6s (uninterrupted)
    expect(clearShot.pendingCameraId).toBe('b');

    quality.b = 1; // 'a' becomes the raw best again — interrupts the debounce
    clearShot.tick(0.1);
    expect(clearShot.pendingCameraId).toBeNull();
    expect(clearShot.liveCameraId).toBe('a');

    quality.b = 10; // debounce restarts from scratch
    clearShot.tick(0.6);
    expect(clearShot.liveCameraId).toBe('a'); // if the earlier 0.6+0.6 had carried over this would already be 'b'

    clearShot.tick(1); // now past 1s of uninterrupted pending time
    expect(clearShot.liveCameraId).toBe('b');
  });

  it('minDuration blocks switching away from the live camera until it has elapsed', () => {
    const a = candidateAt('a', 0, 0);
    const b = candidateAt('b', 10, 0);
    const quality: Record<string, number> = { a: 5, b: 1 };
    const clearShot = new ClearShot([a, b], {
      evaluator: (c) => quality[c.cameraId],
      minDuration: 1,
      defaultBlend: { curve: BlendCurves.cut, time: 0 },
    });
    clearShot.tick(0);
    expect(clearShot.liveCameraId).toBe('a');

    quality.b = 10;
    clearShot.tick(1); // 'a' has only just gone live — minDuration blocks the switch
    expect(clearShot.liveCameraId).toBe('a');

    clearShot.tick(0); // liveElapsed reached 1s by the end of the previous tick
    expect(clearShot.liveCameraId).toBe('b');
  });
});
