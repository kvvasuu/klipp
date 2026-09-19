import { describe, expect, it } from 'vitest';
import { shortestWrappedDelta } from '../../src/input/shortestWrappedDelta';

describe('shortestWrappedDelta', () => {
  it('returns a plain difference when nowhere near the seam', () => {
    expect(shortestWrappedDelta(10, 30, [-180, 180])).toBeCloseTo(20, 5);
    expect(shortestWrappedDelta(30, 10, [-180, 180])).toBeCloseTo(-20, 5);
  });

  it('crosses the seam the short way instead of going the long way around', () => {
    // 170 -> -170 is a 20 step through the +/-180 seam, not a 340 step back through 0
    expect(shortestWrappedDelta(170, -170, [-180, 180])).toBeCloseTo(20, 5);
    expect(shortestWrappedDelta(-170, 170, [-180, 180])).toBeCloseTo(-20, 5);
  });

  it('works for an arbitrary, non-symmetric range', () => {
    expect(shortestWrappedDelta(350, 10, [0, 360])).toBeCloseTo(20, 5);
  });

  it('returns 0 for identical values', () => {
    expect(shortestWrappedDelta(42, 42, [-180, 180])).toBeCloseTo(0, 5);
  });
});
