import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import { resolveInitProvider } from "../src/cli/init.js";

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-test-"));
  originalXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgConfigHome !== undefined) {
    process.env["XDG_CONFIG_HOME"] = originalXdgConfigHome;
  } else {
    delete process.env["XDG_CONFIG_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runInit — config scaffold generation", () => {
  it("creates a config file with version:1 and steps.defaults", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.version).toBe(1);
    expect(config.steps?.defaults).toBeDefined();
    expect(config.steps.defaults.model).toBe("claude-sonnet-4-6");
    expect(config.steps.defaults.maxTurns).toBeNull();
    expect(config.steps.defaults.timeoutMs).toBeNull();
  });

  it("does not write anthropic field to config", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.anthropic).toBeUndefined();
  });

  it("does not write runtime field to config (defaults to local)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.runtime).toBeUndefined();
  });

  it("creates config with 0600 permissions", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const stat = await fs.stat(configPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("--runtime managed returns exit code 2 (deprecated flag is arg error)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ runtime: "managed" });
    expect(result).toBe(2);
  });

  it("--runtime local returns exit code 2 (deprecated flag is arg error)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ runtime: "local" });
    expect(result).toBe(2);
  });
});

// TC-010: init で steps セクションなしの config に steps.defaults が追加される
describe("TC-010: specrunner init で steps.defaults が追加される", () => {
  it("steps フィールドがない config に steps.defaults を追加する", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps).toBeDefined();
    expect(config.steps.defaults).toBeDefined();
    expect(config.steps.defaults.model).toBe("claude-sonnet-4-6");
    expect(config.steps.defaults.maxTurns).toBeNull();
    expect(config.steps.defaults.timeoutMs).toBeNull();
  });
});

// TC-011: init で既存の steps がある場合は上書きされない
describe("TC-011: specrunner init で既存の steps は上書きされない", () => {
  it("steps.defaults.maxTurns: 90 がある既存 config を保持する", async () => {
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: {
        defaults: {
          maxTurns: 90,
          model: "claude-haiku-4-5",
        },
      },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps.defaults.maxTurns).toBe(90);
    expect(config.steps.defaults.model).toBe("claude-haiku-4-5");
  });

  it("2 回目実行後も config.json のコンテンツが変わらない", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const contentAfterFirst = await fs.readFile(configPath, "utf-8");

    await runInit({});

    const contentAfterSecond = await fs.readFile(configPath, "utf-8");
    expect(contentAfterSecond).toBe(contentAfterFirst);
  });
});

// T-01/T-02 (config-write-hygiene): init で github フィールドが保持される
describe("config-write-hygiene: runInit で github フィールドが保持される", () => {
  it("github: { host } がある config で runInit を実行しても github フィールドが保持される", async () => {
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      github: { host: "ghes.example.com", apiBaseUrl: "https://ghes.example.com/api/v3" },
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.github).toBeDefined();
    expect(config.github.host).toBe("ghes.example.com");
    expect(config.github.apiBaseUrl).toBe("https://ghes.example.com/api/v3");
  });
});

