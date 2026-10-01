import type { Quat, Vec3 } from 'math';
import { BlendHints } from './blend/BlendHints.js';
import { copyCameraState, createCameraState, mergeCameraState, type CameraState } from './CameraState.js';
import { EventDispatcher } from './EventDispatcher.js';
import { attachTo, checkName, prepare, register, run, setHints, setPriority } from './internal.js';
import type { CameraTransitionEventMap, KlippCore } from './KlippCore.js';

/** Writes `out` for one frame. Return `true` when more work remains for a later frame. */
export type CameraStateWriter = (out: CameraState, dt: number, justActivated: boolean) => boolean | void;

/** A Body, Aim, Extension or Noise: anything with an `update` that writes the camera state. */
export type CameraPiece = { update: CameraStateWriter };

export type VirtualCameraCoreOptions = {
  /** The active camera with the highest priority is on screen. */
  priority?: number;
  /** Whether this camera takes part in arbitration and updates. */
  active?: boolean;
  /** Blend hints for transitions involving this camera. */
  hints?: BlendHints;
  /** Starting pose and lens, applied over the `KlippCore`'s `initialCameraState` when first added. */
  initialState?: Partial<CameraState>;
};

type SizedPiece = CameraPiece & { aspect: number };
type ViewportPiece = CameraPiece & { viewportWidth: number; viewportHeight: number };
type PositionPrimed = CameraPiece & { primeFrom: (position: Vec3) => void };
type RotationPrimed = CameraPiece & { primeFrom: (rotation: Quat, referenceUp: Vec3) => void };

/** Warn when a second Body or Aim replaces an existing one. */
function warnDoubleRegistration(slot: 'Body' | 'Aim', name: string): void {
  console.warn(`Virtual camera "${name}": a second ${slot} replaced the first. A camera runs one ${slot}.`);
}

const noop = (): void => {};

/** One shot: its state, the pieces that write it, and its place in a `KlippCore`'s arbitration. */
export class VirtualCameraCore extends EventDispatcher<CameraTransitionEventMap> {
  /** This camera's own state, written by its pieces every frame. */
  readonly state: CameraState;

  /** Every piece, in no particular order. */
  protected readonly pieces = new Set<CameraPiece>();

  private readonly initialState: Partial<CameraState> | undefined;
  private _name: string;
  private _priority: number;
  private _hints: BlendHints;
  private _active: boolean;
  private _klipp: KlippCore | null = null;
  private seeded = false;
  private stopTracking: (() => void) | null = null;
  private unregister: (() => void) | null = null;
  private justActivated = true;
  private hasRun = false;
  private _body: CameraPiece | null = null;
  private _aim: CameraPiece | null = null;
  private removeBody: () => void = noop;
  private removeAim: () => void = noop;
  private readonly extensions = new Set<CameraPiece>();
  private readonly noises = new Set<CameraPiece>();

  constructor(name: string, options: VirtualCameraCoreOptions = {}) {
    super();
    this._name = name;
    this._priority = options.priority ?? 0;
    this._hints = options.hints ?? BlendHints.none;
    this._active = options.active ?? true;
    this.initialState = options.initialState;
    // Also applied now, so pieces set before the camera is added can prime from it.
    this.state = mergeCameraState(createCameraState(), options.initialState ?? {});
  }

  /** The `KlippCore` this camera was added to, if any. */
  get klipp(): KlippCore | null {
    return this._klipp;
  }

  get name(): string {
    return this._name;
  }

  /** Renaming a registered camera registers it again under the new name. */
  set name(name: string) {
    if (name === this._name) return;
    this._name = name;
    this._klipp?.[checkName](this);
    if (this.unregister) {
      this.unregister();
      this.unregister = this._klipp![register](this.registration());
    }
  }

  get priority(): number {
    return this._priority;
  }

  set priority(priority: number) {
    this._priority = priority;
    if (this.unregister) this._klipp![setPriority](this._name, priority);
  }

  get hints(): BlendHints {
    return this._hints;
  }

  set hints(hints: BlendHints) {
    this._hints = hints;
    if (this.unregister) this._klipp![setHints](this._name, hints);
  }

  /** Whether this camera takes part. Turning it back on starts it fresh, like a first activation. */
  get active(): boolean {
    return this._active;
  }

  set active(active: boolean) {
    this._active = active;
    this.syncRegistration();
  }

  get body(): CameraPiece | null {
    return this._body;
  }

  /** Replace the Body. */
  set body(body: CameraPiece | null) {
    this.removeBody();
    this.setBody(body);
  }

  get aim(): CameraPiece | null {
    return this._aim;
  }

  /** Replace the Aim. */
  set aim(aim: CameraPiece | null) {
    this.removeAim();
    this.setAim(aim);
  }

