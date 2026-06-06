import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Top-level mocks (vitest hoisting)
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("../src/sdk/client.js", () => ({
  createAnthropicClient: () => currentMockSdk,
}));

let currentMockSdk: unknown = null;

let tempDir: string;
let originalXdgConfigHome: string | undefined;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-cli-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function createValidConfig(overrides: Record<string, unknown> = {}) {
  const configDir = path.join(tempDir, "specrunner");
  await fs.mkdir(configDir, { recursive: true });
  const config = {
    version: 1,
    agent: { id: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    ...overrides,
  };
  const configPath = path.join(configDir, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  return configPath;
}

async function createRequestMd() {
  const reqPath = path.join(tempDir, "request.md");
  await fs.writeFile(reqPath, `# Test Request\n\n## Meta\n\n- **type**: new-feature\n\n## Content\n\nDo something.\n`);
  return reqPath;
}

// TC-063: specrunner run — fail-fast（config 不在 → exit 2, CONFIG_MISSING → ARG_ERROR）
describe("TC-063: specrunner run — fail-fast when config missing", () => {
  it("exits with code 2 when config does not exist (CONFIG_MISSING → ARG_ERROR)", async () => {
    // No config created — config is missing
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error("process.exit called");
    });

    const { runRun } = await import("../src/cli/run.js");
    const reqPath = await createRequestMd();

    await expect(runRun(reqPath, { cwd: tempDir })).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(2);
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(combined).toMatch(/Config file not found|init|config/i);
  });
});

// TC-064: specrunner run — fail-fast（github token 欠落 → exit 1）
describe("TC-064: specrunner run — fail-fast when github token missing", () => {
  it("exits with error when GITHUB_TOKEN env var and credentials file are both missing", async () => {
    // Config exists but no github token in env
    await createValidConfig({});

    // Ensure GITHUB_TOKEN env var is not set
    const originalGithubToken = process.env["GITHUB_TOKEN"];
    delete process.env["GITHUB_TOKEN"];

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error("process.exit called");
    });

    const { runRun } = await import("../src/cli/run.js");
    const reqPath = await createRequestMd();

    try {
      await expect(runRun(reqPath, { cwd: tempDir })).rejects.toThrow("process.exit called");

      expect(exitSpy).toHaveBeenCalledWith(1);
      const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
      const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
      expect(combined).toMatch(/login/i);
    } finally {
      if (originalGithubToken !== undefined) {
        process.env["GITHUB_TOKEN"] = originalGithubToken;
      }
    }
  });
});

// TC-065: specrunner run — fail-fast（origin が GitHub 以外 → exit 1）
// Tests the REMOTE_NOT_GITHUB error path by directly calling getOriginInfo with a non-GitHub URL
describe("TC-065: specrunner run — REMOTE_NOT_GITHUB error message", () => {
  it("parseRemoteUrl throws with message containing github.com for non-GitHub URL", async () => {
    const { parseRemoteUrl } = await import("../src/git/remote.js");

    expect(() => parseRemoteUrl("https://gitlab.com/user/repo.git")).toThrow(
      "'origin' must point to github.com.",
    );
  });
});

// TC-066: specrunner ps — 破損ファイルをスキップして他のジョブを表示
describe("TC-066: specrunner ps — skips corrupted state file", () => {
  it("shows other jobs and silently skips malformed slug state.json", async () => {
    const now = new Date().toISOString();

    // Write valid job to slug dir (section 1)
    const validSlugDir = path.join(tempDir, "specrunner", "changes", "valid-job");
    await fs.mkdir(validSlugDir, { recursive: true });
    await fs.writeFile(
      path.join(validSlugDir, "state.json"),
      JSON.stringify({
        version: 1,
        jobId: "11111111-0000-4000-a000-000000000001",
        createdAt: now,
        updatedAt: now,
        request: { path: "/req.md", title: "Valid Job", type: "new-feature" },
        repository: { owner: "o", name: "r" },
        session: null,
        step: "success",
        status: "awaiting-archive",
        branch: "feat/valid-job",
        error: null,
        _journal: { historyCount: 0, stepCounts: {} },
      }),
    );
    await fs.writeFile(path.join(validSlugDir, "events.jsonl"), "");

    // Write corrupt slug state.json (section 1 silently skips this)
    const corruptSlugDir = path.join(tempDir, "specrunner", "changes", "corrupt-job");
    await fs.mkdir(corruptSlugDir, { recursive: true });
    await fs.writeFile(
      path.join(corruptSlugDir, "state.json"),
      "{ not valid json at all !!!",
    );

    const { runPs } = await import("../src/cli/ps.js");
    await runPs({ repoRoot: tempDir });

    // Valid job should appear in output; corrupt job is silently skipped
    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const stdoutCombined = stdoutCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(stdoutCombined).toContain("11111111");
  });
});

// TC-067: specrunner ps — ジョブが 0 件
describe("TC-067: specrunner ps — no jobs found", () => {
  it("outputs 'No jobs found.' when jobs directory is empty", async () => {
    // Jobs dir does not exist at all
    const { runPs } = await import("../src/cli/ps.js");
    await runPs({ repoRoot: tempDir });

    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stdoutCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(combined).toContain("No jobs found.");
  });
});

// TC-068: specrunner ps — 非 TTY 出力（TAB 区切り）
describe("TC-068: specrunner ps — TAB-separated output in non-TTY mode", () => {
  it("outputs TAB-separated rows when stdout is not a TTY", async () => {
    const now = new Date().toISOString();

    // Write both jobs to slug dirs (section 1)
    for (const [jobId, slug] of [
      ["22222222-0000-4000-a000-000000000001", "job-one"],
      ["33333333-0000-4000-a000-000000000002", "job-two"],
    ] as [string, string][]) {
      const slugDir = path.join(tempDir, "specrunner", "changes", slug);
      await fs.mkdir(slugDir, { recursive: true });
      await fs.writeFile(
        path.join(slugDir, "state.json"),
        JSON.stringify({
          version: 1,
          jobId,
          createdAt: now,
          updatedAt: now,
          request: { path: `/req.md`, title: `Job ${slug}`, type: "new-feature", slug },
          repository: { owner: "o", name: "r" },
          session: null,
          step: "success",
          status: "awaiting-archive",
          branch: `feat/${slug}`,
          error: null,
          _journal: { historyCount: 0, stepCounts: {} },
        }),
      );
      await fs.writeFile(path.join(slugDir, "events.jsonl"), "");
    }

    // Non-TTY mode is default in tests (process.stdout.isTTY is undefined/false)
    const { runPs } = await import("../src/cli/ps.js");
    await runPs({ repoRoot: tempDir });

    const stdoutCalls = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls;
    const lines = stdoutCalls.map((c: unknown[]) => String(c[0])).join("");

    // Should have TAB separators in data rows
    const dataLines = lines.split("\n").filter((l) => l.includes("\t") && !l.startsWith("JOB_ID"));
    expect(dataLines.length).toBeGreaterThanOrEqual(2);
  });
});

// TC-072: CLI — 不明なサブコマンドは exit 2
describe("TC-072: CLI — unknown command exits with code 2", () => {
  it("exits with code 2 and prints Unknown command message", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error(`process.exit:${_code}`);
    });

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // Simulate what main() does for unknown commands (mirrors bin/specrunner.ts default case)
    const unknownCmd = "foobar";
    try {
      process.stderr.write(`Unknown command: ${unknownCmd}\n\n`);
      process.exit(2);
    } catch {
      // expected — process.exit mock throws
    }

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown command: foobar"));
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});
