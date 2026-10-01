import { describe, expect, it } from 'vitest';
import {
  createFollowParams,
  createGroupFramingParams,
  createHardLockToTargetParams,
  createImpulseListenerParams,
  createInputAxisParams,
  createLensParams,
  createPerlinNoiseParams,
  createPositionComposerParams,
  createRotateWithFollowTargetParams,
  createRotationComposerParams,
} from '../../src/core/index';

const factories = {
  createFollowParams,
  createGroupFramingParams,
  createHardLockToTargetParams,
  createImpulseListenerParams,
  createInputAxisParams,
  createLensParams,
  createPerlinNoiseParams,
  createPositionComposerParams,
  createRotateWithFollowTargetParams,
  createRotationComposerParams,
};

describe('params factories', () => {
  it.each(Object.entries(factories))(
    '%s treats undefined as the default and never shares default objects (real bug: React shared them)',
    (_, create) => {
      const make = create as (settings?: object) => Record<string, unknown>;
      const defaults = make();
      const undefinedSettings = Object.fromEntries(Object.keys(defaults).map((key) => [key, undefined]));

      expect(make(undefinedSettings)).toEqual(defaults);
      for (const [key, value] of Object.entries(make())) {
        if (typeof value === 'object' && value !== null && !('generate' in value))
          expect(value).not.toBe(defaults[key]);
      }
    },
  );
});
