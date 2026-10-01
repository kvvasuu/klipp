/** Fills `defaults` with every value of `settings` that isn't `undefined`, and returns it. */
export function withDefaults<T extends object>(defaults: T, settings: Partial<T> | undefined): T {
  if (!settings) return defaults;
  for (const key in defaults) {
    const value = settings[key];
    if (value !== undefined) defaults[key] = value as T[typeof key];
  }
  return defaults;
}
