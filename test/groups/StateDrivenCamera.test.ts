import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { BlendCurves } from '../../src/blend/BlendCurves';
import { StateDrivenCamera, type StateDrivenCandidate } from '../../src/groups/StateDrivenCamera';

function candidateAt(cameraId: string, x: number, priority: number, forState: string): StateDrivenCandidate {
  const state = createCameraState();
  state.position.set(x, 0, 0);
  return { cameraId, state, priority, forState };
}

describe('StateDrivenCamera', () => {
  it('rejects an empty candidate list', () => {
    expect(() => new StateDrivenCamera([])).toThrow();
  });

  it('before setState() has ever been called, liveCameraId stays null (tick() is just the untouched default CameraState)', () => {
    const sdc = new StateDrivenCamera([candidateAt('a', 1, 10, 'idle')]);
    const out = sdc.tick(0);

    expect(sdc.liveCameraId).toBeNull();
    expect(out.position.x).toBe(0); // default CameraState, not candidate 'a's — caller must check liveCameraId
  });

  it('snaps to the matching candidate on the very first tick', () => {
    const sdc = new StateDrivenCamera([candidateAt('a', 1, 10, 'idle')]);
    sdc.setState('idle');
    const out = sdc.tick(0);

    expect(sdc.liveCameraId).toBe('a');
    expect(sdc.isBlending).toBe(false);
    expect(out.position.x).toBe(1);
  });

  it('several candidates mapping to the same state: highest priority wins', () => {
    const sdc = new StateDrivenCamera([candidateAt('low', 0, 10, 'idle'), candidateAt('high', 0, 20, 'idle')]);
    sdc.setState('idle');
    sdc.tick(0);
    expect(sdc.liveCameraId).toBe('high');
  });

  it('a priority tie is broken by LIST ORDER, not activation order', () => {
    const sdc = new StateDrivenCamera([candidateAt('first', 0, 10, 'idle'), candidateAt('second', 0, 10, 'idle')]);
    sdc.setState('idle');
    sdc.tick(0);
    expect(sdc.liveCameraId).toBe('first');
  });

  it('a state with no matching candidate holds whatever was live before', () => {
    const sdc = new StateDrivenCamera([candidateAt('a', 0, 10, 'idle')]);
    sdc.setState('idle');
    sdc.tick(0);
    expect(sdc.liveCameraId).toBe('a');

    sdc.setState('unmapped');
    sdc.tick(1);
    expect(sdc.currentState).toBe('unmapped');
    expect(sdc.liveCameraId).toBe('a');
  });

  it('a state change blends, it does not cut', () => {
    const sdc = new StateDrivenCamera([candidateAt('a', 0, 10, 'idle'), candidateAt('b', 10, 10, 'moving')], {
      defaultBlend: { curve: BlendCurves.linear, time: 1 },
    });
    sdc.setState('idle');
    sdc.tick(0);

    sdc.setState('moving');
    expect(sdc.tick(0.25).position.x).toBeCloseTo(2.5, 10);
    expect(sdc.isBlending).toBe(true);
    expect(sdc.liveCameraId).toBe('a');

    sdc.tick(0.25);
    sdc.tick(0.25);
    const out = sdc.tick(0.25);
    expect(out.position.x).toBeCloseTo(10, 10);
    expect(sdc.isBlending).toBe(false);
    expect(sdc.liveCameraId).toBe('b');
  });

  it('mid-blend interruption: a second state change blends from the CURRENT composited output', () => {
    const a = candidateAt('a', 0, 10, 'idle');
    const b = candidateAt('b', 10, 10, 'moving');
    const c = candidateAt('c', 100, 10, 'running');
    const sdc = new StateDrivenCamera([a, b, c], { defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    sdc.setState('idle');
    sdc.tick(0);

    sdc.setState('moving');
    expect(sdc.tick(0.25).position.x).toBeCloseTo(2.5, 10);

    sdc.setState('running');
    const interrupted = sdc.tick(0.5);
    expect(interrupted.position.x).toBeCloseTo(2.5 + (100 - 2.5) * 0.5, 10);
  });

  it('the live-blend target is tracked LIVE — a mock camera that moves mid-blend pulls the output with it', () => {
    const a = candidateAt('a', 0, 10, 'idle');
    const b = candidateAt('b', 10, 10, 'moving');
    const sdc = new StateDrivenCamera([a, b], { defaultBlend: { curve: BlendCurves.linear, time: 1 } });
    sdc.setState('idle');
    sdc.tick(0);
    sdc.setState('moving');

    expect(sdc.tick(0.5).position.x).toBeCloseTo(5, 10);

    b.state.position.x = 50;

    expect(sdc.tick(0.5).position.x).toBeCloseTo(50, 10);
  });
});
