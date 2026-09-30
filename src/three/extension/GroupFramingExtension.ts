import type { CameraState } from '../../core/CameraState.js';
import type { DampingConstant } from '../../core/damping/Damper.js';
import {
  createGroupFramingState,
  updateGroupFraming,
  type GroupFramingFitMode,
  type GroupFramingMode,
  type GroupFramingParams,
} from '../../core/extension/groupFraming.js';
import type { TargetGroup } from './TargetGroup.js';

export type { GroupFramingFitMode, GroupFramingMode };

/** Keeps a target group inside the camera frame by adjusting position and view offset. */
export class GroupFramingExtension implements GroupFramingParams {
  group: TargetGroup;
  padding: number;
  viewportWidth: number;
  viewportHeight: number;
  damping: DampingConstant;
  maxSpeed: number;
  screenPosition: [number, number];
  fitMode: GroupFramingFitMode;
  minDistance: number;
  maxDistance: number;
  framingMode: GroupFramingMode;

  readonly state = createGroupFramingState();
  private forceSizeRecalculation = false;

  constructor(
    group: TargetGroup,
    padding = 0,
    viewportWidth = 1,
    viewportHeight = 1,
    damping: DampingConstant = 0,
    screenPosition: [number, number] = [0, 0],
    fitMode: GroupFramingFitMode = 'ceiling',
    minDistance = 0,
    maxDistance = Infinity,
    framingMode: GroupFramingMode = 'horizontalAndVertical',
    maxSpeed = Infinity,
  ) {
    this.group = group;
    this.padding = padding;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.damping = damping;
    this.screenPosition = screenPosition;
    this.fitMode = fitMode;
    this.minDistance = minDistance;
    this.maxDistance = maxDistance;
    this.framingMode = framingMode;
    this.maxSpeed = maxSpeed;
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
