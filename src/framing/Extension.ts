import { GroupFraming } from './GroupFraming';

/**
 * `Extension` runs AFTER Body+Aim (so it already knows the shot's orientation) and BEFORE Noise (so
 * shake/impulse lands on an already-correctly-framed shot, not one an extension might still adjust).
 * Goes inside a `<VirtualCamera>` — a STACKING slot like Noise, not exclusive like Body/Aim.
 *
 * Namespace convenience for JSX discoverability (`<Extension.GroupFraming/>`) — same components as the
 * named exports, re-grouped, not reimplemented. Prefer the named export directly if tree-shaking matters
 * more than the namespaced call site.
 */
export const Extension = {
  GroupFraming,
};
