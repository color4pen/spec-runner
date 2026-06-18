/**
 * Unit tests for src/config/store.ts — loadConfig() overlay behavior.
 *
 * Tests project local config overlay feature:
 * - both: user global + project local → deep merge
 * - project-only: only project local → validate as standalone
 * - global-only: only user global → existing behavior
 * - neither: throws CONFIG_MISSING
 * - parse error: invalid JSON in project local → CONFIG_INVALID
 */
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, saveConfig, saveProjectConfig } from "../../src/config/store.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";
import { SpecRunnerError } from "../../src/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TempDirs = { tmpDir: string; repoRoot: string; xdgConfigDir: string };

async function makeTempDirs(): Promise<TempDirs> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-store-test-"));
  const repoRoot = path.join(tmpDir, "repo");
  const xdgConfigDir = path.join(tmpDir, "xdg");
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.mkdir(path.join(xdgConfigDir, "specrunner"), { recursive: true });
  return { tmpDir, repoRoot, xdgConfigDir };
}

async function cleanup(tmpDir: string): Promise<void> {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

const MINIMAL_FULL_CONFIG = {
  version: 1,
  runtime: "local",
  agents: {},
};

async function writeUserGlobal(xdgConfigDir: string, cfg: unknown): Promise<void> {
  const configPath = path.join(xdgConfigDir, "specrunner", "config.json");
  await fs.writeFile(configPath, JSON.stringify(cfg), "utf-8");
}

async function writeProjectLocal(repoRoot: string, cfg: unknown): Promise<void> {
  const dir = path.join(repoRoot, ".specrunner");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "config.json"), JSON.stringify(cfg), "utf-8");
}

/** Run loadConfig with a specific XDG_CONFIG_HOME env override */
async function loadWithEnv(xdgConfigDir: string, repoRoot?: string) {
  const origEnv = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = xdgConfigDir;
  try {
    return await loadConfig(repoRoot);
  } finally {
    if (origEnv === undefined) {
      delete process.env["XDG_CONFIG_HOME"];
    } else {
      process.env["XDG_CONFIG_HOME"] = origEnv;
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadConfig — global-only (existing behavior)", () => {
  let dirs: TempDirs;

  beforeEach(async () => { dirs = await makeTempDirs(); });
  afterEach(async () => { await cleanup(dirs.tmpDir); });

  it("loads user global config when no repoRoot is provided", async () => {
    await writeUserGlobal(dirs.xdgConfigDir, MINIMAL_FULL_CONFIG);

    const cfg = await loadWithEnv(dirs.xdgConfigDir);
    expect(cfg.version).toBe(1);
    expect(cfg.runtime).toBe("local");
  });

  it("loads user global config when repoRoot has no .specrunner/config.json", async () => {
    await writeUserGlobal(dirs.xdgConfigDir, { ...MINIMAL_FULL_CONFIG, steps: { defaults: { model: "claude-sonnet-4-6" } } });

    const cfg = await loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot);
    expect(cfg.steps?.defaults?.model).toBe("claude-sonnet-4-6");
  });
});

describe("loadConfig — neither (throws CONFIG_MISSING)", () => {
  let dirs: TempDirs;

  beforeEach(async () => { dirs = await makeTempDirs(); });
  afterEach(async () => { await cleanup(dirs.tmpDir); });

  it("throws CONFIG_MISSING when neither user global nor project local exists", async () => {
    await expect(loadWithEnv(dirs.xdgConfigDir)).rejects.toThrow(SpecRunnerError);
    await expect(loadWithEnv(dirs.xdgConfigDir)).rejects.toMatchObject({ code: "CONFIG_MISSING" });
  });
});

describe("loadConfig — project-only (standalone)", () => {
  let dirs: TempDirs;

  beforeEach(async () => { dirs = await makeTempDirs(); });
  afterEach(async () => { await cleanup(dirs.tmpDir); });

  it("loads standalone project local config when user global is absent", async () => {
    await writeProjectLocal(dirs.repoRoot, MINIMAL_FULL_CONFIG);

    const cfg = await loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot);
    expect(cfg.version).toBe(1);
  });

  it("loads partial project local config without explicit version (migration adds version: 1 automatically)", async () => {
    // applyMigration always adds version: 1 and agents: {} — so even a partial config is valid
    // as a standalone project local config after migration.
    await writeProjectLocal(dirs.repoRoot, { steps: { defaults: { model: "claude-sonnet-4-6" } } });

    const cfg = await loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot);
    expect(cfg.version).toBe(1);
    expect(cfg.steps?.defaults?.model).toBe("claude-sonnet-4-6");
  });

  it("throws CONFIG_INVALID when project local standalone has invalid model", async () => {
    await writeProjectLocal(dirs.repoRoot, {
      steps: { defaults: { model: "nonexistent-model-xyz" } },
    });

    await expect(loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });
});

