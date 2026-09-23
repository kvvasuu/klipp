import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ImpulseField, ImpulseShapes } from '../../src/impulse/ImpulseField';

const always = () => 1;

describe('ImpulseField', () => {
  it('with no events, sampleAt writes zero position and returns zero strength', () => {
    const field = new ImpulseField();
    const outPosition = new Vector3(9, 9, 9);
    const strength = field.sampleAt(outPosition, new Vector3(), 1, 1, 0);
    expect(outPosition.equals(new Vector3())).toBe(true);
    expect(strength).toBe(0);
  });

  it('shape(t) scales the direction kick, called with progress normalized over duration', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: (t) => t, duration: 2 }, 0);

    const out = new Vector3();
    field.sampleAt(out, new Vector3(), 1, 1, 1); // t = 1/2 = 0.5
    expect(out.x).toBeCloseTo(5, 5);
  });

  it('a custom shape function works exactly like a named one - just a (t) => number', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: (t) => (t < 0.5 ? 0 : 1), duration: 1 }, 0);

    const early = new Vector3();
    field.sampleAt(early, new Vector3(), 1, 1, 0.2);
    expect(early.equals(new Vector3())).toBe(true);

    const late = new Vector3();
    field.sampleAt(late, new Vector3(), 1, 1, 0.8);
    expect(late.x).toBeCloseTo(10, 5);
  });

  it('is exactly 0 before the event starts and after duration ends, regardless of shape', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 0.3 }, 5); // starts at t=5

    const before = new Vector3();
    field.sampleAt(before, new Vector3(), 1, 1, 4.9);
    expect(before.equals(new Vector3())).toBe(true);

    const after = new Vector3();
    field.sampleAt(after, new Vector3(), 1, 1, 5.31); // 5 + 0.3 + a hair more
    expect(after.equals(new Vector3())).toBe(true);
  });

  it('direction defaults to [0, 0, 0] when omitted - no accidental kick from an event with no direction', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], shape: always, duration: 1 }, 0);

    const out = new Vector3();
    field.sampleAt(out, new Vector3(), 1, 1, 0.5);
    expect(out.equals(new Vector3())).toBe(true);
  });

  it('dissipationDistance=0 (default): full strength at ANY distance - no falloff', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1 }, 0);

    const far = new Vector3();
    field.sampleAt(far, new Vector3(1000, 0, 0), 1, 1, 0.5);
    expect(far.x).toBeCloseTo(10, 5);
  });

  it('radius: full strength anywhere inside it, regardless of dissipationDistance', () => {
    const field = new ImpulseField();
    field.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, radius: 5, dissipationDistance: 10 },
      0,
    );

    const out = new Vector3();
    field.sampleAt(out, new Vector3(4, 0, 0), 1, 1, 0.5); // inside radius
    expect(out.x).toBeCloseTo(10, 5);
  });

  it('dissipationDistance: falls off linearly beyond radius, reaching 0 at radius + dissipationDistance', () => {
    const field = new ImpulseField();
    field.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, radius: 0, dissipationDistance: 10 },
      0,
    );

    const halfway = new Vector3();
    field.sampleAt(halfway, new Vector3(5, 0, 0), 1, 1, 0.5);
    expect(halfway.x).toBeCloseTo(5, 5); // halfway through the falloff band

    const beyond = new Vector3();
    field.sampleAt(beyond, new Vector3(20, 0, 0), 1, 1, 0.5);
    expect(beyond.equals(new Vector3())).toBe(true); // past radius + dissipationDistance
  });

  it('propagationSpeed: a distant listener feels the event later, delayed by distance / speed', () => {
    const field = new ImpulseField();
    field.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 10, propagationSpeed: 10 },
      0,
    );

    const listenerPosition = new Vector3(50, 0, 0); // 5s away at this speed

    const tooEarly = new Vector3();
    field.sampleAt(tooEarly, listenerPosition, 1, 1, 4); // hasn't arrived yet
    expect(tooEarly.equals(new Vector3())).toBe(true);

    const arrived = new Vector3();
    field.sampleAt(arrived, listenerPosition, 1, 1, 6); // arrived 1s ago
    expect(arrived.x).toBeCloseTo(10, 5);
  });

  it('propagationSpeed=Infinity (default): felt everywhere instantly, no arrival delay', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1 }, 0);

    const out = new Vector3();
    field.sampleAt(out, new Vector3(100000, 0, 0), 1, 1, 0.001);
    expect(out.x).toBeCloseTo(10, 5);
  });

  it('propagationSpeed=0 degrades to "no delay" instead of Infinity/NaN', () => {
    const leakProne = new ImpulseField(); // radius/dissipationDistance > 0: old code divided by zero -> Infinity -> never expired
    leakProne.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], duration: 0.1, radius: 5, propagationSpeed: 0 },
      0,
    );
    const out = new Vector3();
    leakProne.sampleAt(out, new Vector3(), 1, 1, 1000); // long past the envelope
    expect(leakProne.hasEvents).toBe(false);

    const dropProne = new ImpulseField(); // radius/dissipationDistance both 0 (default): old code divided 0/0 -> NaN -> pruned instantly
    dropProne.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, propagationSpeed: 0 },
      0,
    );
    dropProne.sampleAt(out, new Vector3(), 1, 1, 0.5); // well within the envelope, at the exact source position
    expect(out.x).toBeCloseTo(10, 5);
  });

  it('channel: a listener whose mask does not overlap the event channel feels nothing', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, channel: 0b10 }, 0);

    const wrongChannel = new Vector3();
    field.sampleAt(wrongChannel, new Vector3(), 0b01, 1, 0.5);
    expect(wrongChannel.equals(new Vector3())).toBe(true);

    const rightChannel = new Vector3();
    field.sampleAt(rightChannel, new Vector3(), 0b10, 1, 0.5);
    expect(rightChannel.x).toBeCloseTo(10, 5);
  });

  it('multiple overlapping events combine additively', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1 }, 0);
    field.generate({ position: [0, 0, 0], direction: [0, 5, 0], shape: always, duration: 1 }, 0);

    const out = new Vector3();
    field.sampleAt(out, new Vector3(), 1, 1, 0.5);
    expect(out.x).toBeCloseTo(10, 5);
    expect(out.y).toBeCloseTo(5, 5);
  });

  it('pruning an expired event in place does not corrupt a still-live event sitting after it in the list', () => {
    const field = new ImpulseField();
    // short-lived: fully expired by t=1
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 0.1 }, 0);
    // long-lived, registered SECOND - exercises the write-index shift when the first slot is pruned
    field.generate({ position: [0, 0, 0], direction: [0, 20, 0], shape: always, duration: 5 }, 0);

    const out = new Vector3();
    field.sampleAt(out, new Vector3(), 1, 1, 1); // short one is gone, long one still active
    expect(out.x).toBe(0);
    expect(out.y).toBeCloseTo(20, 5);
  });

  it("a Vector3Like position/direction (r3f's [x,y,z] shorthand) works, not just real Vector3 instances", () => {
    const field = new ImpulseField();
    expect(() =>
      field.generate({ position: [1, 2, 3], direction: [4, 5, 6], shape: always, duration: 1 }, 0),
    ).not.toThrow();

    const out = new Vector3();
    field.sampleAt(out, new Vector3(1, 2, 3), 1, 1, 0.5);
    expect(out.x).toBeCloseTo(4, 5);
  });

  it('gain scales the direction kick, and is returned as (part of) strength', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1 }, 0);

    const out = new Vector3();
    const strength = field.sampleAt(out, new Vector3(), 1, 2, 0.5); // gain = 2
    expect(out.x).toBeCloseTo(20, 5);
    expect(strength).toBeCloseTo(2, 5);
  });

  it('sampleAt defaults to `gain`/`now`/channelMask that make the common single-channel case just work', () => {
    const field = new ImpulseField();
    field.generate({ position: [0, 0, 0], direction: [1, 0, 0], shape: always, duration: 10 }); // default now/channel=1
    const out = new Vector3();
    field.sampleAt(out, new Vector3()); // default channelMask=1, gain=1, now
    expect(out.x).toBeGreaterThan(0);
  });

  describe('shape defaults and presets', () => {
    it('defaults to ImpulseShapes.bump when omitted', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0] }, 0);

      const out = new Vector3();
      const t = 0.2;
      field.sampleAt(out, new Vector3(), 1, 1, t * 0.4); // default duration 0.4
      expect(out.x).toBeCloseTo(10 * ImpulseShapes.bump(t), 5);
    });

    it('an explicit shape always overrides the default', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: () => 0.5 }, 0);

      const out = new Vector3();
      field.sampleAt(out, new Vector3(), 1, 1, 0.1); // within the default duration
      expect(out.x).toBeCloseTo(5, 5);
    });

    it('recoil starts at full strength and eases down to ~0 by the end', () => {
      expect(ImpulseShapes.recoil(0)).toBeCloseTo(1, 5);
      expect(ImpulseShapes.recoil(1)).toBeCloseTo(0, 5);
    });

    it('rumble stays near full strength through most of its (long sustain) duration', () => {
      expect(ImpulseShapes.rumble(0.5)).toBeCloseTo(1, 5);
    });
  });

  describe('strength', () => {
    it('equals the felt amplitude for a single event', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: () => 0.7, duration: 1 }, 0);

      const strength = field.sampleAt(new Vector3(), new Vector3(), 1, 1, 0.5);
      expect(strength).toBeCloseTo(0.7, 5);
    });

    it('sums across overlapping events, same as the position offset', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1 }, 0);
      field.generate({ position: [0, 0, 0], direction: [0, 5, 0], shape: always, duration: 1 }, 0);

      const strength = field.sampleAt(new Vector3(), new Vector3(), 1, 1, 0.5);
      expect(strength).toBeCloseTo(2, 5);
    });

    it('ignores events outside channelMask, same filtering as the position offset', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, channel: 0b10 }, 0);

      expect(field.sampleAt(new Vector3(), new Vector3(), 0b01, 1, 0.5)).toBe(0);
    });
  });

  describe('hasEvents', () => {
    it('false with no events generated', () => {
      const field = new ImpulseField();
      expect(field.hasEvents).toBe(false);
    });

    it('true right after generate, before any sampleAt call', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1 }, 0);
      expect(field.hasEvents).toBe(true);
    });

    it('stays true while active, false once sampleAt prunes it past its lifetime', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 0.3 }, 0);
      const out = new Vector3();

      field.sampleAt(out, new Vector3(), 1, 1, 0.15); // mid-duration
      expect(field.hasEvents).toBe(true);

      field.sampleAt(out, new Vector3(), 1, 1, 1); // well past duration
      expect(field.hasEvents).toBe(false);
    });

    it('true even for a listener whose channelMask does not match - over-inclusive, not under', () => {
      const field = new ImpulseField();
      field.generate({ position: [0, 0, 0], direction: [10, 0, 0], shape: always, duration: 1, channel: 0b10 }, 0);
      expect(field.hasEvents).toBe(true); // hasEvents ignores channel entirely, by design
    });
  });
});
