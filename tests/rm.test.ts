/**
 * Tests for `specrunner rm` command.
 *
 * Covers:
 * - deleteJobState: normal deletion / ENOENT idempotent / other errors thrown
 * - removeSingleJob: failed job deleted / running rejected / running+force allowed /
 *                    awaiting-merge rejected / awaiting-merge+force allowed
 * - removeSingleJob managed mode: session cleanup success / session cleanup failure → warning + continue
 * - removeAllTerminated: target filter / --yes skips prompt / 0 targets early return
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as nodefs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createJobState, deleteJobState } from "../src/state/store.js";
import { removeSingleJob, removeAllTerminated } from "../src/core/rm/runner.js";
import type { SpecRunnerConfig } from "../src/config/schema.js";
import type Anthropic from "@anthropic-ai/sdk";

// ---------- Test fixtures ----------

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await nodefs.mkdtemp(path.join(os.tmpdir(), "specrunner-rm-test-"));
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
  await nodefs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Create a job state with a specific status patched directly into the file. */
async function makeJob(
  status: "running" | "awaiting-merge" | "failed" | "terminated" | "archived" = "failed",
  sessionId?: string,
) {
  const state = await createJobState({
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
  });

  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  const statePath = path.join(jobsDir, `${state.jobId}.json`);
  const raw = JSON.parse(await nodefs.readFile(statePath, "utf-8"));
  raw.status = status;
  if (sessionId) {
    raw.session = { id: sessionId, agentId: "agent-1", environmentId: "env-1" };
  }
  await nodefs.writeFile(statePath, JSON.stringify(raw, null, 2));
  return { jobId: state.jobId };
}

/** Minimal SpecRunnerConfig stub for local runtime. */
function makeLocalConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
  };
}

/** Minimal SpecRunnerConfig stub for managed runtime. */
function makeManagedConfig(): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "managed",
    agents: {},
  };
}

// ---------- deleteJobState ----------

describe("deleteJobState", () => {
  it("deletes an existing state file", async () => {
    const { jobId } = await makeJob("failed");
    const statePath = path.join(tempDir, "specrunner", "jobs", `${jobId}.json`);

    // File should exist before deletion
    await expect(nodefs.stat(statePath)).resolves.toBeTruthy();

    await deleteJobState(jobId);

    // File should not exist after deletion
    await expect(nodefs.access(statePath)).rejects.toThrow();
  });

  it("is idempotent on ENOENT (already deleted)", async () => {
    await expect(deleteJobState("nonexistent-job-id-abc123")).resolves.toBeUndefined();
  });

  it("propagates non-ENOENT errors", async () => {
    // Use real filesystem: make the jobs directory non-writable so unlink fails with EACCES.
    const { jobId } = await makeJob("failed");
    const jobsDir = path.join(tempDir, "specrunner", "jobs");
    await nodefs.chmod(jobsDir, 0o555);
    try {
      await expect(deleteJobState(jobId)).rejects.toThrow();
    } finally {
      // Restore write permission so afterEach cleanup can remove tempDir
      await nodefs.chmod(jobsDir, 0o755);
    }
  });
});

// ---------- removeSingleJob ----------

describe("removeSingleJob — status gate (local mode)", () => {
  it("succeeds for a failed job", async () => {
    const { jobId } = await makeJob("failed");
    const result = await removeSingleJob({ jobId, force: false, config: makeLocalConfig() });
    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(1);

    // State file should be gone
    const statePath = path.join(tempDir, "specrunner", "jobs", `${jobId}.json`);
    await expect(nodefs.access(statePath)).rejects.toThrow();
  });

  it("succeeds for a terminated job", async () => {
    const { jobId } = await makeJob("terminated");
    const result = await removeSingleJob({ jobId, force: false, config: makeLocalConfig() });
    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(1);
  });

  it("succeeds for an archived job", async () => {
    const { jobId } = await makeJob("archived");
    const result = await removeSingleJob({ jobId, force: false, config: makeLocalConfig() });
    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(1);
  });

  it("rejects a running job without --force", async () => {
    const { jobId } = await makeJob("running");
    const result = await removeSingleJob({ jobId, force: false, config: makeLocalConfig() });
    expect(result.exitCode).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.message).toBe("Job is still running. Use --force to override.");
  });

  it("allows a running job with --force", async () => {
    const { jobId } = await makeJob("running");
    const result = await removeSingleJob({ jobId, force: true, config: makeLocalConfig() });
    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(1);
  });

  it("rejects an awaiting-merge job without --force", async () => {
    const { jobId } = await makeJob("awaiting-merge");
    const result = await removeSingleJob({ jobId, force: false, config: makeLocalConfig() });
    expect(result.exitCode).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.message).toBe("Job has a pending PR. Use 'specrunner finish' or --force.");
  });

  it("allows an awaiting-merge job with --force", async () => {
    const { jobId } = await makeJob("awaiting-merge");
    const result = await removeSingleJob({ jobId, force: true, config: makeLocalConfig() });
    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(1);
  });

  it("returns exitCode 1 for non-existent job", async () => {
    const result = await removeSingleJob({
      jobId: "nonexistent-uuid-1234",
      force: false,
      config: makeLocalConfig(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.removed).toBe(0);
  });
});

