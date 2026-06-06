/**
 * Tests for ps command with archived status.
 *
 * TC-032: JobStatus archived in state file → ps reads it correctly
 * TC-033: Existing state file with status=success → ps reads correctly
 * TC-034: specrunner ps --active excludes archived
 * TC-110: specrunner ps --all shows SLUG column and archived jobs
 * TC-143: non-TTY TAB-separated output has SLUG as second column
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runPs, formatJobRow } from "../src/cli/ps.js";
import type { JobState } from "../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-ps-test-"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Write state to the canonical slug dir so list() can find it (new index model).
 *
 * For archived status: writes to specrunner/changes/archive/2026-01-01-<slug>/
 * For other statuses:  writes to specrunner/changes/<slug>/
 *
 * Slug is derived from request.slug → branch (strip "feat/") → jobId prefix.
 */
async function writeStateFile(state: JobState): Promise<void> {
  // Derive slug: prefer explicit request.slug, then branch, then jobId prefix
  const slug = state.request.slug
    ?? (state.branch ? state.branch.replace(/^feat\//, "") : state.jobId.slice(0, 8));

  const stateForFile = {
    version: state.version,
    jobId: state.jobId,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    request: {
      path: state.request.path,
      title: state.request.title,
      type: state.request.type,
      ...(state.request.slug ? { slug: state.request.slug } : {}),
    },
    repository: state.repository,
    session: state.session,
    step: state.step,
    status: state.status,
    branch: state.branch,
    error: state.error,
    ...(state.pid != null ? { pid: state.pid } : {}),
    _journal: { historyCount: 0, stepCounts: {} },
  };

  let dir: string;
  if (state.status === "archived") {
    dir = path.join(tempDir, "specrunner", "changes", "archive", `2026-01-01-${slug}`);
  } else {
    dir = path.join(tempDir, "specrunner", "changes", slug);
  }

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(stateForFile, null, 2));
  await fs.writeFile(path.join(dir, "events.jsonl"), "");
}

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  const jobId = overrides.jobId ?? "test-job-00000000";
  // Use jobId-derived branch by default to ensure unique slug per state.
  // Explicit `branch` override takes priority.
  const defaultBranch = `feat/job-${jobId.slice(0, 8)}`;
  return {
    version: 1,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/test/request.md", title: "Test", type: "new-feature" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: defaultBranch,
    history: [],
    error: null,
    ...overrides,
  };
}

