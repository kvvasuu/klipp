import { describe, expect, it } from 'vitest';
import {
  addPredictorPosition,
  createPredictorState,
  predictPositionDelta,
  resetPredictor,
} from '../../../src/core/damping/predictor';

const DT = 1 / 60;

/** A point moving along X; `move` feeds the predictor one sample per frame. */
function track(state = createPredictorState()) {
  let x = 0;
  return {
    state,
    move(speed: number, seconds: number) {
      for (let i = 0; i < Math.round(seconds / DT); i++) addPredictorPosition(state, [(x += speed * DT), 0, 0], DT, 10);
    },
  };
}

describe('predictor', () => {
  it('tracks the velocity of a moving point and predicts its offset ahead', () => {
    const { state, move } = track();
    move(10, 2);

    expect(state.velocity[0]).toBeCloseTo(10, 1);
    expect(state.velocity[1]).toBe(0);
    expect(predictPositionDelta([0, 0, 0], state, 0.5)[0]).toBeCloseTo(5, 1);
  });

  it('derives no velocity from the first sample, including after a reset', () => {
    const state = createPredictorState();
    addPredictorPosition(state, [5, 0, 0], DT, 10);
    expect(state.velocity).toEqual([0, 0, 0]);

    track(state).move(10, 1);
    resetPredictor(state);
    expect(state.velocity).toEqual([0, 0, 0]);
    addPredictorPosition(state, [100, 0, 0], DT, 10);
    expect(state.velocity).toEqual([0, 0, 0]);
  });

  it('reacts faster to slowing down than to speeding up', () => {
    const slowing = track();
    slowing.move(20, 2);
    slowing.move(5, 5 * DT);

    const speedingUp = track();
    speedingUp.move(5, 2);
    speedingUp.move(20, 5 * DT);

    expect(Math.abs(slowing.state.velocity[0] - 5)).toBeLessThan(Math.abs(speedingUp.state.velocity[0] - 20));
  });

  it('keeps the velocity finite when dt is 0 or negative', () => {
    const { state, move } = track();
    move(10, 1);
    const velocity = [...state.velocity];

    addPredictorPosition(state, [50, 0, 0], 0, 10);
    addPredictorPosition(state, [60, 0, 0], -1, 10);

    expect(state.velocity).toEqual(velocity);
  });
});
