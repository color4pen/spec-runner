/**
 * Unit tests for src/cli/spinner.ts
 *
 * TC-SP-001: createSpinner() returns { start, stop }
 * TC-SP-002: start() calls setInterval when isTTY is true
 * TC-SP-003: stop() clears the spinner line (writes \r\x1b[K to stderr)
 * TC-SP-004: stop() is a no-op when called before start()
 * TC-SP-005: stop() can be called twice without error
 * TC-SP-006: start() is a no-op when isTTY is false (non-TTY guard)
 * TC-SP-007: start() called twice only creates one interval
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSpinner } from "../../../src/cli/spinner.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStderrIsTTY(value: boolean | undefined): void {
  Object.defineProperty(process.stderr, "isTTY", {
    value,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSpinner", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stderr.isTTY;
    vi.useFakeTimers();
  });

  afterEach(() => {
    setStderrIsTTY(originalIsTTY);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("TC-SP-001: createSpinner() returns { start, stop }", () => {
    it("returns an object with start and stop methods", () => {
      const spinner = createSpinner();
      expect(typeof spinner.start).toBe("function");
      expect(typeof spinner.stop).toBe("function");
    });
  });

  describe("TC-SP-002: start() calls setInterval when isTTY is true", () => {
    it("calls setInterval when stderr is a TTY", () => {
      setStderrIsTTY(true);
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      const spinner = createSpinner();
      spinner.start();

      expect(setIntervalSpy).toHaveBeenCalledOnce();

      // Clean up
      spinner.stop();
    });
  });

  describe("TC-SP-003: stop() clears the spinner line", () => {
    it("writes \\r\\x1b[K to stderr to clear the line", () => {
      setStderrIsTTY(true);
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const spinner = createSpinner();
      spinner.start();
      spinner.stop();

      const output = writeSpy.mock.calls.map((c) => c[0] as string).join("");
      expect(output).toContain("\r\x1b[K");
    });
  });

  describe("TC-SP-004: stop() is a no-op when called before start()", () => {
    it("does not throw when stop() is called without a prior start()", () => {
      const spinner = createSpinner();
      expect(() => spinner.stop()).not.toThrow();
    });

    it("does not write to stderr when no timer is active", () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const spinner = createSpinner();
      spinner.stop();

      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe("TC-SP-005: stop() can be called twice without error", () => {
    it("calling stop() twice does not throw", () => {
      setStderrIsTTY(true);
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const spinner = createSpinner();
      spinner.start();

      expect(() => {
        spinner.stop();
        spinner.stop();
      }).not.toThrow();
    });

    it("second stop() does not write \\r\\x1b[K again", () => {
      setStderrIsTTY(true);
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const spinner = createSpinner();
      spinner.start();
      spinner.stop();

      const callCountAfterFirstStop = writeSpy.mock.calls.length;
      spinner.stop(); // second stop — should be no-op

      expect(writeSpy.mock.calls.length).toBe(callCountAfterFirstStop);
    });
  });

  describe("TC-SP-006: start() is a no-op when isTTY is false", () => {
    it("does not call setInterval when isTTY is false", () => {
      setStderrIsTTY(false);
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      const spinner = createSpinner();
      spinner.start();

      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("does not call setInterval when isTTY is undefined", () => {
      setStderrIsTTY(undefined);
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      const spinner = createSpinner();
      spinner.start();

      expect(setIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe("TC-SP-007: start() called twice creates only one interval", () => {
    it("second start() is a no-op when already running", () => {
      setStderrIsTTY(true);
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const setIntervalSpy = vi.spyOn(global, "setInterval");

      const spinner = createSpinner();
      spinner.start();
      spinner.start(); // second call — should be no-op

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      // Clean up
      spinner.stop();
    });
  });
});
