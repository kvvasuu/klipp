import type { CameraState } from './CameraState';

/** Writes into `out` (Body/Aim) or adds on top of it (Noise) — same `out`-parameter convention as the
 *  rest of klipp. */
export type CameraStateWriter = (out: CameraState, dt: number) => void;

export type VirtualCameraSlots = {
  registerBody: (writer: CameraStateWriter) => () => void;
  registerAim: (writer: CameraStateWriter) => () => void;
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
 * Plain class, zero React dependency — the actual logic behind `<VirtualCamera>`'s Body/Aim/Noise slots.
 * Combines whatever's registered into one `update(out, dt)`: Body, then Aim, then every Noise writer (in
 * that order) — Aim reads the position Body just wrote, Noise adds on top of both. At most one Body and
 * one Aim at a time (last registration wins, with a dev-mode warning); Noise deliberately stacks.
 */
export class VirtualCameraController implements VirtualCameraSlots {
  /** Used only for the dev-mode double-registration warning message. */
  name: string;

  private bodyWriter: CameraStateWriter | null = null;
  private aimWriter: CameraStateWriter | null = null;
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

  registerNoise = (writer: CameraStateWriter): (() => void) => {
    this.noiseWriters.add(writer);
    return () => this.noiseWriters.delete(writer);
  };

  update = (out: CameraState, dt: number): void => {
    this.bodyWriter?.(out, dt);
    this.aimWriter?.(out, dt);
    for (const writer of this.noiseWriters) writer(out, dt);
  };
}
