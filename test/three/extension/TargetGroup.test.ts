import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  TargetGroup,
  type TargetGroupMember,
  type TargetGroupPositionMode,
} from '../../../src/three/extension/TargetGroup';

function bounds(members: TargetGroupMember[], mode?: TargetGroupPositionMode) {
  const center = new Vector3(9, 9, 9);
  const radius = new TargetGroup(members, mode).computeBounds(center);
  return { center, radius };
}

describe('TargetGroup', () => {
  it('leaves out untouched and reports no size when nothing resolves', () => {
    for (const members of [[], [{ target: null }, { target: { current: null } }]]) {
      const { center, radius } = bounds(members);
      expect(radius).toBe(0);
      expect(center.toArray()).toEqual([9, 9, 9]);
    }
  });

  describe('groupCenter (default)', () => {
    it('centers the box around every member, radius included, and ignores weight', () => {
      const { center, radius } = bounds([
        { target: new Vector3(0, 0, 0), weight: 100 },
        { target: new Vector3(10, 0, 0), radius: 3 },
      ]);
      expect(center.x).toBeCloseTo(6.5, 10);
      expect(radius).toBeCloseTo(6.5, 10);
    });

    it('skips members that do not resolve instead of counting them at the origin', () => {
      const { center, radius } = bounds([{ target: { current: null } }, { target: new Vector3(10, 0, 0) }]);
      expect(center.toArray()).toEqual([10, 0, 0]);
      expect(radius).toBe(0);
    });
  });

  describe('groupAverage', () => {
    it('averages positions by weight, ignoring zero weights', () => {
      const { center } = bounds(
        [
          { target: new Vector3(0, 0, 0), weight: 9 },
          { target: new Vector3(10, 0, 0), weight: 1 },
          { target: new Vector3(1000, 0, 0), weight: 0 },
        ],
        'groupAverage',
      );
      expect(center.x).toBeCloseTo(1, 10);
    });

    it('measures the radius from the average, member radius included', () => {
      const { center, radius } = bounds(
        [{ target: new Vector3(0, 0, 0) }, { target: new Vector3(10, 0, 0), radius: 3 }],
        'groupAverage',
      );
      expect(center.x).toBeCloseTo(5, 10);
      expect(radius).toBeCloseTo(8, 10);
    });

    it('reports no size when every weight is zero', () => {
      const { center, radius } = bounds([{ target: new Vector3(10, 0, 0), weight: 0 }], 'groupAverage');
      expect(radius).toBe(0);
      expect(center.toArray()).toEqual([9, 9, 9]);
    });
  });

  describe('box members', () => {
    it('reach as far as their half-diagonal, explicit or measured from a mesh', () => {
      expect(bounds([{ target: new Vector3(), size: [2, 2, 2] }]).radius).toBeCloseTo(Math.sqrt(3), 10);
      expect(bounds([{ target: new Mesh(new BoxGeometry(2, 2, 2)) }]).radius).toBeCloseTo(Math.sqrt(3), 10);
    });

    it('measure a mesh at its world scale', () => {
      const mesh = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial());
      mesh.scale.set(3, 1, 0.5);
      const size = new Vector3();

      expect(new TargetGroup().resolveMemberSize(size, { target: mesh })).toBe(true);

      expect(size.x).toBeCloseTo(6, 10);
      expect(size.y).toBeCloseTo(4, 10);
      expect(size.z).toBeCloseTo(3, 10);
    });
  });
});
