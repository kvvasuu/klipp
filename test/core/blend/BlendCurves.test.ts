import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../../src/core/blend/BlendCurves';

describe('BlendCurves', () => {
  it('every curve rises from 0 to 1 without going back', () => {
    for (const [name, ease] of Object.entries(BlendCurves)) {
      expect(ease(0), `${name}(0)`).toBe(0);
      expect(ease(1), `${name}(1)`).toBe(1);
      let previous = 0;
      for (let t = 0.05; t <= 1; t += 0.05) {
        expect(ease(t), `${name}(${t.toFixed(2)})`).toBeGreaterThanOrEqual(previous);
        previous = ease(t);
      }
    }
  });

  it('linear is the identity, and cut holds 0 until the end', () => {
    expect(BlendCurves.linear(0.37)).toBe(0.37);
    expect([BlendCurves.cut(0.5), BlendCurves.cut(0.999)]).toEqual([0, 0]);
  });

  it('easeInOut is a symmetric S-curve (matches the midpoint of a plain lerp exactly)', () => {
    expect(BlendCurves.easeInOut(0.5)).toBeCloseTo(0.5, 10);
    expect(BlendCurves.easeInOut(0.1)).toBeLessThan(0.1); // slow start
    expect(BlendCurves.easeInOut(0.9)).toBeGreaterThan(0.9); // slow finish
  });

  it('orders the one-sided curves by how fast they leave: cubicOut, easeIn, linear, easeOut, cubicIn', () => {
    const order = ['cubicOut', 'easeIn', 'linear', 'easeOut', 'cubicIn'] as const;
    const early = order.map((name) => BlendCurves[name](0.1));
    expect(early).toEqual([...early].sort((a, b) => b - a));
    expect(new Set(early).size).toBe(order.length);
  });
});
