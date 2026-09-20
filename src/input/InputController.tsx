import { useThree } from '@react-three/fiber';
import { createContext, use, useEffect, useImperativeHandle, useState, type Ref, type RefObject } from 'react';
import { useKlippUpdateRegistry } from '../Klipp';
import { useIsActiveVirtualCamera, useIsLiveVirtualCamera } from '../VirtualCamera';
import type { InputAxis } from './InputAxis';
import { InputAxisController, type InputAxisControllerConfig, type InputInvert } from './InputAxisController';
import type { InteractiveArea } from './InputSystem';

/** Anything a `<InputController>` can drive - any Body/Aim/Extension exposing named `InputAxis` instances */
export type InputAxisOwner = {
  readonly inputAxes: Record<string, InputAxis>;
};

/** Set by a Body/Aim/Extension around its `children`, so a nested `<InputController>` finds its `inputAxes` */
export const InputAxisOwnerContext = createContext<InputAxisOwner | null>(null);

export type InputSourceConfig = {
  /** Names into the target's `inputAxes`, e.g. `{ x: 'pan', y: 'tilt' }`. */
  axes: { x: string; y: string };
  /** Multiplies the raw delta before it reaches the axes. Default 1. */
  gain?: number;
  invert?: InputInvert;
};

export type InputControllerProps = {
  /** Which `InputAxisOwner` to drive - defaults to the nearest `InputAxisOwnerContext`. */
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
  /** Wait for an in-progress blend into this camera before listening to input. Default `true`. */
  waitForBlend?: boolean;
  /** Suppresses the native right-click context menu. Default `false`. */
  suppressContextMenu?: boolean;
  /** Restricts drag/wheel start to a normalized rect of the element's bounds. Default `null` (whole element). */
  interactiveArea?: InteractiveArea | null;
  /** Commits a diagonal two-finger touch gesture to whichever of pinch/rotate dominates, zeroing the
   *  other, instead of feeding both at once. Default `false`. */
  lockTouchAxis?: boolean;
  /** Imperative access to the underlying `InputAxisController` */
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

/**
 * Generic JSX wiring for `InputAxisController` - resolves its target's named `inputAxes` against each
 * source's `axes: { x, y }` names. Works with any Body/Aim/Extension that exposes `inputAxes`
 */
export function InputController(props: InputControllerProps) {
  const {
    target,
    waitForBlend = true,
    suppressContextMenu = false,
    interactiveArea = null,
    lockTouchAxis = false,
    ref,
  } = props;
  const contextOwner = use(InputAxisOwnerContext);
  const registerUpdate = useKlippUpdateRegistry();
  const isActive = useIsActiveVirtualCamera();
  const isLive = useIsLiveVirtualCamera();
  const shouldConnect = isActive && (waitForBlend ? isLive : true);
  const domElement = useThree((state) => state.gl.domElement);

  const [controller] = useState(() => new InputAxisController(emptyConfig));
  useImperativeHandle(ref, () => controller, [controller]);

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
