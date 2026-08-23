import { Object3D, PerspectiveCamera, Vector3 } from 'three';
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
