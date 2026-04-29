/**
 * Unit tests for spec-review step (iteration-based behavior).
 * TC-044: iter=1 and iter=2 have different findingsPath (spec-review-result-001.md / 002.md) (must)
 * TC-045: iter=2 initial message contains spec-review-result-002.md (should)
 * TC-046: pushStepResult is used — result appended as array (must)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { buildFindingsPath } from "../../../src/core/step/spec-review.js";
import { toLegacyStepResult } from "../../../src/state/helpers.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-review-step-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function makePersistedJobState(steps: JobState["steps"] = {}): Promise<JobState> {
  const { createJobState, updateJobState } = await import("../../../src/state/store.js");
  const state = await createJobState({
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
  return updateJobState({
    ...state,
    step: "spec-review",
    status: "success",
    branch: "feat/test-branch",
    session: null,
    steps: steps,
  }, {});
}

function buildDeps(opts: {
  sessionId?: string;
  verdict?: "approved" | "needs-fix" | "escalation";
  fileContentOverride?: string;
} = {}): PipelineDeps {
  const {
    sessionId = "sess_spec_review_001",
    verdict = "approved",
    fileContentOverride,
  } = opts;

  const fileContent = fileContentOverride ?? `- **verdict**: ${verdict}\n\n## Findings\nNone.`;

  return {
    client: {
      createSession: vi.fn().mockResolvedValue({ sessionId }),
      sendUserMessage: vi.fn().mockResolvedValue(undefined),
      pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
      streamEvents: vi.fn().mockResolvedValue({ sseDisconnected: false, idleEndTurnDetected: true, terminated: false, terminationReason: "end_turn" }),
    } as unknown as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {
        propose: { agentId: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
        "spec-review": { agentId: "agent_spec_review", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
        "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubFetch: vi.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve(fileContent),
    }),
  };
}

async function runStep(jobState: JobState, deps: PipelineDeps): Promise<JobState> {
  const events = new EventBus();
  const executor = new StepExecutor(events);
  return executor.execute(SpecReviewStep, jobState, deps);
}

// TC-044: iter=1 と iter=2 で別の findingsPath が記録される
describe("TC-044: spec-review step — iter=1 and iter=2 have different findingsPath", () => {
  it("records spec-review-result-001.md for iter=1 and 002.md for iter=2", async () => {
    // iter=1: state without existing spec-review steps
    const state1 = await makePersistedJobState();
    const deps = buildDeps({ sessionId: "sess_001", verdict: "approved" });

    const state2 = await runStep(state1, deps);

    // Check iter=1 findings path
    const specReviewArr = state2.steps?.["spec-review"];
    expect(specReviewArr?.length).toBe(1);
    expect(specReviewArr?.[0] ? toLegacyStepResult(specReviewArr[0]).findingsPath : undefined).toBe("openspec/changes/test-slug/spec-review-result-001.md");

    // iter=2: state with existing spec-review step from iter=1
    const deps2 = buildDeps({ sessionId: "sess_002", verdict: "approved" });
    const state3 = await runStep(state2, deps2);

    const specReviewArr2 = state3.steps?.["spec-review"];
    expect(specReviewArr2?.length).toBe(2);
    expect(specReviewArr2?.[1] ? toLegacyStepResult(specReviewArr2[1]).findingsPath : undefined).toBe("openspec/changes/test-slug/spec-review-result-002.md");
  });
});

// TC-045: iter=2 の初回メッセージに spec-review-result-002.md が含まれる (should)
describe("TC-045: spec-review step — iter=2 initial message contains spec-review-result-002.md", () => {
  it("events.send message includes spec-review-result-002.md when state has 1 existing spec-review entry", async () => {
    // Create state that already has 1 spec-review result (simulating after iter=1)
    const stateWithIter1 = await makePersistedJobState({
      "spec-review": [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "needs-fix" as const, findingsPath: "openspec/changes/test-slug/spec-review-result-001.md", error: null },
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const deps = buildDeps({ sessionId: "sess_002", verdict: "approved" });
    await runStep(stateWithIter1, deps);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendSpy = (deps.client as any).sendUserMessage as ReturnType<typeof vi.fn>;
    expect(sendSpy).toHaveBeenCalled();

    const messageText = sendSpy.mock.calls[0]?.[1] as string ?? "";

    expect(messageText).toContain("spec-review-result-002.md");
  });
});

// TC-046: spec-review step — pushStepResult 経由で配列に append される
describe("TC-046: spec-review step — result appended as array via pushStepResult", () => {
  it("state.steps['spec-review'] is an array after execution", async () => {
    const state = await makePersistedJobState();
    const deps = buildDeps({ verdict: "approved" });

    const result = await runStep(state, deps);

    const specReviewArr = result.steps?.["spec-review"];
    expect(Array.isArray(specReviewArr)).toBe(true);
    expect(specReviewArr?.length).toBe(1);
    expect(specReviewArr?.[0] ? toLegacyStepResult(specReviewArr[0]).verdict : undefined).toBe("approved");
    // attempt is the analog of iteration in StepRun
    expect(specReviewArr?.[0]?.attempt).toBe(1);
  });

  it("appends second result without overwriting first when called twice", async () => {
    const state = await makePersistedJobState();
    const deps1 = buildDeps({ sessionId: "sess_001", verdict: "needs-fix" });

    const state2 = await runStep(state, deps1);

    const deps2 = buildDeps({ sessionId: "sess_002", verdict: "approved" });
    const state3 = await runStep(state2, deps2);

    const specReviewArr = state3.steps?.["spec-review"];
    expect(specReviewArr?.length).toBe(2);
    expect(specReviewArr?.[0] ? toLegacyStepResult(specReviewArr[0]).verdict : undefined).toBe("needs-fix");
    expect(specReviewArr?.[1] ? toLegacyStepResult(specReviewArr[1]).verdict : undefined).toBe("approved");
  });
});

// Verify buildFindingsPath helper
describe("buildFindingsPath — filename format", () => {
  it("produces spec-review-result-001.md for iteration=1", () => {
    expect(buildFindingsPath("my-slug", 1)).toBe("openspec/changes/my-slug/spec-review-result-001.md");
  });

  it("produces spec-review-result-010.md for iteration=10", () => {
    expect(buildFindingsPath("my-slug", 10)).toBe("openspec/changes/my-slug/spec-review-result-010.md");
  });
});
