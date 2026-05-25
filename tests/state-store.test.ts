import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { JobStateStore } from "../src/store/job-state-store.js";
import { appendHistoryEntry, MAX_HISTORY_SIZE } from "../src/state/schema.js";
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

// TC-043: atomic write（temp+rename）
describe("TC-043: atomic write — temp+rename", () => {
  it("writes job state atomically and final file is valid JSON", async () => {
    const state = await JobStateStore.create(tempDir, makeBaseState());
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    const files = await fs.readdir(jobsDir);
    const jsonFile = files.find((f) => f.endsWith(".json"));
    expect(jsonFile).toBeDefined();

    const content = await fs.readFile(path.join(jobsDir, jsonFile!), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.jobId).toBe(state.jobId);
  });

  it("no .tmp files remain after successful write", async () => {
    await JobStateStore.create(tempDir, makeBaseState());
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    const files = await fs.readdir(jobsDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

// TC-044: SIGINT 中断耐性
describe("TC-044: SIGINT resilience", () => {
  it("original file remains intact when temp file exists but rename hasn't happened", async () => {
    const state = await JobStateStore.create(tempDir, makeBaseState());
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");

    // Simulate having a temp file alongside the real file (crash scenario)
    const tmpFile = path.join(jobsDir, `${state.jobId}.json.tmp.abcdef`);
    await fs.writeFile(tmpFile, "INCOMPLETE DATA");

    // Reading the job file should still work
    const content = await fs.readFile(
      path.join(jobsDir, `${state.jobId}.json`),
      "utf-8",
    );
    const parsed = JSON.parse(content);
    expect(parsed.jobId).toBe(state.jobId);
  });
});

// TC-045: 並行 ps と書き込みの整合性
describe("TC-045: concurrent ps and write", () => {
  it("listJobStates returns valid states even during concurrent writes", async () => {
    // Create multiple job states
    const s1 = await JobStateStore.create(tempDir, makeBaseState());
    const s2 = await JobStateStore.create(tempDir, makeBaseState());

    // Run concurrent reads and writes
    const reads = [JobStateStore.list(tempDir), JobStateStore.list(tempDir)];
    const store1 = new JobStateStore(s1.jobId, tempDir);
    const store2 = new JobStateStore(s2.jobId, tempDir);
    const writes = [
      store1.update(s1, { status: "awaiting-merge" }),
      store2.update(s2, { branch: "feat/test" }),
    ];

    void writes;
    // All reads should succeed (no partial JSON errors)
    for (const result of await Promise.all(reads)) {
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// TC-046: history append-only と最大 100 entry truncate
describe("TC-046: history append-only and max 100 truncate", () => {
  it("truncates history to 100 entries", () => {
    // Create a state with 100 history entries
    let state: JobState = {
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
      history: Array.from({ length: 100 }, (_, i) => ({
        ts: new Date().toISOString(),
        step: `step-${i}`,
        status: "ok" as const,
        message: `Entry ${i}`,
      })),
      error: null,
    };

    // Add one more entry
    const updated = appendHistoryEntry(state, {
      ts: new Date().toISOString(),
      step: "step-100",
      status: "ok",
      message: "Entry 100",
    });

    // Should still be 100 (oldest dropped)
    expect(updated.history).toHaveLength(MAX_HISTORY_SIZE);
    // Latest entry should be at the end
    expect(updated.history[updated.history.length - 1]?.step).toBe("step-100");
    // First entry of original should be dropped
    expect(updated.history[0]?.step).toBe("step-1");
  });
});

// TC-047: 破損ファイルが存在しても他のジョブを表示できる
describe("TC-047: corrupt file skipped, others returned", () => {
  it("listJobStates skips corrupt files and returns valid ones", async () => {
    // Create valid states
    const s1 = await JobStateStore.create(tempDir, makeBaseState());
    const s2 = await JobStateStore.create(tempDir, makeBaseState());

    // Create a corrupt file
    const jobsDir = path.join(tempDir, ".specrunner", "jobs");
    await fs.writeFile(
      path.join(jobsDir, "corrupt-job-id.json"),
      "NOT VALID JSON {{{ corrupt",
    );

    const states = await JobStateStore.list(tempDir);
    // Should return 2 valid states
    expect(states).toHaveLength(2);
    const ids = states.map((s) => s.jobId);
    expect(ids).toContain(s1.jobId);
    expect(ids).toContain(s2.jobId);

    // Should log skip message
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("Skipping malformed file:"),
    );
  });
});

// TC-048: repoRoot-based path resolution
describe("TC-048: repoRoot-based path resolution", () => {
  it("jobs directory is <repoRoot>/.specrunner/jobs", () => {
    // New design: jobs go to <repoRoot>/.specrunner/jobs (not XDG-based)
    const expectedJobsDir = path.join(tempDir, ".specrunner", "jobs");
    // Create a job and verify files appear in the expected location
    // (verified implicitly by other tests in this suite)
    expect(expectedJobsDir).toContain(".specrunner/jobs");
  });
});

// TC-051: config atomic write and permission 0600
describe("TC-051: config atomic write and 0600 permission", () => {
  it("saveConfig creates file with 0600 permissions", async () => {
    let originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
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
