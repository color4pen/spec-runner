/**
 * Unit tests for executor-helpers.ts.
 * Tests helpers extracted from StepExecutor.
 *
 * TC-NEW-helpers-001: recordFailedStepResult pushes null-findings failure record
 * TC-NEW-helpers-002: attachStateAndRethrow attaches state and rethrows
 * TC-NEW-helpers-003: throwWrappedError creates wrapped error with code/hint/state
 * TC-NEW-helpers-004: failStepWithError: persists and throws wrapped error
 * TC-NEW-helpers-005: createSessionWithHistory — success path records history and returns sessionId
 * TC-NEW-helpers-006: createSessionWithHistory — failure path fails state, records error history, rethrows with state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createSessionWithHistory,
  recordFailedStepResult,
  attachStateAndRethrow,
  throwWrappedError,
  failStepWithError,
} from "../../../src/core/step/executor-helpers.js";
import type { SessionClient } from "../../../src/core/port/session-client.js";
import { buildInitialJobState } from "../../../src/store/job-state-store.js";
import type { JobState, ErrorInfo } from "../../../src/state/schema.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "helpers-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeState(jobId: string = "test-job-id"): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
  };
}

// TC-NEW-helpers-001: recordFailedStepResult
describe("TC-NEW-helpers-001: recordFailedStepResult", () => {
  it("pushes a step result with verdict=null and findingsPath=null", () => {
    const state = makeState();
    const errorInfo: ErrorInfo = { code: "TEST_ERROR", message: "test", hint: "hint" };

    const newState = recordFailedStepResult(state, "spec-review", errorInfo);

    const stepResults = newState.steps?.["spec-review"];
    expect(stepResults).toBeDefined();
    expect(stepResults?.length).toBe(1);
    expect(stepResults?.[0]?.outcome.verdict).toBeNull();
    expect(stepResults?.[0]?.outcome.findingsPath).toBeNull();
    expect(stepResults?.[0]?.outcome.error).toEqual(errorInfo);
  });

  it("does not mutate the original state", () => {
    const state = makeState();
    const errorInfo: ErrorInfo = { code: "TEST_ERROR", message: "test", hint: "hint" };

    const newState = recordFailedStepResult(state, "spec-review", errorInfo);

    expect(state.steps).toBeUndefined();
    expect(newState.steps?.["spec-review"]?.length).toBe(1);
  });
});

// TC-NEW-helpers-002: attachStateAndRethrow
describe("TC-NEW-helpers-002: attachStateAndRethrow", () => {
  it("attaches state to error object and rethrows", () => {
    const state = makeState();
    const err = new Error("original error");

    expect(() => attachStateAndRethrow(err, state)).toThrow("original error");
    expect((err as unknown as Record<string, unknown>)["state"]).toBe(state);
  });

  it("preserves the original error type", () => {
    class CustomError extends Error {}
    const state = makeState();
    const err = new CustomError("custom");

    expect(() => attachStateAndRethrow(err, state)).toThrow(CustomError);
  });
});

// TC-NEW-helpers-003: throwWrappedError
describe("TC-NEW-helpers-003: throwWrappedError", () => {
  it("throws an error with code, hint, and state attached", () => {
    const state = makeState();
    const errorInfo: ErrorInfo = { code: "GENERIC_ERROR_CODE_FOR_TEST", message: "timed out", hint: "retry" };

    let caught: unknown;
    try {
      throwWrappedError(errorInfo, state);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const e = caught as Error & { code: string; hint: string; state: JobState };
    expect(e.message).toBe("timed out");
    expect(e.code).toBe("GENERIC_ERROR_CODE_FOR_TEST");
    expect(e.hint).toBe("retry");
    expect(e.state).toBe(state);
  });
});

// TC-NEW-helpers-004: failStepWithError
describe("TC-NEW-helpers-004: failStepWithError", () => {
  it("records step result, marks state failed, persists, and throws", async () => {
    const state = buildInitialJobState({
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "o", name: "r" },
    });
    const store = makeStoreFactory(tempDir)(state.jobId);
    await store.persist(state);
    const errorInfo: ErrorInfo = { code: "GENERIC_ERROR_CODE_FOR_TEST", message: "timeout", hint: "retry" };
    const completedAt = new Date().toISOString();

    let caught: unknown;
    try {
      await failStepWithError(store, state, "spec-review", errorInfo, { completedAt });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    const e = caught as Error & { code: string; hint: string; state: JobState };
    expect(e.code).toBe("GENERIC_ERROR_CODE_FOR_TEST");
    expect(e.state.status).toBe("failed");
    expect(e.state.error?.code).toBe("GENERIC_ERROR_CODE_FOR_TEST");
    expect(e.state.steps?.["spec-review"]?.length).toBe(1);
  });
});

// TC-NEW-helpers-005: createSessionWithHistory — success path
describe("TC-NEW-helpers-005: createSessionWithHistory success path", () => {
  it("records started/ok history, updates state with sessionId, and returns sessionId", async () => {
    const state = buildInitialJobState({
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "o", name: "r" },
    });
    const store = makeStoreFactory(tempDir)(state.jobId);
    await store.persist(state);

    const mockClient: SessionClient = {
      createSession: vi.fn().mockResolvedValue({ sessionId: "sess-abc-123" }),
      sendUserMessage: vi.fn(),
      pollUntilComplete: vi.fn(),
      streamEvents: vi.fn(),
      getSessionUsage: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue([]),
      sendEvents: vi.fn().mockResolvedValue(undefined),
    };

    const result = await createSessionWithHistory(
      store,
      state,
      mockClient,
      {
        agentId: "agent-1",
        environmentId: "env-1",
        repoUrl: "https://github.com/owner/repo",
        githubToken: "tok",
      },
      {
        stepLabel: "session-create",
        errorCode: "SESSION_CREATE_FAILED",
        errorMessageFmt: (msg) => `Failed to create session: ${msg}`,
        errorHint: "Check your API key and try again.",
      },
    );

    expect(result.sessionId).toBe("sess-abc-123");
    expect(result.state.session?.id).toBe("sess-abc-123");
    expect(result.state.session?.agentId).toBe("agent-1");
    expect(result.state.session?.environmentId).toBe("env-1");
    expect(result.state.step).toBe("events-stream-connected");

    const history = result.state.history;
    const startedEntry = history.find((h) => h.step === "session-create" && h.status === "started");
    const okEntry = history.find((h) => h.step === "session-create" && h.status === "ok");
    expect(startedEntry).toBeDefined();
    expect(startedEntry?.message).toBe("Creating Anthropic session");
    expect(okEntry).toBeDefined();
    expect(okEntry?.message).toBe("sess-abc-123");
  });
});

// TC-NEW-helpers-006: createSessionWithHistory — failure path
describe("TC-NEW-helpers-006: createSessionWithHistory failure path", () => {
  it("fails state, appends error history, attaches state to error, and rethrows", async () => {
    const state = buildInitialJobState({
      request: { path: "/req.md", title: "Test", type: "feature" },
      repository: { owner: "o", name: "r" },
    });
    const store = makeStoreFactory(tempDir)(state.jobId);
    await store.persist(state);

    const sessionError = new Error("network failure");
    const mockClient: SessionClient = {
      createSession: vi.fn().mockRejectedValue(sessionError),
      sendUserMessage: vi.fn(),
      pollUntilComplete: vi.fn(),
      streamEvents: vi.fn(),
      getSessionUsage: vi.fn().mockResolvedValue(undefined),
      listEvents: vi.fn().mockResolvedValue([]),
      sendEvents: vi.fn().mockResolvedValue(undefined),
    };

    let caught: unknown;
    try {
      await createSessionWithHistory(
        store,
        state,
        mockClient,
        {
          agentId: "agent-1",
          environmentId: "env-1",
          repoUrl: "https://github.com/owner/repo",
          githubToken: "tok",
        },
        {
          stepLabel: "session-create",
          errorCode: "SESSION_CREATE_FAILED",
          errorMessageFmt: (msg) => `Failed to create session: ${msg}`,
          errorHint: "Check your API key and try again.",
        },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBe(sessionError);
    const attachedState = (caught as Record<string, unknown>)["state"] as JobState;
    expect(attachedState).toBeDefined();
    expect(attachedState.status).toBe("failed");
    expect(attachedState.error?.code).toBe("SESSION_CREATE_FAILED");
    expect(attachedState.error?.message).toBe("Failed to create session: network failure");

    const errorHistory = attachedState.history.find(
      (h) => h.step === "session-create" && h.status === "error",
    );
    expect(errorHistory).toBeDefined();
    expect(errorHistory?.message).toBe("network failure");
  });
});
