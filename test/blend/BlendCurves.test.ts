import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../src/blend/BlendCurves';

describe('BlendCurves', () => {
  it('every curve starts at 0 and ends at 1', () => {
    for (const [name, ease] of Object.entries(BlendCurves)) {
      expect(ease(0), `${name}(0)`).toBe(0);
      expect(ease(1), `${name}(1)`).toBe(1);
    }
  });

  it('every curve is monotonically non-decreasing on [0, 1]', () => {
    for (const [name, ease] of Object.entries(BlendCurves)) {
      let previous = ease(0);
      for (let t = 0.05; t <= 1; t += 0.05) {
        const value = ease(t);
        expect(value, `${name}(${t.toFixed(2)}) vs previous`).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it('linear is exactly identity', () => {
    expect(BlendCurves.linear(0.37)).toBeCloseTo(0.37, 10);
  });

  it('cut stays at 0 until the very last instant', () => {
    expect(BlendCurves.cut(0)).toBe(0);
    expect(BlendCurves.cut(0.5)).toBe(0);
    expect(BlendCurves.cut(0.999)).toBe(0);
    expect(BlendCurves.cut(1)).toBe(1);
  });

  it('easeInOut is a symmetric S-curve (matches the midpoint of a plain lerp exactly)', () => {
    expect(BlendCurves.easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(BlendCurves.easeInOut(0.1)).toBeLessThan(0.1); // slow start
    expect(BlendCurves.easeInOut(0.9)).toBeGreaterThan(0.9); // slow finish
  });

  it('easeIn departs at full rate (ahead of linear early), eases into the arrival', () => {
    expect(BlendCurves.easeIn(0.1)).toBeGreaterThan(BlendCurves.linear(0.1));
  });

  it('easeOut eases out of the departure (behind linear early), arrives at full rate', () => {
    expect(BlendCurves.easeOut(0.1)).toBeLessThan(BlendCurves.linear(0.1));
  });

  it('hardOut is an even more abrupt departure than easeIn (both: fast start, eased arrival)', () => {
    expect(BlendCurves.hardOut(0.1)).toBeGreaterThan(BlendCurves.easeIn(0.1));
  });

  it('hardIn is an even more eased departure than easeOut (both: slow start, hard arrival)', () => {
    expect(BlendCurves.hardIn(0.1)).toBeLessThan(BlendCurves.easeOut(0.1));
  });
});
