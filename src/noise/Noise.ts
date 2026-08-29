import { ImpulseListener } from '../impulse/ImpulseListener';
import { BasicMultiChannelPerlin } from './BasicMultiChannelPerlin';

/**
 * `Noise` adds ADDITIVE offset on top of whatever `Body`+`Aim` already computed — unlike them, it's a
 * STACKING slot: mount as many `<Noise.*>` as you want inside one `<VirtualCamera>`.
 *
 * `ImpulseListener` lives in `src/impulse/` (its own subsystem, grouped by TOPIC with `ImpulseManager`)
 * but fills this same stacking slot, so it's re-exported here too, grouped by ROLE.
 */
export const Noise = {
  BasicMultiChannelPerlin,
  ImpulseListener,
};
