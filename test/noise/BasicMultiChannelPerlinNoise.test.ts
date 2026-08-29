import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { BasicMultiChannelPerlinNoise } from '../../src/noise/BasicMultiChannelPerlinNoise';

describe('BasicMultiChannelPerlinNoise', () => {
  it('all amplitudes default to 0: a complete no-op on position and rotation', () => {
    const noise = new BasicMultiChannelPerlinNoise();
    const out = createCameraState();
    const positionBefore = out.position.clone();
    const quaternionBefore = out.quaternion.clone();

    for (let i = 0; i < 10; i++) noise.update(out, 0.1);

    expect(out.position.equals(positionBefore)).toBe(true);
    expect(out.quaternion.equals(quaternionBefore)).toBe(true);
  });

  it('positionAmplitude scales the shake magnitude — stays within a sane multiple of the amplitude on each axis', () => {
    // NOT a hard mathematical bound: Perlin gradient noise can rarely spike close to magnitude 1 (verified
    // empirically across many seeds — most samples stay well under that). 1.5x is a generous safety
    // margin that still catches real bugs (amplitude ignored, wrong axis, order-of-magnitude scale bugs).
    const noise = new BasicMultiChannelPerlinNoise(new Vector3(2, 3, 4));
    const out = createCameraState();

    for (let i = 0; i < 200; i++) {
      noise.update(out, 0.05);
      expect(Math.abs(out.position.x)).toBeLessThanOrEqual(2 * 1.5);
      expect(Math.abs(out.position.y)).toBeLessThanOrEqual(3 * 1.5);
      expect(Math.abs(out.position.z)).toBeLessThanOrEqual(4 * 1.5);
      out.position.set(0, 0, 0); // reset — position noise is additive per-frame, not a running total
    }
  });

  it('positionAmplitude actually produces nonzero motion over time (not stuck at 0)', () => {
    const noise = new BasicMultiChannelPerlinNoise(new Vector3(5, 5, 5));
    const out = createCameraState();

    let sawNonZero = false;
    for (let i = 0; i < 50; i++) {
      out.position.set(0, 0, 0);
      noise.update(out, 0.05);
      if (out.position.length() > 1e-6) sawNonZero = true;
    }
    expect(sawNonZero).toBe(true);
  });

  it('position noise is sampled in camera-LOCAL space, then rotated into world by the current orientation', () => {
    const seed = 7;
    const local = new BasicMultiChannelPerlinNoise(new Vector3(1, 0, 0), undefined, undefined, undefined, 1, 1, seed);
    const outIdentity = createCameraState();

    const rotated = new BasicMultiChannelPerlinNoise(new Vector3(1, 0, 0), undefined, undefined, undefined, 1, 1, seed);
    const outRotated = createCameraState();
    outRotated.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // yawed 90°

    // advance both through the SAME sequence of dt's — same seed/clock, so the LOCAL offset must be
    // identical at every step; only the world-space direction should differ
    for (let i = 0; i < 5; i++) {
      outIdentity.position.set(0, 0, 0);
      outRotated.position.set(0, 0, 0);
      local.update(outIdentity, 0.1);
      rotated.update(outRotated, 0.1);
    }

    // same seed/time → same LOCAL offset magnitude, but rotated 90° around Y: local +X becomes world -Z
    expect(Math.abs(outIdentity.position.x)).toBeGreaterThan(1e-4);
    expect(outRotated.position.x).toBeCloseTo(0, 5);
    expect(Math.abs(outRotated.position.z)).toBeCloseTo(Math.abs(outIdentity.position.x), 5);
  });

  it('rotationAmplitude perturbs the quaternion away from identity, bounded by the amplitude', () => {
    const noise = new BasicMultiChannelPerlinNoise(undefined, undefined, new Vector3(10, 10, 10));
    const out = createCameraState();

    let sawNonIdentity = false;
    for (let i = 0; i < 50; i++) {
      out.quaternion.identity();
      noise.update(out, 0.05);
      const angleDegrees = (out.quaternion.angleTo(new Quaternion()) * 180) / Math.PI;
      if (angleDegrees > 1e-4) sawNonIdentity = true;
      // generous safety margin, not a hard bound — see the position test's comment on Perlin's rare spikes
      expect(angleDegrees).toBeLessThan(45);
    }
    expect(sawNonIdentity).toBe(true);
  });

  it('amplitudeGain=0 silences both position and rotation noise even with nonzero base amplitudes', () => {
    const noise = new BasicMultiChannelPerlinNoise(new Vector3(5, 5, 5), undefined, new Vector3(20, 20, 20));
    noise.amplitudeGain = 0;
    const out = createCameraState();
    const positionBefore = out.position.clone();
    const quaternionBefore = out.quaternion.clone();

    for (let i = 0; i < 10; i++) noise.update(out, 0.1);

    expect(out.position.equals(positionBefore)).toBe(true);
    expect(out.quaternion.equals(quaternionBefore)).toBe(true);
  });

  it('the same seed produces identical noise; a different seed produces different noise', () => {
    const outA = createCameraState();
    const outB = createCameraState();
    const outC = createCameraState();
    const a = new BasicMultiChannelPerlinNoise(new Vector3(3, 3, 3), undefined, undefined, undefined, 1, 1, 42);
    const b = new BasicMultiChannelPerlinNoise(new Vector3(3, 3, 3), undefined, undefined, undefined, 1, 1, 42);
    const c = new BasicMultiChannelPerlinNoise(new Vector3(3, 3, 3), undefined, undefined, undefined, 1, 1, 999);

    a.update(outA, 0.1);
    b.update(outB, 0.1);
    c.update(outC, 0.1);

    expect(outA.position.equals(outB.position)).toBe(true);
    expect(outA.position.equals(outC.position)).toBe(false);
  });

  it('frequencyGain scales how fast the internal clock advances', () => {
    const outFast = createCameraState();
    const outSlow = createCameraState();
    const fast = new BasicMultiChannelPerlinNoise(new Vector3(3, 3, 3), undefined, undefined, undefined, 1, 2, 5);
    const slow = new BasicMultiChannelPerlinNoise(new Vector3(3, 3, 3), undefined, undefined, undefined, 1, 1, 5);

    fast.update(outFast, 0.1); // internal time: 0.1 * 2 = 0.2
    slow.update(outSlow, 0.2); // internal time: 0.2 * 1 = 0.2 — same clock position

    expect(outFast.position.x).toBeCloseTo(outSlow.position.x, 10);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerNoise(noise.update))', () => {
    const noise = new BasicMultiChannelPerlinNoise(new Vector3(1, 1, 1));
    const { update } = noise;
    const out = createCameraState();

    expect(() => update(out, 0.1)).not.toThrow();
  });

  it('amplitude/frequency/gain fields are mutable', () => {
    const noise = new BasicMultiChannelPerlinNoise();
    const out = createCameraState();

    noise.update(out, 0.1);
    expect(out.position.equals(new Vector3())).toBe(true); // still 0: default amplitude

    noise.positionAmplitude = new Vector3(10, 0, 0);
    noise.update(out, 0.1);
    expect(out.position.equals(new Vector3())).toBe(false); // now shaking
  });

  describe('amplitudeDamping', () => {
    it('defaults to 0 (instant) — an amplitudeGain change is a hard cut on the very next frame', () => {
      const noise = new BasicMultiChannelPerlinNoise(new Vector3(5, 5, 5));
      const out = createCameraState();
      noise.update(out, 0.1);
      expect(out.position.length()).toBeGreaterThan(0);

      noise.amplitudeGain = 0;
      out.position.set(0, 0, 0);
      noise.update(out, 0.1);
      expect(out.position.equals(new Vector3())).toBe(true);
    });

    it('> 0: the effective gain eases toward amplitudeGain instead of jumping straight to it', () => {
      const noise = new BasicMultiChannelPerlinNoise(
        new Vector3(5, 5, 5),
        undefined,
        undefined,
        undefined,
        1,
        1,
        3,
        0.5,
      );
      const out = createCameraState();
      noise.update(out, 0.05); // effectiveAmplitudeGain settles at amplitudeGain (1) — nothing to ease yet

      noise.amplitudeGain = 0;
      out.position.set(0, 0, 0);
      noise.update(out, 0.016); // one small step — effective gain shouldn't have reached 0 yet
      expect(out.position.length()).toBeGreaterThan(0);
    });

    it('> 0: converges to the new amplitudeGain over repeated ticks', () => {
      const noise = new BasicMultiChannelPerlinNoise(
        new Vector3(5, 5, 5),
        undefined,
        undefined,
        undefined,
        1,
        1,
        3,
        0.2,
      );
      const out = createCameraState();
      noise.update(out, 0.05);

      noise.amplitudeGain = 0;
      for (let i = 0; i < 300; i++) {
        out.position.set(0, 0, 0);
        noise.update(out, 0.016);
      }
      expect(out.position.length()).toBeCloseTo(0, 5);
    });

    it('is a mutable field', () => {
      const noise = new BasicMultiChannelPerlinNoise(new Vector3(5, 5, 5));
      expect(noise.amplitudeDamping).toBe(0);

      noise.amplitudeDamping = 1;
      expect(noise.amplitudeDamping).toBe(1);
    });
  });

  describe('justActivated', () => {
    // effectiveAmplitudeGain is private, so both tests compare against a "ground truth" instant
    // (amplitudeDamping=0) instance sharing the same seed/frequencyGain and dt sequence — their raw
    // perlin samples then match at every step, isolating exactly what the damped gain contributes
    const seed = 3;
    const amplitude = new Vector3(5, 5, 5);

    it('snaps effectiveAmplitudeGain straight to amplitudeGain even with a warmed-up damper', () => {
      const reference = new BasicMultiChannelPerlinNoise(amplitude, undefined, undefined, undefined, 1, 1, seed, 0);
      const damped = new BasicMultiChannelPerlinNoise(amplitude, undefined, undefined, undefined, 1, 1, seed, 0.5);
      const refOut = createCameraState();
      const dampedOut = createCameraState();

      reference.update(refOut, 0.1, true); // first-ever session: both snap, damped's damper warms up
      damped.update(dampedOut, 0.1, true);

      reference.amplitudeGain = 0;
      damped.amplitudeGain = 0;
      refOut.position.set(0, 0, 0);
      dampedOut.position.set(0, 0, 0);
      reference.update(refOut, 0.016, false);
      damped.update(dampedOut, 0.016, false); // damped hasn't fully eased down to 0 yet — genuinely mid-ease

      // a later, unrelated session: amplitudeGain is back up, but damped's effective gain is still
      // frozen near 0 from the earlier session
      reference.amplitudeGain = 1;
      damped.amplitudeGain = 1;
      refOut.position.set(0, 0, 0);
      dampedOut.position.set(0, 0, 0);
      reference.update(refOut, 0.016, true);
      damped.update(dampedOut, 0.016, true);

      expect(dampedOut.position.length()).toBeCloseTo(refOut.position.length(), 5);
    });

    it('without justActivated, the same scenario eases instead of snapping (the bug this fixes)', () => {
      const reference = new BasicMultiChannelPerlinNoise(amplitude, undefined, undefined, undefined, 1, 1, seed, 0);
      const damped = new BasicMultiChannelPerlinNoise(amplitude, undefined, undefined, undefined, 1, 1, seed, 0.5);
      const refOut = createCameraState();
      const dampedOut = createCameraState();

      reference.update(refOut, 0.1, true);
      damped.update(dampedOut, 0.1, true);

      reference.amplitudeGain = 0;
      damped.amplitudeGain = 0;
      refOut.position.set(0, 0, 0);
      dampedOut.position.set(0, 0, 0);
      reference.update(refOut, 0.016, false);
      damped.update(dampedOut, 0.016, false);

      reference.amplitudeGain = 1;
      damped.amplitudeGain = 1;
      refOut.position.set(0, 0, 0);
      dampedOut.position.set(0, 0, 0);
      reference.update(refOut, 0.016, false); // no reactivation signal — resumes easing instead of snapping
      damped.update(dampedOut, 0.016, false);

      expect(dampedOut.position.length()).toBeLessThan(refOut.position.length());
    });
  });
});
