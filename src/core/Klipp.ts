import {
  cameraLensEquals,
  cameraTransformEquals,
  copyCameraState,
  createCameraState,
  type CameraState,
} from './CameraState.js';
import { EventDispatcher } from './EventDispatcher.js';
import { blendTargetId } from './blend/blend.js';
import type { BlendDefinition, CustomBlend } from './blend/BlendDefinition.js';
import type { BlendHints } from './blend/BlendHints.js';
import {
  DEFAULT_BLEND,
  createKlippState,
  registerKlippCamera,
  setKlippHints,
  setKlippPriority,
  tickKlipp,
  unregisterKlippCamera,
  type CameraTransitionEventMap,
  type KlippParams,
  type VirtualCameraConfig,
} from './klippState.js';

import { advance, attachTo, checkName, prepare, register, run, setHints, setPriority } from './internal.js';
import { VirtualCamera, type VirtualCameraOptions } from './VirtualCamera.js';

export type { CameraTransitionEventMap, VirtualCameraConfig };

/** `'enabled'` writes the output, `'standby'` keeps every camera updating without writing, `'disabled'` stops. */
export type KlippMode = 'enabled' | 'standby' | 'disabled';

/** Per-frame work that runs before the cameras, like input. Return `true` while it is still moving. */
export type FrameUpdate = (dt: number) => boolean | void;

export type KlippOptions = {
  /** Used when no `customBlends` entry matches a from→to transition. */
  defaultBlend?: BlendDefinition;
  customBlends?: CustomBlend[];
  mode?: KlippMode;
  /** The pose and lens new virtual cameras start from. */
  initialCameraState?: CameraState;
};

/** Runs virtual cameras, picks the winner by priority and blends between shots. */
export class Klipp extends EventDispatcher<CameraTransitionEventMap> {
  readonly state = createKlippState();
  /** The pose and lens new virtual cameras start from. */
  readonly initialCameraState: CameraState;
  mode: KlippMode;

  protected readonly cameras = new Set<VirtualCamera>();
  private readonly updates = new Set<FrameUpdate>();
  private readonly previousResult = createCameraState();
  private settled = false;
  private _width = 0;
  private _height = 0;
  private readonly params: KlippParams;
  private readonly activeIdListeners = new Set<() => void>();
  private readonly liveIdListeners = new Set<() => void>();
  private draining = false;

  constructor(options: KlippOptions = {}) {
    super();
    this.mode = options.mode ?? 'enabled';
    this.initialCameraState = options.initialCameraState ?? createCameraState();
    this.params = {
      defaultBlend: options.defaultBlend ?? DEFAULT_BLEND,
      customBlends: options.customBlends ?? [],
    };
  }

  setDefaultBlend(defaultBlend?: BlendDefinition): void {
    this.params.defaultBlend = defaultBlend ?? DEFAULT_BLEND;
  }

  setCustomBlends(customBlends?: CustomBlend[]): void {
    this.params.customBlends = customBlends ?? [];
  }

  get activeCameraId(): string | null {
    return this.state.activeId;
  }

  isActive(id: string): boolean {
    return this.state.activeId === id;
  }

  /** Subscribe to active camera changes. */
  subscribeActiveId = (listener: () => void): (() => void) => {
    this.activeIdListeners.add(listener);
    return () => this.activeIdListeners.delete(listener);
  };

  /** The last shot `update` wrote. Read it after `update` to put it on your camera. */
  get shot(): CameraState {
    return this.previousResult;
  }

  /** The active camera's raw state. */
  get activeState(): CameraState | null {
    return this.state.activeId !== null ? this.state.cameras.get(this.state.activeId)!.state : null;
  }

  /** Camera currently settled in the output. */
  get liveCameraId(): string | null {
    return this.state.blend.liveId;
  }

  isLive(id: string): boolean {
    return this.state.blend.liveId === id;
  }

  /** Subscribe to live camera changes. */
  subscribeLiveId = (listener: () => void): (() => void) => {
    this.liveIdListeners.add(listener);
    return () => this.liveIdListeners.delete(listener);
  };

  get isBlending(): boolean {
    return this.state.blend.transition.active;
  }

  /** Destination of the active blend, or the live camera when settled. */
  get blendTargetId(): string | null {
    return blendTargetId(this.state.blend);
  }

  /** Whether the core has produced a real camera output. */
  get hasEverActivated(): boolean {
    return this.state.blend.hasEverActivated;
  }

  /** Register a camera and return an unregister callback. */
  [register](config: VirtualCameraConfig): () => void {
    const camera = registerKlippCamera(this.state, config);
    this.drainEvents();
    return () => {
      unregisterKlippCamera(this.state, camera);
      this.drainEvents();
    };
  }

  /** Update a candidate priority without restarting the current blend. */
  [setPriority](id: string, priority: number): void {
    setKlippPriority(this.state, id, priority);
    this.drainEvents();
  }

