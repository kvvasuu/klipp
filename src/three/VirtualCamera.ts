import { vec4, type Quat, type Vec3 } from 'math';
import { Quaternion, Vector3 } from 'three';
import { BlendHints } from '../core/blend/BlendHints.js';
import { copyCameraState, createCameraState, mergeCameraState, type CameraState } from '../core/CameraState.js';
import { VirtualCameraController, type CameraStateWriter } from '../core/VirtualCameraController.js';
import type { Klipp } from './Klipp.js';
import { TargetGroup } from './extension/TargetGroup.js';
import { isVector3Like, resolveVector3, type Vector3Like } from './resolve/resolveVector3.js';
import type { Target } from './resolve/Target.js';
import type { RegisteredTarget, TargetSlot } from './resolve/TargetRegistry.js';

/** A starting pose and lens, with three.js vector shorthand. */
export type InitialCameraState = Partial<
  Omit<CameraState, 'position' | 'quaternion' | 'target' | 'lookAtTarget' | 'referenceUp'>
> & {
  position?: Vector3Like;
  quaternion?: Quaternion | Quat;
  target?: Vector3Like;
  lookAtTarget?: Vector3Like;
  referenceUp?: Vector3Like;
};

export type VirtualCameraOptions = {
  /** The active camera with the highest priority is on screen. */
  priority?: number;
  /** Whether this camera takes part in arbitration and updates. */
  active?: boolean;
  /** Blend hints for transitions involving this camera. */
  hints?: BlendHints;
  /** Starting pose, applied on creation. Defaults to the real camera's pose. */
  initialState?: InitialCameraState;
};

/** A Body, Aim, Extension or Noise: anything with an `update` that writes the camera state. */
export type CameraPiece = { update: CameraStateWriter };

type TargetReader = CameraPiece & { target: Target; targetSlot: TargetSlot | null };
type SizedPiece = CameraPiece & { aspect: number };
type ViewportPiece = CameraPiece & { viewportWidth: number; viewportHeight: number };
type PositionPrimed = CameraPiece & { primeFrom: (position: Vec3) => void };
type RotationPrimed = CameraPiece & { primeFrom: (rotation: Quat, referenceUp: Vec3) => void };

const isRegistrable = (target: Target): target is RegisteredTarget => target != null && !isVector3Like(target);
const reads = (piece: CameraPiece): piece is TargetReader => 'targetSlot' in piece;
const scratch = new Vector3();

/** `VirtualCameraController` for three.js: a shot's state, its pieces, and its place in a `Klipp`. */
export class VirtualCamera extends VirtualCameraController {
  /** This camera's own state, written by its pieces every frame. */
  readonly state: CameraState;
  readonly initialState: InitialCameraState | undefined;

  private readonly klipp: Klipp;
  private _priority: number;
  private _hints: BlendHints;
  private _active: boolean;
  private attached = false;
  private unregister: (() => void) | null = null;
  private justActivated = true;
  private _body: CameraPiece | null = null;
  private _aim: CameraPiece | null = null;
  private removeBody: () => void = noop;
  private removeAim: () => void = noop;
  private readonly pieces = new Set<CameraPiece>();
  private readonly slots = new Map<TargetReader, Target>();
  private readonly groupSlots = new Map<TargetGroup, RegisteredTarget[]>();

  constructor(klipp: Klipp, name: string, options: VirtualCameraOptions = {}) {
    super(name);
    this.klipp = klipp;
    this._priority = options.priority ?? 0;
    this._hints = options.hints ?? BlendHints.none;
    this._active = options.active ?? true;
    this.initialState = options.initialState;
    this.state = copyCameraState(createCameraState(), klipp.initialCameraState);
    if (options.initialState) seed(this.state, options.initialState);
  }

  override get name(): string {
    return super.name;
  }

  /** Renaming a registered camera registers it again under the new name. */
  override set name(name: string) {
    if (name === super.name) return;
    super.name = name;
    if (this.unregister) {
      this.unregister();
      this.unregister = this.klipp.registerCamera(this.registration());
    }
  }

  get priority(): number {
    return this._priority;
  }

  set priority(priority: number) {
    this._priority = priority;
    if (this.unregister) this.klipp.updatePriority(this.name, priority);
  }

  get hints(): BlendHints {
    return this._hints;
  }

