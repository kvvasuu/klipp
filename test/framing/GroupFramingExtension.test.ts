import { BoxGeometry, Mesh, Vector3 } from 'three';
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

  describe('ceiling behavior (does not override Body/Aim unless the padded group would not fit)', () => {
    it('leaves out.position untouched in DISTANCE when Body already placed the camera farther than required', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();
      out.position.set(0, 0, 50); // Body already put the camera way farther than the fit requires

      extension.update(out, 0.1);

      // required fit distance for radius 1 at 90° vertical FOV is ~1.41 — Body's own 50 must win
      expect(out.position.z).toBeCloseTo(50, 10);
    });

    it('dollies back to the required distance when Body placed the camera CLOSER than the padded group needs', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();
      out.position.set(0, 0, 0.5); // Body put the camera too close for the group to fit in frame

      extension.update(out, 0.1);

      const expectedDistance = 1 / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeCloseTo(expectedDistance, 10);
    });

    it("tracks Body's own distance 1:1 once it exceeds the required fit distance (real bug this fixes: used to always snap to the rigid fit distance, ignoring Body entirely)", () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();

      out.position.set(0, 0, 10);
      extension.update(out, 0.1);
      expect(out.position.z).toBeCloseTo(10, 10);

      out.position.set(0, 0, 25);
      extension.update(out, 0.1);
      expect(out.position.z).toBeCloseTo(25, 10);
    });
  });

  describe('box members (size)', () => {
    it('fits a face-on box to its actual width/height, not the corner-to-corner sphere (real bug this fixes)', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), size: [2, 2, 2] }]);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();

      new GroupFramingExtension(group, 0, 100, 100).update(out, 0.1);

      // face-on, a 2x2x2 box needs half-width 1 to fit, plus half its own depth (1) so the NEAR face —
      // not the center — lands at the fit distance (matches camera-controls' own `+ depth * 0.5`)
      const expectedDistance = 1 / Math.tan(Math.PI / 4) + 1;
      expect(out.position.z).toBeCloseTo(expectedDistance, 10);

      // the OLD sphere-based (half-diagonal) fit would have required sqrt(3)/sin(45°) ≈ 2.45 — farther still
      const oldSphereDistance = Math.sqrt(3) / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeLessThan(oldSphereDistance);
    });

    it('a box seen from a pitched camera needs less distance than naively summing half-height and half-depth (real bug this fixes: the tallest corner and the nearest corner are not always the same one)', () => {
      const theta = Math.PI / 6;
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), size: [2, 2, 2] }]);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), theta);

      new GroupFramingExtension(group, 0, 100, 100).update(out, 0.1);
      const actualDistance = out.position.length();

      const tanHalf = Math.tan(Math.PI / 4);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      // old (buggy) formula: treats the box's full projected half-height and half-depth as if the SAME
      // corner were simultaneously tallest AND nearest — it isn't, so this over-estimates the distance
      const oldOverConservativeDistance = (cos + sin) / tanHalf + (sin + cos);
      // exact per-corner distance: here the width axis (half-extent 1, unaffected by pitch) combined
      // with the nearest corner's depth is the true binding constraint
      const exactDistance = 1 / tanHalf + (sin + cos);

      expect(actualDistance).toBeCloseTo(exactDistance, 10);
      expect(actualDistance).toBeLessThan(oldOverConservativeDistance);
    });

    it('a box rotated 45° needs MORE distance than face-on (more of its silhouette is exposed)', () => {
      const faceOnGroup = new TargetGroup([{ target: new Vector3(0, 0, 0), size: [2, 2, 2] }]);
      const faceOnOut = createCameraState();
      faceOnOut.fov = 90;
      faceOnOut.quaternion.identity();
      new GroupFramingExtension(faceOnGroup, 0, 100, 100).update(faceOnOut, 0.1);

      const rotatedBox = new Mesh(new BoxGeometry(2, 2, 2));
      rotatedBox.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 4);
      const rotatedGroup = new TargetGroup([{ target: rotatedBox, size: [2, 2, 2] }]);
      const rotatedOut = createCameraState();
      rotatedOut.fov = 90;
      rotatedOut.quaternion.identity();
      new GroupFramingExtension(rotatedGroup, 0, 100, 100).update(rotatedOut, 0.1);

      expect(rotatedOut.position.z).toBeGreaterThan(faceOnOut.position.z);
    });

    it('auto-detects size from a Mesh target end-to-end (no explicit size/radius)', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));
      const group = new TargetGroup([{ target: mesh }]);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();

      new GroupFramingExtension(group, 0, 100, 100).update(out, 0.1);

      const expectedDistance = 1 / Math.tan(Math.PI / 4) + 1;
      expect(out.position.z).toBeCloseTo(expectedDistance, 10);
    });

    it('a mixed group (sphere + box) takes whichever member actually requires more distance', () => {
      const group = new TargetGroup([
        { target: new Vector3(0, 0, 0), radius: 1 }, // needs 1/sin(45°) ≈ 1.41
        { target: new Vector3(0, 0, 0), size: [1, 1, 1] }, // needs 0.5/tan(45°) = 0.5 — much less
      ]);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();

      new GroupFramingExtension(group, 0, 100, 100).update(out, 0.1);

      const expectedFromSphere = 1 / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeCloseTo(expectedFromSphere, 10);
    });

    it('padding adds a flat world-unit margin to a box, same as it does for a sphere', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), size: [2, 2, 2] }]);

      const noPadding = createCameraState();
      noPadding.fov = 90;
      noPadding.quaternion.identity();
      new GroupFramingExtension(group, 0, 100, 100).update(noPadding, 0.1);

      const withPadding = createCameraState();
      withPadding.fov = 90;
      withPadding.quaternion.identity();
      new GroupFramingExtension(group, 1, 100, 100).update(withPadding, 0.1);

      const expectedWithPadding = (1 + 1) / Math.tan(Math.PI / 4) + 1; // half-width 1 + padding 1, plus depth
      expect(withPadding.position.z).toBeCloseTo(expectedWithPadding, 10);
      expect(withPadding.position.z).toBeGreaterThan(noPadding.position.z);
    });
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

    it('stays PERFECTLY aligned with the CURRENT rotation every frame, even while distance is still ' +
      'damping and rotation is ALSO changing frame to frame (e.g. an OrbitalFollow azimuth transition)', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 1); // damping = 1s
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();
      extension.update(out, 0.1); // first-ever call snaps

      group.members[0].radius = 5; // distance target changes...
      for (let i = 1; i <= 5; i++) {
        out.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), i * 0.1); // ...AND rotation sweeps too
        extension.update(out, 0.1);

        // damping the full position (instead of just the scalar distance) would let this drift off the
        // "look straight at the group" ray whenever rotation changes mid-damp — direction-to-group must
        // exactly match the camera's forward axis on EVERY frame, not just once distance settles
        const forward = new Vector3(0, 0, -1).applyQuaternion(out.quaternion);
        const toGroup = new Vector3().subVectors(new Vector3(0, 0, 0), out.position).normalize();
        expect(forward.dot(toGroup)).toBeCloseTo(1, 10);
      }
    });
  });

  describe('screenPosition (normalized 0 = center, ±1 = frame edge - same convention/shape as PositionComposer\'s screenPosition, not pixels)', () => {
    it('writes screenPosition straight into out.viewOffset - both normalized, no pixel conversion here', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0, [0.8, -0.3]);
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1);

      expect(out.viewOffset).toEqual([0.8, -0.3]);
    });

    it('is a no-op (out.viewOffset untouched) when the group has nothing to resolve, same as position', () => {
      const group = new TargetGroup([]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0, [0.8, -0.3]);
      const out = createCameraState();
      out.viewOffset[0] = 1;
      out.viewOffset[1] = 2;

      extension.update(out, 0.1);

      expect(out.viewOffset[0]).toBe(1);
      expect(out.viewOffset[1]).toBe(2);
    });

    it('damps toward screenPosition using the SAME damping field as the distance fit', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 1, [1, 0]); // damping = 1s
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1); // first-ever call snaps
      expect(out.viewOffset[0]).toBe(1);

      extension.screenPosition = [0, 0]; // big change
      extension.update(out, 0.1); // one small step back toward 0

      expect(out.viewOffset[0]).toBeLessThan(1);
      expect(out.viewOffset[0]).toBeGreaterThan(0);
    });

    it('damping=0 (default) snaps screenPosition instantly, same as the distance fit', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100); // damping defaults to 0
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1);
      extension.screenPosition = [0.5, 0];
      extension.update(out, 0.1);

      expect(out.viewOffset[0]).toBe(0.5);
    });
  });

  describe('return value (stillInFlight, frameloop="demand" plateau safety / settle detection)', () => {
    it('damping <= 0 (default): always false — an instant snap is never "in flight"', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100);
      const out = createCameraState();
      out.fov = 90;

      expect(extension.update(out, 0.1)).toBe(false);
      group.members[0].radius = 5;
      expect(extension.update(out, 0.1)).toBe(false);
    });

    it('damping > 0: true while distance is still catching up, false once converged', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0.3);
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1); // first-ever call snaps exactly
      expect(extension.update(out, 0.1)).toBe(false);

      group.members[0].radius = 5; // real ground to cover now
      expect(extension.update(out, 0.1)).toBe(true);

      for (let i = 0; i < 300; i++) extension.update(out, 0.1); // run it out to convergence
      expect(extension.update(out, 0.1)).toBe(false);
    });

    it('true while ONLY screenPosition is still catching up, even if distance already converged', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0.3, [1, 0]);
      const out = createCameraState();
      out.fov = 90;

      extension.update(out, 0.1); // first-ever call snaps both distance and screenPosition exactly
      expect(extension.update(out, 0.1)).toBe(false);

      extension.screenPosition = [0, 0]; // distance's target hasn't changed, only screenPosition's has
      expect(extension.update(out, 0.1)).toBe(true);
    });

    it('false when the group has nothing to resolve — nothing is animating', () => {
      const group = new TargetGroup([]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0.5);
      const out = createCameraState();

      expect(extension.update(out, 0.1)).toBe(false);
    });
  });

  describe('justActivated', () => {
    it('snaps distance straight to the correct value even with a warmed-up damper', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0.5);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();

      extension.update(out, 0.1, true); // first-ever session: snaps, warms up the damper
      extension.update(out, 0.1, false);

      // a later, unrelated session: the group's bounds changed drastically while inactive
      group.members[0].radius = 10;
      extension.update(out, 0.1, true);

      const expectedDistance = 10 / Math.sin(Math.PI / 4);
      expect(out.position.z).toBeCloseTo(expectedDistance, 8); // backward = +Z from an identity quaternion
    });

    it('without justActivated, the same scenario eases instead of snapping (the bug this fixes)', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 1 }]);
      const extension = new GroupFramingExtension(group, 0, 100, 100, 0.5);
      const out = createCameraState();
      out.fov = 90;
      out.quaternion.identity();

      extension.update(out, 0.1, true);
      extension.update(out, 0.1, false);

      group.members[0].radius = 10;
      extension.update(out, 0.1, false); // no reactivation signal — damper treats this as a normal retarget

      const expectedDistance = 10 / Math.sin(Math.PI / 4);
      expect(out.position.z).not.toBeCloseTo(expectedDistance, 1);
    });
  });
});
