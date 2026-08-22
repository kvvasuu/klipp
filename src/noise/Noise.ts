import { ImpulseListener } from '../impulse/ImpulseListener';
import { BasicMultiChannelPerlin } from './BasicMultiChannelPerlin';

/**
 * `Noise` adds ADDITIVE offset on top of whatever `Body`+`Aim` already computed — unlike them, it's a
 * STACKING slot: mount as many `<Noise.*>` as you want inside one `<VirtualCamera>`.
 *
 * `ImpulseListener` lives in `src/impulse/` (grouped by TOPIC with `ImpulseManager`/`ImpulseListenerNoise`
 * — it's its own subsystem, not a Noise variant) but is re-exported here too, grouped by ROLE: it fills
 * the exact same stacking Noise slot `BasicMultiChannelPerlin` does.
 *
 * Namespace convenience for JSX discoverability (`<Noise.BasicMultiChannelPerlin/>`) — same components as
 * the named exports, re-grouped, not reimplemented. Prefer the named export directly if tree-shaking
 * matters more than the namespaced call site.
 */
export const Noise = {
  BasicMultiChannelPerlin,
  ImpulseListener,
};