  /** Add the Body. A second one replaces it with a warning. Returns a function that removes it, unless replaced. */
  setBody(body: CameraPiece | null): () => void {
    if (this._body) {
      if (body) warnDoubleRegistration('Body', this._name);
      this.removePiece(this._body);
    }
    this._body = body;
    if (!body) return (this.removeBody = noop);
    this.pieces.add(body);
    // initialState only shapes the first activation.
    if (!this.hasRun && this.initialState?.position && 'primeFrom' in body) {
      (body as PositionPrimed).primeFrom(this.state.position);
    }
    return (this.removeBody = () => {
      if (this._body !== body) return;
      this.removePiece(body);
      this._body = null;
      this.removeBody = noop;
    });
  }

  /** Add the Aim. Like `setBody`, a second one replaces it with a warning. */
  setAim(aim: CameraPiece | null): () => void {
    if (this._aim) {
      if (aim) warnDoubleRegistration('Aim', this._name);
      this.removePiece(this._aim);
    }
    this._aim = aim;
    if (!aim) return (this.removeAim = noop);
    this.pieces.add(aim);
    if (!this.hasRun && this.initialState?.quaternion && 'primeFrom' in aim) {
      (aim as RotationPrimed).primeFrom(this.state.quaternion, this.state.referenceUp);
    }
    return (this.removeAim = () => {
      if (this._aim !== aim) return;
      this.removePiece(aim);
      this._aim = null;
      this.removeAim = noop;
    });
  }

  /** Add an Extension. They run in the order added. Returns a function that removes it. */
  addExtension(extension: CameraPiece): () => void {
    this.pieces.add(extension);
    this.extensions.add(extension);
    return () => this.removePiece(extension);
  }

  /** Add a Noise. They run in the order added, after every Extension. Returns a function that removes it. */
  addNoise(noise: CameraPiece): () => void {
    this.pieces.add(noise);
    this.noises.add(noise);
    return () => this.removePiece(noise);
  }

  /** Join `klipp`'s arbitration, or leave it with `null`. Only `KlippCore.add` and `remove` call this. */
  [attachTo](klipp: KlippCore | null): void {
    this.stopTracking?.();
    this.stopTracking = null;
    this._klipp = klipp;
    if (klipp) {
      if (!this.seeded) {
        copyCameraState(this.state, klipp.initialCameraState);
        if (this.initialState) mergeCameraState(this.state, this.initialState);
        this.seeded = true;
      }
      this.stopTracking = this.trackEvents(klipp);
    }
    this.syncRegistration();
  }

  /** Pass the viewport size, once known, on to pieces that frame by it. Called by `KlippCore` before the frame. */
  [prepare](width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    for (const piece of this.pieces) {
      if ('aspect' in piece) (piece as SizedPiece).aspect = width / height;
      if ('viewportWidth' in piece) {
        (piece as ViewportPiece).viewportWidth = width;
        (piece as ViewportPiece).viewportHeight = height;
      }
    }
  }

  /** Run the pieces for one frame, if registered. Returns `true` while one is still moving. Called by `KlippCore`. */
  [run](dt: number): boolean {
    if (!this.unregister) return false;
    const stillInFlight = this.update(this.state, dt, this.justActivated);
    this.justActivated = false;
    this.hasRun = true;
    return stillInFlight;
  }

  /** Called when a piece is removed, for layers that hold per-piece resources. */
  protected removePiece(piece: CameraPiece): void {
    this.pieces.delete(piece);
    this.extensions.delete(piece);
    this.noises.delete(piece);
  }

  private registration() {
    return { id: this._name, priority: this._priority, state: this.state, hints: this._hints };
  }

  private syncRegistration(): void {
    const shouldRegister = this._klipp !== null && this._active;
    if (shouldRegister && !this.unregister) {
      this.unregister = this._klipp![register](this.registration());
      this.justActivated = true;
    } else if (!shouldRegister && this.unregister) {
      this.unregister();
      this.unregister = null;
    }
  }

  /** Re-dispatch events for this camera only when it participates in the transition. */
  private trackEvents(core: KlippCore): () => void {
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
  }

  /** Run every piece against `out` once, in order. Each frame runs it with the camera's own state. */
  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    // Keep `=== true` semantics: some pieces return a real boolean even when typed as void.
    let stillInFlight = false;
    if (this._body?.update(out, dt, justActivated) === true) stillInFlight = true;
    if (this._aim?.update(out, dt, justActivated) === true) stillInFlight = true;
    for (const extension of this.extensions) {
      if (extension.update(out, dt, justActivated) === true) stillInFlight = true;
    }
    for (const noise of this.noises) {
      if (noise.update(out, dt, justActivated) === true) stillInFlight = true;
    }
    return stillInFlight;
  };
}
