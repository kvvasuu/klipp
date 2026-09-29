/** An event as listeners receive it: its data plus `type` and the dispatching `target`. */
export type DispatchedEvent<TData, TType extends string, TTarget> = TData & {
  readonly type: TType;
  readonly target: TTarget;
};

export type EventListener<TData, TType extends string, TTarget> = (
  event: DispatchedEvent<TData, TType, TTarget>,
) => void;

type EventType<TEventMap> = Extract<keyof TEventMap, string>;
type AnyListener = (event: never) => void;

/** Typed event dispatcher with the same semantics as three.js `EventDispatcher`. */
export class EventDispatcher<TEventMap extends {} = {}> {
  // Arrays are replaced on add/remove, so dispatch can iterate them without copying.
  private readonly listeners = new Map<string, readonly AnyListener[]>();

  addEventListener<T extends EventType<TEventMap>>(type: T, listener: EventListener<TEventMap[T], T, this>): void {
    const array = this.listeners.get(type) ?? [];
    if (!array.includes(listener)) this.listeners.set(type, [...array, listener]);
  }

  hasEventListener<T extends EventType<TEventMap>>(type: T, listener: EventListener<TEventMap[T], T, this>): boolean {
    return this.listeners.get(type)?.includes(listener) ?? false;
  }

  removeEventListener<T extends EventType<TEventMap>>(type: T, listener: EventListener<TEventMap[T], T, this>): void {
    const array = this.listeners.get(type);
    if (!array?.includes(listener)) return;
    const remaining = array.filter((l) => l !== listener);
    this.listeners.set(type, remaining);
  }

  dispatchEvent<T extends EventType<TEventMap>>(event: { type: T } & TEventMap[T]): void {
    const array = this.listeners.get(event.type);
    if (!array) return;

    const dispatched = event as typeof event & { target: unknown };
    dispatched.target = this;
    for (const listener of array) (listener as (event: unknown) => void).call(this, dispatched);
    dispatched.target = null;
  }
}
