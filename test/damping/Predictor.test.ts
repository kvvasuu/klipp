import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Predictor } from '../../src/damping/Predictor';

const DT = 1 / 60;

function feedConstantVelocity(predictor: Predictor, velocity: Vector3, seconds: number, smoothing: number) {
  const position = new Vector3();
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    position.addScaledVector(velocity, DT);
    predictor.addPosition(position, DT, smoothing);
  }
}

describe('Predictor', () => {
  it('the first addPosition() call only records position - no velocity to derive yet', () => {
    const predictor = new Predictor();
    predictor.addPosition(new Vector3(5, 0, 0), DT, 10);
    expect(predictor.velocity.equals(new Vector3())).toBe(true);
  });

  it('converges to the velocity of a point moving at a constant speed', () => {
    const predictor = new Predictor();
    feedConstantVelocity(predictor, new Vector3(10, 0, 0), 2, 10);

    expect(predictor.velocity.x).toBeCloseTo(10, 1);
    expect(predictor.velocity.y).toBeCloseTo(0, 5);
  });

  it('predictPositionDelta scales the tracked velocity by the lookahead time, writes into out', () => {
    const predictor = new Predictor();
    feedConstantVelocity(predictor, new Vector3(10, 0, 0), 2, 10);

    const out = new Vector3();
    const returned = predictor.predictPositionDelta(out, 0.5);
    expect(returned).toBe(out);
    expect(out.x).toBeCloseTo(5, 1);
  });

  it('reacts faster to a decelerating point than to an accelerating one, same smoothing', () => {
    const smoothing = 10;

    const slowing = new Predictor();
    feedConstantVelocity(slowing, new Vector3(20, 0, 0), 2, smoothing);
    feedConstantVelocity(slowing, new Vector3(5, 0, 0), 5 * DT, smoothing);

    const speedingUp = new Predictor();
    feedConstantVelocity(speedingUp, new Vector3(5, 0, 0), 2, smoothing);
    feedConstantVelocity(speedingUp, new Vector3(20, 0, 0), 5 * DT, smoothing);

    const slowingRemaining = Math.abs(slowing.velocity.x - 5);
    const speedingUpRemaining = Math.abs(speedingUp.velocity.x - 20);
    expect(slowingRemaining).toBeLessThan(speedingUpRemaining);
  });

  it('dt <= 0 does not throw or produce a NaN/Infinity velocity', () => {
    const predictor = new Predictor();
    predictor.addPosition(new Vector3(1, 0, 0), DT, 10);
    expect(() => predictor.addPosition(new Vector3(2, 0, 0), 0, 10)).not.toThrow();
    expect(Number.isFinite(predictor.velocity.x)).toBe(true);
  });

  it('reset() clears tracked velocity and re-arms the first-call skip', () => {
    const predictor = new Predictor();
    feedConstantVelocity(predictor, new Vector3(10, 0, 0), 2, 10);
    expect(predictor.velocity.x).not.toBe(0);

    predictor.reset();
    expect(predictor.velocity.equals(new Vector3())).toBe(true);

    predictor.addPosition(new Vector3(100, 0, 0), DT, 10);
    expect(predictor.velocity.equals(new Vector3())).toBe(true);
  });
});
