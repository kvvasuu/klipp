import { vec3, vec4 } from 'math';
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { PositionComposerBodyThree } from '../../../src/three/body/PositionComposerBodyThree';

/** Screen position of `target` seen from `out`, through a real three.js camera as independent ground truth. */
function projectToScreen(out: CameraState, aspect: number, target: Vector3): Vector3 {
  const camera = new PerspectiveCamera(out.fov, aspect, 0.1, 1000);
  camera.position.fromArray(out.position);
  camera.quaternion.fromArray(out.quaternion);
  camera.updateMatrixWorld(true);
  return target.clone().project(camera);
}

/** Distance from the camera to `target` along its forward axis, for an unrotated camera. */
const depthOf = (out: CameraState, target: Vector3): number => out.position[2] - target.z;

/** Runs one update on a throwaway state, so the next update damps instead of snapping. */
function warmUp(body: PositionComposerBodyThree): PositionComposerBodyThree {
  body.update(createCameraState(), 0.016, false);
  return body;
}

describe('PositionComposerBodyThree', () => {
  it('centers the target at cameraDistance without touching rotation, and publishes it as out.target', () => {
    const target = new Vector3(5, 2, -30);
    const body = new PositionComposerBodyThree(target, { cameraDistance: 8, screenPosition: [0, 0], aspect: 1.5 });
    const out = createCameraState();
    out.fov = 60;
    vec4.normalize(out.quaternion, [0, 0.2, 0, 0.98]);
    const rotation = vec4.clone(out.quaternion);

    body.update(out, 0.1, false);

    const projected = projectToScreen(out, 1.5, target);
    expect(projected.x).toBeCloseTo(0, 5);
    expect(projected.y).toBeCloseTo(0, 5);
    expect(vec3.distance(out.position, target.toArray())).toBeCloseTo(8, 5);
    expect(vec4.exactEquals(out.quaternion, rotation)).toBe(true);
    expect(out.hasTarget).toBe(true);
    expect(out.target).toEqual(target.toArray());
  });

  it('lands the target at screenPosition for any fov, aspect and camera rotation', () => {
    const target = new Vector3(10, 5, 10);
    const body = new PositionComposerBodyThree(target, { cameraDistance: 12, screenPosition: [0.5, -0.3], aspect: 2 });
    const out = createCameraState();
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 3).toArray(out.quaternion);
    out.fov = 90;

    body.update(out, 0.1, false);

    const projected = projectToScreen(out, 2, target);
    expect(projected.x).toBeCloseTo(0.5, 4);
    expect(projected.y).toBeCloseTo(-0.3, 4);
  });

  it('leaves out untouched without a target', () => {
    const out = createCameraState();
    new PositionComposerBodyThree(null).update(out, 0.1, false);
    expect(out.position).toEqual([0, 0, 0]);
  });

  describe('dead zone', () => {
    it('ignores a target that moves within it', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.4, 0.4],
        damping: 0,
      });
      const out = createCameraState();
      body.update(out, 0.1, false);
      const before = vec3.clone(out.position);

      target.set(0.5, 0, -20);
      body.update(out, 0.1, false);

      expect(out.position).toEqual(before);
    });

    it('without damping, snaps the target to the dead zone edge and stays there', () => {
      const target = new Vector3(20, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.1, 0.1],
        damping: 0,
      });
      const out = createCameraState();

      body.update(out, 0.1, false);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0.1, 4);

      const atEdge = vec3.clone(out.position);
      body.update(out, 0.1, false); // the edge itself counts as inside
      expect(out.position).toEqual(atEdge);
    });

    it('with damping, eases toward the dead zone edge', () => {
      const target = new Vector3(20, 0, -20);
      const body = warmUp(
        new PositionComposerBodyThree(target, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0.1, 0.1],
          damping: 0.3,
        }),
      );
      const out = createCameraState();

      body.update(out, 0.016, false);
      expect(projectToScreen(out, 1, target).x).toBeGreaterThan(0.2);

      for (let i = 0; i < 300; i++) body.update(out, 0.016, false);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0.1, 2);
    });

    it('finishes the move it started when the target walks into the dead zone, instead of freezing mid-motion', () => {
      const settle = (stepInside: boolean) => {
        const target = new Vector3(0, 0, -20);
        const body = new PositionComposerBodyThree(target, { deadZone: [0.6, 0.6], damping: 0.5 });
        const out = createCameraState();
        body.update(out, 0.016, true);
        target.set(20, 0, -20);
        while (out.position[0] < 12) body.update(out, 0.016, false);
        // 14.6 is inside the dead zone both from here and from where the camera is heading
        if (stepInside) target.set(14.6, 0, -20);
        for (let i = 0; i < 600; i++) body.update(out, 0.016, false);
        return out.position[0];
      };

      expect(settle(true)).toBeCloseTo(settle(false), 4);
    });

    it('never moves back toward the old direction when the target reverses after settling (real bug: stale damper velocity survived the freeze)', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.15, 0.15],
        damping: 0.3,
      });
      const out = createCameraState();
      for (let i = 0; i < 40; i++) {
        target.x += 0.3;
        body.update(out, 0.016, false);
      }
      for (let i = 0; i < 300; i++) body.update(out, 0.016, false);

      let previousX = out.position[0];
      for (let i = 0; i < 60; i++) {
        target.x -= 0.3;
        body.update(out, 0.016, false);
        expect(out.position[0]).toBeLessThanOrEqual(previousX + 1e-9);
        previousX = out.position[0];
      }
    });
  });

  describe('depth dead zone', () => {
    it('without damping, snaps to the edge of the depth dead zone, not to cameraDistance', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, { cameraDistance: 10, screenPosition: [0, 0], aspect: 1 });
      body.depthDeadZone = 3;
      const out = createCameraState();

      body.update(out, 0.1, false);

      expect(depthOf(out, target)).toBeCloseTo(13, 4);
    });

    it('tolerates gradual drift inside it over many frames (real bug: a frozen desired depth fought the target)', () => {
      const target = new Vector3(0, 0, -10);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0, 0],
        damping: 0.3,
      });
      body.depthDeadZone = 20;
      const out = createCameraState();
      body.update(out, 0.016, false);
      const before = vec3.clone(out.position);

      for (let i = 0; i < 20; i++) {
        target.z -= 0.3;
        body.update(out, 0.016, false);
      }

      expect(out.position).toEqual(before);
    });

    it('with damping, eases the depth toward cameraDistance', () => {
      const target = new Vector3(0, 0, -20);
      const body = warmUp(
        new PositionComposerBodyThree(target, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0, 0],
          damping: 0.3,
        }),
      );
      const out = createCameraState();

      body.update(out, 0.016, false);
      expect(depthOf(out, target)).toBeGreaterThan(11);

      for (let i = 0; i < 300; i++) body.update(out, 0.016, false);
      expect(depthOf(out, target)).toBeCloseTo(10, 2);
    });
  });

  describe('justActivated', () => {
    it('snaps to the composed shot from a stale position, where a plain update would ease', () => {
      const run = (justActivated: boolean) => {
        const target = new Vector3(0, 0, -20);
        const body = new PositionComposerBodyThree(target, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0, 0],
          damping: 0.5,
        });
        const out = createCameraState();
        body.update(out, 0.016, true);
        body.update(out, 0.016, false);
        target.set(40, -12, -30);
        body.update(out, 0.016, justActivated);
        return projectToScreen(out, 1, target);
      };

      const snapped = run(true);
      expect(snapped.x).toBeCloseTo(0, 4);
      expect(snapped.y).toBeCloseTo(0, 4);
      const eased = run(false);
      expect(Math.abs(eased.x) + Math.abs(eased.y)).toBeGreaterThan(0.01);
    });

    it('skips both dead zones, which would otherwise hide the jump', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.9, 0.9],
        damping: 0,
      });
      body.depthDeadZone = 5;
      const out = createCameraState();
      body.update(out, 0.016, true);

      target.set(0.5, 0, -23);
      body.update(out, 0.016, true);

      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0, 4);
      expect(depthOf(out, target)).toBeCloseTo(10, 4);
    });
  });

  it('a reactivation snaps even when the target only resolves a frame later (real bug: it eased from the old shot)', () => {
    const ref: { current: Object3D | null } = { current: new Object3D() };
    ref.current!.position.set(0, 0, -20);
    const body = new PositionComposerBodyThree(ref, { cameraDistance: 10, deadZone: [0.9, 0.9], damping: 0.5 });
    const out = createCameraState();
    body.update(out, 0.016, true);
    ref.current!.position.set(5, 0, -20);
    for (let i = 0; i < 5; i++) body.update(out, 0.016, false);

    ref.current = null;
    body.update(out, 0.016, true);
    ref.current = new Object3D();
    ref.current.position.set(40, -12, -30);
    body.update(out, 0.016, false);

    expect(projectToScreen(out, 1, ref.current.position).x).toBeCloseTo(0, 4);
    expect(depthOf(out, ref.current.position)).toBeCloseTo(10, 4);
  });

  it('maxSpeed caps how fast damping closes the gap', () => {
    const target = new Vector3(20, 0, -10);
    const run = (maxSpeed: number) => {
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0, 0],
        damping: 1,
      });
      body.maxSpeed = maxSpeed;
      warmUp(body);
      const out = createCameraState();
      body.update(out, 0.05, false);
      return out.position[0];
    };

    expect(run(2)).toBeLessThan(run(Infinity));
  });

  describe('primeFrom', () => {
    it('makes the next activation ease from the primed position, once', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0, 0],
        damping: 0.5,
      });
      const out = createCameraState();
      vec3.set(out.position, 0, 0, 50);
      body.primeFrom(out.position);

      body.update(out, 0.016, true);
      expect(out.position[2]).toBeLessThan(50);
      expect(out.position[2]).toBeGreaterThan(-10);

      target.set(40, -12, -30);
      body.update(out, 0.016, true); // a later activation snaps as usual
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0, 4);
    });

    it('is used up even when the target is not resolved yet on that activation', () => {
      const body = new PositionComposerBodyThree(
        { current: null },
        { cameraDistance: 10, screenPosition: [0, 0], aspect: 1, deadZone: [0, 0], damping: 0.5 },
      );
      const out = createCameraState();
      vec3.set(out.position, 0, 0, 50);
      body.primeFrom(out.position);
      body.update(out, 0.016, true);
      expect(out.position).toEqual([0, 0, 50]);

      body.target = new Vector3(0, 0, -20);
      body.update(out, 0.016, true);
      expect(out.position[2]).toBeCloseTo(-10, 5);
    });

    it('still eases from the primed position when the target only resolves a frame later', () => {
      const body = new PositionComposerBodyThree({ current: null }, { cameraDistance: 10, damping: 0.5 });
      const out = createCameraState();
      vec3.set(out.position, 0, 0, 50);
      body.primeFrom(out.position);
      body.update(out, 0.016, true);

      body.target = new Vector3(0, 0, -20);
      body.update(out, 0.016, false);

      expect(out.position[2]).toBeLessThan(50);
      expect(out.position[2]).toBeGreaterThan(-10);
    });
  });

  describe('target extent', () => {
    // fov 90 makes a screen unit equal cameraDistance (10) world units, so extents read directly
    function nudgeFromCenter(target: Object3D | Vector3, body: PositionComposerBodyThree, x = 1.5) {
      const out = createCameraState();
      out.fov = 90;
      body.update(out, 0.1, false);
      const position = target instanceof Vector3 ? target : target.position;
      position.set(x, 0, -20);
      body.update(out, 0.1, false);
      return projectToScreen(out, 1, position.clone()).x;
    }

    it("a radius makes the dead zone react to the target's edge", () => {
      const point = new Vector3(0, 0, -20);
      expect(
        nudgeFromCenter(
          point,
          new PositionComposerBodyThree(point, {
            cameraDistance: 10,
            screenPosition: [0, 0],
            aspect: 1,
            deadZone: [0.2, 0.2],
            damping: 0,
          }),
        ),
      ).toBeCloseTo(0.15, 4);

      const sphere = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(sphere, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.2, 0.2],
        damping: 0,
        hardLimit: [0, 0],
        radius: 1,
      });
      expect(nudgeFromCenter(sphere, body)).toBeCloseTo(0.1, 4); // edge at 0.2, center 0.1 short of it
    });

    it('a size works like a radius, and a rotated box uses its oriented extent', () => {
      const box = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(box, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.2, 0.2],
        damping: 0,
        hardLimit: [0, 0],
        size: [2, 2, 2],
      });
      expect(nudgeFromCenter(box, body)).toBeCloseTo(0.1, 4);

      const rotated = new Object3D();
      rotated.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
      rotated.position.set(0, 0, -20);
      const rotatedBody = new PositionComposerBodyThree(rotated, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.2, 0.2],
        damping: 0,
        hardLimit: [0, 0],
        size: [2, 2, 2],
      });
      expect(nudgeFromCenter(rotated, rotatedBody)).toBeCloseTo(0.2 - Math.SQRT2 / 10, 4);
    });

    it('measures a mesh target on its own, and again only after recalculateSize()', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
      mesh.position.set(10, 0, -20);
      // the dead zone half-width sits between the 3x and 9x extents, so a stale size shows clearly
      const body = new PositionComposerBodyThree(mesh, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.6, 0.6],
        damping: 0,
      });
      const out = createCameraState();
      out.fov = 90;
      body.update(out, 0.1, false);
      expect(projectToScreen(out, 1, mesh.position.clone()).x).toBeCloseTo(0.5, 4); // half-extent 1 detected

      // raw vertex edits are the one change three.js never syncs into a cached bounding box
      const grow = () => {
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          position.setXYZ(i, position.getX(i) * 3, position.getY(i) * 3, position.getZ(i) * 3);
        }
      };
      grow();
      body.update(out, 0.1, false);
      expect(projectToScreen(out, 1, mesh.position.clone()).x).toBeCloseTo(0.5, 4); // still the cached size

      body.recalculateSize();
      body.update(out, 0.1, false);
      const afterRecalc = vec3.clone(out.position);
      expect(projectToScreen(out, 1, mesh.position.clone()).x).toBeCloseTo(0.3, 4); // half-extent 3

      grow();
      body.update(out, 0.1, false);
      expect(out.position).toEqual(afterRecalc); // recalculateSize() measured once, not every frame
    });

    it('an extent larger than the dead zone settles at the center instead of oscillating (real bug)', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.2, 0.2],
        damping: 0,
        hardLimit: [0, 0],
        radius: 2,
      });
      const out = createCameraState();
      body.update(out, 0.1, true);

      target.set(0.3, 0, -20);
      body.update(out, 0.1, false);
      const first = out.position[0];
      body.update(out, 0.1, false);

      expect(out.position[0]).toBeCloseTo(first, 8);
      expect(projectToScreen(out, 1, target).x).toBeCloseTo(0, 4);
    });

    it('an extent larger than hardLimit settles at the center too (real bug)', () => {
      const target = new Vector3(20, 0, -20);
      const body = warmUp(
        new PositionComposerBodyThree(target, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0.1, 0.1],
          damping: 5,
          hardLimit: [0.15, 0.15],
          radius: 2,
        }),
      );
      const out = createCameraState();

      body.update(out, 0.1, false);
      const first = projectToScreen(out, 1, target).x;
      body.update(out, 0.1, false);

      expect(projectToScreen(out, 1, target).x).toBeCloseTo(first, 4);
      expect(first).toBeCloseTo(0, 4);
    });
  });

  describe('hardLimit', () => {
    it('keeps the target inside it even when heavy damping would leave it outside, measured to its edge', () => {
      const pointTarget = new Vector3(20, 0, -10);
      const point = warmUp(
        new PositionComposerBodyThree(pointTarget, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0.1, 0.1],
          damping: 5,
          hardLimit: [0.15, 0.15],
        }),
      );
      const out = createCameraState();
      point.update(out, 0.1, false);
      expect(projectToScreen(out, 1, pointTarget).x).toBeCloseTo(0.15, 4);

      const sphereTarget = new Vector3(20, 0, -10);
      const sphere = warmUp(
        new PositionComposerBodyThree(sphereTarget, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0.1, 0.1],
          damping: 5,
          hardLimit: [0.15, 0.15],
          radius: 1,
        }),
      );
      const sphereOut = createCameraState();
      sphereOut.fov = 90;
      sphere.update(sphereOut, 0.1, false);
      expect(projectToScreen(sphereOut, 1, sphereTarget).x).toBeCloseTo(0.05, 4);
    });

    it('still applies when the target sits inside a larger dead zone (real bug: the dead zone returned early)', () => {
      const target = new Vector3(0, 0, -20);
      const body = new PositionComposerBodyThree(target, {
        cameraDistance: 10,
        screenPosition: [0, 0],
        aspect: 1,
        deadZone: [0.4, 0.4],
        damping: 0,
        hardLimit: [0.1, 0.1],
      });
      const out = createCameraState();
      body.update(out, 0.1, false);
      const before = vec3.clone(out.position);

      target.set(0.5, 0, -20);
      body.update(out, 0.1, false);

      expect(out.position).not.toEqual(before);
    });

    it('does nothing when the damped result is already inside it', () => {
      const target = new Vector3(20, 0, -20);
      const run = (hardLimit: [number, number]) => {
        const out = createCameraState();
        new PositionComposerBodyThree(target, {
          cameraDistance: 10,
          screenPosition: [0, 0],
          aspect: 1,
          deadZone: [0.2, 0.2],
          damping: 0.3,
          hardLimit,
        }).update(out, 0.016, false);
        return out.position;
      };
      expect(run([1000, 1000])).toEqual(run([0, 0]));
    });
  });

  describe('lookahead', () => {
    const dt = 1 / 60;

    function moving(setup: (body: PositionComposerBodyThree) => void) {
      const target = new Vector3();
      const body = new PositionComposerBodyThree(target, { cameraDistance: 10 });
      body.lookaheadTime = 0.5;
      body.lookaheadSmoothing = 10;
      setup(body);
      const out = createCameraState();
      body.update(out, dt, true);
      return { target, body, out };
    }

    it('places out.target ahead of a moving target, and leaves it raw by default', () => {
      const { target, body, out } = moving(() => {});
      for (let i = 0; i < 120; i++) {
        target.x += 10 * dt;
        body.update(out, dt, false);
      }
      expect(out.target[0] - target.x).toBeCloseTo(5, 1); // 0.5 s ahead at 10 units/s

      body.lookaheadTime = 0;
      body.update(out, dt, false);
      expect(out.target).toEqual(target.toArray());
    });

    it('starts over on activation and when the target changes', () => {
      const { target, body, out } = moving(() => {});
      for (let i = 0; i < 60; i++) {
        target.x += 10 * dt;
        body.update(out, dt, false);
      }
      body.update(out, dt, true);
      expect(out.target[0]).toBeCloseTo(target.x, 4);

      for (let i = 0; i < 60; i++) {
        target.x += 10 * dt;
        body.update(out, dt, false);
      }
      const other = new Vector3(100, 0, -20);
      body.target = other;
      body.update(out, dt, false);
      expect(out.target).toEqual(other.toArray());
    });

    it('ignoreY drops the vertical part of the prediction', () => {
      const { target, body, out } = moving((body) => (body.lookaheadIgnoreY = true));
      for (let i = 0; i < 120; i++) {
        target.y += 10 * dt;
        body.update(out, dt, false);
      }
      expect(out.target[1]).toBeCloseTo(target.y, 4);
    });
  });
});
