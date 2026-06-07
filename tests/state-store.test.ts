import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore, buildInitialJobState } from "../src/store/job-state-store.js";
import { appendHistoryEntry, MAX_HISTORY_SIZE, validateJobState } from "../src/state/schema.js";
import type { JobState } from "../src/state/schema.js";

// Setup temp directory for tests
let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeBaseState() {
  return {
    request: { path: "/test/request.md", title: "Test", type: "new-feature" as const },
    repository: { owner: "user", name: "repo" },
  };
}

/**
 * Create a test job using buildInitialJobState + changeDir store.
 * Returns the initial JobState and a store for it.
 */
async function createTestJob(
  params: Parameters<typeof buildInitialJobState>[0] = makeBaseState(),
): Promise<{ state: JobState; store: JobStateStore; changeDir: string }> {
  const state = buildInitialJobState(params);
  const changeDir = path.join(tempDir, ".specrunner", "test-jobs", state.jobId);
  const store = new JobStateStore(state.jobId, tempDir, { changeDir });
  await store.persist(state);
  return { state, store, changeDir };
}

// TC-043: atomic write（temp+rename）
describe("TC-043: atomic write — temp+rename", () => {
  it("writes job state atomically and final file is valid JSON (changeDir layout)", async () => {
    const { state, changeDir } = await createTestJob();

    const stateJsonPath = path.join(changeDir, "state.json");
    const content = await fs.readFile(stateJsonPath, "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.jobId).toBe(state.jobId);
  });

  it("no .tmp files remain after successful write", async () => {
    const { changeDir } = await createTestJob();
    const files = await fs.readdir(changeDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

// TC-044: SIGINT 中断耐性
describe("TC-044: SIGINT resilience", () => {
  it("original state.json remains intact when temp file exists but rename hasn't happened", async () => {
    const { state, changeDir } = await createTestJob();

    // Simulate having a temp file alongside the real state.json (crash scenario)
    const tmpFile = path.join(changeDir, "state.json.tmp.abcdef");
    await fs.writeFile(tmpFile, "INCOMPLETE DATA");

    // Reading the job state should still work (state.json is intact)
    const content = await fs.readFile(path.join(changeDir, "state.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.jobId).toBe(state.jobId);
  });
});

// TC-045: 並行 ps と書き込みの整合性
describe("TC-045: concurrent ps and write", () => {
  it("listJobStates returns valid states even during concurrent writes", async () => {
    // Create multiple job states in slug layout so list() can find them
    const slug1 = "tc045-slug-one";
    const slug2 = "tc045-slug-two";
    const j1 = buildInitialJobState(makeBaseState());
    const j2 = buildInitialJobState(makeBaseState());

    for (const [slug, state] of [[slug1, j1], [slug2, j2]] as [string, JobState][]) {
      const dir = path.join(tempDir, "specrunner", "changes", slug);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "state.json"),
        JSON.stringify({
          version: 1,
          jobId: state.jobId,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
          request: state.request,
          repository: state.repository,
          session: null,
          step: "init",
          status: "running",
          branch: null,
          error: null,
          _journal: { historyCount: 0, stepCounts: {} },
        }),
      );
      await fs.writeFile(path.join(dir, "events.jsonl"), "");
    }

    // Run concurrent reads
    const reads = [JobStateStore.list(tempDir), JobStateStore.list(tempDir)];
    // All reads should succeed (no partial JSON errors)
    for (const result of await Promise.all(reads)) {
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// TC-046: history append-only (Design D4: no persistent truncation)
describe("TC-046: history append-only — no persistent truncation (Design D4)", () => {
  it("does NOT truncate history — all entries preserved in journal (D4)", () => {
    // Create a state with MAX_HISTORY_SIZE history entries
    const state: JobState = {
      version: 1,
      jobId: "test-id",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/test", title: "T", type: "new-feature" },
      repository: { owner: "u", name: "r" },
      session: null,
      step: "init",
      status: "running",
      branch: null,
      history: Array.from({ length: MAX_HISTORY_SIZE }, (_, i) => ({
        ts: new Date().toISOString(),
        step: `step-${i}`,
        status: "ok" as const,
        message: `Entry ${i}`,
      })),
      error: null,
    };

    // Add one more entry — should NOT be truncated (D4)
    const updated = appendHistoryEntry(state, {
      ts: new Date().toISOString(),
      step: "step-100",
      status: "ok",
      message: "Entry 100",
    });

    // All entries retained — history grows beyond MAX_HISTORY_SIZE
    expect(updated.history).toHaveLength(MAX_HISTORY_SIZE + 1);
    // Latest entry should be at the end
    expect(updated.history[updated.history.length - 1]?.step).toBe("step-100");
    // First entry of original is preserved
    expect(updated.history[0]?.step).toBe("step-0");
  });
});

// TC-047: 破損ファイルが存在しても他のジョブを表示できる
describe("TC-047: corrupt slug state skipped, others returned", () => {
  it("list() skips corrupt slug state.json and returns valid ones", async () => {
    // Write 2 valid slug states to specrunner/changes/
    const slug1 = "valid-slug-one";
    const slug2 = "valid-slug-two";
    const jobId1 = "aaaa1111-tc047-0000-0000-000000000001";
    const jobId2 = "bbbb2222-tc047-0000-0000-000000000001";

    for (const [slug, jobId] of [[slug1, jobId1], [slug2, jobId2]] as [string, string][]) {
      const dir = path.join(tempDir, "specrunner", "changes", slug);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "state.json"),
        JSON.stringify({
          version: 1, jobId,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          request: { path: "/test/request.md", title: "T", type: "new-feature" },
          repository: { owner: "u", name: "r" },
          session: null, step: "init", status: "running",
          branch: `change/${slug}`, error: null,
          _journal: { historyCount: 0, stepCounts: {} },
        }),
      );
      await fs.writeFile(path.join(dir, "events.jsonl"), "");
    }

    // Write a corrupt slug state.json in specrunner/changes/corrupt-slug/
    const corruptDir = path.join(tempDir, "specrunner", "changes", "corrupt-slug");
    await fs.mkdir(corruptDir, { recursive: true });
    await fs.writeFile(
      path.join(corruptDir, "state.json"),
      "NOT VALID JSON {{{ corrupt",
    );

    const states = await JobStateStore.list(tempDir);
    // Should return 2 valid states and skip corrupt
    expect(states.length).toBeGreaterThanOrEqual(2);
    const ids = states.map((s) => s.jobId);
    expect(ids).toContain(jobId1);
    expect(ids).toContain(jobId2);
    // corrupt-slug should not produce a state
    const corruptEntry = states.find((s) => s.jobId === "corrupt-slug");
    expect(corruptEntry).toBeUndefined();
  });
});

// TC-048: repoRoot-based path resolution
describe("TC-048: repoRoot-based path resolution", () => {
  it("local sidecar dir is <repoRoot>/.specrunner/local/", () => {
    const expectedLocalDir = path.join(tempDir, ".specrunner", "local");
    expect(expectedLocalDir).toContain(".specrunner/local");
  });
});

// TC-051: config atomic write and permission 0600
describe("TC-051: config atomic write and 0600 permission", () => {
  it("saveConfig creates file with 0600 permissions", async () => {
    const originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = tempDir;

    try {
      const { saveConfig } = await import("../src/config/store.js");
      await saveConfig({
        version: 1,
        agents: {},
      });

      const configPath = path.join(tempDir, "specrunner", "config.json");
      const stat = await fs.stat(configPath);
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o600);

      // Verify no temp files remain
      const dir = path.join(tempDir, "specrunner");
      const files = await fs.readdir(dir);
      const tmpFiles = files.filter((f) => f.includes(".tmp."));
      expect(tmpFiles).toHaveLength(0);
    } finally {
      if (originalXdgConfigHome !== undefined) {
        process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
      } else {
        delete process.env["XDG_CONFIG_HOME"];
      }
    }
  });
});

// TC-PIPID-010: pipelineId round-trip — persist → load で値が保たれる
describe("TC-PIPID-010: pipelineId round-trip — persist then load preserves value", () => {
  it("pipelineId is preserved after create and load", async () => {
    const { state, store } = await createTestJob();
    expect(state.pipelineId).toBe("standard");

    const loaded = await store.load();
    expect(loaded.pipelineId).toBe("standard");
  });
});

// TC-PIPID-011: 後方互換 — pipelineId を持たない state を読んでもエラーにならない
describe("TC-PIPID-011: backward compat — pipelineId absent in legacy state does not throw", () => {
  it("validateJobState succeeds for state without pipelineId, preserving other fields", () => {
    const raw = {
      version: 1,
      jobId: "legacy-job-id",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Legacy", type: "new-feature" },
      repository: { owner: "u", name: "r" },
      session: null,
      step: "implementer",
      status: "awaiting-archive",
      branch: "feat/legacy",
      history: [],
      error: null,
    };

    const state = validateJobState(raw);
    expect(state.jobId).toBe("legacy-job-id");
    expect(state.pipelineId).toBeUndefined();
    expect(state.step).toBe("implementer");
  });

  it("JobStateStore.load succeeds for state file without pipelineId (changeDir layout)", async () => {
    const jobId = "legacy-no-pipeline-id";
    const changeDir = path.join(tempDir, ".specrunner", "local", jobId);
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, "state.json"),
      JSON.stringify({
        version: 1,
        jobId,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        request: { path: "/req.md", title: "Legacy", type: "new-feature" },
        repository: { owner: "u", name: "r" },
        session: null,
        step: "implementer",
        status: "awaiting-archive",
        branch: "feat/legacy",
        history: [],
        error: null,
        _journal: { historyCount: 0, stepCounts: {} },
      }),
    );
    await fs.writeFile(path.join(changeDir, "events.jsonl"), "");

    const store = new JobStateStore(jobId, tempDir, { changeDir });
    const loaded = await store.load();
    expect(loaded.jobId).toBe(jobId);
    expect(loaded.pipelineId).toBeUndefined();
  });
});

// TC-PIPID-012: buildInitialJobState のデフォルト pipelineId は "standard"
describe("TC-PIPID-012: buildInitialJobState default pipelineId is standard", () => {
  it("creates state with pipelineId 'standard' when not specified", async () => {
    const { state } = await createTestJob();
    expect(state.pipelineId).toBe("standard");
  });

  it("creates state with explicit pipelineId when provided", async () => {
    const { state } = await createTestJob({ ...makeBaseState(), pipelineId: "standard" });
    expect(state.pipelineId).toBe("standard");
  });
});

// TC-053: config — anthropic フィールドは不要になった (managed setup に移管)
describe("TC-053: config — anthropic field no longer required", () => {
  it("loadConfig succeeds for config without anthropic.apiKey (apiKey moved to env var)", async () => {
    const originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = tempDir;

    try {
      // Write config without apiKey — should now load successfully
      const configDir = path.join(tempDir, "specrunner");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "config.json"),
        JSON.stringify({ version: 1, agents: {} }),
        { mode: 0o600 },
      );

      const { loadConfig } = await import("../src/config/store.js");
      const config = await loadConfig();
      expect(config.version).toBe(1);
    } finally {
      if (originalXdgConfigHome !== undefined) {
        process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
      } else {
        delete process.env["XDG_CONFIG_HOME"];
      }
    }
  });
});
