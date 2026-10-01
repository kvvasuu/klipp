import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createGroupFramingParams,
  createGroupFramingState,
  updateGroupFraming,
  type GroupFramingFitMode,
  type GroupFramingMode,
  type GroupFramingParams,
} from '../../core/extension/groupFraming.js';
import type { TargetGroup } from './TargetGroup.js';

export type { GroupFramingFitMode, GroupFramingMode };

export type GroupFramingOptions = Partial<GroupFramingParams>;

/** Keeps a target group inside the camera frame by adjusting position and view offset. */
export class GroupFramingExtension implements GroupFramingParams {
  group: TargetGroup;
  declare padding: number;
  declare viewportWidth: number;
  declare viewportHeight: number;
  declare damping: DampingConstant;
  declare maxSpeed: number;
  declare screenPosition: [number, number];
  declare fitMode: GroupFramingFitMode;
  declare minDistance: number;
  declare maxDistance: number;
  declare framingMode: GroupFramingMode;

  readonly state = createGroupFramingState();
  private forceSizeRecalculation = false;

  constructor(group: TargetGroup, options?: GroupFramingOptions) {
    this.group = group;
    Object.assign(this, createGroupFramingParams(options));
  }

  /** Re-measure member sizes on the next update. */
  recalculateSize(): void {
    this.forceSizeRecalculation = true;
  }

  update = (out: CameraState, dt: number, justActivated: boolean): boolean => {
    const members = this.group.resolveMembers(this.forceSizeRecalculation);
    this.forceSizeRecalculation = false;
    return updateGroupFraming(out, this.state, this, members, this.group.positionMode, dt, justActivated);
  };
}
