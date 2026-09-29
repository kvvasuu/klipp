import { vec3, vec4 } from 'math';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { BlendHints } from '../../../src/core/blend/BlendHints';
import { lerpCameraState } from '../../../src/core/blend/lerpCameraState';
import { toQuaternion, toTuple, toVector3 } from '../../tuples';

const worldUp = new Vector3(0, 1, 0);
const scratchMatrix = new Matrix4();

/** A quaternion that actually looks from `position` at `lookAtTarget` - for fixtures that need a REAL,
 *  consistent rotation (matching what an Aim like `HardLookAt` would produce), not an unrelated default. */
function lookAtQuaternion(position: Vector3, lookAtTarget: Vector3): Quaternion {
  scratchMatrix.lookAt(position, lookAtTarget, worldUp);
  return new Quaternion().setFromRotationMatrix(scratchMatrix);
}

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
    quaternion: toTuple(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)),
    fov: 60,
    near: 0.5,
    far: 500,
    viewOffset: [100, -40],
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
    expect(toVector3(out.position).equals(toVector3(a.position))).toBe(true);
    expect(toQuaternion(out.quaternion).equals(toQuaternion(a.quaternion))).toBe(true);
    expect(out.fov).toBe(a.fov);
    expect(out.near).toBe(a.near);
    expect(out.far).toBe(a.far);
  });

  it('t=1 matches "b" exactly', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 1);
    expect(toVector3(out.position).equals(toVector3(b.position))).toBe(true);
    expect(toQuaternion(out.quaternion).equals(toQuaternion(b.quaternion))).toBe(true);
    expect(out.fov).toBe(b.fov);
    expect(out.near).toBe(b.near);
    expect(out.far).toBe(b.far);
  });

  it('t=0.5 lands at the midpoint for position and lens', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 0.5);
    expect(out.position[0]).toBeCloseTo(5, 10);
    expect(out.fov).toBeCloseTo(50, 10);
    expect(out.near).toBeCloseTo(0.3, 10);
    expect(out.far).toBeCloseTo(300, 10);
  });

  it('interpolates viewOffset the same way as fov/near/far', () => {
    const out = createCameraState();
    lerpCameraState(out, a, b, 0.5);
    expect(out.viewOffset[0]).toBeCloseTo(50, 10);
    expect(out.viewOffset[1]).toBeCloseTo(-20, 10);
  });

  it('interpolates referenceUp and re-normalizes it', () => {
    const tiltedA = makeState({ referenceUp: [0, 1, 0] });
    const tiltedB = makeState({ referenceUp: [1, 0, 0] });
    const out = createCameraState();

    lerpCameraState(out, tiltedA, tiltedB, 0.5);

    expect(toVector3(out.referenceUp).length()).toBeCloseTo(1, 10);
    expect(out.referenceUp[0]).toBeGreaterThan(0);
    expect(out.referenceUp[1]).toBeGreaterThan(0);
  });

  it('clamps t outside [0, 1]', () => {
    const below = createCameraState();
    const above = createCameraState();
    lerpCameraState(below, a, b, -5);
    lerpCameraState(above, a, b, 5);
    expect(toVector3(below.position).equals(toVector3(a.position))).toBe(true);
    expect(toVector3(above.position).equals(toVector3(b.position))).toBe(true);
  });

  it('does not mutate "a" or "b"', () => {
    const aBefore = { position: toVector3(a.position), quaternion: toQuaternion(a.quaternion) };
    const bBefore = { position: toVector3(b.position), quaternion: toQuaternion(b.quaternion) };

    lerpCameraState(createCameraState(), a, b, 0.3);

    expect(toVector3(a.position).equals(aBefore.position)).toBe(true);
    expect(toQuaternion(a.quaternion).equals(aBefore.quaternion)).toBe(true);
    expect(toVector3(b.position).equals(bBefore.position)).toBe(true);
    expect(toQuaternion(b.quaternion).equals(bBefore.quaternion)).toBe(true);
  });

  it('is safe when "out" aliases "a" or "b" (the reason lerpVectors/slerpQuaternions are used instead of copy().lerp())', () => {
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

  it('hints have no effect when neither state has a target (a/b here both default to hasTarget: false)', () => {
    const withoutHints = createCameraState();
    const withHints = createCameraState();
    lerpCameraState(withoutHints, a, b, 0.5);
    lerpCameraState(withHints, a, b, 0.5, 0b111111);
    expect(toVector3(withHints.position).equals(toVector3(withoutHints.position))).toBe(true);
  });

  describe('hemisphere continuity (a live, moving "b" must not reverse the interpolated path)', () => {
    it('"b" expressed with a flipped quaternion sign produces the SAME result as the correctly-signed one', () => {
      const previousOutput = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // 90°

      // q and -q represent the IDENTICAL rotation — this is exactly what a live target's computed
      // quaternion can look like from one frame to the next after crossing the antipodal boundary.
      const flipped = previousOutput.clone();
      flipped.set(-flipped.x, -flipped.y, -flipped.z, -flipped.w);

      const outWithFlippedB = createCameraState();
      previousOutput.toArray(outWithFlippedB.quaternion);
      lerpCameraState(outWithFlippedB, a, makeState({ quaternion: toTuple(flipped) }), 0.5);

      const outWithNormalB = createCameraState();
      previousOutput.toArray(outWithNormalB.quaternion);
      lerpCameraState(outWithNormalB, a, makeState({ quaternion: toTuple(previousOutput.clone()) }), 0.5);

      // without the fix, three.js's own dot(a, b) check inside slerp would re-derive its OWN sign for
      // whichever "b" it was handed, based on the frozen `a` — not on continuity with `out` — so the two
      // calls above could disagree even though `flipped` and `previousOutput` are the same rotation.
      expect(toQuaternion(outWithFlippedB.quaternion).dot(toQuaternion(outWithNormalB.quaternion))).toBeGreaterThan(
        0.9999,
      );
    });

    it('a continuously-rotating "b" (e.g. Aim tracking an orbiting target) never takes a sudden jump, even sweeping past where "shortest from the frozen a" would flip sides', () => {
      const out = createCameraState();
      const from = makeState(); // frozen "a", identity — stays fixed the whole time, like a real blend
      vec4.copy(out.quaternion, from.quaternion); // seed "previous output" the same way KlippCore does at blend start

      const axis = new Vector3(0, 1, 0);
      const live = makeState();

      // sweep well past 180° from the frozen `from` — the exact region where comparing against a fixed
      // reference (instead of continuity) would flip which side is "shortest"
      for (let angle = 0; angle <= Math.PI * 1.5; angle += 0.05) {
        toQuaternion(live.quaternion).setFromAxisAngle(axis, angle).toArray(live.quaternion);
        const before = toQuaternion(out.quaternion);

        lerpCameraState(out, from, live, 0.5); // fixed t: isolates "b moves" as the only variable

        expect(before.angleTo(toQuaternion(out.quaternion))).toBeLessThan(0.2);
      }
    });
  });

  describe('BlendHints.sphericalPosition/cylindricalPosition', () => {
    const target = new Vector3(0, 0, 0);
    const orbitingA = makeState({
      position: [5, 5, 5],
      quaternion: toTuple(lookAtQuaternion(new Vector3(5, 5, 5), target)),
      target: toTuple(target.clone()),
      hasTarget: true,
      lookAtTarget: toTuple(target.clone()),
      hasLookAtTarget: true,
    });
    const orbitingB = makeState({
      position: [0, 0, 5],
      quaternion: toTuple(lookAtQuaternion(new Vector3(0, 0, 5), target)),
      target: toTuple(target.clone()),
      hasTarget: true,
      lookAtTarget: toTuple(target.clone()),
      hasLookAtTarget: true,
    });

    it('keeps the camera at the interpolated RADIUS from the shared target, unlike a straight cartesian lerp', () => {
      const radiusA = toVector3(orbitingA.position).distanceTo(target);
      const radiusB = toVector3(orbitingB.position).distanceTo(target);

      const spherical = createCameraState();
      lerpCameraState(spherical, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition);
      expect(toVector3(spherical.position).distanceTo(target)).toBeCloseTo((radiusA + radiusB) / 2, 10);

      const linear = createCameraState();
      lerpCameraState(linear, orbitingA, orbitingB, 0.5);
      // real bug this fixes: without the hint, a linear lerp between two points on a sphere cuts inside
      // it, landing at a distance from the target that doesn't match either endpoint's radius
      expect(toVector3(linear.position).distanceTo(target)).not.toBeCloseTo((radiusA + radiusB) / 2, 1);
    });

    it('with a shared lookAtTarget, position AND rotation both track the target exactly (rotation is driven by lookAtTarget regardless of hints - see the describe block below)', () => {
      const out = createCameraState();
      lerpCameraState(out, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition);

      const forward = new Vector3(0, 0, -1).applyQuaternion(toQuaternion(out.quaternion));
      const toTarget = target.clone().sub(toVector3(out.position)).normalize();
      expect(forward.dot(toTarget)).toBeCloseTo(1, 10); // forward IS the direction to the target, exactly
    });

    it("without a shared lookAtTarget, position still blends spherically but rotation falls back to slerping a/b's own quaternions", () => {
      const rotatedA = makeState({
        ...orbitingA,
        quaternion: toTuple(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)),
      });
      const noLookAt = makeState({ position: [0, 0, 5], target: toTuple(target.clone()), hasTarget: true });
      const out = createCameraState();
      lerpCameraState(out, rotatedA, noLookAt, 0.5, BlendHints.sphericalPosition);

      const radiusA = toVector3(rotatedA.position).distanceTo(target);
      const radiusB = toVector3(noLookAt.position).distanceTo(target);
      expect(toVector3(out.position).distanceTo(target)).toBeCloseTo((radiusA + radiusB) / 2, 10); // position: still spherical
      expect(out.hasLookAtTarget).toBe(false);
      // slerp of rotatedA's 90° and noLookAt's identity lands at 45°, not identity
      expect(toQuaternion(out.quaternion).angleTo(new Quaternion())).toBeGreaterThan(0.1);
    });

    it('falls back to a linear lerp when either side lacks hasTarget', () => {
      const noTarget = makeState({ position: [0, 0, 5] });
      const out = createCameraState();
      lerpCameraState(out, orbitingA, noTarget, 0.5, BlendHints.sphericalPosition);
      const linear = createCameraState();
      lerpCameraState(linear, orbitingA, noTarget, 0.5);
      expect(toVector3(out.position).equals(toVector3(linear.position))).toBe(true);
    });

    it('cylindricalPosition interpolates the vertical (Y) axis linearly while still arcing horizontally', () => {
      const higher = makeState({ position: [5, 10, 0], target: toTuple(target.clone()), hasTarget: true });
      const lower = makeState({ position: [0, 0, 5], target: toTuple(target.clone()), hasTarget: true });
      const out = createCameraState();
      lerpCameraState(out, higher, lower, 0.5, BlendHints.cylindricalPosition);
      expect(out.position[1]).toBeCloseTo(5, 10);
    });

    it('sphericalPosition wins when both flags are set', () => {
      const both = createCameraState();
      lerpCameraState(both, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition | BlendHints.cylindricalPosition);
      const sphericalOnly = createCameraState();
      lerpCameraState(sphericalOnly, orbitingA, orbitingB, 0.5, BlendHints.sphericalPosition);
      expect(toVector3(both.position).equals(toVector3(sphericalOnly.position))).toBe(true);
    });

    describe('a side with a zero orbit radius (position exactly AT its own target, e.g. HardLockToTarget snapped onto it) does not fake a sweep through Math.atan2/Spherical\'s "0" fallback angle', () => {
      // real bug: a zero-length offset reports angle 0 (atan2/Spherical's fallback) - sweeping the other
      // side's real angle toward that fake "0" swings the camera around the target for no reason
      const farAngleA = makeState({
        position: [-5, 3, -5], // ~135°, away from atan2's "0" fallback in both axes
        target: toTuple(target.clone()),
        hasTarget: true,
      });
      const zeroRadiusB = makeState({
        position: [8, 2, -1],
        target: [8, 2, -1],
        hasTarget: true,
      });

      it("sphericalPosition holds a's own bearing/elevation instead of sweeping toward theta=0/phi=0", () => {
        const offsetA = toVector3(farAngleA.position).sub(target);
        const thetaA = Math.atan2(offsetA.x, offsetA.z);
        const phiA = Math.acos(offsetA.y / offsetA.length());

        for (let t = 0; t <= 1; t += 0.25) {
          const out = createCameraState();
          lerpCameraState(out, farAngleA, zeroRadiusB, t, BlendHints.sphericalPosition);

          const interpolatedTarget = target.clone().lerp(toVector3(zeroRadiusB.target), t);
          const offset = toVector3(out.position).sub(interpolatedTarget);
          if (offset.length() < 1e-6) continue; // radius ~0 near t=1 - bearing is moot there anyway

          const theta = Math.atan2(offset.x, offset.z);
          const phi = Math.acos(offset.y / offset.length());
          expect(theta).toBeCloseTo(thetaA, 5);
          expect(phi).toBeCloseTo(phiA, 5);
        }
      });

      it('cylindricalPosition holds the same bearing (Y interpolates independently, unaffected)', () => {
        const offsetA = toVector3(farAngleA.position).sub(target);
        const angleA = Math.atan2(offsetA.x, offsetA.z);

        for (let t = 0; t <= 1; t += 0.25) {
          const out = createCameraState();
          lerpCameraState(out, farAngleA, zeroRadiusB, t, BlendHints.cylindricalPosition);

          const interpolatedTarget = target.clone().lerp(toVector3(zeroRadiusB.target), t);
          const offsetX = out.position[0] - interpolatedTarget.x;
          const offsetZ = out.position[2] - interpolatedTarget.z;
          if (Math.hypot(offsetX, offsetZ) < 1e-6) continue;

          expect(Math.atan2(offsetX, offsetZ)).toBeCloseTo(angleA, 5);
        }
      });
    });

    it('out.target/hasTarget carry the lerped target forward when both sides have one (so a later mid-blend interruption still has it)', () => {
      const withDifferentTarget = makeState({
        position: [0, 0, 5],
        target: [10, 0, 0],
        hasTarget: true,
      });
      const out = createCameraState();
      lerpCameraState(out, orbitingA, withDifferentTarget, 0.5);
      expect(out.hasTarget).toBe(true);
      expect(toVector3(out.target).equals(new Vector3(5, 0, 0))).toBe(true);
    });

    it('out.hasTarget is false when either side lacks one', () => {
      const out = createCameraState();
      lerpCameraState(out, orbitingA, makeState(), 0.5);
      expect(out.hasTarget).toBe(false);
    });
  });

  describe('lookAtTarget-driven rotation (independent of position hints - camera-controls-style continuous look-at)', () => {
    /** A state with a REAL, consistent lookAt quaternion for `position`/`lookAtTarget` - matching what an
     *  actual Aim (e.g. `HardLookAt`) would produce, unlike a quaternion left at some unrelated default. */
    function stateWithLookAt(position: Vector3, lookAtTarget: Vector3): CameraState {
      return makeState({
        position: toTuple(position),
        quaternion: toTuple(lookAtQuaternion(position, lookAtTarget)),
        lookAtTarget: toTuple(lookAtTarget),
        hasLookAtTarget: true,
      });
    }

    it('drives rotation via lookAt with NO hints at all (BlendHints.none) - a shared lookAtTarget alone is enough', () => {
      const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
      const b = stateWithLookAt(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
      const out = createCameraState();

      lerpCameraState(out, a, b, 0.5); // no hints argument at all

      const forward = new Vector3(0, 0, -1).applyQuaternion(toQuaternion(out.quaternion));
      const toTarget = toVector3(out.lookAtTarget).sub(toVector3(out.position)).normalize();
      expect(forward.dot(toTarget)).toBeCloseTo(1, 10);
    });

    it("keeps looking exactly at the smoothly-interpolating target even when a's and b's lookAtTargets are far apart and unrelated (real use case: two cameras looking at entirely different subjects, position blending as a plain straight line)", () => {
      const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
      const b = stateWithLookAt(new Vector3(-8, 2, 10), new Vector3(50, 20, -30));

      for (let t = 0; t <= 1; t += 0.1) {
        const out = createCameraState();
        lerpCameraState(out, a, b, t); // no position hint - plain cartesian position lerp

        const expectedTarget = toVector3(a.lookAtTarget).lerp(toVector3(b.lookAtTarget), t);
        expect(toVector3(out.lookAtTarget).distanceTo(expectedTarget)).toBeLessThan(1e-9);

        const forward = new Vector3(0, 0, -1).applyQuaternion(toQuaternion(out.quaternion));
        const toTarget = toVector3(out.lookAtTarget).sub(toVector3(out.position)).normalize();
        expect(forward.dot(toTarget)).toBeGreaterThan(1 - 1e-9);
      }
    });

    it("matches a's/b's quaternion EXACTLY at t=0/t=1 even when they have extra rotation beyond a pure lookAt (real bug: a raw lookAt ignored that extra rotation entirely, popping visibly the instant a blend committed and handed off to the Aim's own state)", () => {
      const a = stateWithLookAt(new Vector3(-5, 0, 0), new Vector3(0, 0, 0));
      const b = stateWithLookAt(new Vector3(5, 0, 0), new Vector3(0, 0, 0));
      // simulate an Aim like RotationComposer layering an extra offset (screen position, damping lag, ...)
      toQuaternion(b.quaternion)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 9))
        .toArray(b.quaternion);

      const outAt0 = createCameraState();
      lerpCameraState(outAt0, a, b, 0);
      expect(toQuaternion(outAt0.quaternion).angleTo(toQuaternion(a.quaternion))).toBeLessThan(1e-9);

      const outAt1 = createCameraState();
      lerpCameraState(outAt1, a, b, 1);
      expect(toQuaternion(outAt1.quaternion).angleTo(toQuaternion(b.quaternion))).toBeLessThan(1e-9);
    });

    it('sphericalPosition still shapes position on top of the always-on lookAt rotation - the two are independent', () => {
      const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
      const b = stateWithLookAt(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
      vec3.set(a.target, 0, 0, 0);
      a.hasTarget = true;
      vec3.set(b.target, 0, 0, 0);
      b.hasTarget = true;

      const linear = createCameraState();
      lerpCameraState(linear, a, b, 0.5);
      const spherical = createCameraState();
      lerpCameraState(spherical, a, b, 0.5, BlendHints.sphericalPosition);

      expect(toVector3(linear.position).equals(toVector3(spherical.position))).toBe(false); // position differs...
      // ...but rotation is identically correct in both, since it never depended on the position hint
      const forwardLinear = new Vector3(0, 0, -1).applyQuaternion(toQuaternion(linear.quaternion));
      const forwardSpherical = new Vector3(0, 0, -1).applyQuaternion(toQuaternion(spherical.quaternion));
      const toTargetLinear = toVector3(linear.lookAtTarget).sub(toVector3(linear.position)).normalize();
      const toTargetSpherical = toVector3(spherical.lookAtTarget).sub(toVector3(spherical.position)).normalize();
      expect(forwardLinear.dot(toTargetLinear)).toBeCloseTo(1, 10);
      expect(forwardSpherical.dot(toTargetSpherical)).toBeCloseTo(1, 10);
    });

    it("without a shared lookAtTarget, rotation falls back to slerping a/b's own quaternions", () => {
      const rotatedA = makeState({
        quaternion: toTuple(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)),
      });
      const noLookAt = makeState({ position: [0, 0, 5] });
      const out = createCameraState();

      lerpCameraState(out, rotatedA, noLookAt, 0.5);

      expect(out.hasLookAtTarget).toBe(false);
      // slerp of rotatedA's 90° and noLookAt's identity lands at 45°, not identity (a degenerate lookAt's result)
      expect(toQuaternion(out.quaternion).angleTo(new Quaternion())).toBeGreaterThan(0.1);
    });

    describe('BlendHints.ignoreTarget', () => {
      it('opts out of lookAt-driven rotation even with a shared lookAtTarget, falling back to a plain slerp', () => {
        const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
        const b = stateWithLookAt(new Vector3(0, 0, 5), new Vector3(0, 0, 0));

        const tracked = createCameraState();
        lerpCameraState(tracked, a, b, 0.5);
        const ignored = createCameraState();
        lerpCameraState(ignored, a, b, 0.5, BlendHints.ignoreTarget);

        expect(toQuaternion(ignored.quaternion).angleTo(toQuaternion(tracked.quaternion))).toBeGreaterThan(0.01);
        // matches the plain-slerp fallback exactly - the same path taken when there's no lookAtTarget at all
        const plainSlerpEquivalent = createCameraState();
        lerpCameraState(
          plainSlerpEquivalent,
          makeState({ quaternion: a.quaternion }),
          makeState({ quaternion: b.quaternion }),
          0.5,
        );
        expect(toQuaternion(ignored.quaternion).angleTo(toQuaternion(plainSlerpEquivalent.quaternion))).toBeLessThan(
          1e-6,
        );
      });

      it('still publishes lookAtTarget/hasLookAtTarget for downstream consumers - only the ROTATION path is affected', () => {
        const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
        const b = stateWithLookAt(new Vector3(0, 0, 5), new Vector3(2, 0, 0));
        const out = createCameraState();

        lerpCameraState(out, a, b, 0.5, BlendHints.ignoreTarget);

        expect(out.hasLookAtTarget).toBe(true);
        expect(toVector3(out.lookAtTarget).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);
      });

      it('is independent of sphericalPosition - position still arcs while rotation still ignores the target', () => {
        const a = stateWithLookAt(new Vector3(5, 5, 5), new Vector3(0, 0, 0));
        const b = stateWithLookAt(new Vector3(0, 0, 5), new Vector3(0, 0, 0));
        vec3.set(a.target, 0, 0, 0);
        a.hasTarget = true;
        vec3.set(b.target, 0, 0, 0);
        b.hasTarget = true;

        const linearWithoutHints = createCameraState();
        lerpCameraState(linearWithoutHints, a, b, 0.5);
        const combined = createCameraState();
        lerpCameraState(combined, a, b, 0.5, BlendHints.sphericalPosition | BlendHints.ignoreTarget);

        // position still arcs (sphericalPosition applied)...
        expect(toVector3(combined.position).equals(toVector3(linearWithoutHints.position))).toBe(false);
        // ...but rotation ignores the target (a plain slerp, not pointed at combined.lookAtTarget)
        const forward = new Vector3(0, 0, -1).applyQuaternion(toQuaternion(combined.quaternion));
        const toTarget = toVector3(combined.lookAtTarget).sub(toVector3(combined.position)).normalize();
        expect(forward.dot(toTarget)).toBeLessThan(1 - 1e-6);
      });
    });
  });
});
