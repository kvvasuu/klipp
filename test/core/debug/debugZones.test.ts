import { describe, expect, it } from 'vitest';
import { composerDebugZones, groupFramingPaddingBox } from '../../../src/core/debug/debugZones';

describe('composerDebugZones', () => {
  it('turns half-extents into full boxes around screenPosition, hard limit first', () => {
    expect(composerDebugZones([0.2, -0.1], [0.1, 0.2], [0.4, 0.3])).toEqual([
      { screenPosition: [0.2, -0.1], size: [0.8, 0.6], className: 'klipp-debug-hardlimit' },
      { screenPosition: [0.2, -0.1], size: [0.2, 0.4], className: 'klipp-debug-deadzone' },
    ]);
  });

  it('skips zones that are zero on both axes', () => {
    expect(composerDebugZones([0, 0], [0, 0], [0, 0])).toEqual([]);
    expect(composerDebugZones([0, 0], [0.1, 0], [0, 0])).toHaveLength(1);
  });
});

describe('groupFramingPaddingBox', () => {
  it('spans the full frame with no padding', () => {
    expect(groupFramingPaddingBox([0, 0], 60, 16 / 9, 10, 0, 'horizontalAndVertical')).toEqual([2, 2]);
  });

  it('shrinks by the padding over the frustum plane distance', () => {
    // vertical half-FOV 30deg: 1 - 2 / (10 * sin 30deg) = 0.6
    const box = groupFramingPaddingBox([0, 0], 60, 1, 10, 2, 'horizontalAndVertical');
    expect(box[1]).toBeCloseTo(1.2, 10);
    expect(box[0]).toBeCloseTo(1.2, 10); // square aspect: same on both axes
  });

  it('leaves an axis excluded by framingMode at the full frame', () => {
    expect(groupFramingPaddingBox([0, 0], 60, 1, 10, 2, 'horizontal')[1]).toBe(2);
    expect(groupFramingPaddingBox([0, 0], 60, 1, 10, 2, 'vertical')[0]).toBe(2);
  });

  it('clamps to nothing when the padding does not fit', () => {
    expect(groupFramingPaddingBox([0, 0], 60, 1, 1, 5, 'horizontalAndVertical')).toEqual([0, 0]);
  });
});