// ---------- removeSingleJob — managed mode session cleanup ----------

describe("removeSingleJob — managed mode session cleanup", () => {
  it("calls deleteSession when session.id is present", async () => {
    const { jobId } = await makeJob("failed", "ses_abc123");

    const mockDeleteSession = vi.fn().mockResolvedValue(undefined);
    const fakeClient = {
      beta: {
        sessions: {
          delete: mockDeleteSession,
        },
      },
    } as unknown as Anthropic;

    const result = await removeSingleJob({
      jobId,
      force: false,
      config: makeManagedConfig(),
      anthropicClient: fakeClient,
    });

    expect(result.exitCode).toBe(0);
    expect(mockDeleteSession).toHaveBeenCalledWith("ses_abc123");
  });

  it("continues with state deletion even when deleteSession throws (best-effort)", async () => {
    const { jobId } = await makeJob("failed", "ses_fail123");

    const mockDeleteSession = vi.fn().mockRejectedValue(new Error("API Error 500"));
    const fakeClient = {
      beta: {
        sessions: {
          delete: mockDeleteSession,
        },
      },
    } as unknown as Anthropic;

    const result = await removeSingleJob({
      jobId,
      force: false,
      config: makeManagedConfig(),
      anthropicClient: fakeClient,
    });

    // Should still succeed — best-effort cleanup
    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(1);

    // Warning should be returned in result.warnings
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Warning: failed to delete cloud session")]),
    );

    // State file should be deleted
    const statePath = path.join(tempDir, "specrunner", "jobs", `${jobId}.json`);
    await expect(nodefs.access(statePath)).rejects.toThrow();
  });

  it("skips deleteSession when no session.id on state", async () => {
    const { jobId } = await makeJob("failed"); // no sessionId

    const mockDeleteSession = vi.fn().mockResolvedValue(undefined);
    const fakeClient = {
      beta: {
        sessions: {
          delete: mockDeleteSession,
        },
      },
    } as unknown as Anthropic;

    const result = await removeSingleJob({
      jobId,
      force: false,
      config: makeManagedConfig(),
      anthropicClient: fakeClient,
    });

    expect(result.exitCode).toBe(0);
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});

// ---------- removeAllTerminated ----------

describe("removeAllTerminated", () => {
  it("returns 0 removed with message when no terminated jobs exist", async () => {
    // Only create a running job — should not be targeted
    await makeJob("running");

    const result = await removeAllTerminated({
      yes: true,
      config: makeLocalConfig(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.message).toBe("No terminated jobs to remove.");
  });

  it("removes all failed/terminated/archived jobs with --yes", async () => {
    await makeJob("failed");
    await makeJob("terminated");
    await makeJob("archived");
    await makeJob("running"); // should NOT be removed

    const result = await removeAllTerminated({
      yes: true,
      config: makeLocalConfig(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(3);
  });

  it("only targets failed/terminated/archived, not running/awaiting-merge", async () => {
    await makeJob("running");
    await makeJob("awaiting-merge");
    await makeJob("failed");

    const result = await removeAllTerminated({
      yes: true,
      config: makeLocalConfig(),
    });

    expect(result.removed).toBe(1);
  });

  it("rejects non-TTY without --yes", async () => {
    await makeJob("failed");

    // Create a fake non-TTY stream
    const { Readable } = await import("node:stream");
    const fakeStdin = new Readable({ read() {} });
    // isTTY is undefined (falsy) on Readable — not a TTY

    const result = await removeAllTerminated({
      yes: false,
      config: makeLocalConfig(),
      stdin: fakeStdin,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe("Non-interactive mode requires --yes to bulk-delete jobs.");
  });

  it("shows count of targets before deletion", async () => {
    await makeJob("failed");
    await makeJob("terminated");

    const result = await removeAllTerminated({ yes: true, config: makeLocalConfig() });

    expect(result.info).toContain("Found 2 terminated job(s) to remove.");
  });

  it("calls deleteSession for each managed-mode job with best-effort", async () => {
    await makeJob("failed", "ses_one");
    await makeJob("terminated", "ses_two");

    const mockDeleteSession = vi.fn().mockResolvedValue(undefined);
    const fakeClient = {
      beta: {
        sessions: {
          delete: mockDeleteSession,
        },
      },
    } as unknown as Anthropic;

    const result = await removeAllTerminated({
      yes: true,
      config: makeManagedConfig(),
      anthropicClient: fakeClient,
    });

    expect(result.exitCode).toBe(0);
    expect(result.removed).toBe(2);
    expect(mockDeleteSession).toHaveBeenCalledTimes(2);
  });
});
