import CameraControls from 'camera-controls';
import { vec3, type Vec3 } from 'math';
import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../../src/core/blend/BlendCurves';
import { BlendHints } from '../../../src/core/blend/BlendHints';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { KlippCore } from '../../../src/core/KlippCore';
import { HardLookAtAim } from '../../../src/three/aim/HardLookAtAim';
import { CameraControlsBody } from '../../../src/three/body/CameraControlsBody';
import { FollowBody } from '../../../src/three/body/FollowBody';
import { HardLockToTargetBody } from '../../../src/three/body/HardLockToTargetBody';

/** Cosine between the camera's forward axis and the direction to `point`: 1 means looking right at it. */
function lookingAt(out: CameraState, point: Vector3 | Vec3): number {
  const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().fromArray(out.quaternion));
  const toPoint = new Vector3(...(point instanceof Vector3 ? point.toArray() : point)).sub(
    new Vector3(...out.position),
  );
  return forward.dot(toPoint.normalize());
}

function run(body: CameraControlsBody, out: CameraState, frames: number, justActivated = false) {
  for (let i = 0; i < frames; i++) body.update(out, 0.05, justActivated && i === 0);
}

describe('CameraControlsBody', () => {
  it('builds its controls from the given implementation', () => {
    class CustomControls extends CameraControls {}
    expect(new CameraControlsBody(null).controls).toBeInstanceOf(CameraControls);
    expect(new CameraControlsBody(null, 1, null, CustomControls).controls).toBeInstanceOf(CustomControls);
  });

  it('orbits a target, looks at it and publishes it as both target and look-at target', () => {
    const target = new Vector3(0, 0, -20);
    const body = new CameraControlsBody(target);
    const out = createCameraState();

    run(body, out, 30);

    expect(lookingAt(out, target)).toBeGreaterThan(0.99);
    expect(out.hasTarget).toBe(true);
    expect(out.target).toEqual([0, 0, -20]);
    expect(out.hasLookAtTarget).toBe(true);
    expect(out.lookAtTarget).toEqual([0, 0, -20]);
  });

  it('uses the lens from out and its own aspect', () => {
    const body = new CameraControlsBody(new Vector3(0, 0, -20), 2);
    const out = createCameraState();
    out.fov = 35;
    out.near = 0.5;
    out.far = 500;

    body.update(out, 0.05);

    const camera = body.controls.camera as PerspectiveCamera;
    expect([camera.fov, camera.near, camera.far, camera.aspect]).toEqual([35, 0.5, 500, 2]);
  });

  it('without a target runs as free controls that follow direct input', () => {
    const body = new CameraControlsBody(null);
    const out = createCameraState();
    body.update(out, 0.05);
    expect(out.hasTarget).toBe(false);
    expect(out.hasLookAtTarget).toBe(false);

    body.controls.rotate(Math.PI / 4, 0, false);
    body.controls.dollyTo(20, false);
    run(body, out, 5);

    expect(vec3.length(out.position)).toBeCloseTo(20, 3);
  });

  it('drags the camera along with a moving target, keeping the orbit offset (real bug: setTarget only re-aimed)', () => {
    const target = new Vector3(0, 0, -20);
    const body = new CameraControlsBody(target, 1);
    const out = createCameraState();
    run(body, out, 60);
    const before = vec3.clone(out.position);
    const distance = vec3.distance(out.position, target.toArray());

    target.set(30, 0, -20);
    run(body, out, 60);

    expect(out.position[0] - before[0]).toBeGreaterThan(25);
    expect(Math.abs(vec3.distance(out.position, target.toArray()) - distance)).toBeLessThan(1);
  });

  it('keeps separate orbit state per instance', () => {
    const a = new CameraControlsBody(new Vector3(0, 0, -10));
    const b = new CameraControlsBody(new Vector3(20, 5, 0));
    const outA = createCameraState();
    const outB = createCameraState();
    run(a, outA, 20);
    run(b, outB, 20);
    expect(outA.position).not.toEqual(outB.position);
  });

  describe('initialPosition', () => {
    it('starts at that exact point looking at the target, only once', () => {
      const target = new Vector3(5, 0, 5);
      const start = new Vector3(5, 8, 15);
      const body = new CameraControlsBody(target, 1, start);
      const out = createCameraState();

      body.update(out, 0.05);
      expect(vec3.distance(out.position, start.toArray())).toBeLessThan(1e-5);
      expect(lookingAt(out, target)).toBeGreaterThan(0.999);

      target.set(40, 0, 5);
      run(body, out, 60);
      expect(vec3.distance(out.position, start.toArray())).toBeGreaterThan(20);
    });

    it('holds the camera there while the target is not resolved yet, then only turns toward it', () => {
      const ref: { current: Object3D | null } = { current: null };
      const start = new Vector3(0, 5, 20);
      const body = new CameraControlsBody(ref, 1, start);
      const out = createCameraState();

      run(body, out, 5);
      expect(vec3.distance(out.position, start.toArray())).toBeLessThan(1e-5);
      expect(out.hasTarget).toBe(false);

      ref.current = new Object3D();
      ref.current.position.set(0, 0, -20);
      body.update(out, 0.05);
      expect(vec3.distance(out.position, start.toArray())).toBeLessThan(1e-5);
      expect(lookingAt(out, ref.current.position)).toBeGreaterThan(0.999);
    });
  });

  it('without initialPosition, leaves out untouched until a late target resolves, then orbits it', () => {
    const ref: { current: Object3D | null } = { current: null };
    const body = new CameraControlsBody(ref);
    const out = createCameraState();

    run(body, out, 5);
    expect(out.position).toEqual([0, 0, 0]);

    ref.current = new Object3D();
    ref.current.position.set(0, 0, -20);
    run(body, out, 30);
    expect(lookingAt(out, ref.current.position)).toBeGreaterThan(0.99);
  });

  describe('switching targets', () => {
    it('keeps publishing its own state when the target is dropped mid-flight', () => {
      const body = new CameraControlsBody(new Vector3(10, 0, 0), 1);
      const out = createCameraState();
      run(body, out, 5);
      const locked = vec3.clone(out.position);

      body.target = null;
      body.controls.rotate(Math.PI / 2, 0, false);
      run(body, out, 10);

      expect(out.hasTarget).toBe(false);
      expect(out.position).not.toEqual(locked);
    });

    it('re-anchors from where the camera is when a target comes back (real bug: jumped by how far the target moved meanwhile)', () => {
      const target = new Vector3();
      const body = new CameraControlsBody(target, 1);
      const out = createCameraState();
      run(body, out, 5);

      body.target = null;
      body.controls.rotate(Math.PI / 3, 0, false);
      run(body, out, 10);
      const free = vec3.clone(out.position);

      target.set(50, 0, 50);
      body.target = target;
      body.update(out, 0.05);
      expect(vec3.distance(out.position, free)).toBeLessThan(1e-4);

      run(body, out, 60);
      expect(lookingAt(out, target)).toBeGreaterThan(0.99);
    });

    it('re-anchors on justActivated too, after a gap without updates (real bug: an inactive camera jumped when reactivated)', () => {
      const target = new Vector3();
      const body = new CameraControlsBody(target, 1);
      const out = createCameraState();
      run(body, out, 5);
      const before = vec3.clone(out.position);

      target.set(50, 0, 50);
      body.update(out, 0.05, true);
      expect(vec3.distance(out.position, before)).toBeLessThan(1e-4);

      run(body, out, 60);
      expect(lookingAt(out, target)).toBeGreaterThan(0.99);
    });

    it('turns back the short way after free turns (real bug: unwound every accumulated turn)', () => {
      const target = new Vector3();
      const body = new CameraControlsBody(target, 1, new Vector3(6, 4, 6), CameraControls, true);
      const out = createCameraState();
      run(body, out, 5);

      body.target = null;
      body.controls.rotate(Math.PI * 6, 0, false);
      run(body, out, 10);

      body.target = target;
      let turned = 0;
      const previous = new Quaternion().fromArray(out.quaternion);
      for (let i = 0; i < 200; i++) {
        body.update(out, 0.05);
        const current = new Quaternion().fromArray(out.quaternion);
        turned += current.angleTo(previous);
        previous.copy(current);
      }

      expect(turned).toBeLessThan(Math.PI * 1.5);
    });

    it('enableTransition eases into a returning target instead of re-anchoring instantly', () => {
      const target = new Vector3();
      const body = new CameraControlsBody(target, 1, null, CameraControls, true);
      const out = createCameraState();
      run(body, out, 5);
      body.target = null;
      run(body, out, 10);
      const free = vec3.clone(out.position);

      target.set(3, 0, 3);
      body.target = target;
      body.update(out, 0.05);
      expect(out.position).not.toEqual(free);

      run(body, out, 120);
      expect(lookingAt(out, target)).toBeGreaterThan(0.99);
    });
  });

  describe('in KlippCore blends', () => {
    it('sphericalPosition arcs around the shared target (real bug: blends into CameraControls always went straight)', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const a = createCameraState();
      new FollowBody(new Vector3(), [10, 0, 0]).update(a, 0.016);
      new HardLookAtAim(new Vector3()).update(a, 0.016);
      core.registerCamera({ id: 'a', priority: 10, state: a, hints: BlendHints.sphericalPosition });
      core.tick(0);

      const b = createCameraState();
      new CameraControlsBody(new Vector3(), 1, new Vector3(0, 5, -10)).update(b, 0.016);
      core.registerCamera({ id: 'b', priority: 20, state: b, hints: BlendHints.sphericalPosition });

      const mid = core.tick(0.5);
      const straightMid = vec3.lerp(vec3.create(), a.position, b.position, 0.5);
      expect(vec3.distance(mid.position, straightMid)).toBeGreaterThan(0.5);
    });

    it('a blend into it keeps looking at the moving look-at point (real bug: fell back to a plain slerp)', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const a = createCameraState();
      new HardLockToTargetBody(new Vector3(15, 2, -3)).update(a, 0.016);
      new HardLookAtAim(new Vector3(5, 2, -3)).update(a, 0.016);
      core.registerCamera({ id: 'a', priority: 10, state: a });
      core.tick(0);

      const b = createCameraState();
      new CameraControlsBody(new Vector3(5, 2, 47), 1, new Vector3(5, 7, 37)).update(b, 0.016);
      core.registerCamera({ id: 'b', priority: 20, state: b });

      for (let i = 0; i < 3; i++) {
        const out = core.tick(0.25);
        expect(lookingAt(out, out.lookAtTarget)).toBeGreaterThan(0.99);
      }
    });

    it('picks up controls moved while the camera was inactive, once it wins', () => {
      const core = new KlippCore({ defaultBlend: { curve: BlendCurves.linear, time: 1 } });
      const intro = createCameraState();
      vec3.set(intro.position, -2, 0, -1);
      core.registerCamera({ id: 'intro', priority: 2, state: intro });
      core.tick(0);

      const state = createCameraState();
      const body = new CameraControlsBody(new Vector3(), 1, new Vector3(-2, 0, -1));
      body.controls.rotate(Math.PI, 0, false);
      body.controls.dollyTo(5, false);

      body.update(state, 0.016);
      core.registerCamera({ id: 'follow', priority: 3, state });
      expect(vec3.distance(core.tick(0).position, intro.position)).toBeLessThan(1e-6);

      let out = intro;
      for (let i = 0; i < 80; i++) {
        body.update(state, 0.016);
        out = core.tick(0.016);
      }
      expect(vec3.distance(out.position, state.position)).toBeLessThan(1e-4);
      expect(vec3.distance(state.position, [-2, 0, -1])).toBeGreaterThan(1);
    });
  });
});
