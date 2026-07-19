/**
 * TC-016: signalCleanup calls markSignalHandlerFired() before the first await.
 *
 * Validates the ordering contract in local.ts:registerCleanup():
 *   const signalCleanup = async (): Promise<void> => {
 *     markSignalHandlerFired();      ← synchronous, before any await
 *     try {
 *       const store = makeStore();
 *       const current = await store.load();  ← first await
 *       ...
 *
 * The test mocks store.load to capture isSignalHandlerFired() at the exact
 * moment it is called, then asserts the flag was already true.
 *
 * This ordering is a future-edit risk: if markSignalHandlerFired() is moved
 * to after the first await, exit-guard's beforeExit handler can fire between
 * the signal and the flag set, causing a duplicate interruption record.
 *
 * TC-016b: signalCleanup performs a checkpoint (commitFinalState + pushEvidenceAnchor)
 * when the job has a branch and a journalAnchor is set. This prevents false tamper
 * detection on the next resume for SIGINT/SIGTERM-stopped jobs that had a prior
 * checkpoint (durable anchor). Without the checkpoint, on-disk > origin anchor →
 * verifyResumeJournalAuthenticity returns "tamper" → 1st resume blocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalRuntime } from "../local.js";
import { JobStateStore, type NormalizedJobState } from "../../../store/job-state-store.js";
import { JournalAnchorHolder } from "../../../store/journal-anchor.js";
import {
  isSignalHandlerFired,
  resetSignalHandlerFiredForTest,
} from "../../lifecycle/signal-state.js";

// vi.mock is hoisted by Vitest — intercepts imports inside local.ts.
vi.mock("../../step/commit-push.js", () => ({
  commitAndPush: vi.fn().mockResolvedValue(undefined),
  commitFinalState: vi.fn().mockResolvedValue(undefined),
  commitScopedPaths: vi.fn().mockResolvedValue(undefined),
  commitJournalArtifacts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../git/evidence-anchor-ref.js", () => ({
  readEvidenceAnchor: vi.fn().mockResolvedValue({ kind: "absent" }),
  pushEvidenceAnchor: vi.fn().mockResolvedValue(undefined),
}));

// Import the mocked functions so we can assert on them.
// These imports resolve to the mocked module (hoisting ensures this).
import { commitFinalState } from "../../step/commit-push.js";
import { pushEvidenceAnchor } from "../../../git/evidence-anchor-ref.js";

// Minimal fake state that satisfies transitionJob("running" → "awaiting-resume")
function makeFakeState(jobId: string, branch: string | null = null): NormalizedJobState {
  return {
    version: 2,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", type: "new-feature", title: "test", slug: "tc016-slug" },
    repository: { owner: "test", name: "test" },
    session: null,
    step: "implementer",
    status: "running",
    pid: null,
    branch,
    history: [],
    error: null,
    steps: {},
  } as unknown as NormalizedJobState;
}

describe("TC-016: signalCleanup marks signal handler fired before first await", () => {
  beforeEach(() => {
    resetSignalHandlerFiredForTest();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetSignalHandlerFiredForTest();
  });

  it("isSignalHandlerFired() is true when store.load() is invoked (before first await resolves)", async () => {
    const jobId = "tc016-00-0000-0000-000000000001";

    // Capture the signal-handler flag state at the moment store.load() is called
    let signalStateDuringLoad: boolean | null = null;
    vi.spyOn(JobStateStore.prototype, "load").mockImplementation(async () => {
      signalStateDuringLoad = isSignalHandlerFired();
      return makeFakeState(jobId);
    });

    // Suppress downstream I/O (appendInterruption, persist) — best-effort anyway
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);

    // Prevent actual process termination
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    // Build runtime with private workspace/slug fields populated so makeStore() works
    const runtime = new LocalRuntime({ cwd: "/tmp/tc016-repo", githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = "tc016-slug";
    rt["workspace"] = { cwd: "/tmp/tc016-repo", worktreePath: undefined };

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // store.load must have been called (sanity check)
    expect(signalStateDuringLoad).not.toBeNull();
    // And the flag must have been set before load was called
    expect(signalStateDuringLoad).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-016b: signal checkpoint prevents false tamper on resume
// ---------------------------------------------------------------------------

describe("TC-016b: signalCleanup performs checkpoint when branch and journalAnchor are set", () => {
  beforeEach(() => {
    resetSignalHandlerFiredForTest();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetSignalHandlerFiredForTest();
  });

  it("TC-016b: commitFinalState + pushEvidenceAnchor called after persist when branch is set", async () => {
    // Design F-01: signal handler must commit+push journal (commitFinalState) and update
    // the durable anchor (pushEvidenceAnchor) so that the next resume does not see
    // on-disk > origin anchor → false tamper detection.
    const jobId = "tc016b-00-0000-0000-000000000001";
    const BRANCH = "change/test-branch-abc12345";
    const SLUG = "tc016-slug";
    const CWD = "/tmp/tc016b-repo";

    // Pre-seed the anchor holder (simulates a prior checkpoint: anchor is established)
    const journalAnchor = new JournalAnchorHolder();
    journalAnchor.seed('{"type":"step-run"}\n', '{"version":2,"status":"running"}');

    // State has a branch — triggers the checkpoint code path
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(jobId, BRANCH));
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = new LocalRuntime({ cwd: CWD, githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = SLUG;
    rt["workspace"] = { cwd: CWD, worktreePath: undefined };
    // Inject journalAnchor — the fix wires this into makeStore and the signal checkpoint
    rt["journalAnchor"] = journalAnchor;

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // commitFinalState MUST be called with the job's branch and slug (signal checkpoint)
    expect(commitFinalState).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: CWD,
        branch: BRANCH,
        slug: SLUG,
        messageLabel: "checkpoint",
      }),
    );

    // pushEvidenceAnchor MUST be called to update the durable anchor to match
    // the post-signal on-disk state, preventing false tamper on next resume
    expect(pushEvidenceAnchor).toHaveBeenCalledWith(
      expect.any(Function), // wrappedSpawnFn
      CWD,
      BRANCH,
      expect.any(String),  // anchor digest (from journalAnchor.snapshot())
    );
  });

  it("TC-016b: no checkpoint attempted when branch is null (pre-branch job)", async () => {
    // Guard: no checkpoint when branch is absent (no anchor to push to)
    const jobId = "tc016b-01-0000-0000-000000000001";
    const SLUG = "tc016-slug";
    const CWD = "/tmp/tc016b-repo";

    const journalAnchor = new JournalAnchorHolder();
    journalAnchor.seed('{"type":"step-run"}\n', '{"version":2,"status":"running"}');

    // State has branch: null — checkpoint should NOT fire
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(jobId, null));
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const runtime = new LocalRuntime({ cwd: CWD, githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = SLUG;
    rt["workspace"] = { cwd: CWD, worktreePath: undefined };
    rt["journalAnchor"] = journalAnchor;

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // No checkpoint: branch is null
    expect(commitFinalState).not.toHaveBeenCalled();
    expect(pushEvidenceAnchor).not.toHaveBeenCalled();
  });

  it("TC-016b: no checkpoint attempted when journalAnchor is absent", async () => {
    // Guard: no checkpoint when journalAnchor is not set (no anchor to derive digest from)
    const jobId = "tc016b-02-0000-0000-000000000001";
    const BRANCH = "change/test-branch-abc12345";
    const SLUG = "tc016-slug";
    const CWD = "/tmp/tc016b-repo";

    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue(makeFakeState(jobId, BRANCH));
    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    // No journalAnchor injected
    const runtime = new LocalRuntime({ cwd: CWD, githubClient: {} as never });
    const rt = runtime as unknown as Record<string, unknown>;
    rt["currentSlug"] = SLUG;
    rt["workspace"] = { cwd: CWD, worktreePath: undefined };
    // rt["journalAnchor"] is undefined by default

    const handle = runtime.registerCleanup(jobId, "implementer");
    const { signalCleanup } = handle as unknown as { signalCleanup: () => Promise<void> };

    await signalCleanup();

    // No checkpoint: journalAnchor is absent
    expect(commitFinalState).not.toHaveBeenCalled();
    expect(pushEvidenceAnchor).not.toHaveBeenCalled();
  });
});
