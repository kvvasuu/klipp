export {
  createCameraState,
  copyCameraState,
  mergeCameraState,
  cameraTransformEquals,
  cameraLensEquals,
  type CameraState,
} from './CameraState.js';
export { createTargetPose, type TargetPose } from './TargetPose.js';
export { createTargetExtent, projectTargetExtent, type TargetExtent } from './TargetExtent.js';
export { EventDispatcher, type DispatchedEvent, type EventListener } from './EventDispatcher.js';
export {
  VirtualCameraCore,
  type VirtualCameraCoreOptions,
  type CameraPiece,
  type CameraStateWriter,
} from './VirtualCameraCore.js';
export {
  KlippCore,
  type VirtualCameraConfig,
  type KlippCoreOptions,
  type KlippMode,
  type FrameUpdate,
  type CameraTransitionEventMap,
} from './KlippCore.js';
export {
  createKlippState,
  registerKlippCamera,
  unregisterKlippCamera,
  setKlippPriority,
  setKlippHints,
  tickKlipp,
  DEFAULT_BLEND,
  type KlippState,
  type KlippCamera,
  type KlippEvent,
  type KlippParams,
} from './klippState.js';

export {
  Damper,
  damp,
  createDamperState,
  resetDamper,
  type DamperState,
  type DampingConstant,
} from './damping/Damper.js';
export {
  dampVector3,
  createVector3DamperState,
  resetVector3Damper,
  type Vector3DamperState,
} from './damping/dampVector3.js';
export { dampQuaternion } from './damping/dampQuaternion.js';
export {
  addPredictorPosition,
  predictPositionDelta,
  createPredictorState,
  resetPredictor,
  type PredictorState,
} from './damping/predictor.js';

export { lerpCameraState } from './blend/lerpCameraState.js';
export { BlendDriver } from './blend/BlendDriver.js';
export {
  createBlendState,
  setBlendTarget,
  tickBlend,
  forgetBlendCandidate,
  blendTargetId,
  type BlendState,
  type BlendTransition,
} from './blend/blend.js';
export { resolveBlendDefinition, type BlendDefinition, type CustomBlend } from './blend/BlendDefinition.js';
export { BlendHints, hasBlendHint } from './blend/BlendHints.js';
export { BlendCurves, type Ease } from './blend/BlendCurves.js';

export {
  Sequencer,
  tickSequencer,
  createSequencerState,
  sequencerIndex,
  type SequencerInstruction,
  type SequencerOptions,
  type SequencerParams,
  type SequencerState,
} from './groups/Sequencer.js';
export { MixingCamera, mixCameraStates, type MixingCameraSlot } from './groups/MixingCamera.js';
export {
  StateDrivenCamera,
  setDrivingState,
  tickStateDriven,
  createStateDrivenState,
  type StateDrivenCandidate,
  type StateDrivenCameraOptions,
  type StateDrivenParams,
  type StateDrivenState,
} from './groups/StateDrivenCamera.js';
export {
  ClearShot,
  tickClearShot,
  createClearShotState,
  type ClearShotCandidate,
  type ShotQualityEvaluator,
  type ClearShotOptions,
  type ClearShotParams,
  type ClearShotState,
} from './groups/ClearShot.js';

export { BindingModes, type BindingMode } from './body/BindingModes.js';
export {
  updateFollow,
  primeFollow,
  createFollowState,
  createFollowParams,
  followNeedsTargetRotation,
  type FollowParams,
  type FollowState,
} from './body/follow.js';
export {
  updateHardLockToTarget,
  createHardLockToTargetState,
  createHardLockToTargetParams,
  type HardLockToTargetParams,
  type HardLockToTargetState,
} from './body/hardLockToTarget.js';
export {
  updatePositionComposer,
  primePositionComposer,
  retargetPositionComposer,
  createPositionComposerState,
  createPositionComposerParams,
  type PositionComposerParams,
  type PositionComposerState,
} from './body/positionComposer.js';
export { updateHardLookAt } from './aim/hardLookAt.js';
export {
  updateRotateWithFollowTarget,
  primeRotateWithFollowTarget,
  createRotateWithFollowTargetState,
  createRotateWithFollowTargetParams,
  type RotateWithFollowTargetParams,
  type RotateWithFollowTargetState,
} from './aim/rotateWithFollowTarget.js';
export { updatePanTilt, seedPanTilt, createPanTiltState, type PanTiltState } from './aim/panTilt.js';
export {
  updateRotationComposer,
  primeRotationComposer,
  retargetRotationComposer,
  createRotationComposerState,
  createRotationComposerParams,
  rotationComposerNeedsExtent,
  type RotationComposerParams,
  type RotationComposerState,
} from './aim/rotationComposer.js';

export { composerDebugZones, groupFramingPaddingBox, type DebugZone } from './debug/debugZones.js';
export { LensExtension, type LensOptions } from './extension/LensExtension.js';
export { updateLens, createLensState, createLensParams, type LensParams, type LensState } from './extension/lens.js';
export {
  updateGroupFraming,
  horizontalHalfFov,
  computeGroupBounds,
  createGroupFramingState,
  createGroupFramingParams,
  createGroupMember,
  type GroupMember,
  type GroupPositionMode,
  type GroupFramingParams,
  type GroupFramingState,
  type GroupFramingFitMode,
  type GroupFramingMode,
} from './extension/groupFraming.js';
export {
  InputAxis,
  createInputAxisParams,
  applyAxisDelta,
  updateAxis,
  resetAxis,
  normalizeAxis,
  type InputAxisData,
  type InputAxisParams,
  type InputAxisRecentering,
} from './input/InputAxis.js';
export { createConsumedInput, type ConsumedInput } from './input/consumedInput.js';
export {
  feedInputAxes,
  type InputAxisControllerConfig,
  type InputAxisPair,
  type InputInvert,
  type InputSourceMapping,
} from './input/inputMapping.js';

export { BasicMultiChannelPerlinNoise, type PerlinNoiseOptions } from './noise/BasicMultiChannelPerlinNoise.js';
export {
  updatePerlinNoise,
  createPerlinNoiseState,
  createPerlinNoiseParams,
  type PerlinNoiseParams,
  type PerlinNoiseState,
} from './noise/perlinNoise.js';
export { ImpulseField, impulseField } from './impulse/ImpulseField.js';
export {
  ImpulseListenerNoise,
  createImpulseListenerParams,
  type ImpulseListenerOptions,
  type ImpulseListenerParams,
} from './impulse/ImpulseListenerNoise.js';
export {
  ImpulseShapes,
  generateImpulse,
  sampleImpulses,
  pruneImpulses,
  createImpulseFieldState,
  impulseNow,
  type GenerateImpulseOptions,
  type ImpulseShape,
  type ImpulseEvent,
  type ImpulseFieldState,
  type ImpulseClockSeconds,
} from './impulse/impulses.js';