// TC-001: 非 git ディレクトリで非ゼロ exit かつ FS に何も作られない
// Source: spec.md > Scenario: non-git directory stops with non-zero exit and writes nothing
describe("TC-001: specrunner init — git repo 外では非ゼロ exit で停止し FS に何も作られない", () => {
  let nonGitTempDir: string;

  beforeEach(async () => {
    nonGitTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-nongit-test-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(nonGitTempDir, { recursive: true, force: true });
  });

  it("TC-001: git repo 外の dir で init すると非ゼロ exit で停止し、FS に何も作られない", async () => {
    // ANTI-REGRESSION (TC-002): If the git gate is removed, runInit returns 0 even in a
    // non-git directory. The assertion `expect(result).not.toBe(0)` would then fail,
    // confirming the regression. TC-002 in init-git-guard.test.ts reinforces this with
    // a mocked spawnCommand returning exitCode=128.
    vi.spyOn(process, "cwd").mockReturnValue(nonGitTempDir);

    const stderrCapture: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrCapture.push(String(chunk));
      return true;
    });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    // Must be non-zero — ANTI-REGRESSION: removing the git gate makes this 0 and the assertion fails
    expect(result).not.toBe(0);
    expect(result).toBe(1);

    // stderr must contain a prescription requiring a git repository
    const stderrText = stderrCapture.join("");
    expect(stderrText.toLowerCase()).toMatch(/git/);
    // Prescription mentions git init or moving to an existing repo
    expect(stderrText.toLowerCase()).toMatch(/git init|existing repo|git repo|run inside/);

    // No global config created (XDG_CONFIG_HOME → outer tempDir)
    const configPath = path.join(tempDir, "specrunner", "config.json");
    await expect(fs.access(configPath)).rejects.toThrow();

    // No specrunner/ scaffold in the non-git dir
    await expect(fs.access(path.join(nonGitTempDir, "specrunner"))).rejects.toThrow();

    // No .gitignore in the non-git dir
    await expect(fs.access(path.join(nonGitTempDir, ".gitignore"))).rejects.toThrow();
  });
});

// T-01/T-02: init で git repo 内にプロジェクトディレクトリが作成される
describe("T-01: specrunner init でプロジェクトディレクトリが作成される", () => {
  let gitTempDir: string;

  beforeEach(async () => {
    gitTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-git-test-"));
    spawnSync("git", ["init"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: gitTempDir });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(gitTempDir, { recursive: true, force: true });
  });

  it("git repo 内で init すると specrunner/drafts/ と specrunner/changes/ が作成される", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(gitTempDir);

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    expect(result).toBe(0);

    const draftsDir = path.join(gitTempDir, "specrunner", "drafts");
    const changesDir = path.join(gitTempDir, "specrunner", "changes");

    await expect(fs.access(draftsDir).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(changesDir).then(() => undefined)).resolves.toBeUndefined();
  });

  it("冪等性: 2 回 runInit しても正常に完了する", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(gitTempDir);

    const { runInit } = await import("../src/cli/init.js");
    await runInit({});
    const result = await runInit({});

    expect(result).toBe(0);

    const draftsDir = path.join(gitTempDir, "specrunner", "drafts");
    const changesDir = path.join(gitTempDir, "specrunner", "changes");

    await expect(fs.access(draftsDir).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(changesDir).then(() => undefined)).resolves.toBeUndefined();
  });

  it("config が存在する場合でも project scaffold（drafts/, changes/）は作成される", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(gitTempDir);

    // Pre-create the global config so init skips scaffold generation
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = { version: 1, agents: {}, steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } } };
    await fs.writeFile(path.join(configDir, "config.json"), JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    expect(result).toBe(0);

    const draftsPath = path.join(gitTempDir, "specrunner", "drafts");
    const changesPath = path.join(gitTempDir, "specrunner", "changes");

    await expect(fs.access(draftsPath).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(changesPath).then(() => undefined)).resolves.toBeUndefined();
  });
});

// TC-004: 未初期化 git repo で init を実行すると 4 項目すべて created と報告される
// Source: spec.md > Scenario: fresh git repository reports every artifact created
describe("TC-004: 未初期化 git repo で init が 4 項目すべてを created と stdout に報告する", () => {
  let gitTempDir: string;

  beforeEach(async () => {
    gitTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-tc004-"));
    spawnSync("git", ["init"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: gitTempDir });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(gitTempDir, { recursive: true, force: true });
  });

  it("TC-004: stdout に 4 項目すべて created が 1 行ずつ出力され exit 0", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(gitTempDir);

    const stdoutCapture: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutCapture.push(String(chunk));
      return true;
    });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    expect(result).toBe(0);

    const stdoutText = stdoutCapture.join("");
    // Each artifact must be reported individually as "created"
    expect(stdoutText).toContain("global config: created");
    expect(stdoutText).toContain(".gitignore: created");
    expect(stdoutText).toContain("specrunner/drafts: created");
    expect(stdoutText).toContain("specrunner/changes: created");

    // Verify FS artifacts exist
    await expect(fs.access(path.join(tempDir, "specrunner", "config.json")).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(path.join(gitTempDir, ".gitignore")).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(path.join(gitTempDir, "specrunner", "drafts")).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(path.join(gitTempDir, "specrunner", "changes")).then(() => undefined)).resolves.toBeUndefined();
  });
});

