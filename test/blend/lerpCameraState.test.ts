import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../src/CameraState';
import { lerpCameraState } from '../../src/blend/lerpCameraState';

function makeState(overrides: Partial<CameraState> = {}): CameraState {
  return {
    position: new Vector3(0, 0, 0),
    quaternion: new Quaternion(),
    fov: 50,
    near: 0.1,
    far: 1000,
    viewOffsetX: 0,
    viewOffsetY: 0,
    lookAtTarget: new Vector3(0, 0, 0),
    hasLookAtTarget: false,
    ...overrides,
  };
}

describe('lerpCameraState', () => {
  const a = makeState({ position: new Vector3(0, 0, 0), fov: 40, near: 0.1, far: 100, viewOffsetX: 0, viewOffsetY: 0 });
  const b = makeState({
    position: new Vector3(10, 0, 0),
    quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    fov: 60,
    near: 0.5,
    far: 500,
    viewOffsetX: 100,
    viewOffsetY: -40,
  });

  it('writes into "out" without allocating (same Vector3/Quaternion instances)', () => {
    const out = createCameraState();
    const outPosition = out.position;
    const outQuaternion = out.quaternion;

    const returned = lerpCameraState(out, a, b, 0.5);

    expect(returned).toBe(out);
    expect(out.position).toBe(outPosition);
    expect(out.quaternion).toBe(outQuaternion);
  });

  it('t=0 matches "a" exactly', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 0);
    expect(out.position.equals(a.position)).toBe(true);
    expect(out.quaternion.equals(a.quaternion)).toBe(true);
    expect(out.fov).toBe(a.fov);
    expect(out.near).toBe(a.near);
    expect(out.far).toBe(a.far);
  });

  it('t=1 matches "b" exactly', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 1);
    expect(out.position.equals(b.position)).toBe(true);
    expect(out.quaternion.equals(b.quaternion)).toBe(true);
    expect(out.fov).toBe(b.fov);
    expect(out.near).toBe(b.near);
    expect(out.far).toBe(b.far);
  });

  it('t=0.5 lands at the midpoint for position and lens', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 0.5);
    expect(out.position.x).toBeCloseTo(5, 10);
    expect(out.fov).toBeCloseTo(50, 10);
    expect(out.near).toBeCloseTo(0.3, 10);
    expect(out.far).toBeCloseTo(300, 10);
  });

  it('interpolates viewOffsetX/Y the same way as fov/near/far', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 0.5);
    expect(out.viewOffsetX).toBeCloseTo(50, 10);
    expect(out.viewOffsetY).toBeCloseTo(-20, 10);
  });

  it('clamps t outside [0, 1]', () => {
    const below = createCameraState();
    const above = createCameraState();
    lerpCameraState(below, a, b, -5);
    lerpCameraState(above, a, b, 5);
    expect(below.position.equals(a.position)).toBe(true);
    expect(above.position.equals(b.position)).toBe(true);
  });

  it('does not mutate "a" or "b"', () => {
    const aBefore = { position: a.position.clone(), quaternion: a.quaternion.clone() };
    const bBefore = { position: b.position.clone(), quaternion: b.quaternion.clone() };

    lerpCameraState(createCameraState(), a, b, 0.3);

    expect(a.position.equals(aBefore.position)).toBe(true);
    expect(a.quaternion.equals(aBefore.quaternion)).toBe(true);
    expect(b.position.equals(bBefore.position)).toBe(true);
    expect(b.quaternion.equals(bBefore.quaternion)).toBe(true);
  });

  it('is safe when "out" aliases "a" or "b" (the reason lerpVectors/slerpQuaternions are used instead of copy().lerp())', () => {
    const outIsA = makeState({ position: a.position.clone(), fov: a.fov, near: a.near, far: a.far });
    lerpCameraState(outIsA, outIsA, b, 0.5);
    expect(outIsA.position.x).toBeCloseTo(5, 10);

    const outIsB = makeState({
      position: b.position.clone(),
      quaternion: b.quaternion.clone(),
      fov: b.fov,
      near: b.near,
      far: b.far,
    });
    lerpCameraState(outIsB, a, outIsB, 0.5);
    expect(outIsB.position.x).toBeCloseTo(5, 10);
  });

  describe('hemisphere continuity (a live, moving "b" must not reverse the interpolated path)', () => {
    it('"b" expressed with a flipped quaternion sign produces the SAME result as the correctly-signed one', () => {
      const previousOutput = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // 90°

      // q and -q represent the IDENTICAL rotation — this is exactly what a live target's computed
      // quaternion can look like from one frame to the next after crossing the antipodal boundary.
      const flipped = previousOutput.clone();
      flipped.set(-flipped.x, -flipped.y, -flipped.z, -flipped.w);

      const outWithFlippedB = createCameraState();
      outWithFlippedB.quaternion.copy(previousOutput);
      lerpCameraState(outWithFlippedB, a, makeState({ quaternion: flipped }), 0.5);

      const outWithNormalB = createCameraState();
      outWithNormalB.quaternion.copy(previousOutput);
      lerpCameraState(outWithNormalB, a, makeState({ quaternion: previousOutput.clone() }), 0.5);

      // without the fix, three.js's own dot(a, b) check inside slerp would re-derive its OWN sign for
      // whichever "b" it was handed, based on the frozen `a` — not on continuity with `out` — so the two
      // calls above could disagree even though `flipped` and `previousOutput` are the same rotation.
      expect(outWithFlippedB.quaternion.dot(outWithNormalB.quaternion)).toBeGreaterThan(0.9999);
    });

    it('a continuously-rotating "b" (e.g. Aim tracking an orbiting target) never takes a sudden jump, even sweeping past where "shortest from the frozen a" would flip sides', () => {
      const out = createCameraState();
      const from = makeState(); // frozen "a", identity — stays fixed the whole time, like a real blend
      out.quaternion.copy(from.quaternion); // seed "previous output" the same way KlippCore does at blend start

      const axis = new Vector3(0, 1, 0);
      const live = makeState();

      // sweep well past 180° from the frozen `from` — the exact region where comparing against a fixed
      // reference (instead of continuity) would flip which side is "shortest"
      for (let angle = 0; angle <= Math.PI * 1.5; angle += 0.05) {
        live.quaternion.setFromAxisAngle(axis, angle);
        const before = out.quaternion.clone();

        lerpCameraState(out, from, live, 0.5); // fixed t: isolates "b moves" as the only variable

        expect(before.angleTo(out.quaternion)).toBeLessThan(0.2);
      }
    });
  });

  describe('lookAtTarget-driven rotation (camera-controls-style continuous look-at)', () => {
    function stateWithLookAt(position: Vector3, lookAtTarget: Vector3): CameraState {
      return makeState({ position, lookAtTarget, hasLookAtTarget: true });
    }

    it('drives rotation via a fresh lookAt(out.position, out.lookAtTarget) instead of slerping a/b\'s rotations, whenever both sides share a lookAtTarget', () => {
      const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
      const b = stateWithLookAt(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
      const out = createCameraState();

      lerpCameraState(out, a, b, 0.5);

      const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
      const toTarget = out.lookAtTarget.clone().sub(out.position).normalize();
      expect(forward.dot(toTarget)).toBeCloseTo(1, 10);
    });

    it("keeps looking exactly at the smoothly-interpolating target even when a's and b's lookAtTargets are far apart and unrelated (real use case: two cameras looking at entirely different subjects)", () => {
      const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
      const b = stateWithLookAt(new Vector3(-8, 2, 10), new Vector3(50, 20, -30));

      for (let t = 0; t <= 1; t += 0.1) {
        const out = createCameraState();
        lerpCameraState(out, a, b, t);

        const expectedTarget = a.lookAtTarget.clone().lerp(b.lookAtTarget, t);
        expect(out.lookAtTarget.distanceTo(expectedTarget)).toBeLessThan(1e-9);

        const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
        const toTarget = out.lookAtTarget.clone().sub(out.position).normalize();
        expect(forward.dot(toTarget)).toBeGreaterThan(1 - 1e-9);
      }
    });

    it("without a shared lookAtTarget, rotation falls back to slerping a/b's own quaternions", () => {
      const rotatedA = makeState({ quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2) });
      const noLookAt = makeState({ position: new Vector3(0, 0, 5) });
      const out = createCameraState();

      lerpCameraState(out, rotatedA, noLookAt, 0.5);

      expect(out.hasLookAtTarget).toBe(false);
      // slerp of rotatedA's 90° and noLookAt's identity lands at 45°, not identity (a degenerate lookAt's result)
      expect(out.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0.1);
    });
  });
});
