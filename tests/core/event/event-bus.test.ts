/**
 * Unit tests for src/core/event/event-bus.ts — EventBus.
 *
 * must-area: subscribe / emit (TC-070 through TC-076)
 * TC-070: on() + emit() — handler called with correct payload
 * TC-071: emit() with no handlers — no-op (does not throw)
 * TC-072: multiple handlers for same event — all called in order
 * TC-073: off() — removes handler, no longer called on emit
 * TC-074: multiple event types — handlers isolated per event
 * TC-075: emit() is synchronous — all handlers complete before emit returns
 * TC-076: EventBus subscriber=0 is valid (ADR D6: reservation seat)
 */
import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { DomainEvent } from "../../../src/core/event/types.js";

// TC-070: on() + emit() — handler called with correct payload
describe("TC-070: EventBus — on() + emit(): handler called with payload", () => {
  it("calls registered handler with the emitted payload", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on("pipeline:start", handler);
    bus.emit("pipeline:start", { state: { jobId: "test" } as never });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ state: { jobId: "test" } });
  });
});

// TC-071: emit() with no handlers — no-op (does not throw)
describe("TC-071: EventBus — emit() with no handlers: no-op", () => {
  it("does not throw when no handlers are registered for the event", () => {
    const bus = new EventBus();

    expect(() => {
      bus.emit("step:start", { step: "propose", state: {} as never });
    }).not.toThrow();
  });
});

// TC-072: multiple handlers for same event — all called in registration order
describe("TC-072: EventBus — multiple handlers: all called in registration order", () => {
  it("calls all handlers in the order they were registered", () => {
    const bus = new EventBus();
    const callOrder: number[] = [];

    bus.on("step:complete", () => callOrder.push(1));
    bus.on("step:complete", () => callOrder.push(2));
    bus.on("step:complete", () => callOrder.push(3));

    bus.emit("step:complete", { step: "spec-review", state: {} as never });

    expect(callOrder).toEqual([1, 2, 3]);
  });
});

// TC-073: off() — removes handler, no longer called on emit
describe("TC-073: EventBus — off(): removes handler", () => {
  it("handler is not called after off() is invoked", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on("pipeline:complete", handler);
    bus.off("pipeline:complete", handler);
    bus.emit("pipeline:complete", { state: {} as never });

    expect(handler).not.toHaveBeenCalled();
  });

  it("other handlers remain registered after off() removes one", () => {
    const bus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on("pipeline:complete", handler1);
    bus.on("pipeline:complete", handler2);
    bus.off("pipeline:complete", handler1);
    bus.emit("pipeline:complete", { state: {} as never });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledOnce();
  });
});

// TC-074: multiple event types — handlers isolated per event
describe("TC-074: EventBus — handlers isolated per event type", () => {
  it("emitting one event does not trigger handlers for another event", () => {
    const bus = new EventBus();
    const startHandler = vi.fn();
    const completeHandler = vi.fn();

    bus.on("pipeline:start", startHandler);
    bus.on("pipeline:complete", completeHandler);

    bus.emit("pipeline:start", { state: {} as never });

    expect(startHandler).toHaveBeenCalledOnce();
    expect(completeHandler).not.toHaveBeenCalled();
  });
});

// TC-075: emit() is synchronous — all handlers complete before emit returns
describe("TC-075: EventBus — emit() is synchronous", () => {
  it("handlers are called synchronously before emit() returns", () => {
    const bus = new EventBus();
    let sideEffect = 0;

    bus.on("verdict:parsed", () => {
      sideEffect = 42;
    });

    // sideEffect must be 0 before emit and 42 immediately after
    expect(sideEffect).toBe(0);
    bus.emit("verdict:parsed", { step: "spec-review", outcome: { verdict: "approved" } });
    expect(sideEffect).toBe(42);
  });
});

// TC-076: EventBus subscriber=0 is valid (ADR D6: reservation seat)
describe("TC-076: EventBus — subscriber=0: reservation seat is valid", () => {
  it("all lifecycle events can be emitted with 0 subscribers without error", () => {
    const bus = new EventBus();

    const events: Array<{ event: DomainEvent; payload: unknown }> = [
      { event: "pipeline:start",    payload: { state: {} } },
      { event: "pipeline:complete", payload: { state: {} } },
      { event: "pipeline:fail",     payload: { state: {}, reason: "test" } },
      { event: "step:start",        payload: { step: "propose", state: {} } },
      { event: "step:complete",     payload: { step: "propose", state: {} } },
      { event: "step:error",        payload: { step: "propose", error: new Error("test"), state: {} } },
      { event: "verdict:parsed",    payload: { step: "spec-review", outcome: { verdict: "approved" } } },
    ];

    for (const { event, payload } of events) {
      expect(() => bus.emit(event as DomainEvent, payload as never)).not.toThrow();
    }
  });
});
