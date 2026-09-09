import { BoxGeometry, Euler, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
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

  it("with damping, the published lookAtTarget eases across a target change instead of teleporting - a blend measures this camera's (damped) rotation against it", () => {
    const aim = new RotationComposerAim(new Vector3(-6, 1, 0), [0, 0], 1, [0, 0], 0.5);
    const out = createCameraState();
    out.position.set(-6, 3, 7);

    aim.update(out, 1 / 60, true); // activation snaps, same as the rotation itself
    expect(out.lookAtTarget.equals(new Vector3(-6, 1, 0))).toBe(true);

    for (let i = 0; i < 10; i++) aim.update(out, 1 / 60, false);
    const settled = out.lookAtTarget.clone();

    aim.target = new Vector3(6, 5, 1); // 13+ units away
    aim.update(out, 1 / 60, false);

    // publishing the raw target moved this 12.7 units in one tick, against 0.14° of actual rotation
    expect(out.lookAtTarget.distanceTo(settled)).toBeLessThan(0.5);

    // ...and it does still get there
    for (let i = 0; i < 240; i++) aim.update(out, 1 / 60, false);
    expect(out.lookAtTarget.distanceTo(new Vector3(6, 5, 1))).toBeLessThan(1e-6);
  });

  it('eases the published lookAtTarget when only its DISTANCE changes - the direction damper converges instantly there, so the point must not skip ahead along the ray', () => {
    const aim = new RotationComposerAim(new Vector3(0, 0, -200), [0, 0], 1, [0, 0], 0.4);
    const out = createCameraState();
    out.position.set(0, 0, 0);
    aim.update(out, 1 / 60, true);

    aim.target = new Vector3(0, 0, -400); // same direction, twice as far
    aim.update(out, 1 / 60, false);

    // publishing the target as soon as the DIRECTION had converged jumped this the full 200 units
    expect(Math.abs(out.lookAtTarget.z + 200)).toBeLessThan(2);

    for (let i = 0; i < 240; i++) aim.update(out, 1 / 60, false);
    expect(out.lookAtTarget.z).toBeCloseTo(-400, 6);
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
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 0);
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
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 0.3);
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

      aim.deadZone = [0.1, 0.1];
      target.set(20, 5, -20); // move well outside the new dead zone (vertically this time)
      aim.update(out, 0.1);
      projected = projectToScreen(out, 1, target);
      expect(projected.y).toBeCloseTo(0.1, 2);
    });

    it('does not backtrack toward the old direction when the target reverses after settling inside the dead zone (real bug: stale damper velocity surviving the freeze)', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.15, 0.15], 0.3);
      const out = createCameraState();
      const dt = 0.016;

      // steady rightward motion, well outside the dead zone - builds up real rotational velocity
      for (let i = 0; i < 40; i++) {
        target.x += 0.3;
        aim.update(out, dt);
      }

      // target stops - let everything fully settle inside the dead zone
      for (let i = 0; i < 300; i++) aim.update(out, dt);

      // now reverses direction - once the camera starts turning back, it must keep turning the SAME way
      // (a stale, still-rightward damper velocity would show up as an opposite-signed blip right when
      // reaction resumes)
      let previousYaw = new Euler().setFromQuaternion(out.quaternion, 'YXZ').y;
      let firstChangeSign = 0;
      for (let i = 0; i < 60; i++) {
        target.x -= 0.3;
        aim.update(out, dt);
        const yaw = new Euler().setFromQuaternion(out.quaternion, 'YXZ').y;
        const delta = yaw - previousYaw;
        if (Math.abs(delta) > 1e-9) {
          if (firstChangeSign === 0) firstChangeSign = Math.sign(delta);
          else expect(Math.sign(delta)).not.toBe(-firstChangeSign);
        }
        previousYaw = yaw;
      }
      expect(firstChangeSign).not.toBe(0); // sanity: it did eventually react
    });
  });

  describe('dead zone with target extent (radius/size)', () => {
    it("a radius makes the dead zone react to the target's EDGE, catching drift a point target would still ignore", () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0, [0, 0], new Vector3(), 1); // radius = 1
      const out = createCameraState();
      out.fov = 90; // tan(45°) = 1, so depth-normalized math is clean
      aim.update(out, 0.1); // baseline, dead-center

      target.set(1.5, 0, -10); // point-only offset: 1.5 / depth(10) = 0.15, inside [0.2, 0.2]
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      // edge = 0.15 + radius(1)/depth(10) = 0.25, past the dead zone's 0.2 half-width - clamped there,
      // so the CENTER lands 0.1 short of the edge (0.2 - extent 0.1)
      expect(projected.x).toBeCloseTo(0.1, 4);
    });

    it('the identical nudge with no radius stays inside the dead zone (point-target baseline unaffected)', () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1);
      const before = out.quaternion.clone();

      target.set(1.5, 0, -10);
      aim.update(out, 0.1);

      expect(out.quaternion.equals(before)).toBe(true);
    });

    it('an axis-aligned size reproduces the same edge as an equivalent radius', () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0, [0, 0], new Vector3(), undefined, [2, 2, 2]);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1);

      target.set(1.5, 0, -10);
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.1, 4); // half-size 1 on each axis - same reach as radius 1
    });

    it("a rotated box uses its own oriented extent, not an axis-aligned approximation", () => {
      const targetObject = new Object3D();
      targetObject.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4); // 45° around Y
      targetObject.position.set(0, 0, -10);

      const aim = new RotationComposerAim(
        targetObject,
        [0, 0],
        1,
        [0.2, 0.2],
        0,
        [0, 0],
        new Vector3(),
        undefined,
        [2, 2, 2],
      );
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1); // dead-center baseline

      targetObject.position.set(1.5, 0, -10);
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, targetObject.position.clone());
      // a 45°-rotated square's half-diagonal reach along Right = half-size * sqrt(2)
      const extent = Math.sqrt(2) / 10;
      expect(projected.x).toBeCloseTo(0.2 - extent, 4);
    });

    it('auto-detects size from a Mesh target end-to-end, same as an explicit size', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(0, 0, -10);

      const aim = new RotationComposerAim(mesh, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1);

      mesh.position.set(1.5, 0, -10);
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, mesh.position.clone());
      expect(projected.x).toBeCloseTo(0.1, 4);
    });

    // raw vertex mutation, not .scale()/.applyMatrix4() - the one case three.js never keeps a cached
    // boundingBox in sync for automatically
    function growMeshGeometryThreefold(mesh: Mesh): void {
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        position.setXYZ(i, position.getX(i) * 3, position.getY(i) * 3, position.getZ(i) * 3);
      }
      position.needsUpdate = true;
    }

    it('recalculateSize() reacts to a grown mesh on the very next update() call', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(0, 0, -10);
      const aim = new RotationComposerAim(mesh, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1);

      growMeshGeometryThreefold(mesh); // half-extent 1 -> 3
      aim.recalculateSize();
      mesh.position.set(1.5, 0, -10);
      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, mesh.position.clone());
      expect(projected.x).not.toBeCloseTo(0.1, 2); // the grown extent changes the reaction from the baseline
    });

    it('recalculateSize() only forces ONE recompute - a LATER deformation goes stale again', () => {
      // the dead zone's own edge-correction converges over several ticks even with damping=0 (its "desired"
      // point is derived from last frame's own result) - settle fully after each stage so only the extent's
      // effect is being compared, not leftover convergence noise
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(4, 0, -10);
      const aim = new RotationComposerAim(mesh, [0, 0], 1, [1.2, 1.2], 0);
      const out = createCameraState();
      out.fov = 90;
      for (let i = 0; i < 30; i++) aim.update(out, 0.1);

      growMeshGeometryThreefold(mesh); // half-extent 1 -> 3
      aim.recalculateSize(); // only the FIRST of these settling calls actually forces a recompute
      for (let i = 0; i < 30; i++) aim.update(out, 0.1);
      const afterFirstRecalc = out.quaternion.clone();

      growMeshGeometryThreefold(mesh); // half-extent 3 -> 9, but NOT recalculated again
      for (let i = 0; i < 30; i++) aim.update(out, 0.1);

      expect(out.quaternion.angleTo(afterFirstRecalc)).toBeLessThan(1e-6); // still reacting to the 3x measurement
    });
  });

  describe('extent bigger than the reaction zone (real bug in PositionComposer, fixed here from the start)', () => {
    it('a radius larger than the dead zone settles at dead center instead of alternating forever', () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0, [0, 0], new Vector3(), 3); // radius 3 > deadZone's own half-width in world units at this depth
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1); // baseline, dead-center

      target.set(0.3, 0, -10); // nudge off-center
      aim.update(out, 0.1); // first reaction to the nudge - expected to move
      let previous = out.quaternion.clone();
      for (let i = 0; i < 20; i++) {
        aim.update(out, 0.1);
        expect(out.quaternion.angleTo(previous)).toBeLessThan(1e-6); // stays put after that, doesn't alternate
        previous = out.quaternion.clone();
      }

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 4); // the best achievable compromise: dead center
    });

    it('a radius larger than hardLimit settles at dead center there too, not alternating', () => {
      const target = new Vector3(0, 0, -10);
      // huge deadZone never triggers, isolating hardLimit; radius 3 > hardLimit's own half-width here
      const aim = new RotationComposerAim(target, [0, 0], 1, [10, 10], 0, [0.1, 0.1], new Vector3(), 3);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1); // baseline, dead-center

      target.set(3, 0, -10); // nudge - stays inside the huge deadZone, so only hardLimit reacts
      aim.update(out, 0.1); // first reaction to the nudge - expected to move
      let previous = out.quaternion.clone();
      for (let i = 0; i < 20; i++) {
        aim.update(out, 0.1);
        expect(out.quaternion.angleTo(previous)).toBeLessThan(1e-6); // stays put after that, doesn't alternate
        previous = out.quaternion.clone();
      }

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 3); // the best achievable compromise: dead center
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
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5, [0.15, 0.15]);
      aim.update(createCameraState(), 0.1); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();

      aim.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.15, 4); // clamped to the hard limit's edge
    });

    it('hardLimit=[0,0] (default): no enforcement, an unclamped damped result can lag past where a hard limit would clamp it', () => {
      const target = new Vector3(20, 0, -20);

      const aimWithoutLimit = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5);
      aimWithoutLimit.update(createCameraState(), 0.1); // consume the first-ever-update hard snap
      const withoutLimit = createCameraState();
      aimWithoutLimit.update(withoutLimit, 0.1);

      const aimWithLimit = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5, [0.15, 0.15]);
      aimWithLimit.update(createCameraState(), 0.1); // consume the first-ever-update hard snap
      const withLimit = createCameraState();
      aimWithLimit.update(withLimit, 0.1);

      expect(withoutLimit.quaternion.equals(withLimit.quaternion)).toBe(false);
      const projected = projectToScreen(withoutLimit, 1, target);
      expect(Math.abs(projected.x)).toBeGreaterThan(0.15); // past where hardLimit=[0.15,0.15] would have clamped it
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

  describe('lookahead', () => {
    const dt = 1 / 60;

    it('lookaheadTime 0 (default) leaves out.lookAtTarget at the raw target position', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target);
      const out = createCameraState();

      aim.update(out, dt, true);
      target.set(5, 0, -20);
      aim.update(out, dt, false);

      expect(out.lookAtTarget.equals(target)).toBe(true);
    });

    it('extrapolates out.lookAtTarget ahead of a target moving at constant velocity', () => {
      const target = new Vector3();
      const aim = new RotationComposerAim(target);
      aim.lookaheadTime = 0.5;
      aim.lookaheadSmoothing = 10;
      const out = createCameraState();

      aim.update(out, dt, true); // activation: predictor reset, records the first sample only
      for (let i = 0; i < 120; i++) {
        target.x += 10 * dt; // constant velocity, 10 units/s
        aim.update(out, dt, false);
      }

      // steady state: predicted 0.5s ahead at 10 units/s = +5 beyond the raw target
      expect(out.lookAtTarget.x - target.x).toBeCloseTo(5, 1);
    });

    it('a fresh activation resets the predictor - the first frame after it predicts nothing yet', () => {
      const target = new Vector3();
      const aim = new RotationComposerAim(target);
      aim.lookaheadTime = 0.5;
      aim.lookaheadSmoothing = 10;
      const out = createCameraState();

      aim.update(out, dt, true);
      for (let i = 0; i < 60; i++) {
        target.x += 10 * dt;
        aim.update(out, dt, false);
      }
      expect(out.lookAtTarget.x - target.x).not.toBeCloseTo(0, 1); // built up a real lookahead offset

      // a later, unrelated activation - same still-moving target, but the predictor shouldn't carry over
      aim.update(out, dt, true);
      expect(out.lookAtTarget.x).toBeCloseTo(target.x, 4);
    });

    it('retargeting to a different reference resets the predictor too, even without justActivated', () => {
      const targetA = new Vector3();
      const aim = new RotationComposerAim(targetA);
      aim.lookaheadTime = 0.5;
      aim.lookaheadSmoothing = 10;
      const out = createCameraState();

      aim.update(out, dt, true);
      for (let i = 0; i < 60; i++) {
        targetA.x += 10 * dt;
        aim.update(out, dt, false);
      }

      const targetB = new Vector3(100, 0, -20);
      aim.target = targetB;
      aim.update(out, dt, false); // no justActivated - only the target reference changed

      // out.lookAtTarget is reconstructed through its own direction+distance damper (unlike out.target's
      // direct passthrough), so a huge jump leaves a tiny numeric residual even at damping 0 - a few
      // hundredths is still far below the ~5 unit lookahead offset a stale predictor would have added
      expect(out.lookAtTarget.distanceTo(targetB)).toBeLessThan(0.01);
    });

    it('ignoreY zeroes the vertical component of the predicted offset', () => {
      const target = new Vector3();
      const aim = new RotationComposerAim(target);
      aim.lookaheadTime = 0.5;
      aim.lookaheadSmoothing = 10;
      aim.lookaheadIgnoreY = true;
      const out = createCameraState();

      aim.update(out, dt, true);
      for (let i = 0; i < 120; i++) {
        target.y += 10 * dt; // moving straight up
        aim.update(out, dt, false);
      }

      expect(out.lookAtTarget.y).toBeCloseTo(target.y, 4); // vertical lookahead suppressed
    });
  });
});
