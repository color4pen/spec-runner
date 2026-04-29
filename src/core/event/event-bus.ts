import type { DomainEvent, Payload } from "./types.js";

type HandlerFn<E extends DomainEvent> = (payload: Payload<E>) => void;

/**
 * EventBus: synchronous publish/subscribe bus for domain events.
 *
 * Design D6: minimal reservation-seat implementation.
 * v1 ships with subscriber=0; learning layer is out of scope.
 *
 * emit() is synchronous — all handlers complete before emit() returns.
 */
export class EventBus {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- handler sets use unknown shape
  private readonly handlers = new Map<DomainEvent, Set<(payload: unknown) => void>>();

  /**
   * Register a handler for a domain event.
   */
  on<E extends DomainEvent>(event: E, handler: HandlerFn<E>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as (payload: unknown) => void);
  }

  /**
   * Emit a domain event synchronously.
   * All registered handlers are called in registration order.
   * If no handlers are registered, the call is a no-op.
   */
  emit<E extends DomainEvent>(event: E, payload: Payload<E>): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;
    for (const handler of eventHandlers) {
      handler(payload);
    }
  }

  /**
   * Remove a previously registered handler.
   */
  off<E extends DomainEvent>(event: E, handler: HandlerFn<E>): void {
    this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }
}
