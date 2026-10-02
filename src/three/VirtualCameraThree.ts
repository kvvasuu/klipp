import { vec4, type Quat } from 'math';
import { Quaternion, Vector3 } from 'three';
import type { CameraState } from '../core/CameraState.js';
import { VirtualCamera, type CameraPiece, type VirtualCameraOptions } from '../core/VirtualCamera.js';
import { attachTo, prepare } from '../core/internal.js';
import type { Klipp } from '../core/Klipp.js';
import type { KlippThree } from './KlippThree.js';
import { TargetGroup } from './extension/TargetGroup.js';
import { isVector3Like, resolveVector3, type Vector3Like } from './resolve/resolveVector3.js';
import type { Target } from './resolve/Target.js';
import type { RegisteredTarget, TargetRegistry, TargetSlot } from './resolve/TargetRegistry.js';

export type { CameraPiece };

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

export type VirtualCameraThreeOptions = Omit<VirtualCameraOptions, 'initialState'> & {
  /** Starting pose, applied on creation. Defaults to the real camera's pose. */
  initialState?: InitialCameraState;
};

type TargetReader = CameraPiece & { target: Target; targetSlot: TargetSlot | null };

const isRegistrable = (target: Target): target is RegisteredTarget => target != null && !isVector3Like(target);
const reads = (piece: CameraPiece): piece is TargetReader => 'targetSlot' in piece;
const scratch = new Vector3();

/** `VirtualCamera` for three.js: points every piece's target at its slot in the `KlippThree`'s registry. */
export class VirtualCameraThree extends VirtualCamera {
  /** The target registry of the `KlippThree` this camera is in. */
  private registry: TargetRegistry | null = null;
  private readonly slots = new Map<TargetReader, Target>();
  private readonly groupSlots = new Map<TargetGroup, RegisteredTarget[]>();

  constructor(name: string, options: VirtualCameraThreeOptions = {}) {
    super(name, { ...options, initialState: options.initialState && resolveInitialState(options.initialState) });
  }

  override [attachTo](klipp: Klipp | null): void {
    this.releaseSlots();
    super[attachTo](klipp);
    this.registry = klipp && 'targets' in klipp ? (klipp as KlippThree).targets : null;
  }

  override [prepare](width: number, height: number): void {
    super[prepare](width, height);
    for (const piece of this.pieces) {
      if (reads(piece)) this.syncSlot(piece);
      if ('group' in piece && piece.group instanceof TargetGroup) this.syncGroupSlots(piece.group);
    }
  }

  protected override removePiece(piece: CameraPiece): void {
    super.removePiece(piece);
    if (reads(piece)) {
      const target = this.slots.get(piece);
      if (target !== undefined) {
        if (isRegistrable(target)) this.registry?.release(target);
        this.slots.delete(piece);
      }
      piece.targetSlot = null;
    }
    if ('group' in piece && piece.group instanceof TargetGroup) this.releaseGroupSlots(piece.group);
  }

  private releaseSlots(): void {
    for (const [piece, target] of this.slots) {
      if (isRegistrable(target)) this.registry?.release(target);
      piece.targetSlot = null;
    }
    this.slots.clear();
    for (const group of [...this.groupSlots.keys()]) this.releaseGroupSlots(group);
  }

  private syncSlot(piece: TargetReader): void {
    if (!this.registry) return;
    const { target } = piece;
    if (this.slots.has(piece) && this.slots.get(piece) === target) return;
    const previous = this.slots.get(piece);
    if (previous !== undefined && isRegistrable(previous)) this.registry.release(previous);
    this.slots.set(piece, target);
    piece.targetSlot = isRegistrable(target) ? this.registry.acquire(target) : null;
  }

  private syncGroupSlots(group: TargetGroup): void {
    if (!this.registry) return;
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
      slots.set(member.target, this.registry.acquire(member.target));
    }
    this.groupSlots.set(group, targets);
    group.memberSlots = slots;
  }

  private releaseGroupSlots(group: TargetGroup): void {
    const previous = this.groupSlots.get(group);
    if (!previous) return;
    for (const target of previous) this.registry?.release(target);
    this.groupSlots.delete(group);
    group.memberSlots = new Map();
  }
}

/** `initialState` with every vector shorthand resolved to tuples. */
function resolveInitialState(initialState: InitialCameraState): Partial<CameraState> {
  const { position, quaternion, target, lookAtTarget, referenceUp, ...rest } = initialState;
  const resolved: Partial<CameraState> = { ...rest };
  if (position) resolved.position = resolveVector3(scratch, position).toArray();
  if (quaternion instanceof Quaternion) resolved.quaternion = quaternion.toArray() as Quat;
  else if (quaternion) resolved.quaternion = vec4.clone(quaternion) as Quat;
  if (target) resolved.target = resolveVector3(scratch, target).toArray();
  if (lookAtTarget) resolved.lookAtTarget = resolveVector3(scratch, lookAtTarget).toArray();
  if (referenceUp) resolved.referenceUp = resolveVector3(scratch, referenceUp).toArray();
  return resolved;
}
