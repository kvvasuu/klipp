import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { ImpulseField } from '../../src/impulse/ImpulseField';
import { ImpulseListenerNoise } from '../../src/impulse/ImpulseListenerNoise';
import { BasicMultiChannelPerlinNoise } from '../../src/noise/BasicMultiChannelPerlinNoise';

const always = () => 1;

describe('ImpulseListenerNoise', () => {
  it('adds the field-sampled offset to out.position', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [3, 0, 0], shape: always, duration: 10 }, 0);

    const listener = new ImpulseListenerNoise(field);
    const out = createCameraState();
    out.position.set(5, 0, 0);

    listener.update(out, 0.1, false, 0.5); // explicit now - within the event's duration

    expect(out.position.x).toBeCloseTo(8, 4);
  });

  it('with no shake configured, never touches rotation', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [3, 0, 0], shape: always, duration: 10 }, 0);

    const listener = new ImpulseListenerNoise(field);
    const out = createCameraState();
    out.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const before = out.quaternion.clone();

    listener.update(out, 0.1, false, 0.5);

    expect(out.quaternion.equals(before)).toBe(true);
  });

  it('gain scales the sampled offset', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [3, 0, 0], shape: always, duration: 10 }, 0);

    const listener = new ImpulseListenerNoise(field, 1, 2); // gain = 2
    const out = createCameraState();

    listener.update(out, 0.1, false, 0.5);

    expect(out.position.x).toBeCloseTo(6, 4);
  });

  it('channelMask filters which events are felt', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [3, 0, 0], shape: always, duration: 10, channel: 0b10 }, 0);

    const listener = new ImpulseListenerNoise(field, 0b01); // wrong channel
    const out = createCameraState();

    listener.update(out, 0.1, false, 0.5);

    expect(out.position.x).toBe(0);
  });

  it('samples using out.position as the listener location, not the impulse origin', () => {
    const field = new ImpulseField();
    field.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 10, radius: 0, dissipationDistance: 100 },
      0,
    );

    const listener = new ImpulseListenerNoise(field);
    const near = createCameraState();
    near.position.set(0, 0, 0);
    const far = createCameraState();
    far.position.set(90, 0, 0);

    listener.update(near, 0.1, false, 0.5);
    listener.update(far, 0.1, false, 0.5);

    const nearOffset = near.position.x - 0;
    const farOffset = far.position.x - 90;
    expect(nearOffset).toBeGreaterThan(farOffset);
  });

  it('when now is omitted, falls back to the real (shared) clock instead of a private per-instance one', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [7, 0, 0], shape: always, duration: 60 }); // real now, long duration

    const listener = new ImpulseListenerNoise(field);
    const out = createCameraState();
    listener.update(out, 0.1, false); // no explicit now - falls back to the real clock, same domain as generate() above

    expect(out.position.x).toBeCloseTo(7, 4);
  });

  it('defaults to the shared impulseField singleton when none is passed', async () => {
    const { impulseField } = await import('../../src/impulse/ImpulseField');
    impulseField.generate({ position: [0, 0, 0], direction: [7, 0, 0], shape: always, duration: 60 });

    const listener = new ImpulseListenerNoise();
    const out = createCameraState();
    listener.update(out, 0.1, false);

    expect(out.position.x).toBeCloseTo(7, 4);
  });

  it('field/channelMask/gain are mutable fields', () => {
    const fieldA = new ImpulseField();
    fieldA.generate({ position: [0, 0, 0], direction: [3, 0, 0], shape: always, duration: 10 }, 0);
    const fieldB = new ImpulseField();
    fieldB.generate({ position: [0, 0, 0], direction: [9, 0, 0], shape: always, duration: 10 }, 0);

    const listener = new ImpulseListenerNoise(fieldA);
    const out = createCameraState();
    listener.update(out, 0.1, false, 0.5);
    expect(out.position.x).toBeCloseTo(3, 4);

    listener.field = fieldB;
    out.position.set(0, 0, 0);
    listener.update(out, 0.1, false, 0.5);
    expect(out.position.x).toBeCloseTo(9, 4);
  });

  it('update is a bound instance method - safe to pass by reference (e.g. slots.registerNoise(listener.update))', () => {
    const field = new ImpulseField();
    const listener = new ImpulseListenerNoise(field);
    const { update } = listener;

    const out = createCameraState();
    expect(() => update(out, 0.1, false)).not.toThrow();
  });

  it('update() returns whether the field still has an event in flight, even during a constant-amplitude plateau', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [3, 0, 0], shape: always, duration: 1.2 }, 0);
    const listener = new ImpulseListenerNoise(field);
    const out = createCameraState();

    // two samples with an identical out.position.x, but the event is still in flight and klipp must not
    // treat that as "settled forever"
    expect(listener.update(out, 0.1, false, 0.4)).toBe(true);
    expect(listener.update(out, 0.1, false, 0.5)).toBe(true);

    expect(listener.update(out, 0.1, false, 5)).toBe(false); // well past the duration
  });

  describe('shake', () => {
    it('undefined by default - a pure position kick with no rattle', () => {
      const listener = new ImpulseListenerNoise();
      expect(listener.shake).toBeUndefined();
    });

    it("drives the shake's amplitudeGain from the field's current strength every frame", () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], shape: () => 0.6, duration: 10 }, 0); // no direction: kick itself is zero

      const shake = new BasicMultiChannelPerlinNoise(new Vector3(1, 0, 0));
      const listener = new ImpulseListenerNoise(field, 1, 1, shake);
      const out = createCameraState();

      listener.update(out, 0.1, false, 0.5);

      expect(shake.amplitudeGain).toBeCloseTo(0.6, 5);
    });

    it('produces rotation, unlike the kick alone', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], shape: always, duration: 10 }, 0);

      const shake = new BasicMultiChannelPerlinNoise(undefined, undefined, new Vector3(20, 0, 0), undefined, 1, 1, 1);
      const listener = new ImpulseListenerNoise(field, 1, 1, shake);
      const out = createCameraState();
      const before = out.quaternion.clone();

      let sawRotation = false;
      for (let i = 0; i < 10; i++) {
        listener.update(out, 0.1, false, 0.5 + i * 0.1);
        if (!out.quaternion.equals(before)) sawRotation = true;
      }
      expect(sawRotation).toBe(true);
    });

    it('amplitudeGain drops back to 0 (no rattle) once the field has no strength left to give', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], shape: always, duration: 0.3 }, 0);

      const shake = new BasicMultiChannelPerlinNoise(new Vector3(1, 0, 0));
      const listener = new ImpulseListenerNoise(field, 1, 1, shake);
      const out = createCameraState();

      listener.update(out, 0.1, false, 5); // well past duration - field has nothing to give

      expect(shake.amplitudeGain).toBe(0);
    });

    it('is a mutable field - can be attached or removed after construction', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], shape: () => 0.4, duration: 10 }, 0);

      const listener = new ImpulseListenerNoise(field);
      const shake = new BasicMultiChannelPerlinNoise(new Vector3(1, 0, 0));
      listener.shake = shake;
      const out = createCameraState();

      listener.update(out, 0.1, false, 0.5);

      expect(shake.amplitudeGain).toBeCloseTo(0.4, 5);
    });
  });

  describe('cameraSpace', () => {
    it('false by default - direction is a fixed world-space vector, ignoring listener orientation', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 10 }, 0);

      const listener = new ImpulseListenerNoise(field);
      const out = createCameraState();
      out.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // yawed 90°

      listener.update(out, 0.1, false, 0.5);

      expect(out.position.x).toBeCloseTo(1, 5);
      expect(out.position.z).toBeCloseTo(0, 5);
    });

    it("true: rotates the sampled offset by the listener's current orientation", () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 10 }, 0);

      const listener = new ImpulseListenerNoise(field, 1, 1, undefined, true);
      const out = createCameraState();
      out.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2); // yawed 90°

      listener.update(out, 0.1, false, 0.5);

      // the listener's local +X becomes world -Z once yawed 90° around Y
      expect(out.position.x).toBeCloseTo(0, 5);
      expect(out.position.z).toBeCloseTo(-1, 5);
    });

    it('is a mutable field - can be toggled after construction', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 10 }, 0);

      const listener = new ImpulseListenerNoise(field);
      listener.cameraSpace = true;
      const out = createCameraState();
      out.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);

      listener.update(out, 0.1, false, 0.5);

      expect(out.position.z).toBeCloseTo(-1, 5);
    });
  });
});
