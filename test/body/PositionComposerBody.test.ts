import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { PositionComposerBody } from '../../src/body/PositionComposerBody';

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

describe('PositionComposerBody', () => {
  it("writes the target's world position and hasTarget onto out, for BlendHints' sphericalPosition", () => {
    const target = new Vector3(0, 0, -20);
    const body = new PositionComposerBody(target, 10, [0, 0], 1);
    const out = createCameraState();

    body.update(out, 0.1);

    expect(out.hasTarget).toBe(true);
    expect(out.target.equals(target)).toBe(true);
  });

  it('dollies along the camera forward axis until the target is at cameraDistance', () => {
    const target = new Vector3(0, 0, -20); // straight ahead, camera at identity rotation faces -Z
    const body = new PositionComposerBody(target, 10, [0, 0], 1);
    const out = createCameraState(); // position (0,0,0), identity rotation

    body.update(out, 0.1);

    const depth = target
      .clone()
      .sub(out.position)
      .dot(new Vector3(0, 0, -1));
    expect(depth).toBeCloseTo(10, 10);
  });

  it('never touches rotation — position-only Body', () => {
    const target = new Vector3(3, 1, -8);
    const body = new PositionComposerBody(target, 10);
    const out = createCameraState();
    out.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const before = out.quaternion.clone();

    body.update(out, 0.1);

    expect(out.quaternion.equals(before)).toBe(true);
  });

  it('centers the target on screen when screenPosition is [0, 0] (default)', () => {
    const target = new Vector3(5, 2, -30); // off to the side, not straight ahead
    const body = new PositionComposerBody(target, 8, [0, 0], 1.5);
    const out = createCameraState();
    out.fov = 60;

    body.update(out, 0.1);

    const projected = projectToScreen(out, 1.5, target);
    expect(projected.x).toBeCloseTo(0, 5);
    expect(projected.y).toBeCloseTo(0, 5);
  });

  it('lands the target at a non-zero screenPosition', () => {
    const target = new Vector3(0, 0, -15);
    const body = new PositionComposerBody(target, 10, [0.5, -0.3], 1.7777);
    const out = createCameraState();
    out.fov = 50;

    body.update(out, 0.1);

    const projected = projectToScreen(out, 1.7777, target);
    expect(projected.x).toBeCloseTo(0.5, 5);
    expect(projected.y).toBeCloseTo(-0.3, 5);
  });

  it('respects fov and aspect when converting screenPosition to world units', () => {
    const target = new Vector3(0, 0, -15);
    const body = new PositionComposerBody(target, 10, [0.5, 0.5], 2);
    const out = createCameraState();
    out.fov = 90; // wide FOV: same screenPosition should still land correctly

    body.update(out, 0.1);

    const projected = projectToScreen(out, 2, target);
    expect(projected.x).toBeCloseTo(0.5, 5);
    expect(projected.y).toBeCloseTo(0.5, 5);
  });

  it('composes correctly even with a rotated (non-identity) camera orientation', () => {
    const target = new Vector3(10, 5, 10);
    const body = new PositionComposerBody(target, 12, [0.2, 0.1], 1.6);
    const out = createCameraState();
    out.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3); // yawed 60°
    out.fov = 45;

    body.update(out, 0.1);

    const projected = projectToScreen(out, 1.6, target);
    expect(projected.x).toBeCloseTo(0.2, 4);
    expect(projected.y).toBeCloseTo(0.1, 4);
  });

  it("accounts for the target's WORLD position (parent transform included)", () => {
    const parent = new Object3D();
    parent.position.set(100, 0, 0);
    const child = new Object3D();
    child.position.set(0, 0, -10);
    parent.add(child);

    const body = new PositionComposerBody(child, 10);
    const out = createCameraState();
    body.update(out, 0.1);

    // world position of child is (100, 0, -10); centering it (screenPosition [0,0]) with the camera
    // facing pure -Z means the camera lines up on the SAME world X, 10 units in front on Z
    expect(out.position.x).toBeCloseTo(100, 8);
    expect(out.position.z).toBeCloseTo(0, 8);
  });

  it('a null target is a no-op, not a crash', () => {
    const body = new PositionComposerBody(null);
    const out = createCameraState();

    expect(() => body.update(out, 0.1)).not.toThrow();
    expect(out.position.equals(new Vector3())).toBe(true);
  });

  it('target/cameraDistance/screenPosition/aspect are mutable fields', () => {
    const targetA = new Vector3(0, 0, -10);
    const targetB = new Vector3(0, 0, -30);
    const body = new PositionComposerBody(targetA, 10, [0, 0], 1);
    const out = createCameraState();

    body.update(out, 0.1);
    expect(out.position.z).toBeCloseTo(0, 8);

    body.target = targetB;
    body.cameraDistance = 20;
    body.update(out, 0.1);

    const depth = targetB
      .clone()
      .sub(out.position)
      .dot(new Vector3(0, 0, -1));
    expect(depth).toBeCloseTo(20, 8);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerBody(body.update))', () => {
    const target = new Vector3(0, 0, -10);
    const body = new PositionComposerBody(target, 10);
    const { update } = body;

    const out = createCameraState();
    expect(() => update(out, 0.1)).not.toThrow();
  });

  describe('dead zone + damping', () => {
    it('target inside the dead zone: zero lateral reaction — position unchanged by stage 2', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.4, 0.4], 0);
      const out = createCameraState();
      body.update(out, 0.1); // establishes stage-1 dolly, target dead-center

      const afterFirstUpdate = out.position.clone();
      target.set(0.5, 0, -20); // nudge sideways, but within the [0.4, 0.4] dead zone
      body.update(out, 0.1);

      expect(out.position.equals(afterFirstUpdate)).toBe(true);
    });

    it('hardLimit still enforces when the target sits inside a LARGER deadZone (real bug: the dead zone used to return from the whole update, skipping the hardLimit pass entirely)', () => {
      const target = new Vector3(0, 0, -20);
      // hardLimit narrower than deadZone — a plausible misconfiguration (hardLimit is meant to be the
      // wider, outer box), but hardLimit's guarantee should hold regardless
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.4, 0.4], 0, [0.1, 0.1]);
      const out = createCameraState();
      body.update(out, 0.1); // establishes stage-1 dolly, target dead-center

      const afterFirstUpdate = out.position.clone();
      target.set(0.5, 0, -20); // same nudge as above — inside deadZone (no lateral reaction there)...
      body.update(out, 0.1); // ...but hardLimit=[0.1,0.1] is narrower, so it must still correct this

      expect(out.position.equals(afterFirstUpdate)).toBe(false);
    });

    it('target outside the dead zone with damping <= 0: snaps instantly to the dead zone EDGE, not to screenPosition center', () => {
      const target = new Vector3(20, 0, -20); // far outside the dead zone on X
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();

      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      // landed on the RIGHT EDGE of the dead zone (screenPosition 0 + halfWidth 0.1), not at 0
      expect(projected.x).toBeCloseTo(0.1, 4);
      expect(projected.y).toBeCloseTo(0, 4);
    });

    it('target outside the dead zone with damping > 0: catches up gradually, not instantly', () => {
      const target = new Vector3(20, 0, -20);

      const undamped = createCameraState();
      new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0).update(undamped, 0.016);

      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0.5);
      body.update(createCameraState(), 0.016); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();
      body.update(out, 0.016);

      expect(out.position.distanceTo(undamped.position)).toBeGreaterThan(0.01);
    });

    it('converges to the dead zone edge over repeated ticks with damping enabled', () => {
      const target = new Vector3(20, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0.3);
      const out = createCameraState();

      for (let i = 0; i < 300; i++) body.update(out, 0.016);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.1, 2);
    });

    it('stops reacting once the target is exactly AT the dead zone edge (boundary counts as inside)', () => {
      const target = new Vector3(20, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0);
      const out = createCameraState();
      body.update(out, 0.1); // snaps to the edge, target far outside

      const afterEdgeSnap = out.position.clone();
      body.update(out, 0.1); // same target, now sitting exactly at the (inclusive) dead zone boundary

      expect(out.position.equals(afterEdgeSnap)).toBe(true);
    });

    it('deadZone/damping are mutable fields', () => {
      const target = new Vector3(20, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0, 0], 0);
      const out = createCameraState();

      body.update(out, 0.1); // no dead zone yet: snaps straight to center (screenPosition 0)
      let projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 4);

      body.deadZone = [0.2, 0.2];
      target.set(20, 5, -20); // move well outside the new dead zone (vertically this time)
      body.update(out, 0.1);
      projected = projectToScreen(out, 1, target);
      expect(projected.y).toBeCloseTo(0.1, 2);
    });
  });

  describe('justActivated', () => {
    it('snaps straight to the composed position even with a warmed-up damper and a stale out.position', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();

      body.update(out, 0.016, true); // first-ever session: snaps, warms up the damper
      body.update(out, 0.016, false);

      // a later, unrelated session: out.position is frozen at wherever the FIRST session left it
      target.set(40, -12, -30);
      body.update(out, 0.016, true);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 4);
      expect(projected.y).toBeCloseTo(0, 4);
    });

    it('without justActivated, the same stale-state scenario eases instead of snapping (the bug this fixes)', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();

      body.update(out, 0.016, true);
      body.update(out, 0.016, false);

      target.set(40, -12, -30);
      body.update(out, 0.016, false); // no reactivation signal — damper treats this as a normal retarget

      const projected = projectToScreen(out, 1, target);
      expect(Math.abs(projected.x) + Math.abs(projected.y)).toBeGreaterThan(0.01); // not centered yet
    });

    it('skips the dead zone check — a stale out.position inside the box would otherwise cause no reaction at all', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.9, 0.9], 0); // huge dead zone, instant damping
      const out = createCameraState();
      body.update(out, 0.016, true); // centers on target, well inside its own dead zone from here on

      // a later session retargets close by — small enough that, if the dead zone check ran against the
      // STALE (but numerically nearby) position, it would find "inside the box" and never react
      target.set(0.5, 0, -20);
      body.update(out, 0.016, true);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 4); // reacted anyway — justActivated bypasses the dead zone
    });
  });

  describe('dead zone with target extent (radius/size)', () => {
    it("a radius makes the dead zone react to the target's EDGE, catching drift a point target would still ignore", () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.4, 0.4], 0, [0, 0], 1); // radius = 1
      const out = createCameraState();
      out.fov = 90; // tan(45°) = 1, so halfWidth = cameraDistance exactly - clean world-unit math
      body.update(out, 0.1); // establishes stage-1 dolly, target dead-center

      target.set(1.5, 0, -20); // point-only offset: 1.5 / 10 = 0.15 screen units, inside [0.4, 0.4]
      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      // edge = 0.15 + radius(1)/cameraDistance(10) = 0.25, past the dead zone's 0.2 half-width - clamped
      // there, so the CENTER lands 0.1 short of the edge (0.2 - extent 0.1)
      expect(projected.x).toBeCloseTo(0.1, 4);
    });

    it('the identical nudge with no radius stays inside the dead zone (point-target baseline unaffected)', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.4, 0.4], 0);
      const out = createCameraState();
      out.fov = 90;
      body.update(out, 0.1);
      const afterFirstUpdate = out.position.clone();

      target.set(1.5, 0, -20);
      body.update(out, 0.1);

      expect(out.position.equals(afterFirstUpdate)).toBe(true);
    });

    it('an axis-aligned size reproduces the same edge as an equivalent radius', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.4, 0.4], 0, [0, 0], undefined, [2, 2, 2]);
      const out = createCameraState();
      out.fov = 90;
      body.update(out, 0.1);

      target.set(1.5, 0, -20);
      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.1, 4); // half-size 1 on each axis - same reach as radius 1
    });

    it("a rotated box uses its own oriented extent, not an axis-aligned approximation", () => {
      const targetObject = new Object3D();
      targetObject.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4); // 45° around Y
      targetObject.position.set(0, 0, -20);

      const body = new PositionComposerBody(targetObject, 10, [0, 0], 1, [0.4, 0.4], 0, [0, 0], undefined, [2, 2, 2]);
      const out = createCameraState();
      out.fov = 90;
      body.update(out, 0.1); // dead-center baseline

      targetObject.position.set(1.5, 0, -20);
      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, targetObject.position.clone());
      // a 45°-rotated square's half-diagonal reach along Right = half-size * sqrt(2)
      const extent = Math.sqrt(2) / 10;
      expect(projected.x).toBeCloseTo(0.2 - extent, 4);
    });

    it('auto-detects size from a Mesh target end-to-end, same as an explicit size', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(0, 0, -20);

      const body = new PositionComposerBody(mesh, 10, [0, 0], 1, [0.4, 0.4], 0);
      const out = createCameraState();
      out.fov = 90;
      body.update(out, 0.1);

      mesh.position.set(1.5, 0, -20);
      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, mesh.position.clone());
      expect(projected.x).toBeCloseTo(0.1, 4);
    });
  });

  describe('extent bigger than the reaction zone (real bug: used to oscillate like a spring, never converging)', () => {
    it('a radius larger than the dead zone settles at dead center instead of alternating forever', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.4, 0.4], 0, [0, 0], 2); // radius 2 > the dead zone's own half-width in world units
      const out = createCameraState();
      body.update(out, 0.1, true); // baseline, dead-center

      target.set(0.3, 0, -20); // nudge off-center
      let previousX = out.position.x;
      for (let i = 0; i < 20; i++) {
        body.update(out, 0.1, false);
        if (i > 0) expect(out.position.x).toBeCloseTo(previousX, 8); // settles immediately, doesn't alternate
        previousX = out.position.x;
      }

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0, 4); // the best achievable compromise: dead center
    });

    it('an oriented box bigger than the dead zone settles at dead center too', () => {
      const targetObject = new Object3D();
      targetObject.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
      targetObject.position.set(0, 0, -20);

      const body = new PositionComposerBody(targetObject, 10, [0, 0], 1, [0.4, 0.4], 0, [0, 0], undefined, [4, 4, 4]);
      const out = createCameraState();
      body.update(out, 0.1, true);

      targetObject.position.set(0.3, 0, -20);
      let previousX = out.position.x;
      for (let i = 0; i < 20; i++) {
        body.update(out, 0.1, false);
        if (i > 0) expect(out.position.x).toBeCloseTo(previousX, 8);
        previousX = out.position.x;
      }

      const projected = projectToScreen(out, 1, targetObject.position.clone());
      expect(projected.x).toBeCloseTo(0, 4);
    });

    it('a radius larger than hardLimit settles at dead center there too, not alternating', () => {
      const target = new Vector3(20, 0, -20); // far outside
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.1, 0.1], 5, [0.3, 0.3], 2); // radius 2 > hardLimit's own half-width
      body.update(createCameraState(), 0.1); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();

      body.update(out, 0.1);
      const afterFirst = projectToScreen(out, 1, target).x;
      body.update(out, 0.1);
      const afterSecond = projectToScreen(out, 1, target).x;

      expect(afterSecond).toBeCloseTo(afterFirst, 4);
      expect(afterSecond).toBeCloseTo(0, 4);
    });
  });

  describe('hard limit', () => {
    it('forces the target back inside hardLimit even when heavy damping alone would leave it outside', () => {
      const target = new Vector3(20, 0, -20); // far outside on X
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.1, 0.1], 5, [0.3, 0.3]);
      body.update(createCameraState(), 0.1); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();

      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      expect(projected.x).toBeCloseTo(0.15, 4); // clamped to the hard limit's edge (0.3 / 2)
    });

    it("a radius pulls hardLimit enforcement in earlier, clamping the target's EDGE to the limit boundary", () => {
      const target = new Vector3(20, 0, -20); // far outside on X
      const body = new PositionComposerBody(target, 10, [0, 0], 1, [0.1, 0.1], 5, [0.3, 0.3], 1); // radius = 1
      body.update(createCameraState(), 0.1); // consume the first-ever-update hard snap on a throwaway state
      const out = createCameraState();
      out.fov = 90; // tan(45°) = 1, so halfWidth = cameraDistance exactly - clean world-unit math

      body.update(out, 0.1);

      const projected = projectToScreen(out, 1, target);
      // hard limit half-width 0.15; radius 1 at cameraDistance 10 = 0.1 of extent, so the CENTER lands
      // 0.1 short of the limit's edge
      expect(projected.x).toBeCloseTo(0.05, 4);
    });

    it('hardLimit=[0,0] (default): no enforcement, an unclamped damped result can lag past where a hard limit would clamp it', () => {
      const target = new Vector3(20, 0, -20);

      const bodyWithoutLimit = new PositionComposerBody(target, 10, [0, 0], 1, [0.1, 0.1], 5);
      bodyWithoutLimit.update(createCameraState(), 0.1); // consume the first-ever-update hard snap
      const withoutLimit = createCameraState();
      bodyWithoutLimit.update(withoutLimit, 0.1);

      const bodyWithLimit = new PositionComposerBody(target, 10, [0, 0], 1, [0.1, 0.1], 5, [0.3, 0.3]);
      bodyWithLimit.update(createCameraState(), 0.1); // consume the first-ever-update hard snap
      const withLimit = createCameraState();
      bodyWithLimit.update(withLimit, 0.1);

      expect(withoutLimit.position.equals(withLimit.position)).toBe(false);
      const projected = projectToScreen(withoutLimit, 1, target);
      expect(Math.abs(projected.x)).toBeGreaterThan(0.15); // past where hardLimit=[0.3,0.3] would have clamped it
    });

    it('does nothing when the damped result already sits inside a generous hardLimit', () => {
      const target = new Vector3(20, 0, -20);
      const withoutLimit = createCameraState();
      new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0.3).update(withoutLimit, 0.016);

      const withLimit = createCameraState();
      new PositionComposerBody(target, 10, [0, 0], 1, [0.2, 0.2], 0.3, [1000, 1000]).update(withLimit, 0.016);

      expect(withLimit.position.equals(withoutLimit.position)).toBe(true);
    });
  });
});
