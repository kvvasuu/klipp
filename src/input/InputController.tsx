import { useThree } from '@react-three/fiber';
import { use, useEffect, useImperativeHandle, useState, type Ref, type RefObject } from 'react';
import { useKlipp } from '../KlippContext';
import { useIsActiveVirtualCamera, useIsLiveVirtualCamera } from '../VirtualCameraContext';
import type { InputAxis } from './InputAxis';
import { InputAxisController, type InputAxisControllerConfig, type InputInvert } from './InputAxisController';
import { InputAxisOwnerContext, type InputAxisOwner } from './InputAxisOwnerContext';
import type { InteractiveArea } from './InputSystem';

export type InputSourceConfig = {
  /** Axis names to drive for each source. */
  axes: { x: string; y: string };
  /** Multiplies the raw delta before it reaches the axes. */
  gain?: number;
  invert?: InputInvert;
};

export type InputControllerProps = {
  /** Axis owner to drive. Uses the nearest context when omitted. */
  target?: RefObject<InputAxisOwner | null>;
  mouseButtons?: {
    left?: InputSourceConfig | null;
    right?: InputSourceConfig | null;
    middle?: InputSourceConfig | null;
  };
  touches?: {
    one?: InputSourceConfig | null;
    two?: InputSourceConfig | null;
    three?: InputSourceConfig | null;
  };
  /** Wait until this camera is live before listening to input. */
  waitForBlend?: boolean;
  /** Whether input processing is enabled. */
  enabled?: boolean;
  /** Suppresses the native right-click context menu. */
  suppressContextMenu?: boolean;
  /** Restricts drag/wheel start to a normalized rect of the element's bounds. */
  interactiveArea?: InteractiveArea | null;
  /** Lock diagonal two-finger input to pinch or rotation. */
  lockTouchAxis?: boolean;
  ref?: Ref<InputAxisController>;
};

function resolveAxis(owner: InputAxisOwner, name: string): InputAxis | null {
  const axis = owner.inputAxes[name];
  if (!axis) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`<InputController>: no axis named "${name}" on target's inputAxes.`);
    }
    return null;
  }
  return axis;
}

function resolveSource(owner: InputAxisOwner, source: InputSourceConfig | null | undefined) {
  if (!source) return null;
  const x = resolveAxis(owner, source.axes.x);
  const y = resolveAxis(owner, source.axes.y);
  if (!x || !y) return null;
  return { axes: { x, y }, gain: source.gain, invert: source.invert };
}

function buildConfig(owner: InputAxisOwner, props: InputControllerProps): InputAxisControllerConfig {
  return {
    mouseButtons: {
      left: resolveSource(owner, props.mouseButtons?.left),
      right: resolveSource(owner, props.mouseButtons?.right),
      middle: resolveSource(owner, props.mouseButtons?.middle),
    },
    touches: {
      one: resolveSource(owner, props.touches?.one),
      two: resolveSource(owner, props.touches?.two),
      three: resolveSource(owner, props.touches?.three),
    },
  };
}

const emptyConfig: InputAxisControllerConfig = {
  mouseButtons: { left: null, right: null, middle: null },
  touches: { one: null, two: null, three: null },
};

/** Connects DOM input sources to named axes on a camera component. */
export function InputController(props: InputControllerProps) {
  const {
    target,
    waitForBlend = true,
    enabled = true,
    suppressContextMenu = false,
    interactiveArea = null,
    lockTouchAxis = false,
    ref,
  } = props;
  const contextOwner = use(InputAxisOwnerContext);
  const { registerUpdate } = useKlipp();
  const isActive = useIsActiveVirtualCamera();
  const isLive = useIsLiveVirtualCamera();
  const shouldConnect = isActive && (waitForBlend ? isLive : true);
  const domElement = useThree((state) => state.gl.domElement);

  const [controller] = useState(() => new InputAxisController(emptyConfig));
  useImperativeHandle(ref, () => controller, [controller]);

  controller.enabled = enabled;
  controller.inputSystem.suppressContextMenu = suppressContextMenu;
  controller.inputSystem.interactiveArea = interactiveArea;
  controller.inputSystem.lockTouchAxis = lockTouchAxis;

  useEffect(() => {
    const owner = target?.current ?? contextOwner;
    if (owner) controller.config = buildConfig(owner, props);
  });

  useEffect(() => registerUpdate(() => controller.update()), [registerUpdate, controller]);

  useEffect(() => {
    if (!shouldConnect) return;
    controller.connect(domElement);
    return () => controller.disconnect();
  }, [controller, domElement, shouldConnect]);

  return null;
}
