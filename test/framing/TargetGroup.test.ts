import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { TargetGroup } from '../../src/framing/TargetGroup';

describe('TargetGroup', () => {
  describe('groupCenter (default)', () => {
    it('a single point member (radius 0): position = that point, radius = 0', () => {
      const group = new TargetGroup([{ target: new Vector3(3, 4, 5) }]);

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(out.equals(new Vector3(3, 4, 5))).toBe(true);
      expect(radius).toBe(0);
    });

    it('a single member with its own radius: position = that point, radius = its own radius', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), radius: 2 }]);

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(out.equals(new Vector3(0, 0, 0))).toBe(true);
      expect(radius).toBeCloseTo(2, 10);
    });

    it('two symmetric points: position = their midpoint, radius = half the distance between them', () => {
      const group = new TargetGroup([{ target: new Vector3(-5, 0, 0) }, { target: new Vector3(5, 0, 0) }]);

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(out.equals(new Vector3(0, 0, 0))).toBe(true);
      expect(radius).toBeCloseTo(5, 10);
    });

    it('accounts for member radius when computing the enclosing AABB, not just member position', () => {
      // one point at origin, one point at x=10 with radius=3 — AABB spans [-0, 13], center = 6.5
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0) }, { target: new Vector3(10, 0, 0), radius: 3 }]);

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(out.x).toBeCloseTo(6.5, 10);
      expect(radius).toBeCloseTo(6.5, 10);
    });

    it('ignores weight entirely — only radius/position matter in this mode', () => {
      const withWeight = new TargetGroup([
        { target: new Vector3(-5, 0, 0), weight: 100 },
        { target: new Vector3(5, 0, 0), weight: 1 },
      ]);
      const withoutWeight = new TargetGroup([{ target: new Vector3(-5, 0, 0) }, { target: new Vector3(5, 0, 0) }]);

      const outA = new Vector3();
      const outB = new Vector3();
      expect(withWeight.computeBounds(outA)).toBe(withoutWeight.computeBounds(outB));
      expect(outA.equals(outB)).toBe(true);
    });

    it('skips a member that fails to resolve (null ref) instead of treating it as the origin', () => {
      const group = new TargetGroup([{ target: { current: null } }, { target: new Vector3(10, 0, 0) }]);

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(out.equals(new Vector3(10, 0, 0))).toBe(true);
      expect(radius).toBe(0);
    });

    it('returns 0 and leaves "out" untouched when no member resolves', () => {
      const group = new TargetGroup([{ target: null }, { target: { current: null } }]);

      const out = new Vector3(9, 9, 9);
      const radius = group.computeBounds(out);

      expect(radius).toBe(0);
      expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
    });

    it('an empty member list resolves nothing', () => {
      const group = new TargetGroup([]);

      const out = new Vector3(9, 9, 9);
      const radius = group.computeBounds(out);

      expect(radius).toBe(0);
      expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
    });
  });

  describe('groupAverage', () => {
    it('a single point member: position = that point, radius = 0', () => {
      const group = new TargetGroup([{ target: new Vector3(3, 4, 5) }], 'groupAverage');

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(out.equals(new Vector3(3, 4, 5))).toBe(true);
      expect(radius).toBe(0);
    });

    it('unweighted members average their positions evenly', () => {
      const group = new TargetGroup(
        [{ target: new Vector3(0, 0, 0) }, { target: new Vector3(10, 0, 0) }],
        'groupAverage',
      );

      const out = new Vector3();
      group.computeBounds(out);

      expect(out.x).toBeCloseTo(5, 10);
    });

    it('a heavier weight pulls the average position toward it', () => {
      const group = new TargetGroup(
        [
          { target: new Vector3(0, 0, 0), weight: 9 },
          { target: new Vector3(10, 0, 0), weight: 1 },
        ],
        'groupAverage',
      );

      const out = new Vector3();
      group.computeBounds(out);

      expect(out.x).toBeCloseTo(1, 10); // 90% toward the heavier member
    });

    it('a zero/negative weight member contributes nothing to the average', () => {
      const group = new TargetGroup(
        [
          { target: new Vector3(0, 0, 0), weight: 1 },
          { target: new Vector3(1000, 0, 0), weight: 0 },
        ],
        'groupAverage',
      );

      const out = new Vector3();
      group.computeBounds(out);

      expect(out.x).toBeCloseTo(0, 10);
    });

    it('radius is measured from the AVERAGE position, not an AABB center', () => {
      // average of x=0 and x=10 is x=5 — each point is 5 away, so radius = 5 either way here, but this
      // pins the measurement point down explicitly rather than assuming groupCenter's math coincidentally matches
      const group = new TargetGroup(
        [{ target: new Vector3(0, 0, 0) }, { target: new Vector3(10, 0, 0) }],
        'groupAverage',
      );

      const out = new Vector3();
      const radius = group.computeBounds(out);

      expect(radius).toBeCloseTo(5, 10);
    });

    it('accounts for member radius on top of its distance from the average position', () => {
      const group = new TargetGroup(
        [{ target: new Vector3(0, 0, 0) }, { target: new Vector3(10, 0, 0), radius: 3 }],
        'groupAverage',
      );

      const out = new Vector3(); // average = x=5
      const radius = group.computeBounds(out);

      expect(radius).toBeCloseTo(8, 10); // distance 5 + that member's own radius 3
    });

    it('returns 0 and leaves "out" untouched when total weight is 0', () => {
      const group = new TargetGroup([{ target: new Vector3(10, 0, 0), weight: 0 }], 'groupAverage');

      const out = new Vector3(9, 9, 9);
      const radius = group.computeBounds(out);

      expect(radius).toBe(0);
      expect(out.equals(new Vector3(9, 9, 9))).toBe(true);
    });
  });

  describe('resolveMemberSize', () => {
    it('an explicit size wins, in full width/height/depth', () => {
      const group = new TargetGroup();
      const out = new Vector3();

      const resolved = group.resolveMemberSize(out, { target: new Vector3(), size: [2, 4, 6] });

      expect(resolved).toBe(true);
      expect(out.equals(new Vector3(2, 4, 6))).toBe(true);
    });

    it('an explicit radius wins over auto-detection — no size resolved', () => {
      const group = new TargetGroup();
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));

      const resolved = group.resolveMemberSize(new Vector3(), { target: mesh, radius: 1 });

      expect(resolved).toBe(false);
    });

    it('auto-detects from a Mesh target\'s own geometry bounds when neither size nor radius is given', () => {
      const group = new TargetGroup();
      const mesh = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial());
      const out = new Vector3();

      const resolved = group.resolveMemberSize(out, { target: mesh });

      expect(resolved).toBe(true);
      expect(out.x).toBeCloseTo(2, 10);
      expect(out.y).toBeCloseTo(4, 10);
      expect(out.z).toBeCloseTo(6, 10);
    });

    it('does not auto-detect for a non-Mesh Object3D (e.g. a plain Group)', () => {
      const group = new TargetGroup();
      const notAMesh = { isMesh: false } as unknown as Mesh;

      expect(group.resolveMemberSize(new Vector3(), { target: notAMesh })).toBe(false);
    });

    it('a bare point (Vector3Like target, no size/radius) does not auto-detect', () => {
      const group = new TargetGroup();

      expect(group.resolveMemberSize(new Vector3(), { target: new Vector3(1, 2, 3) })).toBe(false);
    });
  });

  describe('size in computeBounds', () => {
    it('a box member contributes its own bounding-sphere (half-diagonal) as the fallback reach', () => {
      const group = new TargetGroup([{ target: new Vector3(0, 0, 0), size: [2, 2, 2] }]);
      const out = new Vector3();

      const radius = group.computeBounds(out);

      // half-diagonal of a 2x2x2 box = sqrt(1^2+1^2+1^2) = sqrt(3)
      expect(radius).toBeCloseTo(Math.sqrt(3), 10);
    });

    it('auto-detected Mesh size also contributes to computeBounds, not just explicit size', () => {
      const mesh = new Mesh(new BoxGeometry(2, 2, 2));
      const group = new TargetGroup([{ target: mesh }]);
      const out = new Vector3();

      const radius = group.computeBounds(out);

      expect(radius).toBeCloseTo(Math.sqrt(3), 10);
    });
  });
});
