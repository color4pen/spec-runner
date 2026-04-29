/**
 * Unit tests for src/core/loop.ts — runLoopUntil.
 * TC-001 through TC-009 (must: TC-001 through TC-006; should: TC-007 through TC-009)
 * TC-053: PipelineDeps is imported from types.ts, not pipeline.ts (circular import elimination)
 * TC-064: maxIterations=1 with needs-fix triggers onExceeded immediately
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runLoopUntil } from "../../src/core/loop.js";
import type { JobState } from "../../src/state/schema.js";
import type { PipelineDeps } from "../../src/core/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "loop-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "feat/test-branch",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agent: { id: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
  };
}

// TC-001: runLoopUntil — iter=1 で approved → 即 exit
describe("TC-001: runLoopUntil — iter=1 approved: exits immediately", () => {
  it("calls body once and returns, stdout contains approved done message", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    const body = vi.fn().mockResolvedValue({
      ...state,
      steps: {
        "spec-review": [
          { iteration: 1, session: null, verdict: "approved", findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    });

    const result = await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    expect(body).toHaveBeenCalledTimes(1);
    expect(result.steps?.["spec-review"]?.[0]?.verdict).toBe("approved");

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("[iter 1] spec-review verdict: approved → done");
  });
});

// TC-002: runLoopUntil — iter=1 で escalation → fixer 起動なしで exit
describe("TC-002: runLoopUntil — iter=1 escalation: exits without running iter=2", () => {
  it("calls body once and halts, stdout contains escalation halt message", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    const body = vi.fn().mockResolvedValue({
      ...state,
      steps: {
        "spec-review": [
          { iteration: 1, session: null, verdict: "escalation", findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    });

    await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    expect(body).toHaveBeenCalledTimes(1);

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("[iter 1] spec-review verdict: escalation → halt");
    // Ensure iter 2 was not started
    expect(stdout).not.toContain("[iter 2/2]");
  });
});

// TC-003: runLoopUntil — needs-fix で iter < maxIterations → iter+1 で body 再実行
describe("TC-003: runLoopUntil — needs-fix triggers next iteration", () => {
  it("calls body twice when iter=1 needs-fix and iter=2 approved", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    let callCount = 0;
    const body = vi.fn().mockImplementation(async (s: JobState) => {
      callCount++;
      const verdict = callCount === 1 ? "needs-fix" : "approved";
      return {
        ...s,
        steps: {
          "spec-review": [
            ...(s.steps?.["spec-review"] ?? []),
            { iteration: callCount, session: null, verdict, findingsPath: null, completedAt: "2026-01-01", error: null },
          ],
        },
      };
    });

    const result = await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    expect(body).toHaveBeenCalledTimes(2);
    expect(result.steps?.["spec-review"]?.length).toBe(2);
    expect(result.steps?.["spec-review"]?.[1]?.verdict).toBe("approved");

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("[iter 1] spec-review verdict: needs-fix → spawning fixer");
  });
});

// TC-004: runLoopUntil — maxIterations 到達で onExceeded を呼んで exit
describe("TC-004: runLoopUntil — maxIterations reached: calls onExceeded", () => {
  it("calls onExceeded once when all iterations return needs-fix", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    const body = vi.fn().mockImplementation(async (s: JobState) => ({
      ...s,
      steps: {
        "spec-review": [
          ...(s.steps?.["spec-review"] ?? []),
          { iteration: (s.steps?.["spec-review"]?.length ?? 0) + 1, session: null, verdict: "needs-fix" as const, findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    }));

    const onExceeded = vi.fn().mockImplementation(async (s: JobState) => ({
      ...s,
      error: { code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "exhausted", hint: "" },
    }));

    const result = await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
      onExceeded,
    });

    expect(onExceeded).toHaveBeenCalledTimes(1);
    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("[iter 2/2] retries exhausted, escalating");
  });
});

// TC-005: runLoopUntil — writeJobState を呼ばない
describe("TC-005: runLoopUntil — does not call writeJobState itself", () => {
  it("loop primitive does not persist state", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    // Spy on the store module for writeJobState
    const storeModule = await import("../../src/state/store.js");
    const persistSpy = vi.spyOn(storeModule, "persistJobState");

    let callCount = 0;
    const body = vi.fn().mockImplementation(async (s: JobState) => {
      callCount++;
      const verdict = callCount === 1 ? "needs-fix" : "approved";
      return {
        ...s,
        steps: {
          "spec-review": [
            ...(s.steps?.["spec-review"] ?? []),
            { iteration: callCount, session: null, verdict, findingsPath: null, completedAt: "2026-01-01", error: null },
          ],
        },
      };
    });

    await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    // The loop itself must not call persistJobState
    expect(persistSpy).not.toHaveBeenCalled();
    // Body was called twice (needs-fix → approved)
    expect(body).toHaveBeenCalledTimes(2);
  });
});

// TC-006: runLoopUntil — state.history に iter 開始/終了 entry が append される
describe("TC-006: runLoopUntil — appends iter start/end history entries", () => {
  it("adds started and ok entries to state.history for approved iteration", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const body = vi.fn().mockImplementation(async (s: JobState) => ({
      ...s,
      steps: {
        "spec-review": [
          { iteration: 1, session: null, verdict: "approved" as const, findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    }));

    const result = await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    const history = result.history;
    const startEntry = history.find((h) => h.step === "spec-review" && h.status === "started");
    const endEntry = history.find((h) => h.step === "spec-review" && h.status === "ok");

    expect(startEntry).toBeDefined();
    expect(endEntry).toBeDefined();
  });
});

// TC-007: runLoopUntil — needs-fix 時の history status は "warning"
describe("TC-007: runLoopUntil — needs-fix history status is 'warning'", () => {
  it("records warning for needs-fix and ok for approved", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let callCount = 0;
    const body = vi.fn().mockImplementation(async (s: JobState) => {
      callCount++;
      const verdict = callCount === 1 ? "needs-fix" : "approved";
      return {
        ...s,
        steps: {
          "spec-review": [
            ...(s.steps?.["spec-review"] ?? []),
            { iteration: callCount, session: null, verdict, findingsPath: null, completedAt: "2026-01-01", error: null },
          ],
        },
      };
    });

    const result = await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    const history = result.history;
    const specReviewEntries = history.filter((h) => h.step === "spec-review");
    // iter 1: started + warning; iter 2: started + ok
    const warningEntry = specReviewEntries.find((h) => h.status === "warning");
    const okEntry = specReviewEntries.find((h) => h.status === "ok");

    expect(warningEntry).toBeDefined();
    expect(okEntry).toBeDefined();
  });
});

// TC-008: runLoopUntil — escalation 時の history status は "error"
describe("TC-008: runLoopUntil — escalation history status is 'error'", () => {
  it("records error status for escalation", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const body = vi.fn().mockImplementation(async (s: JobState) => ({
      ...s,
      steps: {
        "spec-review": [
          { iteration: 1, session: null, verdict: "escalation" as const, findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    }));

    const result = await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 2,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    const history = result.history;
    const errorEntry = history.find((h) => h.step === "spec-review" && h.status === "error");
    expect(errorEntry).toBeDefined();
  });
});

// TC-009: runLoopUntil — stdout フォーマット: iter 開始行
describe("TC-009: runLoopUntil — stdout format: iter start line", () => {
  it("outputs '[iter 1/3] starting spec-review' when maxIterations=3", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    const body = vi.fn().mockImplementation(async (s: JobState) => ({
      ...s,
      steps: {
        "spec-review": [
          { iteration: 1, session: null, verdict: "approved" as const, findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    }));

    await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 3,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
    });

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("[iter 1/3] starting spec-review");
  });
});

// TC-053: loop.ts does not import from pipeline.ts (circular import elimination)
describe("TC-053: loop.ts imports PipelineDeps from types.ts, not pipeline.ts", () => {
  it("loop.ts source does not contain import from pipeline.js or pipeline.ts", async () => {
    const loopSource = await fs.readFile(
      path.resolve(import.meta.dirname, "../../src/core/loop.ts"),
      "utf-8",
    );
    // Must not import from pipeline.ts or pipeline.js
    expect(loopSource).not.toMatch(/from ['"]\.\.\/pipeline\.js['"]/);
    expect(loopSource).not.toMatch(/from ['"]\.\/pipeline\.js['"]/);
    expect(loopSource).not.toMatch(/from ['"]\.\.\/pipeline['"]/);
    expect(loopSource).not.toMatch(/from ['"]\.\/pipeline['"]/);
  });
});

// TC-064: runLoopUntil — maxIterations=1 で iter=1 needs-fix → onExceeded を即呼ぶ
describe("TC-064: runLoopUntil — maxIterations=1 with needs-fix calls onExceeded immediately", () => {
  it("calls onExceeded after iter=1 needs-fix, no iter=2", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stdoutLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutLines.push(String(chunk));
      return true;
    });

    const body = vi.fn().mockImplementation(async (s: JobState) => ({
      ...s,
      steps: {
        "spec-review": [
          { iteration: 1, session: null, verdict: "needs-fix" as const, findingsPath: null, completedAt: "2026-01-01", error: null },
        ],
      },
    }));

    const onExceeded = vi.fn().mockImplementation(async (s: JobState) => s);

    await runLoopUntil(state, deps, {
      loopName: "spec-review",
      maxIterations: 1,
      body,
      evaluator: (s) => ({ verdict: s.steps?.["spec-review"]?.[s.steps["spec-review"]!.length - 1]?.verdict ?? "escalation" }),
      onExceeded,
    });

    expect(onExceeded).toHaveBeenCalledTimes(1);
    expect(body).toHaveBeenCalledTimes(1);

    const stdout = stdoutLines.join("");
    expect(stdout).toContain("[iter 1/1] retries exhausted, escalating");
  });
});
