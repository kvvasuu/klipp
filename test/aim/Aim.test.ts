import { describe, expect, it } from 'vitest';
import { Aim } from '../../src/aim/Aim';
import { HardLookAt } from '../../src/aim/HardLookAt';

describe('Aim namespace', () => {
  it('Aim.HardLookAt is the exact same component as the named export, not a reimplementation', () => {
    expect(Aim.HardLookAt).toBe(HardLookAt);
  });
});