// TC-005: 初期化済み repo での再実行が 4 項目すべて already exists を報告し FS を変更しない
// Source: spec.md > Scenario: second run reports all already-exists with no filesystem change
describe("TC-005: 初期化済み repo での再実行が全項目 already-exists を報告し FS を変更しない", () => {
  let gitTempDir: string;

  beforeEach(async () => {
    gitTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-tc005-"));
    spawnSync("git", ["init"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: gitTempDir });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(gitTempDir, { recursive: true, force: true });
  });

  it("TC-005: 2 回目の runInit が全項目 already-exists を stdout に報告し exit 0、FS を変更しない", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(gitTempDir);

    const { runInit } = await import("../src/cli/init.js");

    // First run: fully initialize
    await runInit({});

    // Snapshot FS state before second run
    const gitignoreBefore = await fs.readFile(path.join(gitTempDir, ".gitignore"), "utf-8");

    // Capture stdout for second run only
    const stdoutCapture: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutCapture.push(String(chunk));
      return true;
    });

    const result = await runInit({});

    expect(result).toBe(0);

    const stdoutText = stdoutCapture.join("");
    // All four artifacts must report already-exists on the second run
    expect(stdoutText).toContain("global config: already exists");
    expect(stdoutText).toContain(".gitignore: already exists");
    expect(stdoutText).toContain("specrunner/drafts: already exists");
    expect(stdoutText).toContain("specrunner/changes: already exists");

    // FS is unchanged between the two runs
    const gitignoreAfter = await fs.readFile(path.join(gitTempDir, ".gitignore"), "utf-8");
    expect(gitignoreAfter).toBe(gitignoreBefore);
  });
});

