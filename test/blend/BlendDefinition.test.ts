import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../src/blend/BlendCurves';
import { resolveBlendDefinition, type CustomBlend } from '../../src/blend/BlendDefinition';

const defaultBlend = { curve: BlendCurves.linear, time: 1 };

describe('resolveBlendDefinition', () => {
  it('falls back to the default when no custom blend matches', () => {
    const resolved = resolveBlendDefinition([], 'a', 'b', defaultBlend);
    expect(resolved).toBe(defaultBlend);
  });

  it('matches an exact from+to pair', () => {
    const blend = { curve: BlendCurves.easeInOut, time: 3 };
    const customBlends: CustomBlend[] = [{ from: 'a', to: 'b', blend }];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'a', 'c', defaultBlend)).toBe(defaultBlend);
  });

  it('a "to" wildcard (any origin) matches, including from null', () => {
    const blend = { curve: BlendCurves.hardIn, time: 2 };
    const customBlends: CustomBlend[] = [{ to: 'b', blend }];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, null, 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'a', 'c', defaultBlend)).toBe(defaultBlend);
  });

  it('a "from" wildcard (any destination) matches', () => {
    const blend = { curve: BlendCurves.hardOut, time: 4 };
    const customBlends: CustomBlend[] = [{ from: 'a', blend }];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'a', 'c', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'x', 'b', defaultBlend)).toBe(defaultBlend);
  });

  it('an exact match wins over both wildcard entries', () => {
    const toWildcard = { curve: BlendCurves.linear, time: 2 };
    const fromWildcard = { curve: BlendCurves.linear, time: 4 };
    const exact = { curve: BlendCurves.easeIn, time: 9 };
    const customBlends: CustomBlend[] = [
      { to: 'b', blend: toWildcard },
      { from: 'a', blend: fromWildcard },
      { from: 'a', to: 'b', blend: exact },
    ];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(exact);
  });

  it('a "to" wildcard wins over a "from" wildcard', () => {
    const fromWildcard = { curve: BlendCurves.linear, time: 4 };
    const toWildcard = { curve: BlendCurves.linear, time: 2 };
    const customBlends: CustomBlend[] = [
      { from: 'a', blend: fromWildcard },
      { to: 'b', blend: toWildcard },
    ];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(toWildcard);
  });
});
