import { GroupFraming } from './GroupFraming';

/** `Extension` runs AFTER Body+Aim (so it already knows the shot's orientation) and BEFORE Noise (so
 *  shake/impulse lands on an already-correctly-framed shot) — a STACKING slot like Noise, not exclusive
 *  like Body/Aim. */
export const Extension = {
  GroupFraming,
};
