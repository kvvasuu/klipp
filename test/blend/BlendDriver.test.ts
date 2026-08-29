import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../src/CameraState';
import { BlendCurves } from '../../src/blend/BlendCurves';
import { BlendDriver } from '../../src/blend/BlendDriver';

function stateAt(x: number): CameraState {
  const state = createCameraState();
  state.position.set(x, 0, 0);
  return state;
}

const cut = { curve: BlendCurves.linear, time: 0 };
const linear2s = { curve: BlendCurves.linear, time: 2 };

describe('BlendDriver', () => {
  it('the very first setTarget snaps immediately — no blend, isBlending stays false', () => {
    const states = { a: stateAt(5) };
    const driver = new BlendDriver<'a'>((id) => states[id]);

    driver.setTarget('a', linear2s);

    expect(driver.isBlending).toBe(false);
    expect(driver.liveId).toBe('a');
    expect(driver.tick(0).position.x).toBe(5);
  });

  it('setTarget is a no-op when toId already matches blendTargetId', () => {
    const states = { a: stateAt(5) };
    const driver = new BlendDriver<'a'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    const before = driver.tick(0);

    driver.setTarget('a', linear2s); // same id again
    expect(driver.isBlending).toBe(false);
    expect(driver.tick(0)).toBe(before); // same scratch instance, untouched
  });

  it('a SECOND setTarget call starts a real blend, not a snap', () => {
    const states = { a: stateAt(0), b: stateAt(10) };
    const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    driver.setTarget('b', linear2s);
    expect(driver.isBlending).toBe(true);
    expect(driver.blendTargetId).toBe('b');
    expect(driver.liveId).toBe('a'); // still 'a' until the blend finishes

    const out = driver.tick(1); // halfway through a 2s linear blend
    expect(out.position.x).toBeCloseTo(5, 5);
  });

  it('commits liveId and clears isBlending once the blend reaches t >= 1', () => {
    const states = { a: stateAt(0), b: stateAt(10) };
    const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);
    driver.setTarget('b', linear2s);

    driver.tick(1);
    expect(driver.isBlending).toBe(true);
    const out = driver.tick(1); // total elapsed 2s — exactly at the 2s duration

    expect(driver.isBlending).toBe(false);
    expect(driver.liveId).toBe('b');
    expect(out.position.x).toBeCloseTo(10, 5);
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
    expect(out.position.x).toBe(10);
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
    expect(justAfterRetarget.position.x).toBeCloseTo(5, 5); // still at the interruption point, not back at 'a'

    const out = driver.tick(2); // full 2s of the NEW blend, from x=5 toward c's x=-10
    expect(out.position.x).toBeCloseTo(-10, 5);
  });

  it('the target candidate is tracked LIVE while settled — a moving state pulls the output with it', () => {
    const target = stateAt(0);
    const states = { a: target };
    const driver = new BlendDriver<'a'>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    target.position.set(42, 0, 0); // the live candidate's own state moves
    const out = driver.tick(0.1);

    expect(out.position.x).toBe(42);
  });

  it('a vanished-then-replaced candidate blends from the frozen output, not a fresh snap (real scenario KlippCore relies on)', () => {
    const states: Record<string, CameraState> = { a: stateAt(0) };
    const driver = new BlendDriver<string>((id) => states[id]);
    driver.setTarget('a', linear2s);
    driver.tick(0);

    // 'a' "vanishes" — a caller like KlippCore would null out its own liveId bookkeeping here, but the
    // driver's own `output` (and `everActivated`) stay exactly as they were — nothing resets them
    states.b = stateAt(20);
    driver.setTarget('b', linear2s); // a NEW candidate takes over

    expect(driver.isBlending).toBe(true); // blends, doesn't snap — everActivated was already true
    const out = driver.tick(1); // halfway through
    expect(out.position.x).toBeCloseTo(10, 5); // from 0 (frozen output) toward 20, not a snap to 20
  });

  describe('forget', () => {
    it('forgetting the live (settled, not blending) id clears liveId, keeping the frozen output', () => {
      const states = { a: stateAt(5) };
      const driver = new BlendDriver<'a'>((id) => states[id]);
      driver.setTarget('a', linear2s);
      const beforeForget = driver.tick(0);

      driver.forget('a');

      expect(driver.liveId).toBeNull();
      expect(driver.blendTargetId).toBeNull();
      expect(driver.tick(0)).toBe(beforeForget); // output itself untouched — just no longer "live"
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

    it('a later setTarget after forget blends from the frozen output, not a fresh snap — everActivated survives', () => {
      const states: Record<string, ReturnType<typeof stateAt>> = { a: stateAt(0) };
      const driver = new BlendDriver<string>((id) => states[id]);
      driver.setTarget('a', linear2s);
      driver.tick(0);
      driver.forget('a');

      states.b = stateAt(20);
      driver.setTarget('b', linear2s);

      expect(driver.isBlending).toBe(true); // not a snap
      const out = driver.tick(1); // halfway through 2s
      expect(out.position.x).toBeCloseTo(10, 5); // from the frozen 0, not a snap to 20
    });

    it('forgetting an id that is neither live nor the blend target is a no-op', () => {
      const states = { a: stateAt(0), b: stateAt(10) };
      const driver = new BlendDriver<'a' | 'b'>((id) => states[id]);
      driver.setTarget('a', linear2s);
      driver.tick(0);

      expect(() => driver.forget('b')).not.toThrow();
      expect(driver.liveId).toBe('a');
    });
  });

  it('tick() returns the same scratch CameraState instance every call', () => {
    const states = { a: stateAt(1) };
    const driver = new BlendDriver<'a'>((id) => states[id]);
    driver.setTarget('a', linear2s);

    const first = driver.tick(0);
    const second = driver.tick(0.1);
    expect(first).toBe(second);
  });

  it('liveId/blendTargetId are both null before the first setTarget call', () => {
    const driver = new BlendDriver<string>(() => stateAt(0));
    expect(driver.liveId).toBeNull();
    expect(driver.blendTargetId).toBeNull();
    expect(driver.isBlending).toBe(false);
  });
});