describe("loadConfig — both (deep merge)", () => {
  let dirs: TempDirs;

  beforeEach(async () => { dirs = await makeTempDirs(); });
  afterEach(async () => { await cleanup(dirs.tmpDir); });

  it("project local overrides steps.code-review.model while inheriting other steps", async () => {
    const userGlobal = {
      ...MINIMAL_FULL_CONFIG,
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
        design: { model: "claude-sonnet-4-6", maxTurns: 50 },
        "code-review": { model: "claude-sonnet-4-6" },
      },
    };
    const projectLocal = {
      steps: {
        "code-review": { model: "claude-opus-4-6" },
      },
    };

    await writeUserGlobal(dirs.xdgConfigDir, userGlobal);
    await writeProjectLocal(dirs.repoRoot, projectLocal);

    const cfg = await loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot);

    // Project local code-review.model wins
    expect(cfg.steps?.["code-review"]?.model).toBe("claude-opus-4-6");
    // design step inherited from user global
    expect(cfg.steps?.["design"]?.model).toBe("claude-sonnet-4-6");
    expect(cfg.steps?.["design"]?.maxTurns).toBe(50);
    // defaults inherited
    expect(cfg.steps?.defaults?.model).toBe("claude-sonnet-4-6");
  });

  it("project local byRequestType overlays onto user global step config", async () => {
    const userGlobal = {
      ...MINIMAL_FULL_CONFIG,
      steps: {
        "code-review": { model: "claude-sonnet-4-6" },
      },
    };
    const projectLocal = {
      steps: {
        "code-review": {
          byRequestType: {
            "spec-change": { model: "claude-opus-4-6" },
          },
        },
      },
    };

    await writeUserGlobal(dirs.xdgConfigDir, userGlobal);
    await writeProjectLocal(dirs.repoRoot, projectLocal);

    const cfg = await loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot);

    // Top-level model from user global is preserved
    expect(cfg.steps?.["code-review"]?.model).toBe("claude-sonnet-4-6");
    // byRequestType from project local is merged in
    expect(cfg.steps?.["code-review"]?.byRequestType?.["spec-change"]?.model).toBe("claude-opus-4-6");
  });

  it("project local runtime overrides user global runtime", async () => {
    await writeUserGlobal(dirs.xdgConfigDir, { ...MINIMAL_FULL_CONFIG, runtime: "local" });
    await writeProjectLocal(dirs.repoRoot, { runtime: "managed" });

    const cfg = await loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot);
    expect(cfg.runtime).toBe("managed");
  });

  it("merged config is validated — invalid merged model throws CONFIG_INVALID", async () => {
    await writeUserGlobal(dirs.xdgConfigDir, MINIMAL_FULL_CONFIG);
    // Project local sets an invalid (unknown) model
    await writeProjectLocal(dirs.repoRoot, {
      steps: { defaults: { model: "nonexistent-model-xyz" } },
    });

    await expect(loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });
});

describe("loadConfig — parse error in project local", () => {
  let dirs: TempDirs;

  beforeEach(async () => { dirs = await makeTempDirs(); });
  afterEach(async () => { await cleanup(dirs.tmpDir); });

  it("throws CONFIG_INVALID when project local has invalid JSON", async () => {
    await writeUserGlobal(dirs.xdgConfigDir, MINIMAL_FULL_CONFIG);

    const dir = path.join(dirs.repoRoot, ".specrunner");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "config.json"), "{ invalid json }", "utf-8");

    await expect(loadWithEnv(dirs.xdgConfigDir, dirs.repoRoot)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });
});

// ---------------------------------------------------------------------------
// saveConfig
// ---------------------------------------------------------------------------

describe("saveConfig", () => {
  let dirs: TempDirs;
  let origXdg: string | undefined;

  beforeEach(async () => {
    dirs = await makeTempDirs();
    origXdg = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = dirs.xdgConfigDir;
  });

  afterEach(async () => {
    if (origXdg === undefined) {
      delete process.env["XDG_CONFIG_HOME"];
    } else {
      process.env["XDG_CONFIG_HOME"] = origXdg;
    }
    await cleanup(dirs.tmpDir);
  });

  it("TC-001: retains github field (GHES host config survives saveConfig)", async () => {
    const cfg = {
      version: 1,
      agents: {},
      github: { host: "ghes.example.com", apiBaseUrl: "https://ghes.example.com/api/v3" },
    } as SpecRunnerConfig;

    await saveConfig(cfg);

    const written = JSON.parse(
      await fs.readFile(
        path.join(dirs.xdgConfigDir, "specrunner", "config.json"),
        "utf-8",
      ),
    );
    expect(written.github).toBeDefined();
    expect(written.github.host).toBe("ghes.example.com");
    expect(written.github.apiBaseUrl).toBe("https://ghes.example.com/api/v3");
  });

  it("TC-002: strips legacy agent / timeout / anthropic fields", async () => {
    const cfg = {
      version: 1,
      agents: {},
      agent: "legacy-agent",
      timeout: 1000,
      anthropic: { key: "abc" },
    } as unknown as SpecRunnerConfig;

    await saveConfig(cfg);

    const written = JSON.parse(
      await fs.readFile(
        path.join(dirs.xdgConfigDir, "specrunner", "config.json"),
        "utf-8",
      ),
    );
    expect(written.agent).toBeUndefined();
    expect(written.timeout).toBeUndefined();
    expect(written.anthropic).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveProjectConfig
// ---------------------------------------------------------------------------

describe("saveProjectConfig", () => {
  let dirs: TempDirs;

  beforeEach(async () => { dirs = await makeTempDirs(); });
  afterEach(async () => { await cleanup(dirs.tmpDir); });

  it("writes config to <repoRoot>/.specrunner/config.json", async () => {
    const cfg = {
      steps: { "code-review": { model: "claude-opus-4-6" } },
    };

    await saveProjectConfig(dirs.repoRoot, cfg as never);

    const written = JSON.parse(
      await fs.readFile(path.join(dirs.repoRoot, ".specrunner", "config.json"), "utf-8"),
    );
    expect(written.steps?.["code-review"]?.model).toBe("claude-opus-4-6");
  });

  it("creates the .specrunner directory if it does not exist", async () => {
    await saveProjectConfig(dirs.repoRoot, { version: 1, agents: {} } as never);

    const stat = await fs.stat(path.join(dirs.repoRoot, ".specrunner", "config.json"));
    expect(stat.isFile()).toBe(true);
  });
});