  /** Update candidate hints in place. */
  [setHints](id: string, hints: BlendHints): void {
    setKlippHints(this.state, id, hints);
  }

  /** Viewport width in pixels, `0` until `setSize`. */
  get width(): number {
    return this._width;
  }

  /** Viewport height in pixels, `0` until `setSize`. */
  get height(): number {
    return this._height;
  }

  /** Set the viewport size in pixels. Pieces that frame by screen size get it every frame from then on. */
  setSize(width: number, height: number): void {
    this._width = width;
    this._height = height;
  }

  /** Create a virtual camera and add it. */
  addCamera(name: string, options?: VirtualCameraOptions): VirtualCamera {
    const camera = new VirtualCamera(name, options);
    this.add(camera);
    return camera;
  }

  /** Add a virtual camera, moving it from any other `Klipp`. Returns a function that removes it. */
  add(camera: VirtualCamera): () => void {
    if (camera.klipp !== this) {
      camera.klipp?.remove(camera);
      this[checkName](camera);
      this.cameras.add(camera);
      camera[attachTo](this);
    }
    return () => this.remove(camera);
  }

  /** Remove a virtual camera. It leaves the arbitration, and the shot blends to the next winner. */
  remove(camera: VirtualCamera): void {
    if (!this.cameras.delete(camera)) return;
    camera[attachTo](null);
  }

  [checkName](camera: VirtualCamera): void {
    for (const other of this.cameras) {
      if (other !== camera && other.name === camera.name) {
        console.warn(
          `Two virtual cameras are named "${camera.name}". Names must be unique: blends and events use them.`,
        );
        return;
      }
    }
  }

  /**
   * Call `start` while `camera` is on screen, and the function it returns once it leaves, for example to connect
   * input. With `waitForBlend`, on screen begins once the blend into it has finished. Returns a function that stops.
   */
  whileOnScreen(camera: VirtualCamera, start: () => () => void, { waitForBlend = true } = {}): () => void {
    let stop: (() => void) | null = null;
    const check = () => {
      const onScreen = this.isActive(camera.name) && (!waitForBlend || this.isLive(camera.name));
      if (onScreen && !stop) stop = start();
      else if (!onScreen && stop) {
        stop();
        stop = null;
      }
    };
    const offActive = this.subscribeActiveId(check);
    const offLive = this.subscribeLiveId(check);
    check();
    return () => {
      offActive();
      offLive();
      stop?.();
      stop = null;
    };
  }

  /** Run `update` every frame before the cameras. Returns a function that stops it. */
  registerUpdate(update: FrameUpdate): () => void {
    this.updates.add(update);
    return () => this.updates.delete(update);
  }

  /**
   * Advance one frame: run every camera, pick and blend the shot, and `write` it when it changed.
   * Returns `true` while something is still moving, so on-demand rendering knows to request another frame.
   */
  update(dt: number): boolean {
    if (this.mode === 'disabled') return false;

    this.prepareFrame();
    // Keep `=== true` semantics: some writers return a real boolean value even when typed as void.
    let stillInFlight = false;
    for (const update of this.updates) {
      if (update(dt) === true) stillInFlight = true;
    }
    for (const camera of this.cameras) {
      if (camera[run](dt)) stillInFlight = true;
    }
    const result = this[advance](dt);

    // Standby stays warm but never writes.
    if (this.mode === 'standby') return stillInFlight || this.isBlending;
    // Do not write the untouched initial state before any camera has gone live.
    if (!this.hasEverActivated) return stillInFlight;

    const previous = this.previousResult;
    const transformChanged = !this.settled || !cameraTransformEquals(result, previous);
    const lensChanged = !this.settled || !cameraLensEquals(result, previous);
    if (!transformChanged && !lensChanged) return stillInFlight;

    copyCameraState(previous, result);
    this.settled = true;
    this.write(result, transformChanged, lensChanged);
    return true;
  }

  /** Runs at the start of every frame, before any camera. Layers override it to read their targets. */
  protected prepareFrame(): void {
    for (const camera of this.cameras) camera[prepare](this._width, this._height);
  }

  /** Called with the output whenever it changed. Layers override it to write their camera. */
  protected write(_result: CameraState, _transformChanged: boolean, _lensChanged: boolean): void {}

  /** Advance the blend and return the reusable output state. */
  [advance](dt: number): CameraState {
    const result = tickKlipp(this.state, this.params, dt);
    this.drainEvents();
    return result;
  }

  /** Notify subscribers and listeners of buffered events, including ones raised while notifying. */
  private drainEvents(): void {
    if (this.draining) return;
    this.draining = true;
    const events = this.state.events;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.type === 'activeIdChanged') for (const listener of this.activeIdListeners) listener();
      else if (event.type === 'liveIdChanged') for (const listener of this.liveIdListeners) listener();
      else this.dispatchEvent(event);
    }
    events.length = 0;
    this.draining = false;
  }
}
