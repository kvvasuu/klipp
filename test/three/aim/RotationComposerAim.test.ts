import { vec3, vec4 } from 'math';
import {
  BoxGeometry,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { RotationComposerAim } from '../../../src/three/aim/RotationComposerAim';

/** Screen position of `target` seen from `out`, through a real three.js camera as independent ground truth. */
function projectToScreen(out: CameraState, aspect: number, target: Vector3): Vector3 {
  const camera = new PerspectiveCamera(out.fov, aspect, 0.1, 1000);
  camera.position.fromArray(out.position);
  camera.quaternion.fromArray(out.quaternion);
  camera.updateMatrixWorld(true);
  return target.clone().project(camera);
}

const rotationOf = (out: CameraState) => new Quaternion().fromArray(out.quaternion);

/** Runs one update on a throwaway state, so the next update damps instead of snapping. */
function warmUp(aim: RotationComposerAim): RotationComposerAim {
  aim.update(createCameraState(), 0.016, false);
  return aim;
}

describe('RotationComposerAim', () => {
  it('centers the target without moving the camera, using out.referenceUp', () => {
    const target = new Vector3(5, 2, -30);
    const out = createCameraState();
    vec3.set(out.position, 1, 1, 0);
    const up = new Vector3(1, 1, 0).normalize();
    up.toArray(out.referenceUp);

    new RotationComposerAim(target).update(out, 0.1, false);

    const expected = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(new Vector3(1, 1, 0), target, up));
    expect(rotationOf(out).angleTo(expected)).toBeLessThan(1e-9);
    expect(out.position).toEqual([1, 1, 0]);
  });

  it('lands the target at screenPosition for any distance, fov and aspect', () => {
    const aim = new RotationComposerAim(new Vector3(), [0.3, 0.2], 1.5);
    const out = createCameraState();
    out.fov = 35;
    vec3.set(out.position, 3, -1, 5);

    for (const distance of [5, 20, 100]) {
      const target = new Vector3(2, 1, -distance);
      aim.target = target;
      aim.update(out, 0.1, false);
      const projected = projectToScreen(out, 1.5, target);
      expect(projected.x).toBeCloseTo(0.3, 5);
      expect(projected.y).toBeCloseTo(0.2, 5);
    }
  });

  it('leaves out untouched without a target', () => {
    const out = createCameraState();
    new RotationComposerAim(null, [0.5, 0.5]).update(out, 0.1, false);
    expect(out.quaternion).toEqual([0, 0, 0, 1]);
  });

  describe('lookAtTarget', () => {
    it('publishes the raw target, unaffected by screenPosition', () => {
      const out = createCameraState();
      new RotationComposerAim(new Vector3(5, 2, -30), [0.3, 0.2]).update(out, 0.1, false);
      expect(out.hasLookAtTarget).toBe(true);
      expect(out.lookAtTarget).toEqual([5, 2, -30]);
    });

    it('eases across a target change with damping instead of teleporting (real bug: a blend read a 12 unit jump for 0.14° of rotation)', () => {
      const aim = new RotationComposerAim(new Vector3(-6, 1, 0), [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();
      vec3.set(out.position, -6, 3, 7);
      aim.update(out, 1 / 60, true);
      for (let i = 0; i < 10; i++) aim.update(out, 1 / 60, false);
      const settled = vec3.clone(out.lookAtTarget);

      aim.target = new Vector3(6, 5, 1);
      aim.update(out, 1 / 60, false);
      expect(vec3.distance(out.lookAtTarget, settled)).toBeLessThan(0.5);

      for (let i = 0; i < 240; i++) aim.update(out, 1 / 60, false);
      expect(vec3.distance(out.lookAtTarget, [6, 5, 1])).toBeLessThan(1e-6);
    });

    it('eases when only the distance changes (real bug: skipped ahead along the ray once the direction settled)', () => {
      const aim = new RotationComposerAim(new Vector3(0, 0, -200), [0, 0], 1, [0, 0], 0.4);
      const out = createCameraState();
      aim.update(out, 1 / 60, true);

      aim.target = new Vector3(0, 0, -400);
      aim.update(out, 1 / 60, false);
      expect(Math.abs(out.lookAtTarget[2] + 200)).toBeLessThan(2);

      for (let i = 0; i < 240; i++) aim.update(out, 1 / 60, false);
      expect(out.lookAtTarget[2]).toBeCloseTo(-400, 6);
    });
  });

  describe('targetOffset', () => {
    it("shifts the look-at point in the target's local space", () => {
      const target = new Object3D();
      target.position.set(0, 0, -20);
      target.rotation.set(0, Math.PI / 2, 0);
      const out = createCameraState();

      new RotationComposerAim(target, [0, 0], 1, [0, 0], 0, [0, 0], [1, 0, 0]).update(out, 0.1, false);

      const point = target.position.clone().add(new Vector3(1, 0, 0).applyQuaternion(target.quaternion));
      expect(projectToScreen(out, 1, point).x).toBeCloseTo(0, 5);
    });

    it('adds in world space for a fixed-point target', () => {
      const out = createCameraState();
      new RotationComposerAim(new Vector3(0, 0, -20), [0, 0], 1, [0, 0], 0, [0, 0], [2, 3, 0]).update(out, 0.1, false);
      const projected = projectToScreen(out, 1, new Vector3(2, 3, -20));
      expect(projected.x).toBeCloseTo(0, 5);
      expect(projected.y).toBeCloseTo(0, 5);
    });
  });

  describe('dead zone', () => {
    it('ignores a target that moves within it', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.4, 0.4], 0);
      const out = createCameraState();

      target.set(1, 1, -20);
      aim.update(out, 0.1, false);

      expect(out.quaternion).toEqual([0, 0, 0, 1]);
    });

    it('without damping, turns the target to the dead zone edge and stays there', () => {
      const target = new Vector3(20, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 0);
      const out = createCameraState();

      aim.update(out, 0.1, false);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0.1, 4);

      const atEdge = vec4.clone(out.quaternion);
      aim.update(out, 0.1, false); // the edge itself counts as inside
      expect(out.quaternion).toEqual(atEdge);
    });

    it('with damping, eases toward the dead zone edge', () => {
      const target = new Vector3(20, 0, -20);
      const aim = warmUp(new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 0.3));
      const out = createCameraState();

      aim.update(out, 0.016, false);
      expect(projectToScreen(out, 1, target).x).toBeGreaterThan(0.2);

      for (let i = 0; i < 300; i++) aim.update(out, 0.016, false);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0.1, 2);
    });

    it('never turns back the old way when the target reverses after settling (real bug: stale damper velocity survived the freeze)', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.15, 0.15], 0.3);
      const out = createCameraState();
      for (let i = 0; i < 40; i++) {
        target.x += 0.3;
        aim.update(out, 0.016, false);
      }
      for (let i = 0; i < 300; i++) aim.update(out, 0.016, false);

      const yaw = () => new Euler().setFromQuaternion(rotationOf(out), 'YXZ').y;
      let previous = yaw();
      let direction = 0;
      for (let i = 0; i < 60; i++) {
        target.x -= 0.3;
        aim.update(out, 0.016, false);
        const delta = yaw() - previous;
        if (Math.abs(delta) > 1e-9) {
          if (direction === 0) direction = Math.sign(delta);
          else expect(Math.sign(delta)).not.toBe(-direction);
        }
        previous = yaw();
      }
      expect(direction).not.toBe(0);
    });
  });

  it('maxSpeed caps how fast damping closes the gap, in radians per second', () => {
    const target = new Vector3(0, 0, 20); // behind the camera, a near half turn
    const instant = createCameraState();
    new RotationComposerAim(target).update(instant, 0.05, false);
    const gap = (maxSpeed: number) => {
      const aim = warmUp(new RotationComposerAim(target, [0, 0], 1, [0, 0], 1));
      aim.maxSpeed = maxSpeed;
      const out = createCameraState();
      aim.update(out, 0.05, false);
      return rotationOf(out).angleTo(rotationOf(instant));
    };

    expect(gap(0.3)).toBeGreaterThan(gap(Infinity));
  });

  describe('target extent', () => {
    // fov 90 at depth 10 makes one screen unit equal 10 world units, so extents read directly
    function nudgeFromCenter(target: Object3D | Vector3, aim: RotationComposerAim) {
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1, false);
      const position = target instanceof Vector3 ? target : target.position;
      position.set(1.5, 0, -10);
      aim.update(out, 0.1, false);
      return projectToScreen(out, 1, position.clone()).x;
    }

    it("a radius makes the dead zone react to the target's edge", () => {
      const point = new Vector3(0, 0, -10);
      expect(nudgeFromCenter(point, new RotationComposerAim(point, [0, 0], 1, [0.2, 0.2], 0))).toBeCloseTo(0.15, 4);

      const sphere = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(sphere, [0, 0], 1, [0.2, 0.2], 0, [0, 0], [0, 0, 0], 1);
      expect(nudgeFromCenter(sphere, aim)).toBeCloseTo(0.1, 4);
    });

    it('a size works like a radius, a rotated box uses its oriented extent, and a mesh is measured on its own', () => {
      const box = new Vector3(0, 0, -10);
      const boxAim = new RotationComposerAim(box, [0, 0], 1, [0.2, 0.2], 0, [0, 0], [0, 0, 0], undefined, [2, 2, 2]);
      expect(nudgeFromCenter(box, boxAim)).toBeCloseTo(0.1, 4);

      const rotated = new Object3D();
      rotated.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
      rotated.position.set(0, 0, -10);
      const rotatedAim = new RotationComposerAim(
        rotated,
        [0, 0],
        1,
        [0.2, 0.2],
        0,
        [0, 0],
        [0, 0, 0],
        undefined,
        [2, 2, 2],
      );
      expect(nudgeFromCenter(rotated, rotatedAim)).toBeCloseTo(0.2 - Math.SQRT2 / 10, 4);

      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(0, 0, -10);
      expect(nudgeFromCenter(mesh, new RotationComposerAim(mesh, [0, 0], 1, [0.2, 0.2], 0))).toBeCloseTo(0.1, 4);
    });

    it('measures a mesh again only after recalculateSize()', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(4, 0, -10);
      const aim = new RotationComposerAim(mesh, [0, 0], 1, [0.6, 0.6], 0);
      const out = createCameraState();
      out.fov = 90;
      // raw vertex edits are the one change three.js never syncs into a cached bounding box
      const grow = () => {
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          position.setXYZ(i, position.getX(i) * 3, position.getY(i) * 3, position.getZ(i) * 3);
        }
      };
      const settle = () => {
        for (let i = 0; i < 30; i++) aim.update(out, 0.1, false);
      };
      settle();
      const original = rotationOf(out);

      grow();
      aim.recalculateSize();
      settle();
      const afterRecalc = rotationOf(out);
      expect(afterRecalc.angleTo(original)).toBeGreaterThan(1e-3);

      grow();
      settle();
      expect(rotationOf(out).angleTo(afterRecalc)).toBeLessThan(1e-6);
    });

    it('an extent larger than the dead zone settles at the center instead of oscillating', () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0, [0, 0], [0, 0, 0], 3);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1, false);

      target.set(0.3, 0, -10);
      aim.update(out, 0.1, false);
      const first = rotationOf(out);
      aim.update(out, 0.1, false);

      expect(rotationOf(out).angleTo(first)).toBeLessThan(1e-6);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0, 4);
    });

    it('an extent larger than hardLimit settles at the center too', () => {
      const target = new Vector3(0, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [10, 10], 0, [0.1, 0.1], [0, 0, 0], 3);
      const out = createCameraState();
      out.fov = 90;
      aim.update(out, 0.1, false);

      target.set(3, 0, -10);
      aim.update(out, 0.1, false);
      const first = rotationOf(out);
      aim.update(out, 0.1, false);

      expect(rotationOf(out).angleTo(first)).toBeLessThan(1e-6);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0, 3);
    });
  });

  describe('hardLimit', () => {
    it('keeps the target inside it even when heavy damping would leave it outside', () => {
      const target = new Vector3(20, 0, -20);
      const aim = warmUp(new RotationComposerAim(target, [0, 0], 1, [0.1, 0.1], 5, [0.15, 0.15]));
      const out = createCameraState();

      aim.update(out, 0.1, false);

      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0.15, 4);
    });

    it('still applies when the target sits inside a larger dead zone (real bug: the dead zone returned early)', () => {
      const target = new Vector3(0, 0, -20);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0.4, 0.4], 0, [0.05, 0.05]);
      const out = createCameraState();

      target.set(1, 1, -20);
      aim.update(out, 0.1, false);

      expect(out.quaternion).not.toEqual([0, 0, 0, 1]);
    });

    it('does nothing when the damped result is already inside it', () => {
      const target = new Vector3(20, 0, -20);
      const run = (hardLimit: [number, number]) => {
        const out = createCameraState();
        new RotationComposerAim(target, [0, 0], 1, [0.2, 0.2], 0.3, hardLimit).update(out, 0.016, false);
        return out.quaternion;
      };
      expect(run([1000, 1000])).toEqual(run([0, 0]));
    });
  });

  describe('justActivated', () => {
    it('snaps to a new target from a stale rotation, where a plain update would ease', () => {
      const run = (justActivated: boolean) => {
        const aim = new RotationComposerAim(new Vector3(10, 0, -10), [0, 0], 1, [0, 0], 0.5);
        const out = createCameraState();
        aim.update(out, 0.016, true);
        aim.update(out, 0.016, false);
        aim.target = new Vector3(30, -8, -5);
        aim.update(out, 0.016, justActivated);
        return projectToScreen(out, 1, aim.target);
      };

      const snapped = run(true);
      expect(snapped.x).toBeCloseTo(0, 5);
      expect(snapped.y).toBeCloseTo(0, 5);
      const eased = run(false);
      expect(Math.abs(eased.x) + Math.abs(eased.y)).toBeGreaterThan(0.01);
    });

    it('skips the dead zone, which would otherwise hide the jump', () => {
      const aim = new RotationComposerAim(new Vector3(0, 0, -10), [0, 0], 1, [0.9, 0.9], 0);
      const out = createCameraState();
      aim.update(out, 0.016, true);

      aim.target = new Vector3(0.5, 0, -10);
      aim.update(out, 0.016, true);

      expect(projectToScreen(out, 1, aim.target).x).toBeCloseTo(0, 5);
    });
  });

  describe('primeFrom', () => {
    it('makes the next activation ease from the primed rotation, once', () => {
      const target = new Vector3(10, 0, -10);
      const aim = new RotationComposerAim(target, [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();
      aim.primeFrom(out.quaternion);

      aim.update(out, 0.016, true);
      const eased = projectToScreen(out, 1, target);
      expect(out.quaternion).not.toEqual([0, 0, 0, 1]);
      expect(Math.abs(eased.x) + Math.abs(eased.y)).toBeGreaterThan(0.01);

      aim.target = new Vector3(30, -8, -5);
      aim.update(out, 0.016, true); // a later activation snaps as usual
      expect(projectToScreen(out, 1, aim.target).x).toBeCloseTo(0, 5);
    });

    it('is used up even when the target is not resolved yet on that activation', () => {
      const aim = new RotationComposerAim({ current: null }, [0, 0], 1, [0, 0], 0.5);
      const out = createCameraState();
      aim.primeFrom(out.quaternion);
      aim.update(out, 0.016, true);
      expect(out.quaternion).toEqual([0, 0, 0, 1]);

      aim.target = new Vector3(10, 0, -10);
      aim.update(out, 0.016, true);
      expect(projectToScreen(out, 1, aim.target).x).toBeCloseTo(0, 5);
    });
  });

  describe('lookahead', () => {
    const dt = 1 / 60;

    function moving(setup: (aim: RotationComposerAim) => void) {
      const target = new Vector3();
      const aim = new RotationComposerAim(target);
      aim.lookaheadTime = 0.5;
      aim.lookaheadSmoothing = 10;
      setup(aim);
      const out = createCameraState();
      aim.update(out, dt, true);
      return { target, aim, out };
    }

    it('places out.lookAtTarget ahead of a moving target, and leaves it raw by default', () => {
      const { target, aim, out } = moving(() => {});
      for (let i = 0; i < 120; i++) {
        target.x += 10 * dt;
        aim.update(out, dt, false);
      }
      expect(out.lookAtTarget[0] - target.x).toBeCloseTo(5, 1);

      aim.lookaheadTime = 0;
      aim.update(out, dt, false);
      expect(out.lookAtTarget[0]).toBeCloseTo(target.x, 4);
    });

    it('starts over on activation and when the target changes', () => {
      const { target, aim, out } = moving(() => {});
      for (let i = 0; i < 60; i++) {
        target.x += 10 * dt;
        aim.update(out, dt, false);
      }
      aim.update(out, dt, true);
      expect(out.lookAtTarget[0]).toBeCloseTo(target.x, 4);

      for (let i = 0; i < 60; i++) {
        target.x += 10 * dt;
        aim.update(out, dt, false);
      }
      const other = new Vector3(100, 0, -20);
      aim.target = other;
      aim.update(out, dt, false);
      // the published point runs through its own damper, so a big jump leaves a tiny residual even undamped
      expect(vec3.distance(out.lookAtTarget, other.toArray())).toBeLessThan(0.01);
    });

    it('ignoreY drops the vertical part of the prediction', () => {
      const { target, aim, out } = moving((aim) => (aim.lookaheadIgnoreY = true));
      for (let i = 0; i < 120; i++) {
        target.y += 10 * dt;
        aim.update(out, dt, false);
      }
      expect(out.lookAtTarget[1]).toBeCloseTo(target.y, 4);
    });
  });
});
