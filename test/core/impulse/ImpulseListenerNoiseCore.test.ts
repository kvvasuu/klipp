import { quat, vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../../src/core/CameraState';
import { ImpulseField, impulseField } from '../../../src/core/impulse/ImpulseField';
import { ImpulseListenerNoiseCore } from '../../../src/core/impulse/ImpulseListenerNoiseCore';
import { BasicMultiChannelPerlinNoiseCore } from '../../../src/core/noise/BasicMultiChannelPerlinNoiseCore';

const always = () => 1;

function kickX(amount: number, options: { duration?: number; channel?: number; dissipationDistance?: number } = {}) {
  const field = new ImpulseField();
  field.generate({ position: [0, 0, 0], direction: [amount, 0, 0], shape: always, duration: 10, ...options }, 0);
  return field;
}

describe('ImpulseListenerNoiseCore', () => {
  it('adds the offset felt at the camera, scaled by gain, without turning it', () => {
    const out = createCameraState();
    vec3.set(out.position, 5, 0, 0);
    quat.normalize(out.quaternion, [0.1, 0.2, 0.3, 0.9]);
    const rotation = quat.clone(out.quaternion);

    new ImpulseListenerNoiseCore({ field: kickX(3), channelMask: 1, gain: 2 }).update(out, 0.1, false, 0.5);

    expect(out.position[0]).toBeCloseTo(11, 4);
    expect(out.quaternion).toEqual(rotation);
  });

  it('feels only its channels, at its own position', () => {
    const offCamera = createCameraState();
    new ImpulseListenerNoiseCore({ field: kickX(3, { channel: 0b10 }), channelMask: 0b01 }).update(
      offCamera,
      0.1,
      false,
      0.5,
    );
    expect(offCamera.position[0]).toBe(0);

    const listener = new ImpulseListenerNoiseCore({ field: kickX(10, { dissipationDistance: 100 }) });
    const near = createCameraState();
    const far = createCameraState();
    vec3.set(far.position, 90, 0, 0);
    listener.update(near, 0.1, false, 0.5);
    listener.update(far, 0.1, false, 0.5);
    expect(near.position[0]).toBeGreaterThan(far.position[0] - 90);
  });

  it('uses the shared field and the shared clock by default', () => {
    impulseField.generate({ position: [0, 0, 0], direction: [7, 0, 0], shape: always, duration: 60 });
    const out = createCameraState();

    new ImpulseListenerNoiseCore().update(out, 0.1, false);

    expect(out.position[0]).toBeCloseTo(7, 4);
  });

  it('reports in flight while the field has an event, even when the offset holds steady', () => {
    const listener = new ImpulseListenerNoiseCore({ field: kickX(3, { duration: 1.2 }) });
    const out = createCameraState();
    expect(listener.update(out, 0.1, false, 0.4)).toBe(true);
    expect(listener.update(out, 0.1, false, 0.5)).toBe(true);
    expect(listener.update(out, 0.1, false, 5)).toBe(false);
  });

  it('turns the offset with the camera only in cameraSpace', () => {
    const run = (cameraSpace: boolean) => {
      const out = createCameraState();
      quat.setAxisAngle(out.quaternion, [0, 1, 0], Math.PI / 2);
      new ImpulseListenerNoiseCore({ field: kickX(1), channelMask: 1, gain: 1, cameraSpace }).update(
        out,
        0.1,
        false,
        0.5,
      );
      return out.position;
    };

    const world = run(false);
    expect(world[0]).toBeCloseTo(1, 5);
    expect(world[2]).toBeCloseTo(0, 5);
    const local = run(true);
    expect(local[0]).toBeCloseTo(0, 5);
    expect(local[2]).toBeCloseTo(-1, 5);
  });

  describe('shake', () => {
    it("follows the field's strength, and rests when the field is empty", () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], shape: () => 0.6, duration: 0.3 }, 0);
      const shake = new BasicMultiChannelPerlinNoiseCore({ positionAmplitude: [1, 0, 0] });
      const listener = new ImpulseListenerNoiseCore({ field, channelMask: 1, gain: 1, shake });
      const out = createCameraState();

      listener.update(out, 0.1, false, 0.1);
      expect(shake.amplitudeGain).toBeCloseTo(0.6, 5);

      listener.update(out, 0.1, false, 5);
      expect(shake.amplitudeGain).toBe(0);
    });

    it('adds rotation, which the kick alone never does', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], shape: always, duration: 10 }, 0);
      const shake = new BasicMultiChannelPerlinNoiseCore({
        rotationAmplitude: [20, 0, 0],
        amplitudeGain: 1,
        frequencyGain: 1,
        seed: 1,
      });
      const listener = new ImpulseListenerNoiseCore({ field, channelMask: 1, gain: 1, shake });
      const out = createCameraState();

      for (let i = 0; i < 10; i++) listener.update(out, 0.1, false, 0.5 + i * 0.1);

      expect(out.quaternion).not.toEqual([0, 0, 0, 1]);
    });
  });
});
