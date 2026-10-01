import type { Vec3 } from 'math';
import { describe, expect, it } from 'vitest';
import { ImpulseField } from '../../../src/core/impulse/ImpulseField';
import { ImpulseShapes, type GenerateImpulseOptions } from '../../../src/core/impulse/impulses';

const always = () => 1;

/** A field with one event from the origin, kicking +X by 10. */
function fieldWith(options: Partial<GenerateImpulseOptions> = {}, start = 0) {
  const field = new ImpulseField();
  field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, ...options }, start);
  return field;
}

/** The offset and strength felt at `at`, at time `now`. */
function feel(field: ImpulseField, now: number, at: Vec3 = [0, 0, 0], channelMask = 1, gain = 1) {
  const offset: Vec3 = [9, 9, 9];
  const strength = field.sampleAt(offset, at, channelMask, gain, now);
  return { offset, strength };
}

describe('ImpulseField', () => {
  it('feels nothing without events, and nothing without a direction', () => {
    expect(feel(new ImpulseField(), 0)).toEqual({ offset: [0, 0, 0], strength: 0 });
    expect(feel(fieldWith({ direction: undefined }), 0.5).offset).toEqual([0, 0, 0]);
  });

  it('scales the kick by shape(t) over its duration, and nothing outside it', () => {
    const field = fieldWith({ shape: (t) => t, duration: 2 }, 5);
    expect(feel(field, 6).offset[0]).toBeCloseTo(5, 5);
    expect(feel(field, 6).strength).toBeCloseTo(0.5, 5);
    expect(feel(field, 4.9).offset).toEqual([0, 0, 0]);
    expect(feel(field, 7.01).offset).toEqual([0, 0, 0]);
  });

  it('defaults to the bump shape and a 0.4 s duration', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0] }, 0);
    expect(feel(field, 0.2 * 0.4).offset[0]).toBeCloseTo(10 * ImpulseShapes.bump(0.2), 5);
  });

  it('built-in shapes: recoil fades from full to nothing, rumble holds through the middle', () => {
    expect(ImpulseShapes.recoil(0)).toBeCloseTo(1, 5);
    expect(ImpulseShapes.recoil(1)).toBeCloseTo(0, 5);
    expect(ImpulseShapes.rumble(0.5)).toBeCloseTo(1, 5);
  });

  it('reaches everywhere by default, full inside radius, fading to nothing over dissipationDistance', () => {
    expect(feel(fieldWith(), 0.5, [1000, 0, 0]).offset[0]).toBeCloseTo(10, 5);

    const falloff = fieldWith({ radius: 5, dissipationDistance: 10 });
    expect(feel(falloff, 0.5, [4, 0, 0]).offset[0]).toBeCloseTo(10, 5);
    expect(feel(falloff, 0.5, [10, 0, 0]).offset[0]).toBeCloseTo(5, 5);
    expect(feel(falloff, 0.5, [20, 0, 0]).offset).toEqual([0, 0, 0]);
  });

  it('with a propagation speed, reaches a distant listener later', () => {
    const field = fieldWith({ duration: 10, propagationSpeed: 10 });
    expect(feel(field, 4, [50, 0, 0]).offset).toEqual([0, 0, 0]);
    expect(feel(field, 6, [50, 0, 0]).offset[0]).toBeCloseTo(10, 5);
    expect(feel(fieldWith(), 0.001, [100000, 0, 0]).offset[0]).toBeCloseTo(10, 5);
  });

  it('treats a propagation speed of 0 as no delay (real bug: divided by zero, never expiring or never felt)', () => {
    const lingering = fieldWith({ duration: 0.1, radius: 5, propagationSpeed: 0 });
    feel(lingering, 1000);
    expect(lingering.hasEvents).toBe(false);

    expect(feel(fieldWith({ propagationSpeed: 0 }), 0.5).offset[0]).toBeCloseTo(10, 5);
  });

  it('is only felt by listeners on its channel', () => {
    const field = fieldWith({ channel: 0b10 });
    expect(feel(field, 0.5, [0, 0, 0], 0b01)).toEqual({ offset: [0, 0, 0], strength: 0 });
    expect(feel(field, 0.5, [0, 0, 0], 0b10).offset[0]).toBeCloseTo(10, 5);
  });

  it('adds up overlapping events, scaled by gain', () => {
    const field = fieldWith();
    field.generate({ position: [0, 0, 0], direction: [0, 5, 0], shape: always, duration: 1 }, 0);

    const { offset, strength } = feel(field, 0.5, [0, 0, 0], 1, 2);

    expect(offset[0]).toBeCloseTo(20, 5);
    expect(offset[1]).toBeCloseTo(10, 5);
    expect(strength).toBeCloseTo(4, 5);
  });

  it('uses sensible defaults for a plain sampleAt call', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 10 });
    const offset: Vec3 = [0, 0, 0];
    field.sampleAt(offset, [0, 0, 0]);
    expect(offset[0]).toBeGreaterThan(0);
  });

  describe('expired events', () => {
    it('are dropped without disturbing the live events after them', () => {
      const field = fieldWith({ duration: 0.1 });
      field.generate({ position: [0, 0, 0], direction: [0, 20, 0], shape: always, duration: 5 }, 0);

      const { offset } = feel(field, 1);

      expect(offset[0]).toBe(0);
      expect(offset[1]).toBeCloseTo(20, 5);
    });

    it('are dropped on generate too, while live ones stay (real bug: grew without bound when nothing listened)', () => {
      const field = new ImpulseField();
      for (let i = 0; i < 10_000; i++) field.generate({ position: [0, 0, 0], duration: 0.4 }, i);
      expect(field.state.events).toHaveLength(1);

      const live = fieldWith();
      live.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 1 }, 0.5);
      expect(feel(live, 0.75).strength).toBe(2);
    });

    it('hasEvents is true from generate until an event expires, on any channel', () => {
      expect(new ImpulseField().hasEvents).toBe(false);

      const field = fieldWith({ duration: 0.3, channel: 0b10 });
      expect(field.hasEvents).toBe(true);
      feel(field, 0.15);
      expect(field.hasEvents).toBe(true);
      feel(field, 1);
      expect(field.hasEvents).toBe(false);
    });
  });
});
