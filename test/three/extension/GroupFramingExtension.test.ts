import { vec3 } from 'math';
import { BoxGeometry, Mesh, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState, type CameraState } from '../../../src/core/CameraState';
import { applyCameraState } from '../../../src/three/camera';
import { GroupFramingExtension } from '../../../src/three/extension/GroupFramingExtension';
import { TargetGroup, type TargetGroupMember } from '../../../src/three/extension/TargetGroup';

/** Distance that fits a sphere of `radius` in a 90° field of view. */
const sphereFit = (radius: number) => radius / Math.sin(Math.PI / 4);

/** A camera state with a 90° field of view, looking down -Z from `position`. */
function camera(position: [number, number, number] = [0, 0, 0]): CameraState {
  const out = createCameraState();
  out.fov = 90;
  vec3.copy(out.position, position);
  return out;
}

const unit = (radius = 1): TargetGroupMember[] => [{ target: new Vector3(), radius }];

describe('GroupFramingExtension', () => {
  it('leaves out untouched when nothing resolves or the group has no size', () => {
    for (const members of [[], [{ target: new Vector3(5, 5, 5) }]]) {
      const out = camera([1, 2, 3]);
      out.viewOffset[0] = 1;
      const moving = new GroupFramingExtension(new TargetGroup(members), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0.5,
        screenPosition: [0.8, 0],
      }).update(out, 0.1, false);
      expect(out.position).toEqual([1, 2, 3]);
      expect(out.viewOffset[0]).toBe(1);
      expect(moving).toBe(false);
    }
  });

  it("backs away along the camera's own view axis until the group fits", () => {
    const out = camera();
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2).toArray(out.quaternion);

    new GroupFramingExtension(new TargetGroup(unit()), { padding: 0, viewportWidth: 100, viewportHeight: 100 }).update(
      out,
      0.1,
      false,
    );

    expect(out.position[0]).toBeCloseTo(sphereFit(1), 10);
    expect(out.position[1]).toBeCloseTo(0, 10);
    expect(out.position[2]).toBeCloseTo(0, 10);
  });

  it('adds padding as a world-unit margin, for spheres and boxes', () => {
    const sphere = camera();
    new GroupFramingExtension(new TargetGroup(unit()), { padding: 20, viewportWidth: 100, viewportHeight: 100 }).update(
      sphere,
      0.1,
      false,
    );
    expect(sphere.position[2]).toBeGreaterThan(sphereFit(1));

    const box = camera();
    new GroupFramingExtension(new TargetGroup([{ target: new Vector3(), size: [2, 2, 2] }]), {
      padding: 1,
      viewportWidth: 100,
      viewportHeight: 100,
    }).update(box, 0.1, false);
    expect(box.position[2]).toBeCloseTo(2 / Math.tan(Math.PI / 4) + 1, 10);
  });

  it('uses the tighter axis of a non-square viewport', () => {
    const out = camera();
    new GroupFramingExtension(new TargetGroup(unit()), { padding: 0, viewportWidth: 1000, viewportHeight: 100 }).update(
      out,
      0.1,
      false,
    );
    expect(out.position[2]).toBeCloseTo(sphereFit(1), 5);
  });

  it('fits an off-axis member per axis, not by its full offset (real bug: overshot along the wider axis)', () => {
    const group = new TargetGroup([
      { target: new Vector3(-5, 0, 0), radius: 1 },
      { target: new Vector3(5, 0, 0), radius: 1 },
    ]);
    const out = camera();

    new GroupFramingExtension(group, { padding: 0, viewportWidth: 1000, viewportHeight: 100 }).update(out, 0.1, false);

    // (radius + 5 cos(h)) / sin(h), with h = atan(tan(45°) * 10)
    expect(out.position[2]).toBeCloseTo(1.5049875621120896, 10);
  });

  it('reads the group live, not a snapshot from construction', () => {
    const group = new TargetGroup(unit());
    const extension = new GroupFramingExtension(group, { padding: 0, viewportWidth: 100, viewportHeight: 100 });
    const out = camera();
    extension.update(out, 0.1, false);

    group.members[0].radius = 5;
    extension.update(out, 0.1, false);

    expect(out.position[2]).toBeCloseTo(sphereFit(5), 10);
  });

  describe('fitMode', () => {
    it("'ceiling' (default) only backs away when the Body placed the camera too close (real bug: always snapped to the fit)", () => {
      const extension = new GroupFramingExtension(new TargetGroup(unit()), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      });

      const close = camera([0, 0, 0.5]);
      extension.update(close, 0.1, false);
      expect(close.position[2]).toBeCloseTo(sphereFit(1), 10);

      for (const distance of [10, 25]) {
        const far = camera([0, 0, distance]);
        extension.update(far, 0.1, false);
        expect(far.position[2]).toBeCloseTo(distance, 10);
      }
    });

    it("'rigid' always sits at the fit distance, following a shrinking group back in", () => {
      const group = new TargetGroup(unit(10));
      const extension = new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0,
        screenPosition: [0, 0],
        fitMode: 'rigid',
      });
      const out = camera([0, 0, 50]);

      extension.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(sphereFit(10), 10);

      group.members[0].radius = 1;
      extension.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(sphereFit(1), 10);
    });
  });

  it("minDistance and maxDistance bound the fit, not the Body's own placement", () => {
    const fit = (radius: number, fitMode: 'rigid' | 'ceiling', min: number, max: number, from = 0) => {
      const out = camera([0, 0, from]);
      new GroupFramingExtension(new TargetGroup(unit(radius)), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0,
        screenPosition: [0, 0],
        fitMode,
        minDistance: min,
        maxDistance: max,
      }).update(out, 0.1, false);
      return out.position[2];
    };

    expect(fit(100, 'rigid', 0, 5)).toBeCloseTo(5, 10);
    expect(fit(0.01, 'rigid', 10, Infinity)).toBeCloseTo(10, 10);
    expect(fit(1, 'ceiling', 0, 5, 50)).toBeCloseTo(50, 10);
  });

  it('framingMode ignores the axis it leaves out', () => {
    const fit = (framingMode: 'horizontal' | 'vertical', spread: Vector3) => {
      const group = new TargetGroup([
        { target: spread.clone().negate(), radius: 1 },
        { target: spread, radius: 1 },
      ]);
      const out = camera([0, 0, 0.5]);
      new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0,
        screenPosition: [0, 0],
        fitMode: 'ceiling',
        minDistance: 0,
        maxDistance: Infinity,
        framingMode,
      }).update(out, 0.1, false);
      return out.position[2];
    };

    expect(fit('horizontal', new Vector3(0, 1000, 0))).toBeCloseTo(sphereFit(1), 10);
    expect(fit('vertical', new Vector3(1000, 0, 0))).toBeCloseTo(sphereFit(1), 10);
  });

  describe('box members', () => {
    const boxFit = (halfSize: number) => halfSize / Math.tan(Math.PI / 4) + halfSize;

    it('fits a face-on box to its width and height, with its near face at the fit distance (real bug: used the corner-to-corner sphere)', () => {
      const out = camera();
      new GroupFramingExtension(new TargetGroup([{ target: new Vector3(), size: [2, 2, 2] }]), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      }).update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(boxFit(1), 10);
    });

    it('from a pitched camera, takes the tallest and nearest corners separately (real bug: summed them as one corner)', () => {
      const pitch = Math.PI / 6;
      const out = camera();
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch).toArray(out.quaternion);

      new GroupFramingExtension(new TargetGroup([{ target: new Vector3(), size: [2, 2, 2] }]), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      }).update(out, 0.1, false);

      expect(vec3.length(out.position)).toBeCloseTo(1 / Math.tan(Math.PI / 4) + Math.sin(pitch) + Math.cos(pitch), 10);
    });

    it('a rotated box needs more room than face-on', () => {
      const rotated = new Mesh(new BoxGeometry(2, 2, 2));
      rotated.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
      const out = camera();
      new GroupFramingExtension(new TargetGroup([{ target: rotated, size: [2, 2, 2] }]), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      }).update(out, 0.1, false);
      expect(out.position[2]).toBeGreaterThan(boxFit(1));
    });

    it('a mixed group takes whichever member needs more room', () => {
      const group = new TargetGroup([...unit(), { target: new Vector3(), size: [1, 1, 1] }]);
      const out = camera();
      new GroupFramingExtension(group, { padding: 0, viewportWidth: 100, viewportHeight: 100 }).update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(sphereFit(1), 10);
    });

    it('measures a mesh on its own, and again only after recalculateSize()', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));
      const extension = new GroupFramingExtension(new TargetGroup([{ target: mesh }]), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      });
      const out = camera();
      // raw vertex edits are the one change three.js never syncs into a cached bounding box
      const grow = () => {
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          position.setXYZ(i, position.getX(i) * 3, position.getY(i) * 3, position.getZ(i) * 3);
        }
      };

      extension.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(boxFit(1), 10);

      grow();
      extension.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(boxFit(1), 10);

      extension.recalculateSize();
      extension.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(boxFit(3), 10);

      grow();
      extension.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(boxFit(3), 10);
    });
  });

  describe('screenPosition', () => {
    it('writes straight into out.viewOffset', () => {
      const out = camera();
      new GroupFramingExtension(new TargetGroup(unit()), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0,
        screenPosition: [0.8, -0.3],
      }).update(out, 0.1, false);
      expect(out.viewOffset).toEqual([0.8, -0.3]);
    });

    it('a positive x moves the group toward the right of the frame (real bug: was inverted)', () => {
      const out = camera();
      new GroupFramingExtension(new TargetGroup(unit()), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0,
        screenPosition: [0.5, 0],
      }).update(out, 0.1, false);

      const view = new PerspectiveCamera(out.fov, 1, 0.1, 1000);
      applyCameraState(view, out, 100, 100);
      view.updateMatrixWorld(true);

      expect(new Vector3().project(view).x).toBeGreaterThan(0);
    });
  });

  describe('damping', () => {
    it('is instant by default, and with damping snaps on the first update then eases distance and screenPosition', () => {
      const instantGroup = new TargetGroup(unit());
      const instant = new GroupFramingExtension(instantGroup, { padding: 0, viewportWidth: 100, viewportHeight: 100 });
      const instantOut = camera();
      instant.update(instantOut, 0.1, false);
      instantGroup.members[0].radius = 5;
      instant.update(instantOut, 0.1, false);
      expect(instantOut.position[2]).toBeCloseTo(sphereFit(5), 10);

      const group = new TargetGroup(unit());
      const damped = new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 1,
        screenPosition: [1, 0],
      });
      const out = camera();
      damped.update(out, 0.1, false);
      expect(out.position[2]).toBeCloseTo(sphereFit(1), 10);
      expect(out.viewOffset[0]).toBe(1);

      group.members[0].radius = 5;
      damped.screenPosition = [0, 0];
      damped.update(out, 0.1, false);
      expect(out.position[2]).toBeGreaterThan(sphereFit(1));
      expect(out.position[2]).toBeLessThan(sphereFit(5));
      expect(out.viewOffset[0]).toBeGreaterThan(0);
      expect(out.viewOffset[0]).toBeLessThan(1);
    });

    it('keeps its own progress when the Body resets out.position every frame', () => {
      const group = new TargetGroup(unit());
      const extension = new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 1,
      });
      const out = camera([0, 2, 5]);
      extension.update(out, 0.1, false);
      const first = out.position[2];

      group.members[0].radius = 5;
      for (let i = 0; i < 5; i++) {
        vec3.set(out.position, 0, 2, 5);
        extension.update(out, 0.1, false);
      }

      expect(out.position[2]).toBeGreaterThan(first);
    });

    it('stays on the view axis every frame while the camera turns mid-ease', () => {
      const group = new TargetGroup(unit());
      const extension = new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 1,
      });
      const out = camera();
      extension.update(out, 0.1, false);

      group.members[0].radius = 5;
      for (let i = 1; i <= 5; i++) {
        const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 0.1);
        rotation.toArray(out.quaternion);
        extension.update(out, 0.1, false);

        const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
        const toGroup = new Vector3(...out.position).negate().normalize();
        expect(forward.dot(toGroup)).toBeCloseTo(1, 10);
      }
    });

    it('maxSpeed caps how fast damping closes the gap', () => {
      const run = (maxSpeed: number) => {
        const group = new TargetGroup(unit());
        const extension = new GroupFramingExtension(group, {
          padding: 0,
          viewportWidth: 100,
          viewportHeight: 100,
          damping: 1,
          screenPosition: [0, 0],
          fitMode: 'ceiling',
          minDistance: 0,
          maxDistance: Infinity,
          framingMode: 'horizontalAndVertical',
          maxSpeed,
        });
        const out = camera();
        extension.update(out, 0.1, false);
        group.members[0].radius = 5;
        extension.update(out, 0.1, false);
        return out.position[2];
      };

      expect(run(2)).toBeLessThan(run(Infinity));
    });

    it('reports whether distance or screenPosition is still moving', () => {
      const group = new TargetGroup(unit());
      const extension = new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0.3,
        screenPosition: [1, 0],
      });
      const out = camera();
      extension.update(out, 0.1, false);
      expect(extension.update(out, 0.1, false)).toBe(false);

      group.members[0].radius = 5;
      expect(extension.update(out, 0.1, false)).toBe(true);
      for (let i = 0; i < 300; i++) extension.update(out, 0.1, false);
      expect(extension.update(out, 0.1, false)).toBe(false);

      extension.screenPosition = [0, 0];
      expect(extension.update(out, 0.1, false)).toBe(true);

      const instant = new GroupFramingExtension(new TargetGroup(unit()), {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
      });
      expect(instant.update(camera(), 0.1, false)).toBe(false);
    });

    it('justActivated snaps to a changed group, where a plain update would ease', () => {
      const run = (justActivated: boolean) => {
        const group = new TargetGroup(unit());
        const extension = new GroupFramingExtension(group, {
          padding: 0,
          viewportWidth: 100,
          viewportHeight: 100,
          damping: 0.5,
        });
        const out = camera();
        extension.update(out, 0.1, true);
        extension.update(out, 0.1, false);
        group.members[0].radius = 10;
        extension.update(out, 0.1, justActivated);
        return out.position[2];
      };

      expect(run(true)).toBeCloseTo(sphereFit(10), 8);
      expect(run(false)).not.toBeCloseTo(sphereFit(10), 1);
    });

    it('a reactivation snaps even when the group only resolves a frame later (real bug: it eased from the old shot)', () => {
      const group = new TargetGroup(unit());
      const extension = new GroupFramingExtension(group, {
        padding: 0,
        viewportWidth: 100,
        viewportHeight: 100,
        damping: 0.5,
      });
      const out = camera();
      extension.update(out, 0.1, true);
      extension.update(out, 0.1, false);

      const members = group.members;
      group.members = [];
      extension.update(out, 0.1, true);
      group.members = [{ ...members[0], radius: 10 }];
      extension.update(out, 0.1, false);

      expect(out.position[2]).toBeCloseTo(sphereFit(10), 8);
    });
  });
});
