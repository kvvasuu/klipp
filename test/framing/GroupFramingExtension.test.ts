import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { GroupFramingExtension } from '../../src/framing/GroupFramingExtension';
import { TargetGroup } from '../../src/framing/TargetGroup';

describe('GroupFramingExtension', () => {
  it('no-op (out untouched) when the group has nothing to resolve', () => {
    const group = new TargetGroup([]);
    const extension = new GroupFramingExtension(group, 0, 800, 600);
    const out = createCameraState();
    out.position.set(1, 2, 3);

    extension.update(out, 0.1);

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  it('no-op when the group resolves to a dimensionless point (radius 0)', () => {
    const group = new TargetGroup([{ target: new Vector3(5, 5, 5) }]); // no radius given, defaults to 0
    const extension = new GroupFramingExtension(group, 0, 800, 600);
    const out = createCameraState();
    out.position.set(1, 2, 3);

    extension.update(out, 0.1);

    expect(out.position.equals(new Vector3(1, 2, 3))).toBe(true);
  });

  it('90° vertical FOV, square viewport, no padding: distance = radius / sin(45°)', () => {
    const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
    const extension = new GroupFramingExtension(group, 0, 100, 100);
    const out = createCameraState();
    out.fov = 90;
    out.quaternion.identity(); // default THREE orientation: looks down -Z, so backward = +Z

    extension.update(out, 0.1);

    const expectedDistance = 1 / Math.sin(Math.PI / 4);
    expect(out.position.x).toBeCloseTo(0, 10);
    expect(out.position.y).toBeCloseTo(0, 10);
    expect(out.position.z).toBeCloseTo(expectedDistance, 10);
  });

  it('dollies along the camera\'s OWN current backward direction, not a fixed world axis', () => {
    const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
    const extension = new GroupFramingExtension(group, 0, 100, 100);
    const out = createCameraState();
    out.fov = 90;
    out.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // now looking down -X instead

    extension.update(out, 0.1);

    const expectedDistance = 1 / Math.sin(Math.PI / 4);
    // world +Z rotated +90° around Y lands on +X — backward follows the rotation, not a hardcoded axis
    expect(out.position.x).toBeCloseTo(expectedDistance, 10);
    expect(out.position.y).toBeCloseTo(0, 10);
    expect(out.position.z).toBeCloseTo(0, 10);
  });

  it('more padding pushes the camera farther away', () => {
    const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);

    const noPadding = createCameraState();
    noPadding.fov = 90;
    new GroupFramingExtension(group, 0, 100, 100).update(noPadding, 0.1);

    const withPadding = createCameraState();
    withPadding.fov = 90;
    new GroupFramingExtension(group, 20, 100, 100).update(withPadding, 0.1);

    expect(withPadding.position.z).toBeGreaterThan(noPadding.position.z);
  });

  it('a non-square viewport picks the more restrictive of the two axes', () => {
    // very wide viewport: horizontal FOV ends up huge, so vertical stays the binding constraint
    const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
    const out = createCameraState();
    out.fov = 90;

    new GroupFramingExtension(group, 0, 1000, 100).update(out, 0.1);

    const expectedDistance = 1 / Math.sin(Math.PI / 4); // the (aspect-independent) vertical requirement
    expect(out.position.z).toBeCloseTo(expectedDistance, 5);
  });

  it('reads group/padding/viewport LIVE off its own fields, not a snapshot taken at construction', () => {
    const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
    const extension = new GroupFramingExtension(group, 0, 100, 100);
    const out = createCameraState();
    out.fov = 90;

    extension.update(out, 0.1);
    const distanceForRadius1 = out.position.z;

    group.members[0].radius = 2; // grow the framed box after construction
    extension.update(out, 0.1);

    expect(out.position.z).toBeGreaterThan(distanceForRadius1);
  });

  describe('damping', () => {
    it('damping=0 (default) stays perfectly instant, even across repeated changes', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100); // damping defaults to 0
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1);
      group.members[0].radius = 5;
      extension.update(out, 0.1);

      const expectedDistance = 5 / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeCloseTo(expectedDistance, 10); // fully caught up in a single step
    });

    it('the first-ever update still snaps hard, matching the rest of klipp\'s damping convention', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 1); // damping = 1s
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1);

      const expectedDistance = 1 / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeCloseTo(expectedDistance, 10); // no lag on the very first frame
    });

    it('a SUBSEQUENT change eases in over time instead of snapping instantly', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 1); // damping = 1s
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1); // first-ever call snaps
      const initialDistance = out.position.z;

      group.members[0].radius = 5; // grow the box a lot
      extension.update(out, 0.1); // one small step toward the new, much farther distance

      const distanceIfInstant = 5 / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeGreaterThan(initialDistance); // moved...
      expect(out.position.z).toBeLessThan(distanceIfInstant); // ...but not all the way there yet
    });

    it('keeps making progress even when something ELSE resets out.position every frame before it runs ' +
      '(e.g. an undamped Body.Follow, which recomputes a fixed position from scratch each tick)', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 1); // damping = 1s
      const out = createCameraState();
      out.fov = 90;
      const bodyWrittenPosition = new Vector3(0, 2, 5); // stand-in for Body.Follow's damping=0 output

      out.position.copy(bodyWrittenPosition);
      extension.update(out, 0.1); // first-ever call snaps to the desired distance regardless
      const afterFirst = out.position.z;

      group.members[0].radius = 5; // grow the box — new desired distance is much farther
      for (let i = 0; i < 5; i++) {
        out.position.copy(bodyWrittenPosition); // simulates Body resetting the shared CameraState
        extension.update(out, 0.1);
      }

      // if damping incorrectly read its "current" value FROM out.position (which Body keeps stomping
      // back to bodyWrittenPosition), every step would restart from the same spot and net progress
      // would be ~0 — a persistent internal memory keeps advancing regardless
      expect(out.position.z).toBeGreaterThan(afterFirst);
    });
  });
});
