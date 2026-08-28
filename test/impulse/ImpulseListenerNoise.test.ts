import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCameraState } from '../../src/CameraState';
import { ImpulseListenerNoise } from '../../src/impulse/ImpulseListenerNoise';
import { ImpulseManager } from '../../src/impulse/ImpulseManager';

describe('ImpulseListenerNoise', () => {
  it('adds the manager-sampled offset to out.position', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [3, 0, 0], sustainTime: 10 }, 0);

    const listener = new ImpulseListenerNoise(manager);
    const out = createCameraState();
    out.position.set(5, 0, 0);

    listener.update(out, 0.1, 0.5); // explicit now — within the event's sustain window

    expect(out.position.x).toBeCloseTo(8, 4);
  });

  it('never touches rotation', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [3, 0, 0], sustainTime: 10 }, 0);

    const listener = new ImpulseListenerNoise(manager);
    const out = createCameraState();
    out.quaternion.set(0.1, 0.2, 0.3, 0.9).normalize();
    const before = out.quaternion.clone();

    listener.update(out, 0.1, 0.5);

    expect(out.quaternion.equals(before)).toBe(true);
  });

  it('gain scales the sampled offset', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [3, 0, 0], sustainTime: 10 }, 0);

    const listener = new ImpulseListenerNoise(manager, 1, 2); // gain = 2
    const out = createCameraState();

    listener.update(out, 0.1, 0.5);

    expect(out.position.x).toBeCloseTo(6, 4);
  });

  it('channelMask filters which events are felt', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [3, 0, 0], sustainTime: 10, channel: 0b10 }, 0);

    const listener = new ImpulseListenerNoise(manager, 0b01); // wrong channel
    const out = createCameraState();

    listener.update(out, 0.1, 0.5);

    expect(out.position.x).toBe(0);
  });

  it('samples using out.position as the listener location, not the impulse origin', () => {
    const manager = new ImpulseManager();
    manager.generate(
      { position: [0, 0, 0], direction: [10, 0, 0], sustainTime: 10, radius: 0, dissipationDistance: 100 },
      0,
    );

    const listener = new ImpulseListenerNoise(manager);
    const near = createCameraState();
    near.position.set(0, 0, 0);
    const far = createCameraState();
    far.position.set(90, 0, 0);

    listener.update(near, 0.1, 0.5);
    listener.update(far, 0.1, 0.5);

    const nearOffset = near.position.x - 0;
    const farOffset = far.position.x - 90;
    expect(nearOffset).toBeGreaterThan(farOffset);
  });

  it('when now is omitted, falls back to the real (shared) clock instead of a private per-instance one', () => {
    const manager = new ImpulseManager();
    manager.generate({ position: [0, 0, 0], direction: [7, 0, 0], sustainTime: 60 }); // real now, long sustain

    const listener = new ImpulseListenerNoise(manager);
    const out = createCameraState();
    listener.update(out, 0.1); // no explicit now — falls back to the real clock, same domain as generate() above

    expect(out.position.x).toBeCloseTo(7, 4);
  });

  it('defaults to the shared impulseManager singleton when none is passed', async () => {
    const { impulseManager } = await import('../../src/impulse/ImpulseManager');
    impulseManager.generate({ position: [0, 0, 0], direction: [7, 0, 0], sustainTime: 60 });

    const listener = new ImpulseListenerNoise();
    const out = createCameraState();
    listener.update(out, 0.1);

    expect(out.position.x).toBeCloseTo(7, 4);
  });

  it('manager/channelMask/gain are mutable fields', () => {
    const managerA = new ImpulseManager();
    managerA.generate({ position: [0, 0, 0], direction: [3, 0, 0], sustainTime: 10 }, 0);
    const managerB = new ImpulseManager();
    managerB.generate({ position: [0, 0, 0], direction: [9, 0, 0], sustainTime: 10 }, 0);

    const listener = new ImpulseListenerNoise(managerA);
    const out = createCameraState();
    listener.update(out, 0.1, 0.5);
    expect(out.position.x).toBeCloseTo(3, 4);

    listener.manager = managerB;
    out.position.set(0, 0, 0);
    listener.update(out, 0.1, 0.5);
    expect(out.position.x).toBeCloseTo(9, 4);
  });

  it('update is a bound instance method — safe to pass by reference (e.g. slots.registerNoise(listener.update))', () => {
    const manager = new ImpulseManager();
    const listener = new ImpulseListenerNoise(manager);
    const { update } = listener;

    const out = createCameraState();
    expect(() => update(out, 0.1)).not.toThrow();
  });

  it('update() returns whether the manager still has an event in flight, even during a constant-amplitude plateau', () => {
    const manager = new ImpulseManager();
    manager.generate(
      { position: [0, 0, 0], direction: [3, 0, 0], attackTime: 0.1, sustainTime: 1, decayTime: 0.1 },
      0,
    );
    const listener = new ImpulseListenerNoise(manager);
    const out = createCameraState();

    // two samples deep in the flat sustain plateau — out.position.x is identical both times, but the
    // event is still in flight and klipp must not treat that as "settled forever"
    expect(listener.update(out, 0.1, 0.4)).toBe(true);
    expect(listener.update(out, 0.1, 0.5)).toBe(true);

    expect(listener.update(out, 0.1, 5)).toBe(false); // well past the whole envelope
  });
});
