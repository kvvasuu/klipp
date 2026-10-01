export { Klipp, type KlippMode, type KlippOptions, type FrameUpdate } from './Klipp.js';
export {
  VirtualCamera,
  type VirtualCameraOptions,
  type InitialCameraState,
  type CameraPiece,
} from './VirtualCamera.js';
export { copyCameraStateFromCamera, applyCameraState, writeCameraTransform, writeCameraLens } from './camera.js';
export { readTargetPose, readTargetRotation } from './readTargetPose.js';
export { readTargetExtent } from './readTargetExtent.js';
export {
  resolveTargetPosition,
  resolveTargetRotation,
  resolveTargetSize,
  type Target,
  type RefLike,
} from './resolve/Target.js';
export { resolveVector3, resolveVec3, isVector3Like, type Vector3Like } from './resolve/resolveVector3.js';
export { TargetRegistry, type TargetSlot, type RegisteredTarget } from './resolve/TargetRegistry.js';

export { Vector3Damper } from './damping/Vector3Damper.js';
export { QuaternionDamper } from './damping/QuaternionDamper.js';
export { Predictor } from './damping/Predictor.js';

export { HardLockToTargetBody, type HardLockToTargetOptions } from './body/HardLockToTargetBody.js';
export { FollowBody, type FollowOptions } from './body/FollowBody.js';
export { PositionComposerBody, type PositionComposerOptions } from './body/PositionComposerBody.js';

export { HardLookAtAim } from './aim/HardLookAtAim.js';
export { RotateWithFollowTargetAim, type RotateWithFollowTargetOptions } from './aim/RotateWithFollowTargetAim.js';
export { RotationComposerAim, type RotationComposerOptions } from './aim/RotationComposerAim.js';
export { PanTiltAim } from './aim/PanTiltAim.js';

export { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './extension/TargetGroup.js';
export {
  GroupFramingExtension,
  type GroupFramingOptions,
  type GroupFramingFitMode,
  type GroupFramingMode,
} from './extension/GroupFramingExtension.js';

export { LensExtensionCore as LensExtension } from '../core/extension/LensExtensionCore.js';
export { BasicMultiChannelPerlinNoiseCore as BasicMultiChannelPerlinNoise } from '../core/noise/BasicMultiChannelPerlinNoiseCore.js';
export { ImpulseListenerNoiseCore as ImpulseListenerNoise } from '../core/impulse/ImpulseListenerNoiseCore.js';
