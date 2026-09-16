import { BasicMultiChannelPerlin } from './BasicMultiChannelPerlin';

/**
 * `Noise` adds ADDITIVE offset on top of whatever `Body`+`Aim` already computed - unlike them, it's a
 * STACKING slot: mount as many `<Noise.*>` as you want inside one `<VirtualCamera>`.
 */
export const Noise = {
  BasicMultiChannelPerlin,
};
