import type { Quat, Vec3 } from 'math';
import type { RefObject } from 'react';
import { Quaternion, Vector3, type Object3D } from 'three';

/** A target whose world transform comes from the scene graph. */
export type RegisteredTarget = Object3D | RefObject<Object3D | null>;

/** A target's world transform for the current frame. `valid` is false while a ref is empty. */
export type TargetSlot = {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  valid: boolean;
};

type Entry = { target: RegisteredTarget; count: number; slot: TargetSlot };

const scratchPosition = new Vector3();
const scratchRotation = new Quaternion();
const scratchScale = new Vector3();

/**
 * Resolves each registered target once per frame, however many stages and cameras read it.
 * Two different refs to the same object get two slots.
 */
export class TargetRegistry {
  private readonly entries: Entry[] = [];
  private readonly byTarget = new Map<RegisteredTarget, Entry>();

  /** Register a reader of `target` and return its slot. The same target shares one slot. */
  acquire(target: RegisteredTarget): TargetSlot {
    let entry = this.byTarget.get(target);
    if (!entry) {
      entry = {
        target,
        count: 0,
        slot: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], valid: false },
      };
      this.byTarget.set(target, entry);
      this.entries.push(entry);
    }
    entry.count++;
    return entry.slot;
  }

  /** Unregister a reader. Unused entries are dropped on the next `refresh()`, so a re-`acquire` keeps the slot. */
  release(target: RegisteredTarget): void {
    const entry = this.byTarget.get(target);
    if (entry && entry.count > 0) entry.count--;
  }

  has(target: RegisteredTarget): boolean {
    return this.byTarget.has(target);
  }

  /** Read every registered target's world transform. Call once per frame, before any stage runs. */
  refresh(): void {
    let kept = 0;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.count === 0) {
        this.byTarget.delete(entry.target);
        continue;
      }
      this.entries[kept++] = entry;

      const object = 'current' in entry.target ? entry.target.current : entry.target;
      const slot = entry.slot;
      slot.valid = object != null;
      if (!object) continue;

      object.updateWorldMatrix(true, false);
      object.matrixWorld.decompose(scratchPosition, scratchRotation, scratchScale);
      scratchPosition.toArray(slot.position);
      scratchRotation.toArray(slot.rotation);
      scratchScale.toArray(slot.scale);
    }
    this.entries.length = kept;
  }
}