  set hints(hints: BlendHints) {
    this._hints = hints;
    if (this.unregister) this.klipp.updateHints(this.name, hints);
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

  /**
   * Add a Body. A camera has one: a second one replaces the first, with a dev warning, since two mounted
   * Bodies are usually a mistake. The returned function removes it, unless it was replaced since.
   */
  setBody(body: CameraPiece | null): () => void {
    if (this._body) this.removePiece(this._body);
    this._body = body;
    if (!body) return (this.removeBody = noop);
    this.addPiece(body);
    if (this.initialState?.position && 'primeFrom' in body) (body as PositionPrimed).primeFrom(this.state.position);
    const unregister = this.registerBody(body.update);
    return (this.removeBody = () => {
      if (this._body !== body) return;
      unregister();
      this.removePiece(body);
      this._body = null;
      this.removeBody = noop;
    });
  }

  /** Add an Aim. Like `setBody`, a second one replaces the first with a dev warning. */
  setAim(aim: CameraPiece | null): () => void {
    if (this._aim) this.removePiece(this._aim);
    this._aim = aim;
    if (!aim) return (this.removeAim = noop);
    this.addPiece(aim);
    if (this.initialState?.quaternion && 'primeFrom' in aim) {
      (aim as RotationPrimed).primeFrom(this.state.quaternion, this.state.referenceUp);
    }
    const unregister = this.registerAim(aim.update);
    return (this.removeAim = () => {
      if (this._aim !== aim) return;
      unregister();
      this.removePiece(aim);
      this._aim = null;
      this.removeAim = noop;
    });
  }

  /** Add an Extension. They run in the order added. Returns a function that removes it. */
  addExtension(extension: CameraPiece): () => void {
    this.addPiece(extension);
    const unregister = this.registerExtension(extension.update);
    return () => {
      unregister();
      this.removePiece(extension);
    };
  }

  /** Add a Noise. They run in the order added, after every Extension. Returns a function that removes it. */
  addNoise(noise: CameraPiece): () => void {
    this.addPiece(noise);
    const unregister = this.registerNoise(noise.update);
    return () => {
      unregister();
      this.removePiece(noise);
    };
  }

  /** Join the `Klipp`'s arbitration. Called by `Klipp.add`. */
  attach(): () => void {
    this.attached = true;
    const stopTracking = this.trackEvents(this.klipp);
    this.syncRegistration();
    return () => {
      this.attached = false;
      this.syncRegistration();
      stopTracking();
    };
  }

  /** Point every piece's target at its registry slot and pass on the viewport size. Called by `Klipp`. */
  prepare(width: number, height: number): void {
    for (const piece of this.pieces) {
      if ('aspect' in piece) (piece as SizedPiece).aspect = width / height;
      if ('viewportWidth' in piece) {
        (piece as ViewportPiece).viewportWidth = width;
        (piece as ViewportPiece).viewportHeight = height;
      }
      if (reads(piece)) this.syncSlot(piece);
      if ('group' in piece && piece.group instanceof TargetGroup) this.syncGroupSlots(piece.group);
    }
  }

  /** Run the pieces for one frame, if registered. Returns `true` while one is still moving. Called by `Klipp`. */
  tick(dt: number): boolean {
    if (!this.unregister) return false;
    const stillInFlight = this.update(this.state, dt, this.justActivated);
    this.justActivated = false;
    return stillInFlight;
  }

  private registration() {
    return { id: this.name, priority: this._priority, state: this.state, hints: this._hints };
  }

  private syncRegistration(): void {
    const shouldRegister = this.attached && this._active;
    if (shouldRegister && !this.unregister) {
      this.unregister = this.klipp.registerCamera(this.registration());
      this.justActivated = true;
    } else if (!shouldRegister && this.unregister) {
      this.unregister();
      this.unregister = null;
    }
  }

  private addPiece(piece: CameraPiece): void {
    this.pieces.add(piece);
  }

  private removePiece(piece: CameraPiece): void {
    this.pieces.delete(piece);
    if (reads(piece)) {
      const target = this.slots.get(piece);
      if (target !== undefined) {
        if (isRegistrable(target)) this.klipp.targets.release(target);
        this.slots.delete(piece);
      }
      piece.targetSlot = null;
    }
    if ('group' in piece && piece.group instanceof TargetGroup) this.releaseGroupSlots(piece.group);
  }

  private syncSlot(piece: TargetReader): void {
    const { target } = piece;
    if (this.slots.has(piece) && this.slots.get(piece) === target) return;
    const previous = this.slots.get(piece);
    if (previous !== undefined && isRegistrable(previous)) this.klipp.targets.release(previous);
    this.slots.set(piece, target);
    piece.targetSlot = isRegistrable(target) ? this.klipp.targets.acquire(target) : null;
  }

  private syncGroupSlots(group: TargetGroup): void {
    const previous = this.groupSlots.get(group);
    const { members } = group;
    let count = 0;
    let changed = previous === undefined;
    for (const member of members) {
      if (!isRegistrable(member.target)) continue;
      if (!changed && previous![count] !== member.target) changed = true;
      count++;
    }
    if (!changed && previous!.length === count) return;

    this.releaseGroupSlots(group);
    const targets: RegisteredTarget[] = [];
    const slots = new Map<Target, TargetSlot>();
    for (const member of members) {
      if (!isRegistrable(member.target)) continue;
      targets.push(member.target);
      slots.set(member.target, this.klipp.targets.acquire(member.target));
    }
    this.groupSlots.set(group, targets);
    group.memberSlots = slots;
  }

  private releaseGroupSlots(group: TargetGroup): void {
    const previous = this.groupSlots.get(group);
    if (!previous) return;
    for (const target of previous) this.klipp.targets.release(target);
    this.groupSlots.delete(group);
    group.memberSlots = new Map();
  }
}

const noop = (): void => {};

/** Write `initialState` over `out`, resolving vector shorthand. */
function seed(out: CameraState, initialState: InitialCameraState): void {
  const { position, quaternion, target, lookAtTarget, referenceUp, ...rest } = initialState;
  mergeCameraState(out, rest);
  if (position) resolveVector3(scratch, position).toArray(out.position);
  if (quaternion instanceof Quaternion) quaternion.toArray(out.quaternion);
  else if (quaternion) vec4.copy(out.quaternion, quaternion);
  if (target) resolveVector3(scratch, target).toArray(out.target);
  if (lookAtTarget) resolveVector3(scratch, lookAtTarget).toArray(out.lookAtTarget);
  if (referenceUp) resolveVector3(scratch, referenceUp).toArray(out.referenceUp);
}
