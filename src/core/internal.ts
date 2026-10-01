// Not exported from the package: what only cameras and their KlippCore call on each other.

/** Connect a camera to a `KlippCore`, or disconnect it with `null`. */
export const attachTo = Symbol('attachTo');
/** Register a raw state in a `KlippCore`'s arbitration. Returns a function that unregisters it. */
export const register = Symbol('register');
export const setPriority = Symbol('setPriority');
export const setHints = Symbol('setHints');
/** Advance a `KlippCore`'s arbitration and blend, without running any camera. */
export const advance = Symbol('advance');
/** Warn when another camera in a `KlippCore` already has this camera's name. */
export const checkName = Symbol('checkName');
/** Pass the viewport size on to a camera's pieces. */
export const prepare = Symbol('prepare');
/** Run a camera's pieces for one frame. */
export const run = Symbol('run');
