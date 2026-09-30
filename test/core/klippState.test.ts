import { describe, expect, it } from 'vitest';
import { BlendCurves } from '../../src/core/blend/BlendCurves';
import { createCameraState } from '../../src/core/CameraState';
import {
  DEFAULT_BLEND,
  createKlippState,
  registerKlippCamera,
  setKlippPriority,
  tickKlipp,
  unregisterKlippCamera,
  type KlippParams,
} from '../../src/core/klippState';

const params: KlippParams = { defaultBlend: { curve: BlendCurves.linear, time: 1 }, customBlends: [] };
const types = (events: { type: string }[]) => events.map((event) => event.type);

describe('klipp state', () => {
  it('records transitions as data, in order, and leaves draining to the caller', () => {
    const state = createKlippState();
    registerKlippCamera(state, { id: 'a', priority: 1, state: createCameraState() });
    expect(types(state.events)).toEqual(['activeIdChanged', 'activated']);
    state.events.length = 0;

    tickKlipp(state, params, 0.1);
    expect(types(state.events)).toEqual(['cut', 'liveIdChanged']);
    state.events.length = 0;

    registerKlippCamera(state, { id: 'b', priority: 2, state: createCameraState() });
    tickKlipp(state, params, 0.5);
    expect(state.events).toContainEqual({ type: 'blendCreated', incoming: 'b', outgoing: 'a' });
    state.events.length = 0;

    tickKlipp(state, params, 0.6);
    expect(types(state.events)).toEqual(['blendFinished', 'liveIdChanged', 'deactivated']);
    expect(state.blend.liveId).toBe('b');
  });

  it('ignores an unregister of a record whose id was taken by a newer registration', () => {
    const state = createKlippState();
    const first = registerKlippCamera(state, { id: 'a', priority: 1, state: createCameraState() });
    registerKlippCamera(state, { id: 'a', priority: 1, state: createCameraState() });
    unregisterKlippCamera(state, first);
    expect(state.cameras.has('a')).toBe(true);
  });

  it('keeps the settled output allocation-free: no events while nothing changes', () => {
    const state = createKlippState();
    registerKlippCamera(state, { id: 'a', priority: 1, state: createCameraState() });
    tickKlipp(state, { defaultBlend: DEFAULT_BLEND, customBlends: [] }, 0.1);
    state.events.length = 0;
    setKlippPriority(state, 'a', 5);
    tickKlipp(state, params, 0.1);
    expect(state.events).toEqual([]);
  });
});
