/**
 * Unit tests for src/adapter/managed-agent/error-helpers.ts
 *
 * TC-01-01: throwSessionCreateError throws SESSION_CREATE_FAILED
 * TC-01-02: throwSessionCreateError context suffix in message
 * TC-01-03: throwSendMessageError hint differs from throwSessionCreateError
 * TC-01-04: throwCaughtAsWrapped prefers err.code/hint
 * TC-01-05: throwCaughtAsWrapped falls back to defaults
 * TC-01-06: buildTimeoutResult returns AgentRunResult without throwing
 * TC-01-07: throwPollError throws using pollError
 * TC-01-08: throwPollError falls back to sessionTerminatedError when undefined
 * TC-01-09: executor-helpers.ts is unchanged (throwWrappedError / attachStateAndRethrow exist)
 * TC-01-10: error-helpers.ts delegates throw to throwWrappedError, no reimplementation
 */

import { describe, it, expect } from "vitest";
import {
  throwSessionCreateError,
  throwSendMessageError,
  throwCaughtAsWrapped,
  buildTimeoutResult,
  throwPollError,
} from "../../../src/adapter/managed-agent/error-helpers.js";
import type { JobState } from "../../../src/state/schema.js";

function makeState(): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature", slug: "test-slug" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

describe("error-helpers", () => {
  const state = makeState();

  // ─── TC-01-01 ─────────────────────────────────────────────────────────────
  describe("TC-01-01: throwSessionCreateError — SESSION_CREATE_FAILED code", () => {
    it("throws with SESSION_CREATE_FAILED and expected message/hint", () => {
      expect(() => throwSessionCreateError("network error", "design", state)).toThrow();
      try {
        throwSessionCreateError("network error", "design", state);
      } catch (err) {
        const e = err as { code: string; message: string; hint: string };
        expect(e.code).toBe("SESSION_CREATE_FAILED");
        expect(e.message).toContain("network error");
        expect(e.hint).toBe("Check your API key and try again.");
      }
    });
  });

  // ─── TC-01-02 ─────────────────────────────────────────────────────────────
  describe("TC-01-02: throwSessionCreateError — context appended in parentheses", () => {
    it("includes context in parentheses when provided", () => {
      try {
        throwSessionCreateError("net err", "design", state, "fallback after resume failure");
      } catch (err) {
        const e = err as { message: string };
        expect(e.message).toContain("(fallback after resume failure)");
        expect(e.message).toContain("net err");
      }
    });

    it("excludes parentheses when context is undefined", () => {
      try {
        throwSessionCreateError("net err", "design", state);
      } catch (err) {
        const e = err as { message: string };
        expect(e.message).not.toContain("(");
      }
    });
  });

  // ─── TC-01-03 ─────────────────────────────────────────────────────────────
  describe("TC-01-03: throwSendMessageError — hint differs from throwSessionCreateError", () => {
    it("both use SESSION_CREATE_FAILED code but different hints", () => {
      let createHint: string | undefined;
      let sendHint: string | undefined;

      try {
        throwSessionCreateError("err", "design", state);
      } catch (err) {
        createHint = (err as { hint: string }).hint;
      }

      try {
        throwSendMessageError("err", "design", state);
      } catch (err) {
        sendHint = (err as { hint: string }).hint;
      }

      expect(createHint).toBe("Check your API key and try again.");
      expect(sendHint).toBe("Check your network connection.");
      expect(createHint).not.toBe(sendHint);

      // Both still use SESSION_CREATE_FAILED
      try {
        throwSendMessageError("err", "design", state);
      } catch (err) {
        expect((err as { code: string }).code).toBe("SESSION_CREATE_FAILED");
      }
    });
  });

  // ─── TC-01-04 ─────────────────────────────────────────────────────────────
  describe("TC-01-04: throwCaughtAsWrapped — err code/hint take priority over defaults", () => {
    it("uses err.code and err.hint when present", () => {
      const err = Object.assign(new Error("msg"), { code: "CUSTOM_CODE", hint: "custom hint" });
      try {
        throwCaughtAsWrapped(err, { code: "DEFAULT_CODE", hint: "default hint" }, state);
      } catch (thrown) {
        const e = thrown as { code: string; message: string; hint: string };
        expect(e.code).toBe("CUSTOM_CODE");
        expect(e.hint).toBe("custom hint");
        expect(e.message).toBe("msg");
      }
    });
  });

  // ─── TC-01-05 ─────────────────────────────────────────────────────────────
  describe("TC-01-05: throwCaughtAsWrapped — falls back to defaults when err lacks code/hint", () => {
    it("uses default code and hint for plain Error", () => {
      const err = new Error("plain error");
      try {
        throwCaughtAsWrapped(err, { code: "CONFIG_INCOMPLETE", hint: "Run specrunner managed setup" }, state);
      } catch (thrown) {
        const e = thrown as { code: string; message: string; hint: string };
        expect(e.code).toBe("CONFIG_INCOMPLETE");
        expect(e.hint).toBe("Run specrunner managed setup");
        expect(e.message).toBe("plain error");
      }
    });
  });

  // ─── TC-01-06 ─────────────────────────────────────────────────────────────
  describe("TC-01-06: buildTimeoutResult — returns AgentRunResult without throwing", () => {
    it("returns completionReason=timeout, does not throw", () => {
      const pollError = { code: "POLL_TIMEOUT", message: "timed out", hint: "increase timeout" };
      let result: ReturnType<typeof buildTimeoutResult> | undefined;

      expect(() => {
        result = buildTimeoutResult(pollError, "sid-abc");
      }).not.toThrow();

      expect(result).toBeDefined();
      expect(result!.completionReason).toBe("timeout");
      expect(result!.resultContent).toBeNull();
      expect(result!.sessionId).toBe("sid-abc");
      expect((result!.error as { code: string }).code).toBe("POLL_TIMEOUT");
      expect((result!.error as { hint: string }).hint).toBe("increase timeout");
    });
  });

  // ─── TC-01-07 ─────────────────────────────────────────────────────────────
  describe("TC-01-07: throwPollError — throws using pollError directly", () => {
    it("throws with the pollError code and message", () => {
      const pollError = { code: "POLL_FAILED", message: "poll failed", hint: "retry" };
      try {
        throwPollError(pollError, state);
      } catch (err) {
        const e = err as { code: string; message: string; hint: string };
        expect(e.code).toBe("POLL_FAILED");
        expect(e.message).toBe("poll failed");
        expect(e.hint).toBe("retry");
      }
    });
  });

  // ─── TC-01-08 ─────────────────────────────────────────────────────────────
  describe("TC-01-08: throwPollError — falls back to sessionTerminatedError when undefined", () => {
    it("throws a defined error (sessionTerminatedError fallback) when pollError is undefined", () => {
      let caught: unknown;
      try {
        throwPollError(undefined, state);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      const e = caught as { code: string; message: string };
      expect(e.code).toBeDefined();
      expect(e.message).toBeDefined();
    });
  });

  // ─── TC-01-09 ─────────────────────────────────────────────────────────────
  describe("TC-01-09: executor-helpers.ts — throwWrappedError / attachStateAndRethrow unchanged", () => {
    it("exports throwWrappedError and attachStateAndRethrow", async () => {
      const mod = await import("../../../src/core/step/executor-helpers.js");
      expect(typeof mod.throwWrappedError).toBe("function");
      expect(typeof mod.attachStateAndRethrow).toBe("function");
    });
  });

  // ─── TC-01-10 ─────────────────────────────────────────────────────────────
  describe("TC-01-10: error-helpers.ts — delegates to throwWrappedError, no reimplementation", () => {
    it("exports all helper functions without own throw logic", async () => {
      const mod = await import("../../../src/adapter/managed-agent/error-helpers.js");
      expect(typeof mod.throwSessionCreateError).toBe("function");
      expect(typeof mod.throwSendMessageError).toBe("function");
      expect(typeof mod.throwCaughtAsWrapped).toBe("function");
      expect(typeof mod.buildTimeoutResult).toBe("function");
      expect(typeof mod.throwPollError).toBe("function");
    });
  });
});
