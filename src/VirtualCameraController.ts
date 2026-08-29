import type { CameraState } from './CameraState';

/** Writes into `out` (Body/Aim) or adds on top of it (Noise) — same `out`-parameter convention as the
 *  rest of klipp. Return `true` if there's still work in flight that could change the output on a LATER
 *  frame even though this call's output happens to match the previous one — see `FrameUpdate` in
 *  `Klipp.tsx` for why that matters. Most writers can ignore this and return nothing.
 *
 *  `justActivated` is `true` on the first call after the owning `<VirtualCamera>`'s `active` prop flips
 *  from `false` to `true` (including its very first-ever activation) — `false` every other call. A
 *  writer with its own persistent damping state — chasing a target across calls, independent of what's
 *  currently in `out` — should treat this as a cue to snap straight to the target instead of easing:
 *  while `active` was `false`, this writer wasn't being called at all (`<VirtualCamera>` only runs
 *  Body/Aim/Extension/Noise while `active`), so both `out` and any damper's own remembered state are
 *  frozen at whatever an EARLIER, unrelated activation last left them at. Easing from there reads as
 *  flying in from a stale position instead of the fresh one this activation actually wants. */
export type CameraStateWriter = (out: CameraState, dt: number, justActivated: boolean) => boolean | void;

export type VirtualCameraSlots = {
  registerBody: (writer: CameraStateWriter) => () => void;
  registerAim: (writer: CameraStateWriter) => () => void;
  registerExtension: (writer: CameraStateWriter) => () => void;
  registerNoise: (writer: CameraStateWriter) => () => void;
};

/** Dev-mode-only: warns when a second Body/Aim registers on top of an existing one — silently replacing
 *  it is almost never intended (unlike Noise, which is meant to stack). Stripped in production builds by
 *  whatever bundler the consumer uses, same convention as React itself. */
function warnDoubleRegistration(slot: 'Body' | 'Aim', name: string): void {
  if (process.env.NODE_ENV !== 'production') {
    const article = slot === 'Aim' ? 'an' : 'a';
    console.warn(
      `<VirtualCamera name="${name}"> already has ${article} ${slot} registered — it will be replaced. Only one ${slot} at a time is supported (unlike Noise, which stacks).`,
    );
  }
}

/**
 * Plain class, zero React dependency — the actual logic behind `<VirtualCamera>`'s Body/Aim/Extension/
 * Noise slots. Combines whatever's registered into one `update(out, dt)`: Body, then Aim, then every
 * Extension writer, then every Noise writer — Aim reads the position Body just wrote, Extension
 * (framing/collision-avoidance/...) runs on an already fully-oriented shot so it knows which way is
 * "back", and Noise adds shake on top of a shot that's already correctly composed, not one an
 * extension might still adjust out from under it. At most one Body and one Aim at a time (last
 * registration wins, with a dev-mode warning); Extension and Noise both deliberately stack.
 */
export class VirtualCameraController implements VirtualCameraSlots {
  /** Used only for the dev-mode double-registration warning message. */
  name: string;

  private bodyWriter: CameraStateWriter | null = null;
  private aimWriter: CameraStateWriter | null = null;
  private readonly extensionWriters = new Set<CameraStateWriter>();
  private readonly noiseWriters = new Set<CameraStateWriter>();

  constructor(name: string) {
    this.name = name;
  }

  registerBody = (writer: CameraStateWriter): (() => void) => {
    if (this.bodyWriter !== null) warnDoubleRegistration('Body', this.name);
    this.bodyWriter = writer;
    return () => {
      if (this.bodyWriter === writer) this.bodyWriter = null;
    };
  };

  registerAim = (writer: CameraStateWriter): (() => void) => {
    if (this.aimWriter !== null) warnDoubleRegistration('Aim', this.name);
    this.aimWriter = writer;
    return () => {
      if (this.aimWriter === writer) this.aimWriter = null;
    };
  };

  registerExtension = (writer: CameraStateWriter): (() => void) => {
    this.extensionWriters.add(writer);
    return () => this.extensionWriters.delete(writer);
  };

  registerNoise = (writer: CameraStateWriter): (() => void) => {
    this.noiseWriters.add(writer);
    return () => this.noiseWriters.delete(writer);
  };

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    // `=== true`, not plain truthiness: a writer that's supposed to return `void` but happens to be an
    // expression-bodied arrow ending in an assignment (e.g. `(out) => (out.position.x = dt)`) returns
    // that assigned VALUE at runtime regardless of its `: void` type annotation — strict equality is
    // what actually keeps such a writer from silently pinning "still in flight" forever
    let stillInFlight = false;
    if (this.bodyWriter?.(out, dt, justActivated) === true) stillInFlight = true;
    if (this.aimWriter?.(out, dt, justActivated) === true) stillInFlight = true;
    for (const writer of this.extensionWriters) {
      if (writer(out, dt, justActivated) === true) stillInFlight = true;
    }
    for (const writer of this.noiseWriters) {
      if (writer(out, dt, justActivated) === true) stillInFlight = true;
    }
    return stillInFlight;
  };
}
