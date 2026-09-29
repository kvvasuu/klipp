import { describe, expect, it } from 'vitest';
import { Aim } from '../../../src/react/aim/Aim';
import { HardLookAt } from '../../../src/react/aim/HardLookAt';

describe('Aim namespace', () => {
  it('Aim.HardLookAt is the exact same component as the named export, not a reimplementation', () => {
    expect(Aim.HardLookAt).toBe(HardLookAt);
  });
});
