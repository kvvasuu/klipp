import { quat, vec3, vec4, type Vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { BasicMultiChannelPerlinNoise } from '../../../src/core/noise/BasicMultiChannelPerlinNoise';
import { angleBetween } from '../mathHelpers';

/** Noise with a fixed seed, so two instances produce the same samples. */
const seeded = (position: Vec3, rotation?: Vec3, seed = 3, frequencyGain = 1, amplitudeDamping = 0) =>
  new BasicMultiChannelPerlinNoise(position, undefined, rotation, undefined, 1, frequencyGain, seed, amplitudeDamping);

/** Size of the position offset one update adds to a fresh camera at the origin. */
function offset(noise: BasicMultiChannelPerlinNoise, dt: number, justActivated = false) {
  const out = createCameraState();
  noise.update(out, dt, justActivated);
  return vec3.length(out.position);
}

describe('BasicMultiChannelPerlinNoise', () => {
  it('does nothing with zero amplitudes or a zero amplitudeGain', () => {
    const silenced = new BasicMultiChannelPerlinNoise([5, 5, 5], undefined, [20, 20, 20]);
    silenced.amplitudeGain = 0;
    for (const noise of [new BasicMultiChannelPerlinNoise(), silenced]) {
      const out = createCameraState();
      for (let i = 0; i < 10; i++) noise.update(out, 0.1);
      expect(out.position).toEqual([0, 0, 0]);
      expect(out.quaternion).toEqual([0, 0, 0, 1]);
    }
  });

  it('shakes position within about its amplitude per axis', () => {
    const noise = seeded([2, 3, 4], undefined, 11);
    const out = createCameraState();
    let moved = false;

    for (let i = 0; i < 200; i++) {
      vec3.set(out.position, 0, 0, 0);
      noise.update(out, 0.05);
      moved ||= vec3.length(out.position) > 1e-6;
      expect(Math.abs(out.position[0])).toBeLessThanOrEqual(3);
      expect(Math.abs(out.position[1])).toBeLessThanOrEqual(4.5);
      expect(Math.abs(out.position[2])).toBeLessThanOrEqual(6);
    }
    expect(moved).toBe(true);
  });

  it('shakes position in camera space', () => {
    const identity = createCameraState();
    const yawed = createCameraState();
    quat.setAxisAngle(yawed.quaternion, [0, 1, 0], Math.PI / 2);

    seeded([1, 0, 0], undefined, 7).update(identity, 0.5);
    seeded([1, 0, 0], undefined, 7).update(yawed, 0.5);

    expect(Math.abs(identity.position[0])).toBeGreaterThan(1e-4);
    expect(yawed.position[0]).toBeCloseTo(0, 5);
    expect(Math.abs(yawed.position[2])).toBeCloseTo(Math.abs(identity.position[0]), 5);
  });

  it('shakes rotation within a sane angle', () => {
    const noise = seeded([0, 0, 0], [10, 10, 10], 11);
    const out = createCameraState();
    let turned = false;

    for (let i = 0; i < 50; i++) {
      vec4.set(out.quaternion, 0, 0, 0, 1);
      noise.update(out, 0.05);
      const degrees = (angleBetween(out.quaternion, [0, 0, 0, 1]) * 180) / Math.PI;
      turned ||= degrees > 1e-4;
      expect(degrees).toBeLessThan(45);
    }
    expect(turned).toBe(true);
  });

  it('repeats for the same seed and differs for another', () => {
    const a = offset(seeded([3, 3, 3], undefined, 42), 0.1);
    expect(offset(seeded([3, 3, 3], undefined, 42), 0.1)).toBe(a);
    expect(offset(seeded([3, 3, 3], undefined, 999), 0.1)).not.toBe(a);
  });

  it('frequencyGain speeds up its clock', () => {
    expect(offset(seeded([3, 3, 3], undefined, 5, 2), 0.1)).toBeCloseTo(
      offset(seeded([3, 3, 3], undefined, 5, 1), 0.2),
      10,
    );
  });

  describe('amplitudeDamping', () => {
    it('without it, an amplitudeGain change applies on the next frame', () => {
      const noise = seeded([5, 5, 5]);
      expect(offset(noise, 0.1)).toBeGreaterThan(0);
      noise.amplitudeGain = 0;
      expect(offset(noise, 0.1)).toBe(0);
    });

    it('with it, eases toward a new amplitudeGain and gets there', () => {
      const noise = seeded([5, 5, 5], undefined, 3, 1, 0.2);
      noise.update(createCameraState(), 0.05);

      noise.amplitudeGain = 0;
      expect(offset(noise, 0.016)).toBeGreaterThan(0);

      for (let i = 0; i < 300; i++) noise.update(createCameraState(), 0.016);
      expect(offset(noise, 0.016)).toBeCloseTo(0, 5);
    });

    it('justActivated jumps to the current amplitudeGain, where a plain update would ease', () => {
      // an undamped twin with the same seed and dt sequence gives the full-gain sample to compare against
      const run = (justActivated: boolean) => {
        const reference = seeded([5, 5, 5]);
        const damped = seeded([5, 5, 5], undefined, 3, 1, 0.5);
        for (const noise of [reference, damped]) {
          noise.update(createCameraState(), 0.1, true);
          noise.amplitudeGain = 0;
          noise.update(createCameraState(), 0.016);
          noise.amplitudeGain = 1;
        }
        return { full: offset(reference, 0.016, justActivated), damped: offset(damped, 0.016, justActivated) };
      };

      const snapped = run(true);
      expect(snapped.damped).toBeCloseTo(snapped.full, 5);
      const eased = run(false);
      expect(eased.damped).toBeLessThan(eased.full);
    });
  });
});