// TC-006: config 既存かつ scaffold 欠損の状態から実行すると欠損分が created として報告される
// Source: spec.md > Scenario: config exists but scaffold missing is completed and reported
describe("TC-006: config 既存・scaffold 欠損の状態から init が欠損分を created として報告する", () => {
  let gitTempDir: string;

  beforeEach(async () => {
    gitTempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-init-tc006-"));
    spawnSync("git", ["init"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: gitTempDir });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: gitTempDir });

    // Pre-create global config to simulate half-initialized state
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } },
    };
    await fs.writeFile(
      path.join(configDir, "config.json"),
      JSON.stringify(existingConfig),
      { mode: 0o600 },
    );
    // No scaffold (no specrunner/drafts, specrunner/changes, no .gitignore specrunner entries)
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(gitTempDir, { recursive: true, force: true });
  });

  it("TC-006: config 既存だが scaffold なしの状態から init が欠損分を created として stdout に報告する", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(gitTempDir);

    const stdoutCapture: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutCapture.push(String(chunk));
      return true;
    });

    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({});

    expect(result).toBe(0);

    const stdoutText = stdoutCapture.join("");
    // Config already existed — must report already-exists (no re-write)
    expect(stdoutText).toContain("global config: already exists");
    // Missing scaffold items must be reported as created (not silent "Skipping")
    expect(stdoutText).toContain("specrunner/drafts: created");
    expect(stdoutText).toContain("specrunner/changes: created");
    expect(stdoutText).toContain(".gitignore: created");

    // Scaffold is actually created
    await expect(fs.access(path.join(gitTempDir, "specrunner", "drafts")).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(path.join(gitTempDir, "specrunner", "changes")).then(() => undefined)).resolves.toBeUndefined();
    await expect(fs.access(path.join(gitTempDir, ".gitignore")).then(() => undefined)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveInitProvider — unit tests (no real stdin/TTY dependency)
// ---------------------------------------------------------------------------

describe("resolveInitProvider — flag provider", () => {
  it("returns the flag value immediately when flagProvider is 'openai'", async () => {
    const ask = vi.fn();
    const result = await resolveInitProvider("openai", { isTTY: false, ask });
    expect(result).toBe("openai");
    expect(ask).not.toHaveBeenCalled();
  });

  it("returns the flag value immediately when flagProvider is 'anthropic'", async () => {
    const ask = vi.fn();
    const result = await resolveInitProvider("anthropic", { isTTY: true, ask });
    expect(result).toBe("anthropic");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("resolveInitProvider — non-TTY defaults to anthropic", () => {
  it("returns anthropic without prompting when isTTY=false and no flag", async () => {
    const ask = vi.fn();
    const result = await resolveInitProvider(undefined, { isTTY: false, ask });
    expect(result).toBe("anthropic");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("resolveInitProvider — TTY prompts user", () => {
  it("returns openai when user enters '2'", async () => {
    const result = await resolveInitProvider(undefined, { isTTY: true, ask: async () => "2" });
    expect(result).toBe("openai");
  });

  it("returns openai when user enters 'openai'", async () => {
    const result = await resolveInitProvider(undefined, { isTTY: true, ask: async () => "openai" });
    expect(result).toBe("openai");
  });

  it("returns openai when user enters 'o'", async () => {
    const result = await resolveInitProvider(undefined, { isTTY: true, ask: async () => "o" });
    expect(result).toBe("openai");
  });

  it("returns anthropic when user presses Enter (empty string)", async () => {
    const result = await resolveInitProvider(undefined, { isTTY: true, ask: async () => "" });
    expect(result).toBe("anthropic");
  });

  it("returns anthropic when user enters '1'", async () => {
    const result = await resolveInitProvider(undefined, { isTTY: true, ask: async () => "1" });
    expect(result).toBe("anthropic");
  });

  it("returns anthropic when user enters 'anthropic'", async () => {
    const result = await resolveInitProvider(undefined, { isTTY: true, ask: async () => "anthropic" });
    expect(result).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// runInit — provider scaffold tests
// ---------------------------------------------------------------------------

describe("runInit — provider: openai scaffold", () => {
  it("generates config with gpt-5.4-mini as defaults model and gpt-5.5 as design model", async () => {
    const { runInit } = await import("../src/cli/init.js");
    const result = await runInit({ provider: "openai" });

    expect(result).toBe(0);

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe("gpt-5.4-mini");
    expect(config.steps?.defaults?.maxTurns).toBeNull();
    expect(config.steps?.defaults?.timeoutMs).toBeNull();
    expect(config.steps?.design?.model).toBe("gpt-5.5");
  });
});

describe("runInit — provider: anthropic scaffold (legacy-compatible)", () => {
  it("generates config identical to legacy (no steps.design block)", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({ provider: "anthropic" });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe("claude-sonnet-4-6");
    expect(config.steps?.design).toBeUndefined();
  });
});

describe("runInit — no provider flag, non-TTY (CI compatibility)", () => {
  it("defaults to anthropic scaffold when stdin is not a TTY", async () => {
    // process.stdin.isTTY is undefined/false in test environment
    const { runInit } = await import("../src/cli/init.js");
    await runInit({});

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe("claude-sonnet-4-6");
    expect(config.steps?.design).toBeUndefined();
  });
});

describe("runInit — config exists, provider flag is ignored", () => {
  it("does not overwrite existing config when --provider openai is passed", async () => {
    // Write an existing config
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ provider: "openai" });

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    // Should be unchanged — openai defaults NOT applied
    expect(config.steps?.defaults?.model).toBe("claude-sonnet-4-6");
    expect(config.steps?.design).toBeUndefined();
  });
});
