import { GroupFramingExtension, type GroupFramingOptions } from '../../core/extension/GroupFramingExtension.js';
import type { GroupFramingFitMode, GroupFramingMode, GroupMember } from '../../core/extension/groupFraming.js';
import type { TargetGroup } from './TargetGroup.js';

export type { GroupFramingFitMode, GroupFramingMode, GroupFramingOptions };

/** Keeps a `TargetGroup` of `Object3D`s, refs and points inside the camera frame. */
export class GroupFramingExtensionThree extends GroupFramingExtension {
  group: TargetGroup;
  private forceSizeRecalculation = false;

  constructor(group: TargetGroup, options?: GroupFramingOptions) {
    super([], group.positionMode, options);
    this.group = group;
  }

  /** Re-measure member sizes on the next update. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  protected override readMembers(): readonly GroupMember[] {
    this.positionMode = this.group.positionMode;
    const members = this.group.resolveMembers(this.forceSizeRecalculation);
    this.forceSizeRecalculation = false;
    return members;
  }
}
