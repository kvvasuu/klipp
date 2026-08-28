import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ImpulseManager } from '../../src/impulse/ImpulseManager';

describe('ImpulseManager', () => {
  it('with no events, sampleAt writes zero', () => {
    const manager = new ImpulseManager();
    const out = new Vector3(9, 9, 9);
    manager.sampleAt(out, new Vector3(), 1, 0);
    expect(out.equals(new Vector3())).toBe(true);
  });

  it('during the attack phase, ramps linearly from 0 toward direction', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], attackTime: 1, sustainTime: 0, decayTime: 0 }, 0);

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(), 1, 0.5); // halfway through a 1s attack
    expect(out.x).toBeCloseTo(5, 5);
  });

  it('during the sustain phase, holds at full direction', () => {
    const manager = new ImpulseManager();
    manager.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0.1, sustainTime: 1, decayTime: 0.1 },
      0,
    );

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(), 1, 0.5); // within the sustain window
    expect(out.x).toBeCloseTo(10, 5);
  });

  it('during the decay phase, ramps linearly back to 0', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0, sustainTime: 0, decayTime: 1 }, 0);

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(), 1, 0.5); // halfway through a 1s decay
    expect(out.x).toBeCloseTo(5, 5);
  });

  it('is exactly 0 before the event starts and after it fully ends', () => {
    const manager = new ImpulseManager();
    manager.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0.1, sustainTime: 0.1, decayTime: 0.1 },
      5, // starts at t=5
    );

    const before = new Vector3();
    manager.sampleAt(before, new Vector3(), 1, 4.9);
    expect(before.equals(new Vector3())).toBe(true);

    const after = new Vector3();
    manager.sampleAt(after, new Vector3(), 1, 5.31); // 5 + 0.1+0.1+0.1 + a hair more
    expect(after.equals(new Vector3())).toBe(true);
  });

  it('dissipationDistance=0 (default): full strength at ANY distance — no falloff', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0, sustainTime: 1, decayTime: 0 }, 0);

    const far = new Vector3();
    manager.sampleAt(far, new Vector3(1000, 0, 0), 1, 0.5);
    expect(far.x).toBeCloseTo(10, 5);
  });

  it('radius: full strength anywhere inside it, regardless of dissipationDistance', () => {
    const manager = new ImpulseManager();
    manager.generate(
      {
        position: [0, 0, 0],
        direction: [10, 0, 0],
        attackTime: 0,
        sustainTime: 1,
        decayTime: 0,
        radius: 5,
        dissipationDistance: 10,
      },
      0,
    );

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(4, 0, 0), 1, 0.5); // inside radius
    expect(out.x).toBeCloseTo(10, 5);
  });

  it('dissipationDistance: falls off linearly beyond radius, reaching 0 at radius + dissipationDistance', () => {
    const manager = new ImpulseManager();
    manager.generate(
      {
        position: [0, 0, 0],
        direction: [10, 0, 0],
        attackTime: 0,
        sustainTime: 1,
        decayTime: 0,
        radius: 0,
        dissipationDistance: 10,
      },
      0,
    );

    const halfway = new Vector3();
    manager.sampleAt(halfway, new Vector3(5, 0, 0), 1, 0.5);
    expect(halfway.x).toBeCloseTo(5, 5); // halfway through the falloff band

    const beyond = new Vector3();
    manager.sampleAt(beyond, new Vector3(20, 0, 0), 1, 0.5);
    expect(beyond.equals(new Vector3())).toBe(true); // past radius + dissipationDistance
  });

  it('propagationSpeed: a distant listener feels the event later, delayed by distance / speed', () => {
    const manager = new ImpulseManager();
    manager.generate(
      {
        position: [0, 0, 0],
        direction: [10, 0, 0],
        attackTime: 0,
        sustainTime: 10, // long sustain so we're only testing the ARRIVAL delay, not decay timing
        decayTime: 0,
        propagationSpeed: 10, // 10 units/sec
      },
      0,
    );

    const listenerPosition = new Vector3(50, 0, 0); // 5s away at this speed

    const tooEarly = new Vector3();
    manager.sampleAt(tooEarly, listenerPosition, 1, 4); // hasn't arrived yet
    expect(tooEarly.equals(new Vector3())).toBe(true);

    const arrived = new Vector3();
    manager.sampleAt(arrived, listenerPosition, 1, 6); // arrived 1s ago
    expect(arrived.x).toBeCloseTo(10, 5);
  });

  it('propagationSpeed=Infinity (default): felt everywhere instantly, no arrival delay', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0, sustainTime: 1, decayTime: 0 }, 0);

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(100000, 0, 0), 1, 0.001);
    expect(out.x).toBeCloseTo(10, 5);
  });

  it('channel: a listener whose mask does not overlap the event channel feels nothing', () => {
    const manager = new ImpulseManager();
    manager.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0, sustainTime: 1, decayTime: 0, channel: 0b10 },
      0,
    );

    const wrongChannel = new Vector3();
    manager.sampleAt(wrongChannel, new Vector3(), 0b01, 0.5);
    expect(wrongChannel.equals(new Vector3())).toBe(true);

    const rightChannel = new Vector3();
    manager.sampleAt(rightChannel, new Vector3(), 0b10, 0.5);
    expect(rightChannel.x).toBeCloseTo(10, 5);
  });

  it('multiple overlapping events combine additively', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0, sustainTime: 1, decayTime: 0 }, 0);
    manager.generate({ position: [0, 0, 0], direction: [0, 5, 0], attackTime: 0, sustainTime: 1, decayTime: 0 }, 0);

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(), 1, 0.5);
    expect(out.x).toBeCloseTo(10, 5);
    expect(out.y).toBeCloseTo(5, 5);
  });

  it("a Vector3Like position/direction (r3f's [x,y,z] shorthand) works, not just real Vector3 instances", () => {
    const manager = new ImpulseManager();
    expect(() => manager.generate({ position: [1, 2, 3], direction: [4, 5, 6], sustainTime: 1 }, 0)).not.toThrow();

    const out = new Vector3();
    manager.sampleAt(out, new Vector3(1, 2, 3), 1, 0.5);
    expect(out.x).toBeCloseTo(4, 5);
  });

  it('sampleAt defaults to `now`/channelMask that make the common single-channel case just work', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [1, 0, 0], sustainTime: 10 }); // default now, default channel=1
    const out = new Vector3();
    manager.sampleAt(out, new Vector3()); // default now, default channelMask=1
    expect(out.x).toBeGreaterThan(0);
  });

  describe('hasEvents', () => {
    it('false with no events generated', () => {
      const manager = new ImpulseManager();
      expect(manager.hasEvents).toBe(false);
    });

    it('true right after generate, before any sampleAt call', () => {
      const manager = new ImpulseManager();
      manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], sustainTime: 1 }, 0);
      expect(manager.hasEvents).toBe(true);
    });

    it('stays true through attack/sustain/decay, false once sampleAt prunes it past its lifetime', () => {
      const manager = new ImpulseManager();
      manager.generate(
        { position: [0, 0, 0], direction: [10, 0, 0], attackTime: 0.1, sustainTime: 0.1, decayTime: 0.1 },
        0,
      );
      const out = new Vector3();

      manager.sampleAt(out, new Vector3(), 1, 0.15); // mid-sustain
      expect(manager.hasEvents).toBe(true);

      manager.sampleAt(out, new Vector3(), 1, 1); // well past attack+sustain+decay
      expect(manager.hasEvents).toBe(false);
    });

    it('true even for a listener whose channelMask does not match — over-inclusive, not under', () => {
      const manager = new ImpulseManager();
      manager.generate({ position: [0, 0, 0], direction: [10, 0, 0], sustainTime: 1, channel: 0b10 }, 0);
      expect(manager.hasEvents).toBe(true); // hasEvents ignores channel entirely, by design
    });
  });
});
