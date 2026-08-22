import { describe, expect, it } from 'vitest';
import { HardLockToTarget } from '../../src/body/HardLockToTarget';
import { Body } from '../../src/body/Body';

describe('Body namespace', () => {
  it('Body.HardLockToTarget is the exact same component as the named export, not a reimplementation', () => {
    expect(Body.HardLockToTarget).toBe(HardLockToTarget);
  });
});
