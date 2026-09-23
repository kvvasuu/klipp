import { EventDispatcher } from 'three';
import type { CameraState } from './CameraState';
import type { CameraTransitionEventMap, KlippCore } from './KlippCore';

/** A writer mutates `out` or adds to it. Return `true` when more work remains for a later frame. */
export type CameraStateWriter = (out: CameraState, dt: number, justActivated: boolean) => boolean | void;

export type VirtualCameraSlots = {
  registerBody: (writer: CameraStateWriter) => () => void;
  registerAim: (writer: CameraStateWriter) => () => void;
  registerExtension: (writer: CameraStateWriter) => () => void;
  registerNoise: (writer: CameraStateWriter) => () => void;
};

/** Warn in dev mode when a second Body or Aim replaces an existing writer. */
function warnDoubleRegistration(slot: 'Body' | 'Aim', name: string): void {
  if (process.env.NODE_ENV !== 'production') {
    const article = slot === 'Aim' ? 'an' : 'a';
    console.warn(
      `<VirtualCamera name="${name}"> already has ${article} ${slot} registered - it will be replaced. Only one ${slot} at a time is supported (unlike Noise, which stacks).`,
    );
  }
}

/** Combines Body, Aim, Extension and Noise writers into a single camera update. */
export class VirtualCameraController extends EventDispatcher<CameraTransitionEventMap> implements VirtualCameraSlots {
  name: string;

  private bodyWriter: CameraStateWriter | null = null;
  private aimWriter: CameraStateWriter | null = null;
  private readonly extensionWriters = new Set<CameraStateWriter>();
  private readonly noiseWriters = new Set<CameraStateWriter>();

  constructor(name: string) {
    super();
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

  /** Re-dispatch events for this camera only when it participates in the transition. */
  trackEvents = (core: KlippCore): (() => void) => {
    const onActivated = (event: CameraTransitionEventMap['activated']) => {
      if (event.incoming === this.name) this.dispatchEvent({ type: 'activated', ...event });
    };
    const onDeactivated = (event: CameraTransitionEventMap['deactivated']) => {
      if (event.outgoing === this.name) this.dispatchEvent({ type: 'deactivated', ...event });
    };
    const onBlendCreated = (event: CameraTransitionEventMap['blendCreated']) => {
      if (event.incoming === this.name || event.outgoing === this.name) {
        this.dispatchEvent({ type: 'blendCreated', ...event });
      }
    };
    const onBlendFinished = (event: CameraTransitionEventMap['blendFinished']) => {
      if (event.liveId === this.name) this.dispatchEvent({ type: 'blendFinished', ...event });
    };
    const onCut = (event: CameraTransitionEventMap['cut']) => {
      if (event.incoming === this.name || event.outgoing === this.name) {
        this.dispatchEvent({ type: 'cut', ...event });
      }
    };
    core.addEventListener('activated', onActivated);
    core.addEventListener('deactivated', onDeactivated);
    core.addEventListener('blendCreated', onBlendCreated);
    core.addEventListener('blendFinished', onBlendFinished);
    core.addEventListener('cut', onCut);
    return () => {
      core.removeEventListener('activated', onActivated);
      core.removeEventListener('deactivated', onDeactivated);
      core.removeEventListener('blendCreated', onBlendCreated);
      core.removeEventListener('blendFinished', onBlendFinished);
      core.removeEventListener('cut', onCut);
    };
  };

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    // Keep `=== true` semantics: some writers return a real boolean even when typed as void.
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
