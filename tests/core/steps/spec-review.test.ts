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
import { runSpecReviewStep, buildFindingsPath } from "../../../src/core/steps/spec-review.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";

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

function makeBaseState(steps: JobState["steps"] = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "success",
    branch: "feat/test-branch",
    history: [],
    error: null,
    steps,
  };
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
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: sessionId, type: "session" }),
          retrieve: vi.fn().mockResolvedValue({ id: sessionId, status: "idle" }),
          events: {
            send: vi.fn().mockResolvedValue({}),
            stream: vi.fn(),
          },
        },
      },
    } as unknown as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agent: { id: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      agents: {
        propose: { id: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
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

// TC-044: iter=1 と iter=2 で別の findingsPath が記録される
describe("TC-044: spec-review step — iter=1 and iter=2 have different findingsPath", () => {
  it("records spec-review-result-001.md for iter=1 and 002.md for iter=2", async () => {
    // iter=1: state without existing spec-review steps
    const state1 = makeBaseState();
    const deps = buildDeps({ sessionId: "sess_001", verdict: "approved" });

    const state2 = await runSpecReviewStep(state1, deps);

    // Check iter=1 findings path
    const specReviewArr = state2.steps?.["spec-review"];
    expect(specReviewArr?.length).toBe(1);
    expect(specReviewArr?.[0]?.findingsPath).toBe("openspec/changes/test-slug/spec-review-result-001.md");

    // iter=2: state with existing spec-review step from iter=1
    const deps2 = buildDeps({ sessionId: "sess_002", verdict: "approved" });
    const state3 = await runSpecReviewStep(state2, deps2);

    const specReviewArr2 = state3.steps?.["spec-review"];
    expect(specReviewArr2?.length).toBe(2);
    expect(specReviewArr2?.[1]?.findingsPath).toBe("openspec/changes/test-slug/spec-review-result-002.md");
  });
});

// TC-045: iter=2 の初回メッセージに spec-review-result-002.md が含まれる (should)
describe("TC-045: spec-review step — iter=2 initial message contains spec-review-result-002.md", () => {
  it("events.send message includes spec-review-result-002.md when state has 1 existing spec-review entry", async () => {
    // Create state that already has 1 spec-review result (simulating after iter=1)
    const stateWithIter1 = makeBaseState({
      "spec-review": [
        {
          iteration: 1,
          session: null,
          verdict: "needs-fix",
          findingsPath: "openspec/changes/test-slug/spec-review-result-001.md",
          completedAt: "2026-01-01T00:00:00.000Z",
          error: null,
        },
      ],
    });

    const deps = buildDeps({ sessionId: "sess_002", verdict: "approved" });
    await runSpecReviewStep(stateWithIter1, deps);

    const sendSpy = deps.client.beta.sessions.events?.send as ReturnType<typeof vi.fn>;
    expect(sendSpy).toHaveBeenCalled();

    const sendArgs = sendSpy.mock.calls[0];
    const eventsPayload = sendArgs?.[1] as { events: Array<{ content: Array<{ text: string }> }> };
    const messageText = eventsPayload?.events?.[0]?.content?.[0]?.text ?? "";

    expect(messageText).toContain("spec-review-result-002.md");
  });
});

// TC-046: spec-review step — pushStepResult 経由で配列に append される
describe("TC-046: spec-review step — result appended as array via pushStepResult", () => {
  it("state.steps['spec-review'] is an array after runSpecReviewStep", async () => {
    const state = makeBaseState();
    const deps = buildDeps({ verdict: "approved" });

    const result = await runSpecReviewStep(state, deps);

    const specReviewArr = result.steps?.["spec-review"];
    expect(Array.isArray(specReviewArr)).toBe(true);
    expect(specReviewArr?.length).toBe(1);
    expect(specReviewArr?.[0]?.verdict).toBe("approved");
    expect(specReviewArr?.[0]?.iteration).toBe(1);
  });

  it("appends second result without overwriting first when called twice", async () => {
    const state = makeBaseState();
    const deps1 = buildDeps({ sessionId: "sess_001", verdict: "needs-fix" });

    const state2 = await runSpecReviewStep(state, deps1);

    const deps2 = buildDeps({ sessionId: "sess_002", verdict: "approved" });
    const state3 = await runSpecReviewStep(state2, deps2);

    const specReviewArr = state3.steps?.["spec-review"];
    expect(specReviewArr?.length).toBe(2);
    expect(specReviewArr?.[0]?.verdict).toBe("needs-fix");
    expect(specReviewArr?.[1]?.verdict).toBe("approved");
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
