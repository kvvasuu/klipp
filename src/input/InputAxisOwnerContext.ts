import { createContext } from 'react';
import type { InputAxis } from './InputAxis';

/** Anything a `<InputController>` can drive - any Body/Aim/Extension exposing named `InputAxis` instances */
export type InputAxisOwner = {
  readonly inputAxes: Record<string, InputAxis>;
};

/** Set by a Body/Aim/Extension around its `children`, so a nested `<InputController>` finds its `inputAxes` */
export const InputAxisOwnerContext = createContext<InputAxisOwner | null>(null);
