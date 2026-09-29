export { copyCameraStateFromCamera, applyCameraState, writeCameraTransform, writeCameraLens } from './camera';
export { readTargetPose } from './readTargetPose';
export {
  resolveTargetPosition,
  resolveTargetRotation,
  resolveTargetSize,
  type Target,
  type RefLike,
} from './resolve/Target';
export { resolveVector3, resolveVec3, isVector3Like, type Vector3Like } from './resolve/resolveVector3';
export { TargetRegistry, type TargetSlot, type RegisteredTarget } from './resolve/TargetRegistry';

export { Vector3Damper } from './damping/Vector3Damper';
export { QuaternionDamper } from './damping/QuaternionDamper';
export { Predictor } from './damping/Predictor';

export { HardLockToTargetBody } from './body/HardLockToTargetBody';
export { FollowBody } from './body/FollowBody';
export { PositionComposerBody } from './body/PositionComposerBody';

export { HardLookAtAim } from './aim/HardLookAtAim';
export { RotateWithFollowTargetAim } from './aim/RotateWithFollowTargetAim';
export { RotationComposerAim } from './aim/RotationComposerAim';
export { PanTiltAim } from './aim/PanTiltAim';

export { BasicMultiChannelPerlinNoise } from './noise/BasicMultiChannelPerlinNoise';
export {
  ImpulseField,
  impulseField,
  ImpulseShapes,
  type GenerateImpulseOptions,
  type ImpulseShape,
} from './impulse/ImpulseField';
export { ImpulseListenerNoise } from './impulse/ImpulseListenerNoise';

export { TargetGroup, type TargetGroupMember, type TargetGroupPositionMode } from './extension/TargetGroup';
export {
  GroupFramingExtension,
  type GroupFramingFitMode,
  type GroupFramingMode,
} from './extension/GroupFramingExtension';
