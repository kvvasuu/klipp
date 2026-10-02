import { quat, vec3, vec4, type Vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { BlendHints } from '../../../src/core/blend/BlendHints';
import { lerpCameraState } from '../../../src/core/blend/lerpCameraState';
import { angleBetween, forwardDot, lookAtQuaternion, yaw } from '../mathHelpers';

function makeState(overrides: Partial<CameraState> = {}): CameraState {
  return {
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    fov: 50,
    near: 0.1,
    far: 1000,
    viewOffset: [0, 0],
    target: [0, 0, 0],
    hasTarget: false,
    lookAtTarget: [0, 0, 0],
    hasLookAtTarget: false,
    referenceUp: [0, 1, 0],
    ...overrides,
  };
}

describe('lerpCameraState', () => {
  const a = makeState({ position: [0, 0, 0], fov: 40, near: 0.1, far: 100, viewOffset: [0, 0] });
  const b = makeState({
    position: [10, 0, 0],
    quaternion: yaw(90),
    fov: 60,
    near: 0.5,
    far: 500,
    viewOffset: [100, -40],
  });

  it('matches "a" and "b" exactly at the ends, clamping t outside [0, 1]', () => {
    for (const [t, end] of [
      [0, a],
      [-5, a],
      [1, b],
      [5, b],
    ] as const) {
      const out = createCameraState();
      lerpCameraState(out, a, b, t);
      expect(out.position).toEqual(end.position);
      expect(out.quaternion).toEqual(end.quaternion);
      expect([out.fov, out.near, out.far]).toEqual([end.fov, end.near, end.far]);
    }
  });

  it('interpolates position, lens and viewOffset', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 0.5);
    expect(out.position[0]).toBeCloseTo(5, 10);
    expect(out.fov).toBeCloseTo(50, 10);
    expect(out.near).toBeCloseTo(0.3, 10);
    expect(out.far).toBeCloseTo(300, 10);
    expect(out.viewOffset[0]).toBeCloseTo(50, 10);
    expect(out.viewOffset[1]).toBeCloseTo(-20, 10);
  });

  it('interpolates referenceUp and re-normalizes it', () => {
    const tiltedA = makeState({ referenceUp: [0, 1, 0] });
    const tiltedB = makeState({ referenceUp: [1, 0, 0] });
    const out = createCameraState();

    lerpCameraState(out, tiltedA, tiltedB, 0.5);

    expect(vec3.length(out.referenceUp)).toBeCloseTo(1, 10);
    expect(out.referenceUp[0]).toBeGreaterThan(0);
    expect(out.referenceUp[1]).toBeGreaterThan(0);
  });

  it('does not mutate "a" or "b"', () => {
    const aBefore = { position: vec3.clone(a.position), quaternion: quat.clone(a.quaternion) };
    const bBefore = { position: vec3.clone(b.position), quaternion: quat.clone(b.quaternion) };

    lerpCameraState(createCameraState(), a, b, 0.3);

    expect(vec3.exactEquals(a.position, aBefore.position)).toBe(true);
    expect(vec4.exactEquals(a.quaternion, aBefore.quaternion)).toBe(true);
    expect(vec3.exactEquals(b.position, bBefore.position)).toBe(true);
    expect(vec4.exactEquals(b.quaternion, bBefore.quaternion)).toBe(true);
  });

  it('is safe when "out" aliases "a" or "b"', () => {
    const outIsA = makeState({ position: vec3.clone(a.position), fov: a.fov, near: a.near, far: a.far });
    lerpCameraState(outIsA, outIsA, b, 0.5);
    expect(outIsA.position[0]).toBeCloseTo(5, 10);

    const outIsB = makeState({
      position: vec3.clone(b.position),
      quaternion: vec4.clone(b.quaternion),
      fov: b.fov,
      near: b.near,
      far: b.far,
    });
    lerpCameraState(outIsB, a, outIsB, 0.5);
    expect(outIsB.position[0]).toBeCloseTo(5, 10);
  });

  describe('hemisphere continuity (a live, moving "b" must not reverse the interpolated path)', () => {
    it('"b" expressed with a flipped quaternion sign produces the SAME result as the correctly-signed one', () => {
      const previousOutput = yaw(90);

      // q and -q represent the IDENTICAL rotation — this is exactly what a live target's computed
      // quaternion can look like from one frame to the next after crossing the antipodal boundary.
      const flipped = vec4.negate(quat.create(), previousOutput);

      const outWithFlippedB = createCameraState();
      vec4.copy(outWithFlippedB.quaternion, previousOutput);
      lerpCameraState(outWithFlippedB, a, makeState({ quaternion: flipped }), 0.5);

      const outWithNormalB = createCameraState();
      vec4.copy(outWithNormalB.quaternion, previousOutput);
      lerpCameraState(outWithNormalB, a, makeState({ quaternion: quat.clone(previousOutput) }), 0.5);

      // without the fix, a plain slerp's dot(a, b) check would re-derive its OWN sign for
      // whichever "b" it was handed, based on the frozen `a` — not on continuity with `out` — so the two
      // calls above could disagree even though `flipped` and `previousOutput` are the same rotation.
      expect(quat.dot(outWithFlippedB.quaternion, outWithNormalB.quaternion)).toBeGreaterThan(0.9999);
    });

    it('a continuously-rotating "b" (e.g. Aim tracking an orbiting target) never takes a sudden jump, even sweeping past where "shortest from the frozen a" would flip sides', () => {
      const out = createCameraState();
      const from = makeState(); // frozen "a", identity — stays fixed the whole time, like a real blend
      vec4.copy(out.quaternion, from.quaternion); // seed "previous output" the same way Klipp does at blend start

      const axis: Vec3 = [0, 1, 0];
      const live = makeState();

      // sweep well past 180° from the frozen `from` — the exact region where comparing against a fixed
      // reference (instead of continuity) would flip which side is "shortest"
      for (let angle = 0; angle <= Math.PI * 1.5; angle += 0.05) {
        quat.setAxisAngle(live.quaternion, axis, angle);
        const before = quat.clone(out.quaternion);

        lerpCameraState(out, from, live, 0.5); // fixed t: isolates "b moves" as the only variable

        expect(angleBetween(before, out.quaternion)).toBeLessThan(0.2);
      }
    });
  });

  describe('BlendHints.sphericalPosition/cylindricalPosition', () => {
    const target: Vec3 = [0, 0, 0];
    const orbitingA = makeState({
      position: [5, 5, 5],
      quaternion: lookAtQuaternion([5, 5, 5], target),
      target: vec3.clone(target),
      hasTarget: true,
      lookAtTarget: vec3.clone(target),
      hasLookAtTarget: true,
    });
    const orbitingB = makeState({
      position: [0, 0, 5],
      quaternion: lookAtQuaternion([0, 0, 5], target),
      target: vec3.clone(target),
      hasTarget: true,
      lookAtTarget: vec3.clone(target),
      hasLookAtTarget: true,
    });

    it('keeps the camera at the interpolated RADIUS from the shared target, unlike a straight cartesian lerp', () => {
      const radiusA = vec3.distance(orbitingA.position, target);
      const radiusB = vec3.distance(orbitingB.position, target);

      const spherical = createCameraState();
      lerpCameraState(spherical, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition);
      expect(vec3.distance(spherical.position, target)).toBeCloseTo((radiusA + radiusB) / 2, 10);

      const linear = createCameraState();
      lerpCameraState(linear, orbitingA, orbitingB, 0.5);
      // real bug this fixes: without the hint, a linear lerp between two points on a sphere cuts inside
      // it, landing at a distance from the target that doesn't match either endpoint's radius
      expect(vec3.distance(linear.position, target)).not.toBeCloseTo((radiusA + radiusB) / 2, 1);
    });

    it("without a shared lookAtTarget, position still blends spherically but rotation falls back to slerping a/b's own quaternions", () => {
      const rotatedA = makeState({
        ...orbitingA,
        quaternion: yaw(90),
      });
      const noLookAt = makeState({ position: [0, 0, 5], target: vec3.clone(target), hasTarget: true });
      const out = createCameraState();
      lerpCameraState(out, rotatedA, noLookAt, 0.5, BlendHints.sphericalPosition);

      const radiusA = vec3.distance(rotatedA.position, target);
      const radiusB = vec3.distance(noLookAt.position, target);
      expect(vec3.distance(out.position, target)).toBeCloseTo((radiusA + radiusB) / 2, 10); // position: still spherical
      expect(out.hasLookAtTarget).toBe(false);
      // slerp of rotatedA's 90° and noLookAt's identity lands at 45°, not identity
      expect(angleBetween(out.quaternion, [0, 0, 0, 1])).toBeGreaterThan(0.1);
    });

    it('falls back to a straight line when either side has no target', () => {
      for (const [from, to] of [
        [orbitingA, makeState({ position: [0, 0, 5] })],
        [a, b],
      ]) {
        const hinted = createCameraState();
        lerpCameraState(hinted, from, to, 0.5, 0b111111);
        const linear = createCameraState();
        lerpCameraState(linear, from, to, 0.5);
        expect(hinted.position).toEqual(linear.position);
      }
    });

    it('cylindricalPosition interpolates the vertical (Y) axis linearly while still arcing horizontally', () => {
      const higher = makeState({ position: [5, 10, 0], target: vec3.clone(target), hasTarget: true });
      const lower = makeState({ position: [0, 0, 5], target: vec3.clone(target), hasTarget: true });
      const out = createCameraState();
      lerpCameraState(out, higher, lower, 0.5, BlendHints.cylindricalPosition);
      expect(out.position[1]).toBeCloseTo(5, 10);
    });

    it('sphericalPosition wins when both flags are set', () => {
      const both = createCameraState();
      lerpCameraState(both, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition | BlendHints.cylindricalPosition);
      const sphericalOnly = createCameraState();
      lerpCameraState(sphericalOnly, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition);
      expect(vec3.exactEquals(both.position, sphericalOnly.position)).toBe(true);
    });

    describe('a side with a zero orbit radius (position exactly AT its own target, e.g. HardLockToTarget snapped onto it) does not fake a sweep through Math.atan2/Spherical\'s "0" fallback angle', () => {
      // real bug: a zero-length offset reports angle 0 (atan2/Spherical's fallback) - sweeping the other
      // side's real angle toward that fake "0" swings the camera around the target for no reason
      const farAngleA = makeState({
        position: [-5, 3, -5], // ~135°, away from atan2's "0" fallback in both axes
        target: vec3.clone(target),
        hasTarget: true,
      });
      const zeroRadiusB = makeState({
        position: [8, 2, -1],
        target: [8, 2, -1],
        hasTarget: true,
      });

      it("sphericalPosition holds a's own bearing/elevation instead of sweeping toward theta=0/phi=0", () => {
        const offsetA = vec3.subtract(vec3.create(), farAngleA.position, target);
        const thetaA = Math.atan2(offsetA[0], offsetA[2]);
        const phiA = Math.acos(offsetA[1] / vec3.length(offsetA));

        for (let t = 0; t <= 1; t += 0.25) {
          const out = createCameraState();
          lerpCameraState(out, farAngleA, zeroRadiusB, t, BlendHints.sphericalPosition);

          const interpolatedTarget = vec3.lerp(vec3.create(), target, zeroRadiusB.target, t);
          const offset = vec3.subtract(vec3.create(), out.position, interpolatedTarget);
          if (vec3.length(offset) < 1e-6) continue; // radius ~0 near t=1 - bearing is moot there anyway

          const theta = Math.atan2(offset[0], offset[2]);
          const phi = Math.acos(offset[1] / vec3.length(offset));
          expect(theta).toBeCloseTo(thetaA, 5);
          expect(phi).toBeCloseTo(phiA, 5);
        }
      });

      it('cylindricalPosition holds the same bearing (Y interpolates independently, unaffected)', () => {
        const offsetA = vec3.subtract(vec3.create(), farAngleA.position, target);
        const angleA = Math.atan2(offsetA[0], offsetA[2]);

        for (let t = 0; t <= 1; t += 0.25) {
          const out = createCameraState();
          lerpCameraState(out, farAngleA, zeroRadiusB, t, BlendHints.cylindricalPosition);

          const interpolatedTarget = vec3.lerp(vec3.create(), target, zeroRadiusB.target, t);
          const offsetX = out.position[0] - interpolatedTarget[0];
          const offsetZ = out.position[2] - interpolatedTarget[2];
          if (Math.hypot(offsetX, offsetZ) < 1e-6) continue;

          expect(Math.atan2(offsetX, offsetZ)).toBeCloseTo(angleA, 5);
        }
      });
    });

    it('carries the interpolated target forward only when both sides have one', () => {
      const out = createCameraState();
      lerpCameraState(out, orbitingA, makeState({ position: [0, 0, 5], target: [10, 0, 0], hasTarget: true }), 0.5);
      expect(out.hasTarget).toBe(true);
      expect(out.target).toEqual([5, 0, 0]);

      lerpCameraState(out, orbitingA, makeState(), 0.5);
      expect(out.hasTarget).toBe(false);
    });
  });

  describe('lookAtTarget-driven rotation (independent of position hints - camera-controls-style continuous look-at)', () => {
    /** A state with a REAL, consistent lookAt quaternion for `position`/`lookAtTarget` - matching what an
     *  actual Aim (e.g. `HardLookAt`) would produce, unlike a quaternion left at some unrelated default. */
    function stateWithLookAt(position: Vec3, lookAtTarget: Vec3): CameraState {
      return makeState({
        position: position,
        quaternion: lookAtQuaternion(position, lookAtTarget),
        lookAtTarget: lookAtTarget,
        hasLookAtTarget: true,
      });
    }

    it('drives rotation via lookAt with NO hints at all (BlendHints.none) - a shared lookAtTarget alone is enough', () => {
      const a = stateWithLookAt([5, 5, 5], [0, 0, 0]);
      const b = stateWithLookAt([0, 0, 5], [0, 0, 0]);
      const out = createCameraState();

      lerpCameraState(out, a, b, 0.5); // no hints argument at all

      expect(forwardDot(out.quaternion, out.position, out.lookAtTarget)).toBeCloseTo(1, 10);
    });

    it("keeps looking exactly at the smoothly-interpolating target even when a's and b's lookAtTargets are far apart and unrelated (real use case: two cameras looking at entirely different subjects, position blending as a plain straight line)", () => {
      const a = stateWithLookAt([5, 5, 5], [0, 0, 0]);
      const b = stateWithLookAt([-8, 2, 10], [50, 20, -30]);

      for (let t = 0; t <= 1; t += 0.1) {
        const out = createCameraState();
        lerpCameraState(out, a, b, t); // no position hint - plain cartesian position lerp

        const expectedTarget = vec3.lerp(vec3.create(), a.lookAtTarget, b.lookAtTarget, t);
        expect(vec3.distance(out.lookAtTarget, expectedTarget)).toBeLessThan(1e-9);

        expect(forwardDot(out.quaternion, out.position, out.lookAtTarget)).toBeGreaterThan(1 - 1e-9);
      }
    });

    it("matches a's/b's quaternion EXACTLY at t=0/t=1 even when they have extra rotation beyond a pure lookAt (real bug: a raw lookAt ignored that extra rotation entirely, popping visibly the instant a blend committed and handed off to the Aim's own state)", () => {
      const a = stateWithLookAt([-5, 0, 0], [0, 0, 0]);
      const b = stateWithLookAt([5, 0, 0], [0, 0, 0]);
      // simulate an Aim like RotationComposer layering an extra offset (screen position, damping lag, ...)
      quat.multiply(b.quaternion, b.quaternion, yaw(20));

      const outAt0 = createCameraState();
      lerpCameraState(outAt0, a, b, 0);
      expect(angleBetween(outAt0.quaternion, a.quaternion)).toBeLessThan(1e-9);

      const outAt1 = createCameraState();
      lerpCameraState(outAt1, a, b, 1);
      expect(angleBetween(outAt1.quaternion, b.quaternion)).toBeLessThan(1e-9);
    });

    it('sphericalPosition still shapes position on top of the always-on lookAt rotation - the two are independent', () => {
      const a = stateWithLookAt([5, 5, 5], [0, 0, 0]);
      const b = stateWithLookAt([0, 0, 5], [0, 0, 0]);
      vec3.set(a.target, 0, 0, 0);
      a.hasTarget = true;
      vec3.set(b.target, 0, 0, 0);
      b.hasTarget = true;

      const linear = createCameraState();
      lerpCameraState(linear, a, b, 0.5);
      const spherical = createCameraState();
      lerpCameraState(spherical, a, b, 0.5, BlendHints.sphericalPosition);

      expect(vec3.exactEquals(linear.position, spherical.position)).toBe(false); // position differs...
      // ...but rotation is identically correct in both, since it never depended on the position hint
      expect(forwardDot(linear.quaternion, linear.position, linear.lookAtTarget)).toBeCloseTo(1, 10);
      expect(forwardDot(spherical.quaternion, spherical.position, spherical.lookAtTarget)).toBeCloseTo(1, 10);
    });

    describe('BlendHints.ignoreTarget', () => {
      it('opts out of lookAt-driven rotation even with a shared lookAtTarget, falling back to a plain slerp', () => {
        const a = stateWithLookAt([5, 5, 5], [0, 0, 0]);
        const b = stateWithLookAt([0, 0, 5], [0, 0, 0]);

        const tracked = createCameraState();
        lerpCameraState(tracked, a, b, 0.5);
        const ignored = createCameraState();
        lerpCameraState(ignored, a, b, 0.5, BlendHints.ignoreTarget);

        expect(angleBetween(ignored.quaternion, tracked.quaternion)).toBeGreaterThan(0.01);
        // matches the plain-slerp fallback exactly - the same path taken when there's no lookAtTarget at all
        const plainSlerpEquivalent = createCameraState();
        lerpCameraState(
          plainSlerpEquivalent,
          makeState({ quaternion: a.quaternion }),
          makeState({ quaternion: b.quaternion }),
          0.5,
        );
        expect(angleBetween(ignored.quaternion, plainSlerpEquivalent.quaternion)).toBeLessThan(1e-6);
      });

      it('still publishes lookAtTarget/hasLookAtTarget for downstream consumers - only the ROTATION path is affected', () => {
        const a = stateWithLookAt([5, 5, 5], [0, 0, 0]);
        const b = stateWithLookAt([0, 0, 5], [2, 0, 0]);
        const out = createCameraState();

        lerpCameraState(out, a, b, 0.5, BlendHints.ignoreTarget);

        expect(out.hasLookAtTarget).toBe(true);
        expect(vec3.distance(out.lookAtTarget, [1, 0, 0])).toBeLessThan(1e-9);
      });

      it('is independent of sphericalPosition - position still arcs while rotation still ignores the target', () => {
        const a = stateWithLookAt([5, 5, 5], [0, 0, 0]);
        const b = stateWithLookAt([0, 0, 5], [0, 0, 0]);
        vec3.set(a.target, 0, 0, 0);
        a.hasTarget = true;
        vec3.set(b.target, 0, 0, 0);
        b.hasTarget = true;

        const linearWithoutHints = createCameraState();
        lerpCameraState(linearWithoutHints, a, b, 0.5);
        const combined = createCameraState();
        lerpCameraState(combined, a, b, 0.5, BlendHints.sphericalPosition | BlendHints.ignoreTarget);

        // position still arcs (sphericalPosition applied)...
        expect(vec3.exactEquals(combined.position, linearWithoutHints.position)).toBe(false);
        // ...but rotation ignores the target (a plain slerp, not pointed at combined.lookAtTarget)
        expect(forwardDot(combined.quaternion, combined.position, combined.lookAtTarget)).toBeLessThan(1 - 1e-6);
      });
    });
  });
});
