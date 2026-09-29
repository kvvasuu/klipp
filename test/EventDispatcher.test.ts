import { describe, expect, it, vi } from 'vitest';
import { EventDispatcher } from '../src/EventDispatcher';

type Events = { ping: { value: number }; pong: { label: string } };

describe('EventDispatcher', () => {
  it('calls listeners of the dispatched type with the event data and type', () => {
    const dispatcher = new EventDispatcher<Events>();
    const ping = vi.fn();
    const pong = vi.fn();
    dispatcher.addEventListener('ping', ping);
    dispatcher.addEventListener('pong', pong);

    dispatcher.dispatchEvent({ type: 'ping', value: 3 });

    expect(ping).toHaveBeenCalledOnce();
    expect(ping.mock.calls[0][0]).toMatchObject({ type: 'ping', value: 3 });
    expect(pong).not.toHaveBeenCalled();
  });

  it('sets event.target and this to the dispatcher during the call, and clears target afterwards', () => {
    const dispatcher = new EventDispatcher<Events>();
    let target: unknown;
    const listener = vi.fn((event: { target: unknown }) => {
      target = event.target;
    });
    dispatcher.addEventListener('ping', listener);
    const event = { type: 'ping' as const, value: 1 };

    dispatcher.dispatchEvent(event);

    expect(target).toBe(dispatcher);
    expect(listener.mock.contexts[0]).toBe(dispatcher);
    expect((event as { target?: unknown }).target).toBeNull();
  });

  it('ignores a listener added twice', () => {
    const dispatcher = new EventDispatcher<Events>();
    const listener = vi.fn();
    dispatcher.addEventListener('ping', listener);
    dispatcher.addEventListener('ping', listener);

    dispatcher.dispatchEvent({ type: 'ping', value: 1 });

    expect(listener).toHaveBeenCalledOnce();
  });

  it('hasEventListener and removeEventListener track listeners per type', () => {
    const dispatcher = new EventDispatcher<Events>();
    const listener = vi.fn();
    dispatcher.addEventListener('ping', listener);

    expect(dispatcher.hasEventListener('ping', listener)).toBe(true);
    expect(dispatcher.hasEventListener('pong', listener)).toBe(false);

    dispatcher.removeEventListener('pong', listener);
    expect(dispatcher.hasEventListener('ping', listener)).toBe(true);

    dispatcher.removeEventListener('ping', listener);
    dispatcher.dispatchEvent({ type: 'ping', value: 1 });
    expect(dispatcher.hasEventListener('ping', listener)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('still calls every listener when one removes itself during dispatch', () => {
    const dispatcher = new EventDispatcher<Events>();
    const second = vi.fn();
    const first = () => dispatcher.removeEventListener('ping', first);
    dispatcher.addEventListener('ping', first);
    dispatcher.addEventListener('ping', second);

    dispatcher.dispatchEvent({ type: 'ping', value: 1 });

    expect(second).toHaveBeenCalledOnce();
    expect(dispatcher.hasEventListener('ping', first)).toBe(false);
  });

  it('does not call a listener added during dispatch until the next dispatch', () => {
    const dispatcher = new EventDispatcher<Events>();
    const late = vi.fn();
    dispatcher.addEventListener('ping', () => dispatcher.addEventListener('ping', late));

    dispatcher.dispatchEvent({ type: 'ping', value: 1 });
    expect(late).not.toHaveBeenCalled();

    dispatcher.dispatchEvent({ type: 'ping', value: 2 });
    expect(late).toHaveBeenCalledOnce();
  });
});
