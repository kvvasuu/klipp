import { vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { BlendCurves } from '../../../src/core/blend/BlendCurves';
import { BlendDriver } from '../../../src/core/blend/BlendDriver';

function stateAt(x: number): CameraState {
  const state = createCameraState();
  vec3.set(state.position, x, 0, 0);
  return state;
}

const cut = { curve: BlendCurves.linear, time: 0 };
const linear2s = { curve: BlendCurves.linear, time: 2 };

describe('BlendDriver', () => {
  it('starts empty, and snaps to its first target without blending', () => {
    const states = { a: stateAt(5) };
    const driver = new BlendDriver<'a'>((id) => states[id]);
    expect([driver.liveId, driver.blendTargetId, driver.isBlending, driver.hasEverActivated]).toEqual([
      null,
      null,
      false,
      false,
    ]);

    driver.setTarget('a', linear2s);

    expect([driver.liveId, driver.isBlending, driver.hasEverActivated]).toEqual(['a', false, true]);
    expect(driver.tick(0).position[0]).toBe(5);
  });

  it('ignores a repeated target and keeps writing into the same output', () => {
    const states = { a: stateAt(5) };
    const driver = new BlendDriver<'a'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    const output = driver.tick(0);

    driver.setTarget('a', linear2s);

    expect(driver.isBlending).toBe(false);
    expect(driver.tick(0.1)).toBe(output);
  });

  it('blends to a later target, keeping the old one live until the blend completes', () => {
    const states = { a: stateAt(0), b: stateAt(10) };
    const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    driver.setTarget('b', linear2s);
    expect([driver.isBlending, driver.blendTargetId, driver.liveId]).toEqual([true, 'b', 'a']);
    expect(driver.tick(1).position[0]).toBeCloseTo(5, 5);

    expect(driver.tick(1).position[0]).toBeCloseTo(10, 5);
    expect([driver.isBlending, driver.liveId]).toEqual([false, 'b']);
  });

  it('a `time: 0` (cut) definition resolves to the destination on the very next tick', () => {
    const states = { a: stateAt(0), b: stateAt(10) };
    const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    driver.setTarget('b', cut);
    const out = driver.tick(0);

    expect(driver.isBlending).toBe(false);
    expect(driver.liveId).toBe('b');
    expect(out.position[0]).toBe(10);
  });

  it('mid-blend interruption: retargeting blends from the CURRENT composited output, not the original start', () => {
    const states = { a: stateAt(0), b: stateAt(10), c: stateAt(-10) };
    const driver = new BlendDriver<'a' | 'b' | 'c'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    driver.setTarget('b', linear2s);
    driver.tick(1); // halfway to 'b' (x=5)

    driver.setTarget('c', linear2s); // interrupt — retarget to 'c' from wherever we are NOW
    const justAfterRetarget = driver.tick(0);
    expect(justAfterRetarget.position[0]).toBeCloseTo(5, 5); // still at the interruption point, not back at 'a'

    const out = driver.tick(2); // full 2s of the NEW blend, from x=5 toward c's x=-10
    expect(out.position[0]).toBeCloseTo(-10, 5);
  });

  it('the target candidate is tracked LIVE while settled — a moving state pulls the output with it', () => {
    const target = stateAt(0);
    const states = { a: target };
    const driver = new BlendDriver<'a'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    vec3.set(target.position, 42, 0, 0); // the live candidate's own state moves
    const out = driver.tick(0.1);

    expect(out.position[0]).toBe(42);
  });

  describe('forget', () => {
    it('forgetting the live id keeps the output and hasEverActivated, and the next target blends from there', () => {
      const states: Record<string, CameraState> = { a: stateAt(0) };
      const driver = new BlendDriver<string>((id) => states[id]);
      driver.setTarget('a', linear2s);
      const output = driver.tick(0);

      driver.forget('unknown');
      expect(driver.liveId).toBe('a');

      driver.forget('a');
      expect([driver.liveId, driver.blendTargetId, driver.hasEverActivated]).toEqual([null, null, true]);
      expect(driver.tick(0)).toBe(output);

      states.b = stateAt(20);
      driver.setTarget('b', linear2s);
      expect(driver.isBlending).toBe(true);
      expect(driver.tick(1).position[0]).toBeCloseTo(10, 5); // from the frozen 0, not a snap to 20
    });

    it('forgetting the in-progress blend target cancels the blend AND clears liveId', () => {
      const states = { a: stateAt(0), b: stateAt(10) };
      const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
      driver.setTarget('a', linear2s);
      driver.tick(0);
      driver.setTarget('b', linear2s);
      driver.tick(1); // mid-blend toward 'b'

      driver.forget('b');

      expect(driver.isBlending).toBe(false);
      expect(driver.liveId).toBeNull();
    });
  });

  describe('damping-based blend', () => {
    const damped = { damping: 0.3 };

    it('eases toward the target, never overshooting, and settles', () => {
      const states = { a: stateAt(0), b: stateAt(10) };
      const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
      driver.setTarget('a', damped);
      driver.tick(0);
      driver.setTarget('b', damped);
      expect(driver.isBlending).toBe(true);

      let previous = 0;
      for (let i = 0; i < 500 && driver.isBlending; i++) {
        const x = driver.tick(0.016).position[0];
        expect(x).toBeGreaterThanOrEqual(previous);
        expect(x).toBeLessThanOrEqual(10 + 1e-6);
        previous = x;
      }

      expect([driver.isBlending, driver.liveId]).toEqual([false, 'b']);
    });

    it('maxSpeed clamps how fast damping can advance progress, in progress/sec (a floor on total blend duration)', () => {
      const states = { a: stateAt(0), b: stateAt(10) };

      const unclamped = new BlendDriver<'a' | 'b'>((id) => states[id]);
      unclamped.setTarget('a', damped);
      unclamped.tick(0);
      unclamped.setTarget('b', damped);
      const xUnclamped = unclamped.tick(0.05).position[0];

      const clamped = new BlendDriver<'a' | 'b'>((id) => states[id]);
      clamped.setTarget('a', damped);
      clamped.tick(0);
      clamped.setTarget('b', { damping: 0.3, maxSpeed: 1 });
      const xClamped = clamped.tick(0.05).position[0];

      expect(xClamped).toBeLessThan(xUnclamped);
    });
  });
});
