import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../../src/core/blend/BlendCurves';
import { resolveBlendDefinition, type CustomBlend } from '../../../src/core/blend/BlendDefinition';

const defaultBlend = { curve: BlendCurves.linear, time: 1 };

describe('resolveBlendDefinition', () => {
  it('matches an exact from+to pair', () => {
    const blend = { curve: BlendCurves.easeInOut, time: 3 };
    const customBlends: CustomBlend[] = [{ from: 'a', to: 'b', blend }];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'a', 'c', defaultBlend)).toBe(defaultBlend);
  });

  it('a "to" wildcard (any origin) matches, including from null', () => {
    const blend = { curve: BlendCurves.cubicIn, time: 2 };
    const customBlends: CustomBlend[] = [{ to: 'b', blend }];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, null, 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'a', 'c', defaultBlend)).toBe(defaultBlend);
  });

  it('a "from" wildcard (any destination) matches', () => {
    const blend = { curve: BlendCurves.cubicOut, time: 4 };
    const customBlends: CustomBlend[] = [{ from: 'a', blend }];

    expect(resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'a', 'c', defaultBlend)).toBe(blend);
    expect(resolveBlendDefinition(customBlends, 'x', 'b', defaultBlend)).toBe(defaultBlend);
  });

  it('prefers an exact pair, then a "to" wildcard, then a "from" wildcard, then the default', () => {
    const exact = { curve: BlendCurves.easeIn, time: 9 };
    const toWildcard = { curve: BlendCurves.linear, time: 2 };
    const fromWildcard = { curve: BlendCurves.linear, time: 4 };
    const resolve = (customBlends: CustomBlend[]) => resolveBlendDefinition(customBlends, 'a', 'b', defaultBlend);

    expect(
      resolve([
        { from: 'a', blend: fromWildcard },
        { to: 'b', blend: toWildcard },
        { from: 'a', to: 'b', blend: exact },
      ]),
    ).toBe(exact);
    expect(
      resolve([
        { from: 'a', blend: fromWildcard },
        { to: 'b', blend: toWildcard },
      ]),
    ).toBe(toWildcard);
    expect(resolve([{ from: 'a', blend: fromWildcard }])).toBe(fromWildcard);
    expect(resolve([])).toBe(defaultBlend);
  });
});