// TC-032
describe("TC-032: archived state file → ps reads without crash", () => {
  it("ps --all does not crash and shows archived status", async () => {
    await writeStateFile(makeBaseState({ status: "archived", jobId: "archived-job-001" }));

    // Should not throw
    await expect(runPs({ all: true, repoRoot: tempDir })).resolves.toBe(0);

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("archived");
  });

  it("ps (no flags) hides archived jobs by default (TC-142)", async () => {
    await writeStateFile(makeBaseState({ status: "archived", jobId: "archived-job-002" }));

    await runPs({ repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // archived-job-002 should NOT appear in default ps
    expect(output).not.toContain("archived-job-002".slice(0, 8));
  });
});

// TC-033
describe("TC-033: legacy state file with status=success → ps reads correctly", () => {
  it("reads success state files without crash", async () => {
    const state = makeBaseState({ jobId: "tc033-job-00000001", status: "awaiting-archive" });
    await writeStateFile(state);

    await expect(runPs({ repoRoot: tempDir })).resolves.toBe(0);

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(output).toContain(state.jobId.slice(0, 8));
  });
});

// TC-034
describe("TC-034: ps --active excludes archived", () => {
  it("--active flag excludes archived and non-running jobs", async () => {
    // Use UUIDs so the 8-char prefix is deterministic
    const runningId = "aaaaaaaa-0000-0000-0000-000000000001";
    const archivedId = "bbbbbbbb-0000-0000-0000-000000000001";
    await writeStateFile(makeBaseState({ jobId: runningId, status: "running" }));
    await writeStateFile(makeBaseState({ jobId: archivedId, status: "archived" }));

    await runPs({ active: true, repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // JOB_ID column shows 8-char prefix
    expect(output).toContain("aaaaaaaa"); // running job prefix
    expect(output).not.toContain("bbbbbbbb"); // archived job prefix
  });

  it("--active shows running jobs only", async () => {
    const runningId = "cccccccc-0000-0000-0000-000000000001";
    const successId = "dddddddd-0000-0000-0000-000000000001";
    await writeStateFile(makeBaseState({ jobId: runningId, status: "running" }));
    await writeStateFile(makeBaseState({ jobId: successId, status: "awaiting-archive" }));

    await runPs({ active: true, repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // Only running should appear
    expect(output).toContain("cccccccc");
    expect(output).not.toContain("dddddddd");
  });
});

// TC-054: TypeScript exhaustive-switch — runtime check that archived is handled in formatJobRow
describe("TC-054: formatJobRow handles archived status", () => {
  it("does not throw or produce undefined for archived status", () => {
    const state = makeBaseState({ status: "archived" });
    const row = formatJobRow(state, false);
    expect(row).toBeTruthy();
    expect(row).toContain("archived");
  });
});

// TC-110: specrunner ps --all shows SLUG column and archived jobs
describe("TC-110: specrunner ps --all shows SLUG column and archived jobs", () => {
  it("--all output contains SLUG header at position 2, archived job row, and SLUG value", async () => {
    const archivedId = "eeeeeeee-0000-0000-0000-000000000001";
    const successId = "ffffffff-0000-0000-0000-000000000001";

    await writeStateFile(makeBaseState({
      jobId: archivedId,
      status: "archived",
      branch: "feat/my-archived-feature",
      request: { path: "specrunner/drafts/my-archived-feature.md", title: "T", type: "new-feature", slug: "my-archived-feature" },
    }));
    await writeStateFile(makeBaseState({
      jobId: successId,
      status: "awaiting-archive",
      branch: "feat/active-job",
      request: { path: "specrunner/drafts/active-job.md", title: "T", type: "new-feature", slug: "active-job" },
    }));

    await runPs({ all: true, repoRoot: tempDir });

    const allOutput = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // SLUG header should appear (non-TTY since stdout is mocked/not a real TTY)
    expect(allOutput).toContain("SLUG");
    // Both jobs should appear
    expect(allOutput).toContain("eeeeeeee");
    expect(allOutput).toContain("ffffffff");
    // archived status appears
    expect(allOutput).toContain("archived");
    // SLUG values appear
    expect(allOutput).toContain("my-archived-feature");
    expect(allOutput).toContain("active-job");
  });
});

// TC-NEW-07: ps ACTIVE_STATUSES — awaiting-resume が active として表示される
describe("TC-NEW-07: ps --active includes awaiting-resume", () => {
  it("--active flag shows awaiting-resume jobs", async () => {
    const awaitingResumeId = "11111111-0000-0000-0000-000000000001";
    const archivedId = "22222222-0000-0000-0000-000000000001";
    await writeStateFile(makeBaseState({ jobId: awaitingResumeId, status: "awaiting-resume" as JobState["status"] }));
    await writeStateFile(makeBaseState({ jobId: archivedId, status: "archived" }));

    await runPs({ active: true, repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("11111111"); // awaiting-resume job should appear
    expect(output).not.toContain("22222222"); // archived should not appear
  });
});

// TC-NEW-08: ps stale detection — formatJobRow が isStale 引数を参照する
describe("TC-NEW-08: ps stale detection via isStale argument", () => {
  it("adds (stale?) when isStale=true is passed", () => {
    const state = makeBaseState({ status: "running" });
    const row = formatJobRow(state, false, Date.now(), undefined, true);
    expect(row).toContain("stale?");
  });

  it("does NOT add (stale?) when isStale=false (default)", () => {
    const state = makeBaseState({ status: "running" });
    const row = formatJobRow(state, false, Date.now(), undefined, false);
    expect(row).not.toContain("stale?");
  });

  it("does NOT add (stale?) when isStale is omitted", () => {
    const state = makeBaseState({ status: "running" });
    const row = formatJobRow(state, false, Date.now());
    expect(row).not.toContain("stale?");
  });

  it("does NOT add (stale?) to awaiting-resume jobs when isStale=false", () => {
    const oldUpdatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    const state = makeBaseState({
      status: "awaiting-resume" as JobState["status"],
      updatedAt: oldUpdatedAt,
    });
    const row = formatJobRow(state, false, Date.now(), undefined, false);
    expect(row).not.toContain("stale?");
  });
});

// TC-143: non-TTY TAB-separated output has SLUG as second column
describe("TC-143: non-TTY TAB-separated output — SLUG is second column", () => {
  it("header row second tab-delimited field is SLUG", async () => {
    await writeStateFile(makeBaseState({
      jobId: "aaaaaaaa-0000-0000-0000-000000000099",
      status: "awaiting-archive",
      branch: "feat/test-slug",
      request: { path: "specrunner/drafts/test-slug.md", title: "T", type: "new-feature", slug: "test-slug" },
    }));

    // formatJobRow non-TTY (isTty=false) — validate header fields
    const state = makeBaseState({
      jobId: "aaaaaaaa-0000-0000-0000-000000000099",
      status: "awaiting-archive",
      branch: "feat/test-slug",
      request: { path: "specrunner/drafts/test-slug.md", title: "T", type: "new-feature", slug: "test-slug" },
    });
    const row = formatJobRow(state, false);
    const fields = row.split("\t");

    // Non-TTY format: JOB_ID, SLUG, STEP, STATUS, BRANCH, AGE
    expect(fields).toHaveLength(6);
    expect(fields[0]).toBe("aaaaaaaa");  // JOB_ID 8 chars
    expect(fields[1]).toBe("test-slug"); // SLUG is second column
    expect(fields[3]).toBe("awaiting-archive");   // STATUS is fourth column
  });

  it("ps output header TAB-separated second field is SLUG", async () => {
    await writeStateFile(makeBaseState({
      jobId: "bbbbbbbb-0000-0000-0000-000000000099",
      status: "awaiting-archive",
    }));

    await runPs({ repoRoot: tempDir });

    const allOutput = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // First line is the header
    const lines = allOutput.split("\n").filter((l) => l.trim().length > 0);
    const headerLine = lines[0] ?? "";
    const headerFields = headerLine.split("\t");
    expect(headerFields[1]).toBe("SLUG");
  });
});

// TC-D6-DEDUP: dedup で archive-location の archived が legacy jobId ストアの running に勝つ
describe("TC-D6-DEDUP: dedup regression — archived (newest updatedAt) wins over running (older)", () => {
  it("archived job from archive-location wins dedup over legacy running state with same jobId", async () => {
    const jobId = "dedup-job-0000-0000-0000-000000000001";
    const slug = "dedup-test-slug";

    // Legacy jobId store: running (older updatedAt)
    const olderUpdatedAt = new Date(Date.now() - 60000).toISOString();
    const legacyState = makeBaseState({
      jobId,
      status: "running",
      updatedAt: olderUpdatedAt,
      request: { path: "/test/request.md", title: "Test", type: "new-feature", slug },
    });
    await writeStateFile(legacyState);

    // Archive location: archived (newer updatedAt)
    const newerUpdatedAt = new Date().toISOString();
    const archiveDir = path.join(tempDir, "specrunner", "changes", "archive", `2026-01-15-${slug}`);
    await fs.mkdir(archiveDir, { recursive: true });
    const archivedStateForFile = {
      ...makeBaseState({
        jobId,
        status: "archived",
        updatedAt: newerUpdatedAt,
        request: { path: "/test/request.md", title: "Test", type: "new-feature", slug },
      }),
      _journal: { historyCount: 0, stepCounts: {} },
    };
    await fs.writeFile(path.join(archiveDir, "state.json"), JSON.stringify(archivedStateForFile), "utf-8");
    await fs.writeFile(path.join(archiveDir, "events.jsonl"), "", "utf-8");

    // default ps should NOT show the job (archived wins dedup, and archived is filtered out)
    await runPs({ repoRoot: tempDir });
    const defaultOutput = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(defaultOutput).not.toContain("dedup-job");

    // --all should show job as archived (not running)
    (process.stdout.write as ReturnType<typeof vi.fn>).mockClear();
    await runPs({ all: true, repoRoot: tempDir });
    const allOutput = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(allOutput).toContain("archived");
    expect(allOutput).not.toContain("running");
  });
});

// TC-STALE-PID: runPs level pid/sidecar stale detection tests
describe("TC-STALE-PID: runPs stale detection via pid/sidecar", () => {
  it("shows 'running (stale?)' for a running job with a dead pid", async () => {
    // Use a pid that is very unlikely to exist (large number)
    const deadPid = 999999999;
    const state = makeBaseState({
      jobId: "stale-pid-00000000-0000-0000-0000-000000000001",
      status: "running",
      pid: deadPid,
    });
    await writeStateFile(state);

    await runPs({ repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("running (stale?)");
  });

  it("does NOT show 'running (stale?)' for a running job with the current process pid", async () => {
    const alivePid = process.pid;
    const state = makeBaseState({
      jobId: "alive-pid-0000-0000-0000-0000-000000000001",
      status: "running",
      pid: alivePid,
    });
    await writeStateFile(state);

    await runPs({ repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).not.toContain("stale?");
  });

  it("shows 'running (stale?)' for a running job with no pid and updatedAt 16 min ago (15 min fallback)", async () => {
    const sixteenMinAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const state = makeBaseState({
      jobId: "fallback-stale-00-0000-0000-0000-000000000001",
      status: "running",
      updatedAt: sixteenMinAgo,
    });
    await writeStateFile(state);

    await runPs({ repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("running (stale?)");
  });

  it("does NOT show 'running (stale?)' for a running job with no pid and updatedAt 5 min ago", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const state = makeBaseState({
      jobId: "fallback-fresh-00-0000-0000-0000-000000000001",
      status: "running",
      updatedAt: fiveMinAgo,
    });
    await writeStateFile(state);

    await runPs({ repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).not.toContain("stale?");
  });

  it("shows 'running (stale?)' for a running job whose sidecar has a dead pid", async () => {
    const slug = "sidecar-dead-pid-test";
    const state = makeBaseState({
      jobId: "sidecar-dead-pid-0000-0000-0000-000000000001",
      status: "running",
      request: { path: "/test/request.md", title: "Test", type: "new-feature", slug },
    });
    await writeStateFile(state);

    // Write sidecar with a dead pid
    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    await fs.mkdir(sidecarDir, { recursive: true });
    await fs.writeFile(
      path.join(sidecarDir, "liveness.json"),
      JSON.stringify({ pid: 999999999, session: null, worktreePath: "/tmp/test", jobId: state.jobId }),
    );

    await runPs({ repoRoot: tempDir });

    const output = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(output).toContain("running (stale?)");
  });
});
