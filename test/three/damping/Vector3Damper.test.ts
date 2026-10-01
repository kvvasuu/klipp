import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from 'math';
import { createVector3DamperState, dampVector3, resetVector3Damper } from '../../../src/core/damping/dampVector3';
import { Vector3Damper } from '../../../src/three/damping/Vector3Damper';

describe('Vector3Damper', () => {
  it('matches dampVector3 step for step, including reset', () => {
    const wrapper = new Vector3Damper();
    const state = createVector3DamperState();
    const vector = new Vector3();
    const tuple: Vec3 = [0, 0, 0];

    for (let i = 0; i < 60; i++) {
      if (i === 30) {
        wrapper.reset();
        resetVector3Damper(state);
      }
      const target = new Vector3(Math.sin(i * 0.1) * 10, i * 0.2, -i);
      expect(wrapper.update(vector, target, { into: 0.2, from: 0.5 }, 1 / 60, 30)).toBe(vector);
      dampVector3(state, tuple, [target.x, target.y, target.z], { into: 0.2, from: 0.5 }, 1 / 60, 30);
      expect(tuple).toEqual(vector.toArray());
    }
  });
});
