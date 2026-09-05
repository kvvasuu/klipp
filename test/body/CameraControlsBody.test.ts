import CameraControls from 'camera-controls';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../src/blend/BlendCurves';
import { createCameraState } from '../../src/CameraState';
import { KlippCore } from '../../src/KlippCore';
import { CameraControlsBody } from '../../src/body/CameraControlsBody';

describe('CameraControlsBody', () => {
  it('constructs a real, ready-to-use CameraControls instance', () => {
    const body = new CameraControlsBody(null);
    expect(body.controls).toBeDefined();
    expect(typeof body.controls.update).toBe('function');
  });

  it('impl lets a custom CameraControls subclass be constructed instead of the base class', () => {
    class CustomControls extends CameraControls {}
    const body = new CameraControlsBody(null, 1, null, CustomControls);
    expect(body.controls).toBeInstanceOf(CustomControls);
  });

  it("writes the target position and hasTarget onto out, for BlendHints' sphericalPosition", () => {
    const target = new Vector3(1, 2, 3);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    body.update(out, 0.05);

    expect(out.hasTarget).toBe(true);
    expect(out.target.equals(target)).toBe(true);
  });

  it('with no initialPosition, the first resolution keeps camera-controls\' own starting position - coincident with a target at the origin', () => {
    const target = new Vector3(0, 0, 0);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    body.update(out, 0.05);

    expect(out.position.distanceTo(target)).toBeCloseTo(0, 5);
  });

  it('dollying moves the camera to a real distance from a target at the origin', () => {
    const target = new Vector3(0, 0, 0);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    body.update(out, 0.05);

    body.controls.dollyTo(20, false);
    for (let i = 0; i < 5; i++) body.update(out, 0.05);

    expect(out.position.distanceTo(target)).toBeCloseTo(20, 3);
  });

  it('initialPosition starts the camera at that EXACT world point, looking at the target', () => {
    const target = new Vector3(5, 0, 5);
    const start = new Vector3(5, 8, 15); // above and behind, not just "some distance along +Z"
    const body = new CameraControlsBody(target, 1, start);
    const out = createCameraState();

    body.update(out, 0.05);

    expect(out.position.distanceTo(start)).toBeLessThan(1e-5);
    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = target.clone().sub(start).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.999);
  });

  it('initialPosition only applies ONCE - a moving target does not re-snap the camera back to it', () => {
    const target = new Vector3(0, 0, 0);
    const body = new CameraControlsBody(target, 1, new Vector3(0, 0, 10));
    const out = createCameraState();
    body.update(out, 0.05);

    target.set(30, 0, 0);
    for (let i = 0; i < 60; i++) body.update(out, 0.05);

    // followed the moved target instead of snapping back to the initialPosition's own distance/angle
    expect(out.position.distanceTo(new Vector3(0, 0, 10))).toBeGreaterThan(20);
  });

  it('initialPosition parks the camera there IMMEDIATELY, frozen, while target is still pending - not a no-op, and not snapped elsewhere once it resolves', () => {
    const ref: { current: Object3D | null } = { current: null };
    const start = new Vector3(0, 5, 20);
    const body = new CameraControlsBody(ref, 1, start);
    const out = createCameraState();

    for (let i = 0; i < 5; i++) body.update(out, 0.05); // ref still unmounted - frozen at `start`, not a no-op
    expect(out.position.distanceTo(start)).toBeLessThan(1e-5);
    expect(out.hasTarget).toBe(false);

    ref.current = new Object3D();
    ref.current.position.set(0, 0, -20);
    body.update(out, 0.05); // first frame it resolves - only the aim cuts, position stays exactly put

    expect(out.position.distanceTo(start)).toBeLessThan(1e-5);
    expect(out.hasTarget).toBe(true);
    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = ref.current.position.clone().sub(start).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.999);
  });

  it('a null target runs FULL FREE camera-controls (like a bare drei <CameraControls>) - publishes its own live state, no locking', () => {
    const body = new CameraControlsBody(null);
    const out = createCameraState();

    body.update(out, 0.1);

    expect(out.position.length()).toBeCloseTo(0, 5);
    expect(out.hasTarget).toBe(false);
  });

  it('free mode (no target) responds to direct orbit/dolly input on `controls`, unconstrained by any target lock', () => {
    const body = new CameraControlsBody(null);
    const out = createCameraState();
    body.update(out, 0.05);
    const positionBefore = out.position.clone();

    body.controls.rotate(Math.PI / 4, 0, false);
    body.controls.dollyTo(20, false);
    for (let i = 0; i < 5; i++) body.update(out, 0.05);

    expect(out.position.equals(positionBefore)).toBe(false);
    expect(out.position.length()).toBeCloseTo(20, 3);
  });

  it('switching a live instance from a target to null mid-flight drops the lock and keeps publishing from wherever it was, instead of freezing', () => {
    const target = new Vector3(10, 0, 0);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    for (let i = 0; i < 5; i++) body.update(out, 0.05);
    const positionWhileLocked = out.position.clone();

    body.target = null;
    body.controls.rotate(Math.PI / 2, 0, false);
    for (let i = 0; i < 10; i++) body.update(out, 0.05);

    expect(out.hasTarget).toBe(false);
    expect(out.position.equals(positionWhileLocked)).toBe(false);
  });

  it('re-acquiring a target after a null gap (e.g. "free" mode) re-anchors from wherever the camera IS, instead of moveTo jumping by the stale delta the target drifted during the gap (real bug: "Free Control" then "Start Game" snapped)', () => {
    const target = new Vector3(0, 0, 0);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    for (let i = 0; i < 5; i++) body.update(out, 0.05); // locked, settled

    body.target = null; // "Free Control"
    body.controls.rotate(Math.PI / 3, 0, false);
    for (let i = 0; i < 10; i++) body.update(out, 0.05);
    const positionInFreeMode = out.position.clone();

    target.set(50, 0, 50); // the target kept moving a long way during the gap
    body.target = target; // "Start Game" again
    body.update(out, 0.05); // the very next frame - position must not jump

    expect(out.position.distanceTo(positionInFreeMode)).toBeLessThan(1e-4);

    for (let i = 0; i < 60; i++) body.update(out, 0.05); // settle
    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = target.clone().sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99); // and it DOES get there
  });

  it('enableTransition: true eases re-acquisition instead of an instant re-anchor - opt-in, since it can overshoot badly on a large target jump (see the class doc comment)', () => {
    const target = new Vector3(0, 0, 0);
    const body = new CameraControlsBody(target, 1, null, CameraControls, true);
    const out = createCameraState();
    for (let i = 0; i < 5; i++) body.update(out, 0.05); // locked, settled

    body.target = null; // "Free Control"
    for (let i = 0; i < 10; i++) body.update(out, 0.05);
    const positionInFreeMode = out.position.clone();

    target.set(3, 0, 3); // a SMALL move this time - enableTransition is documented as fine for this
    body.target = target; // "Start Game" again
    body.update(out, 0.05); // one frame in

    // eased, not instant: has moved SOME already, but not the whole way there yet
    expect(out.position.equals(positionInFreeMode)).toBe(false);

    for (let i = 0; i < 120; i++) body.update(out, 0.05); // let it settle
    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = target.clone().sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99);
  });

  it('a target that resolves LATE (e.g. a ref that mounts a few frames in) leaves out untouched until then, then picks up normally', () => {
    const ref: { current: Object3D | null } = { current: null };
    const body = new CameraControlsBody(ref);
    const out = createCameraState();
    const positionBefore = out.position.clone();

    for (let i = 0; i < 5; i++) body.update(out, 0.05); // ref still unmounted — must stay a no-op
    expect(out.position.equals(positionBefore)).toBe(true);

    ref.current = new Object3D();
    ref.current.position.set(0, 0, -20);
    for (let i = 0; i < 30; i++) body.update(out, 0.05); // now resolves — orbits normally, no leftover jump

    expect(out.position.distanceTo(ref.current.position)).toBeGreaterThan(0);
    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = ref.current.position.clone().sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99);
  });

  it('orbits so the camera ends up looking roughly toward the target', () => {
    const target = new Vector3(0, 0, -20);
    const body = new CameraControlsBody(target);
    const out = createCameraState();

    for (let i = 0; i < 30; i++) body.update(out, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = target.clone().sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99); // nearly parallel
  });

  it("re-orients when the target moves, tracking the target's WORLD position (parent transform included)", () => {
    const parent = new Object3D();
    parent.position.set(50, 0, 0);
    const child = new Object3D();
    child.position.set(0, 0, -10);
    parent.add(child);

    const body = new CameraControlsBody(child);
    const out = createCameraState();
    for (let i = 0; i < 30; i++) body.update(out, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardTarget = new Vector3(50, 0, -10).sub(out.position).normalize();
    expect(forward.dot(towardTarget)).toBeGreaterThan(0.99);
  });

  it('syncs fov/near/far from out and aspect from the aspect field into the scratch camera', () => {
    const target = new Vector3(0, 0, -20);
    const body = new CameraControlsBody(target, 2);
    const out = createCameraState();
    out.fov = 35;
    out.near = 0.5;
    out.far = 500;

    expect(() => body.update(out, 0.05)).not.toThrow();
    // indirect check: the underlying camera picked up the values (accessible via controls.camera)
    expect(body.controls.camera.fov).toBe(35);
    expect(body.controls.camera.near).toBe(0.5);
    expect(body.controls.camera.far).toBe(500);
    expect((body.controls.camera as PerspectiveCamera).aspect).toBe(2);
  });

  it('never lets the target field itself get mutated — target/aspect are mutable fields', () => {
    const targetA = new Vector3(0, 0, -20);
    const targetB = new Vector3(30, 0, 0);
    const body = new CameraControlsBody(targetA);
    const out = createCameraState();
    for (let i = 0; i < 20; i++) body.update(out, 0.05);

    body.target = targetB;
    for (let i = 0; i < 20; i++) body.update(out, 0.05);

    const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
    const towardB = targetB.clone().sub(out.position).normalize();
    expect(forward.dot(towardB)).toBeGreaterThan(0.99);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerBody(body.update))', () => {
    const body = new CameraControlsBody(new Vector3(0, 0, -10));
    const { update } = body;
    const out = createCameraState();
    expect(() => update(out, 0.05)).not.toThrow();
  });

  it('two instances have fully independent orbit state (no shared scratch camera)', () => {
    const bodyA = new CameraControlsBody(new Vector3(0, 0, -10));
    const bodyB = new CameraControlsBody(new Vector3(20, 5, 0));
    const outA = createCameraState();
    const outB = createCameraState();

    for (let i = 0; i < 20; i++) {
      bodyA.update(outA, 0.05);
      bodyB.update(outB, 0.05);
    }

    expect(outA.position.equals(outB.position)).toBe(false);
  });

  it('a moving target drags the camera along with it, preserving the orbit offset (not frozen in world space)', () => {
    // regression: the first version used controls.setTarget(), which camera-controls' own source
    // documents as "an alias of setLookAt(), WITHOUT position change" — it only re-aims, leaving the
    // camera's world position frozen. controls.moveTo() shifts the target while leaving the internal
    // spherical (radius/azimuth/polar) offset untouched, so the camera translates by the same delta.
    const target = new Vector3(0, 0, -20);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    for (let i = 0; i < 60; i++) body.update(out, 0.05); // let camera-controls' own smoothTime settle

    const positionBeforeMove = out.position.clone();
    const distanceBeforeMove = out.position.distanceTo(target);

    target.set(30, 0, -20); // move the target by (30, 0, 0)
    for (let i = 0; i < 60; i++) body.update(out, 0.05); // settle again

    const moved = out.position.clone().sub(positionBeforeMove);
    expect(moved.x).toBeGreaterThan(25); // camera moved by roughly the same delta as the target
    expect(Math.abs(out.position.distanceTo(target) - distanceBeforeMove)).toBeLessThan(1); // offset preserved
  });

  describe('blending in via KlippCore, the `active`-prop toggle pattern (a real game: fixed intro shot -> CameraControls takeover)', () => {
    it('imperative controls calls made while NOT registered (the `active=false` no-op window) are picked up correctly once it wins arbitration - the blend tracks its live, moved-to position', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });

      const introState = createCameraState();
      introState.position.set(-2, 0, -1);
      core.registerCamera({ id: 'intro', priority: 2, state: introState });
      core.tick(0); // 'intro' snaps live - the only registered candidate so far

      const player = new Vector3(0, 0, 0);
      const followState = createCameraState();
      const followBody = new CameraControlsBody(player, 1, new Vector3(-2, 0, -1));
      // NOT calling followBody.update() here - mirrors `active={false}`: the <VirtualCamera> never
      // registers, so this Body's own update() genuinely never runs, same as if it weren't mounted at all

      // the player imperatively drives the (not-yet-live) orbital rig via `ref.current.controls` -
      // e.g. snapping to a designer-configured "reveal" angle before the cut ever happens
      followBody.controls.rotate(Math.PI, 0, false);
      followBody.controls.dollyTo(5, false);

      // now "follow" wins arbitration (`active` flips true) - its own update() starts running for the
      // first time, and it gets registered as a KlippCore candidate in the same frame
      followBody.update(followState, 0.016);
      core.registerCamera({ id: 'follow', priority: 3, state: followState });

      const atStart = core.tick(0); // blend just started - must still read exactly as 'intro'
      expect(atStart.position.distanceTo(introState.position)).toBeLessThan(1e-6);

      let out = atStart;
      for (let i = 0; i < 80; i++) {
        followBody.update(followState, 0.016); // the incoming camera's OWN Body keeps ticking live
        out = core.tick(0.016);
      }

      // the blend settled on the orbital rig's ACTUAL live state (post rotate+dolly), not on whatever
      // position it would have had without those imperative calls
      expect(out.position.distanceTo(followState.position)).toBeLessThan(1e-4);
      expect(followState.position.distanceTo(new Vector3(-2, 0, -1))).toBeGreaterThan(1); // truly moved
    });
  });
});
