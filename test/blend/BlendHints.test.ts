import { describe, expect, it } from 'vitest';
import { BlendHints, hasBlendHint } from '../../src/blend/BlendHints';

describe('BlendHints', () => {
  it('each flag is a distinct bit (no accidental overlap)', () => {
    const flags = [
      BlendHints.cylindricalPosition,
      BlendHints.sphericalPosition,
      BlendHints.screenSpaceAimWhenTargetsDiffer,
      BlendHints.ignoreTarget,
      BlendHints.inheritPosition,
    ];
    const seen = new Set(flags);
    expect(seen.size).toBe(flags.length);
  });

  it('none has no flags set', () => {
    expect(hasBlendHint(BlendHints.none, BlendHints.cylindricalPosition)).toBe(false);
    expect(hasBlendHint(BlendHints.none, BlendHints.ignoreTarget)).toBe(false);
  });

  it('combining flags with | preserves each one independently', () => {
    const combined = BlendHints.cylindricalPosition | BlendHints.ignoreTarget;

    expect(hasBlendHint(combined, BlendHints.cylindricalPosition)).toBe(true);
    expect(hasBlendHint(combined, BlendHints.ignoreTarget)).toBe(true);
    expect(hasBlendHint(combined, BlendHints.sphericalPosition)).toBe(false);
    expect(hasBlendHint(combined, BlendHints.inheritPosition)).toBe(false);
  });
});
