export { Klipp, useKlippCore, type KlippProps } from './Klipp';
export {
  VirtualCamera,
  useVirtualCameraSlots,
  useIsActiveVirtualCamera,
  useIsLiveVirtualCamera,
  type VirtualCameraProps,
} from './VirtualCamera';
export { VirtualCameraController, type VirtualCameraSlots, type CameraStateWriter } from './VirtualCameraController';
export { KlippCore, type VirtualCameraConfig, type KlippCoreOptions } from './KlippCore';
export { createCameraState, copyCameraState, copyCameraStateFromCamera, type CameraState } from './CameraState';
export { resolveTargetPosition, resolveTargetRotation, type Target } from './resolve/Target';
export { resolveVector3, isVector3Like } from './resolve/resolveVector3';
export { Damper, type DampingConstant } from './damping/Damper';
export { Vector3Damper } from './damping/Vector3Damper';
export { QuaternionDamper } from './damping/QuaternionDamper';

export { lerpCameraState } from './blend/lerpCameraState';
export { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition';
export { BlendHints, hasBlendHint } from './blend/BlendHints';
export { BlendCurves, type Ease } from './blend/BlendCurves';

export { Sequencer, type SequencerInstruction, type SequencerOptions } from './groups/Sequencer';
export { MixingCamera, type MixingCameraSlot } from './groups/MixingCamera';
export {
  StateDrivenCamera,
  type StateDrivenCandidate,
  type StateDrivenCameraOptions,
} from './groups/StateDrivenCamera';
export {
  ClearShot,
  type ClearShotCandidate,
  type ShotQualityEvaluator,
  type ClearShotOptions,
} from './groups/ClearShot';

export { HardLockToTarget, type HardLockToTargetProps } from './body/HardLockToTarget';
export { HardLockToTargetBody } from './body/HardLockToTargetBody';
export { Follow, type FollowProps } from './body/Follow';
export { FollowBody } from './body/FollowBody';
export { BindingModes, type BindingMode } from './body/BindingMode';
export { PositionComposer, type PositionComposerProps } from './body/PositionComposer';
export { PositionComposerBody } from './body/PositionComposerBody';
export { Body } from './body/Body';

export { HardLookAt, type HardLookAtProps } from './aim/HardLookAt';
export { HardLookAtAim } from './aim/HardLookAtAim';
export { RotateWithFollowTarget, type RotateWithFollowTargetProps } from './aim/RotateWithFollowTarget';
export { RotateWithFollowTargetAim } from './aim/RotateWithFollowTargetAim';
export { RotationComposer, type RotationComposerProps } from './aim/RotationComposer';
export { RotationComposerAim } from './aim/RotationComposerAim';
export { Aim } from './aim/Aim';

export { BasicMultiChannelPerlin, type BasicMultiChannelPerlinProps } from './noise/BasicMultiChannelPerlin';
export { BasicMultiChannelPerlinNoise } from './noise/BasicMultiChannelPerlinNoise';
export { Noise } from './noise/Noise';

export { ImpulseManager, impulseManager, type GenerateImpulseOptions } from './impulse/ImpulseManager';
export { ImpulseListenerNoise } from './impulse/ImpulseListenerNoise';
export { ImpulseListener, type ImpulseListenerProps } from './impulse/ImpulseListener';
