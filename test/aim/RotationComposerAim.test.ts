import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { RotationComposerAim } from '../../src/aim/RotationComposerAim';

/** Projects `target` through a REAL three.js PerspectiveCamera at `out`'s position/rotation/fov/aspect —
 *  independent ground truth (three.js's own `project()`), not a re-derivation of our own formula. */
function projectToScreen(out: ReturnType<typeof createCameraState>, aspect: number, target: Vector3): Vector3 {
  const camera = new PerspectiveCamera(out.fov, aspect, 0.1, 1000);
  camera.position.copy(out.position);
  camera.quaternion.copy(out.quaternion);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return target.clone().project(camera);
}

describe('RotationComposerAim', () => {
  it('centers the target on screen when screenPosition is [0, 0] (default) — same as HardLookAt', () => {
    const target = new Vector3(5, 2, -30);
    const aim = new RotationComposerAim(target);
    const out = createCameraState();
    out.position.set(1, 1, 0);

    aim.update(out, 0.1);

    const projected = projectToScreen(out, 1, target);
    expect(projected.x).toBeCloseTo(0, 9);
    expect(projected.y).toBeCloseTo(0, 9);
  });

  it("writes the resolved target's world position and hasLookAtTarget onto out, for the blend's always-on lookAt rotation - the raw target, unaffected by screenPosition/deadZone offsets", () => {
    const target = new Vector3(5, 2, -30);
    const aim = new RotationComposerAim(target, [0.3, 0.2]); // non-zero screenPosition on purpose
    const out = createCameraState();
    out.position.set(1, 1, 0);

    aim.update(out, 0.1);

    expect(out.hasLookAtTarget).toBe(true);
    expect(out.lookAtTarget.equals(target)).toBe(true);
  });

  it('lands the target at a non-zero screenPosition, independent of distance', () => {
    const aim = new RotationComposerAim(new Vector3(), [0.3, 0.2], 1.5);
    const out = createCameraState();
    out.fov = 60;

    for (const distance of [5, 20, 100]) {
      const target = new Vector3(2, 1, -distance);
      aim.target = target;
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1.5, target);
      expect(projected.x).toBeCloseTo(0.3, 5);
      expect(projected.y).toBeCloseTo(0.2, 5);
    }
  });

  it('respects fov and aspect', () => {
    const target = new Vector3(0, 0, -20);
    const aim = new RotationComposerAim(target, [-0.4, 0.6], 2.5);
    const out = createCameraState();
    out.position.set(3, -1, 5);
    out.fov = 35;

    aim.update(out, 0.1);

    const projected = projectToScreen(out, 2.5, target);
    expect(projected.x).toBeCloseTo(-0.4, 5);
    expect(projected.y).toBeCloseTo(0.6, 5);
  });

  it('never touches position — rotation-only Aim', () => {
    const target = new Vector3(3, 1, -8);
    const aim = new RotationComposerAim(target, [0.2, 0.1]);
    const out = createCameraState();
    out.position.set(9, 8, 7);
    const before = out.position.clone();

    aim.update(out, 0.1);

    expect(out.position.equals(before)).toBe(true);
  });

  it("accounts for the target's WORLD position (parent transform included)", () => {
    const parent = new Object3D();
    parent.position.set(50, 0, 0);
    const child = new Object3D();
    child.position.set(0, 0, -10);
    parent.add(child);

    const aim = new RotationComposerAim(child);
    const out = createCameraState();
    aim.update(out, 0.1);

    const projected = projectToScreen(out, 1, new Vector3(50, 0, -10));
    expect(projected.x).toBeCloseTo(0, 9);
    expect(projected.y).toBeCloseTo(0, 9);
  });

  it('a null target is a no-op, not a crash', () => {
    const aim = new RotationComposerAim(null, [0.5, 0.5]);
    const out = createCameraState();

    expect(() => aim.update(out, 0.1)).not.toThrow();
    expect(out.quaternion.equals(createCameraState().quaternion)).toBe(true);
  });

  it('target/screenPosition/aspect are mutable fields', () => {
    const target = new Vector3(0, 0, -10);
    const aim = new RotationComposerAim(target, [0, 0], 1);
    const out = createCameraState();

    aim.update(out, 0.1);
    let projected = projectToScreen(out, 1, target);
    expect(projected.x).toBeCloseTo(0, 5);

    aim.screenPosition = [0.4, 0];
    aim.update(out, 0.1);
    projected = projectToScreen(out, 1, target);
    expect(projected.x).toBeCloseTo(0.4, 5);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerAim(aim.update))', () => {
    const target = new Vector3(0, 0, -10);
    const aim = new RotationComposerAim(target);
    const { update } = aim;

    const out = createCameraState();
    expect(() => update(out, 0.1)).not.toThrow();
  });

  describe('dead zone + damping', () => {
    it('target inside the dead zone: zero reaction — quaternion stays exactly unchanged', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.4, 0.4], 0);
      const out = createCameraState();
      out.position.set(0, 0, 0);

      // move the target slightly off-center, but within the [0.4, 0.4] dead zone
      target.set(1, 1, -20);
      const before = out.quaternion.clone();
      aim.update(out, 0.1);

      expect(out.quaternion.equals(before)).toBe(true);
    });

    it('hardLimit still enforces when the target sits inside a LARGER deadZone (real bug: the dead zone used to return from the whole update, skipping the hardLimit pass entirely)', () => {
      const target = new Vector3(0, 0, -20);
      // hardLimit narrower than deadZone — a plausible misconfiguration (hardLimit is meant to be the
      // wider, outer box), but hardLimit's guarantee should hold regardless
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.4, 0.4], 0, [0.05, 0.05]);
      const out = createCameraState();
      out.position.set(0, 0, 0);

      target.set(1, 1, -20); // same offset as above — inside deadZone (no reaction there)...
      const before = out.quaternion.clone();
      aim.update(out, 0.1); // ...but hardLimit=[0.05,0.05] is narrower, so it must still correct this

      expect(out.quaternion.equals(before)).toBe(false);
    });

    it('target outside the dead zone with damping <= 0: snaps instantly to the dead zone EDGE, not to screenPosition center', () => {
      const target = new Vector3(20, 0, -20); // far outside the dead zone on X
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();

      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      // landed on the RIGHT EDGE of the dead zone (screenPosition 0 + halfWidth 0.1), not at 0
      expect(projected.x).toBeCloseTo(0.1, 4);
      expect(projected.y).toBeCloseTo(0, 4);
    });

    it('target outside the dead zone with damping > 0: catches up gradually, not instantly', () => {
      const target = new Vector3(20, 0, -20);

      // the fully-converged, undamped edge orientation, for reference
      const undamped = createCameraState();
      new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0).update(undamped, 0.016);

      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0.5);
      aim.update(createCameraState(), 0.016); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();
      aim.update(out, 0.016);

      expect(out.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0); // moved off identity
      expect(out.quaternion.angleTo(undamped.quaternion)).toBeGreaterThan(0.01); // but not there yet
    });

    it('converges to the dead zone edge over repeated ticks with damping enabled', () => {
      const target = new Vector3(20, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0.3);
      const out = createCameraState();

      for (let i = 0; i < 300; i++) aim.update(out, 0.016);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.1, 2);
    });

    it('stops reacting once the target is exactly AT the dead zone edge (boundary counts as inside)', () => {
      const target = new Vector3(20, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();
      aim.update(out, 0.1); // snaps to the edge, target far outside

      const afterEdgeSnap = out.quaternion.clone();
      aim.update(out, 0.1); // same target, now sitting exactly at the (inclusive) dead zone boundary

      expect(out.quaternion.equals(afterEdgeSnap)).toBe(true);
    });

    it('deadZone/damping are mutable fields', () => {
      const target = new Vector3(20, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0, 0], 0);
      const out = createCameraState();

      aim.update(out, 0.1); // no dead zone yet: snaps straight to center (screenPosition 0)
      let projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 4);

      aim.deadZone = [0.2, 0.2];
      target.set(20, 5, -20); // move well outside the new dead zone (vertically this time)
      aim.update(out, 0.1);
      projected = projectToScreen(out, 1, target);
      expect(projected.y).toBeCloseTo(0.1, 2);
    });
  });

  describe('targetOffset', () => {
    it("shifts the look-at point in the target's LOCAL space, not world space", () => {
      const target = new Object3D();
      target.position.set(0, 0, -20);
      target.rotation.set(0, Math.PI / 2, 0);

      const offset = new Vector3(1, 0, 0);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0, 0], 0, [0, 0], offset);
      const out = createCameraState();
      aim.update(out, 0.1);

      const expectedLookAtPoint = target.position.clone().add(offset.clone().applyQuaternion(target.quaternion));
      const projected = projectToScreen(out, 1, expectedLookAtPoint);
      expect(projected.x).toBeCloseTo(0, 5);
      expect(projected.y).toBeCloseTo(0, 5);
    });

    it('degrades to a plain world-space addition for a fixed-point target (no rotation to apply)', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0, 0], 0, [0, 0], new Vector3(2, 3, 0));
      const out = createCameraState();
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, new Vector3(2, 3, -20));
      expect(projected.x).toBeCloseTo(0, 5);
      expect(projected.y).toBeCloseTo(0, 5);
    });

    it('is a mutable field', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target);
      const out = createCameraState();
      aim.update(out, 0.1);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0, 5);

      aim.targetOffset = new Vector3(5, 0, 0);
      aim.update(out, 0.1);
      expect(projectToScreen(out, 1, new Vector3(5, 0, -20)).x).toBeCloseTo(0, 5);
    });
  });

  describe('hard limit', () => {
    it('forces the target back inside hardLimit even when heavy damping alone would leave it outside', () => {
      const target = new Vector3(20, 0, -20); // far outside on X
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5, [0.3, 0.3]);
      aim.update(createCameraState(), 0.1); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();

      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.15, 4); // clamped to the hard limit's edge (0.3 / 2)
    });

    it('hardLimit=[0,0] (default): no enforcement, an unclamped damped result can lag past where a hard limit would clamp it', () => {
      const target = new Vector3(20, 0, -20);

      const aimWithoutLimit = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5);
      aimWithoutLimit.update(createCameraState(), 0.1); // consume the first-ever-update hard snap
      const withoutLimit = createCameraState();
      aimWithoutLimit.update(withoutLimit, 0.1);

      const aimWithLimit = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5, [0.3, 0.3]);
      aimWithLimit.update(createCameraState(), 0.1); // consume the first-ever-update hard snap
      const withLimit = createCameraState();
      aimWithLimit.update(withLimit, 0.1);

      expect(withoutLimit.quaternion.equals(withLimit.quaternion)).toBe(false);
      const projected = projectToScreen(withoutLimit, 1, target);
      expect(Math.abs(projected.x)).toBeGreaterThan(0.15); // past where hardLimit=[0.3,0.3] would have clamped it
    });

    it('does nothing when the damped result already sits inside a generous hardLimit', () => {
      const target = new Vector3(20, 0, -20);
      const withoutLimit = createCameraState();
      new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0.3).update(withoutLimit, 0.016);

      const withLimit = createCameraState();
      new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0.3, [1000, 1000]).update(withLimit, 0.016);

      expect(withLimit.quaternion.equals(withoutLimit.quaternion)).toBe(true);
    });
  });

  describe('justActivated', () => {
    it('snaps straight to target even with a warmed-up damper and a stale out.quaternion', () => {
      // off-axis from identity (unlike straight down -Z) so the warm-up calls below exercise REAL
      // damping, not the angle~0 shortcut that would leave the underlying Damper looking un-warmed
      const aim = new RotationComposerAim(new Vector3(10, 0, -10), [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();

      aim.update(out, 0.016, true); // first-ever session: snaps, warms up the damper
      aim.update(out, 0.016, false); // already at target: settles, still genuinely warmed up

      // a later, unrelated session: out.quaternion is frozen at wherever the FIRST session left it
      aim.target = new Vector3(30, -8, -5);
      aim.update(out, 0.016, true);

      const projected = projectToScreen(out, 1, aim.target);
      expect(projected.x).toBeCloseTo(0, 5);
      expect(projected.y).toBeCloseTo(0, 5);
    });

    it('without justActivated, the same stale-state scenario eases instead of snapping (the bug this fixes)', () => {
      const aim = new RotationComposerAim(new Vector3(10, 0, -10), [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();

      aim.update(out, 0.016, true);
      aim.update(out, 0.016, false);

      aim.target = new Vector3(30, -8, -5);
      aim.update(out, 0.016, false); // no reactivation signal — damps from the stale orientation instead

      const projected = projectToScreen(out, 1, aim.target);
      expect(Math.abs(projected.x) + Math.abs(projected.y)).toBeGreaterThan(0.01); // not centered yet
    });

    it('skips the dead zone check — a stale out.quaternion inside the box would otherwise cause no reaction at all', () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.9, 0.9], 0); // huge dead zone, instant damping
      const out = createCameraState();
      aim.update(out, 0.016, true); // centers on target, well inside its own dead zone from here on

      // a later session retargets close by — small enough that, if the dead zone check ran against the
      // STALE (but numerically nearby) orientation, it would find "inside the box" and never react
      aim.target = new Vector3(0.5, 0, -10);
      aim.update(out, 0.016, true);

      const projected = projectToScreen(out, 1, aim.target);
      expect(projected.x).toBeCloseTo(0, 5); // reacted anyway — justActivated bypasses the dead zone
    });
  });
});
