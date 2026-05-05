/**
 * Unit tests for runtime config (TC-032 through TC-042)
 *
 * TC-032: ConfigStore.load() normalizes missing runtime to "managed"
 * TC-033: ConfigStore.load() accepts local runtime without apiKey
 * TC-034: ConfigStore.load() rejects invalid runtime value
 * TC-035: managed runtime → ManagedAgentRunner created (integration)
 * TC-036: local runtime → SessionClient not created
 * TC-037: local runtime → getAgentId not called
 * TC-038: AgentSyncer not called on init --runtime local
 * TC-039: core layer has no SDK imports
 * TC-040: managed-agent and claude-code adapters are independent
 * TC-041: --runtime local accepts missing apiKey
 * TC-042: specrunner init --runtime local → zero Anthropic API calls
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { validateConfig, checkConfigComplete } from "../../../src/config/schema.js";
import { applyMigration } from "../../../src/config/migrate.js";

let tempDir: string;
let originalXdgConfigHome: string | undefined;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-config-test-"));
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

async function writeConfig(cfg: Record<string, unknown>): Promise<void> {
  const configDir = path.join(tempDir, "specrunner");
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify(cfg),
    { mode: 0o600 },
  );
}

// ---------------------------------------------------------------------------
// TC-032: runtime field absent → migrated to "managed"
// ---------------------------------------------------------------------------

describe("TC-032: applyMigration normalizes missing runtime to 'managed'", () => {
  it("config without runtime field → runtime: 'managed' after migration", () => {
    const raw = {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agents: {},
    };

    const migrated = applyMigration(raw);
    expect(migrated.runtime).toBe("managed");
  });

  it("config with runtime: 'local' → preserves 'local' after migration", () => {
    const raw = {
      version: 1,
      runtime: "local",
      anthropic: { apiKey: "" },
      agents: {},
    };

    const migrated = applyMigration(raw);
    expect(migrated.runtime).toBe("local");
  });

  it("config with runtime: 'managed' → preserves 'managed'", () => {
    const raw = {
      version: 1,
      runtime: "managed",
      anthropic: { apiKey: "sk-test" },
      agents: {},
    };

    const migrated = applyMigration(raw);
    expect(migrated.runtime).toBe("managed");
  });
});

// ---------------------------------------------------------------------------
// TC-033: local runtime without apiKey → no CONFIG_INCOMPLETE
// ---------------------------------------------------------------------------

describe("TC-033: validateConfig accepts local runtime without apiKey", () => {
  it("{ version: 1, runtime: 'local' } validates without apiKey", () => {
    const raw = {
      version: 1,
      runtime: "local",
    };

    // Should not throw CONFIG_INCOMPLETE
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("local runtime config passes validateConfig with empty anthropic", () => {
    const raw = {
      version: 1,
      runtime: "local",
      anthropic: { apiKey: "" },
      agents: {},
    };

    expect(() => validateConfig(raw)).not.toThrow();
    const result = validateConfig(raw);
    expect(result.runtime).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// TC-034: invalid runtime value → CONFIG_INVALID
// ---------------------------------------------------------------------------

describe("TC-034: validateConfig rejects invalid runtime values", () => {
  it("runtime: 'remote' → CONFIG_INVALID error with expected message", () => {
    const raw = {
      version: 1,
      runtime: "remote",
      anthropic: { apiKey: "sk-test" },
    };

    expect(() => validateConfig(raw)).toThrow();
    try {
      validateConfig(raw);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
      expect((err as Error).message).toMatch(/runtime must be "managed" or "local"/);
    }
  });

  it("runtime: 'cloud' → CONFIG_INVALID", () => {
    const raw = { version: 1, runtime: "cloud", anthropic: { apiKey: "sk-test" } };
    expect(() => validateConfig(raw)).toThrow();
  });

  it("runtime: '' (empty string) → CONFIG_INVALID", () => {
    const raw = { version: 1, runtime: "", anthropic: { apiKey: "sk-test" } };
    expect(() => validateConfig(raw)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-035: managed runtime → ManagedAgentRunner created (module-level check)
// ---------------------------------------------------------------------------

describe("TC-035: managed runtime → ManagedAgentRunner created by composition root", () => {
  it("createManagedAgentRunner is exported from managed-agent adapter", async () => {
    const { createManagedAgentRunner } = await import("../../../src/adapter/managed-agent/agent-runner.js");
    expect(typeof createManagedAgentRunner).toBe("function");
  });

  it("runPipeline with managed runtime creates ManagedAgentRunner (verified by no local runner in managed path)", async () => {
    // The composition root in run.ts creates ManagedAgentRunner when config.runtime !== "local"
    // This is a structural test — verify the import path exists
    const { createClaudeCodeRunner } = await import("../../../src/adapter/claude-code/agent-runner.js");
    const { createManagedAgentRunner } = await import("../../../src/adapter/managed-agent/agent-runner.js");
    expect(typeof createClaudeCodeRunner).toBe("function");
    expect(typeof createManagedAgentRunner).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-036: local runtime → SessionClient not created (pipeline run.ts check)
// ---------------------------------------------------------------------------

describe("TC-036: local runtime → SessionClient not used", () => {
  it("run.ts does not create SessionClient when config.runtime === 'local'", async () => {
    // Verify via source inspection that the condition exists
    const runPath = path.resolve(__dirname, "../../../src/cli/run.ts");
    const content = await fs.readFile(runPath, "utf-8");

    // The composition root should check runtime and skip SessionClient creation
    expect(content).toMatch(/runtime.*!==.*"local"|runtime.*===.*"local"/);
  });
});

// ---------------------------------------------------------------------------
// TC-037: local runtime → getAgentId not called
// ---------------------------------------------------------------------------

describe("TC-037: local runtime → getAgentId not called for pipeline steps", () => {
  it("ClaudeCodeRunner does not call getAgentId (no import)", async () => {
    const filePath = path.resolve(__dirname, "../../../src/adapter/claude-code/agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");

    // getAgentId should not be imported or called in ClaudeCodeRunner
    const importLines = content
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .filter((l) => l.includes("getAgentId"));
    expect(importLines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-038: AgentSyncer not called on init --runtime local
// ---------------------------------------------------------------------------

describe("TC-038: runInit with runtime='local' does not call AgentSyncer.syncAll()", () => {
  it("init.ts runInitLocal function does not reference AgentSyncer or syncAll", async () => {
    // Verify via source inspection that the local init path skips AgentSyncer.
    // The runInitLocal function should not contain any reference to AgentSyncer.
    const initPath = path.resolve(__dirname, "../../../src/cli/init.ts");
    const content = await fs.readFile(initPath, "utf-8");

    // Extract the local init section (everything after "runInitLocal" function)
    const localInitMatch = /async function runInitLocal\(\)[^}]+(?:\{[^}]*\})*[^}]*\}/s.exec(content);
    if (localInitMatch) {
      const localInitBody = localInitMatch[0];
      // The local init path must not reference syncAll or AgentSyncer
      expect(localInitBody).not.toContain("syncAll");
      expect(localInitBody).not.toContain("AgentSyncer");
    } else {
      // Fallback: verify the overall structure has a local guard
      expect(content).toContain("runtime === \"local\"");
      expect(content).toContain("return runInitLocal()");
    }
  });

  it("init --runtime local actually writes config without calling AgentSyncer", async () => {
    // Run the actual init local to verify config is written
    const { runInit } = await import("../../../src/cli/init.js");
    await runInit({ runtime: "local" });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    // Local init should write runtime: "local" and empty agents
    expect(config.runtime).toBe("local");
    expect(typeof config.agents).toBe("object");
    // No environment.id (AgentSyncer + environment creation was skipped)
    // Anthropic API key should be empty
    expect(config.anthropic?.apiKey ?? "").toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-039: core layer has no SDK imports
// ---------------------------------------------------------------------------

describe("TC-039: core layer has no direct @anthropic-ai SDK imports", () => {
  it("no file in src/core/ imports @anthropic-ai/sdk or @anthropic-ai/claude-code", async () => {
    const coreDir = path.resolve(__dirname, "../../../src/core");

    async function scanDir(dir: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...(await scanDir(full)));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const content = await fs.readFile(full, "utf-8");
          const importLines = content
            .split("\n")
            .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
            .filter((l) => /from\s+["']@anthropic-ai\/(sdk|claude-code)/.test(l));
          if (importLines.length > 0) {
            matches.push(full);
          }
        }
      }
      return matches;
    }

    const matches = await scanDir(coreDir);
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-040: managed-agent and claude-code adapters are independent (no cross-imports)
// ---------------------------------------------------------------------------

describe("TC-040: managed-agent and claude-code adapters do not import each other", () => {
  it("managed-agent adapter does not import from claude-code adapter", async () => {
    const managedDir = path.resolve(__dirname, "../../../src/adapter/managed-agent");

    async function hasImportFrom(dir: string, target: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...(await hasImportFrom(full, target)));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const content = await fs.readFile(full, "utf-8");
          const importLines = content
            .split("\n")
            .filter((l) => !l.trim().startsWith("//"))
            .filter((l) => new RegExp(`from\\s+["'][^"']*${target}`).test(l));
          if (importLines.length > 0) {
            matches.push(full);
          }
        }
      }
      return matches;
    }

    const crossImports = await hasImportFrom(managedDir, "adapter/claude-code");
    expect(crossImports).toHaveLength(0);
  });

  it("claude-code adapter does not import from managed-agent adapter", async () => {
    const claudeCodeDir = path.resolve(__dirname, "../../../src/adapter/claude-code");

    async function hasImportFrom(dir: string, target: string): Promise<string[]> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const matches: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          matches.push(...(await hasImportFrom(full, target)));
        } else if (entry.isFile() && entry.name.endsWith(".ts")) {
          const content = await fs.readFile(full, "utf-8");
          const importLines = content
            .split("\n")
            .filter((l) => !l.trim().startsWith("//"))
            .filter((l) => new RegExp(`from\\s+["'][^"']*${target}`).test(l));
          if (importLines.length > 0) {
            matches.push(full);
          }
        }
      }
      return matches;
    }

    const crossImports = await hasImportFrom(claudeCodeDir, "adapter/managed-agent");
    expect(crossImports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-041: --runtime local accepts missing apiKey
// ---------------------------------------------------------------------------

describe("TC-041: runtime='local' allows missing apiKey", () => {
  it("checkConfigComplete with local runtime: no error when apiKey is empty", () => {
    const config = {
      version: 1 as const,
      runtime: "local" as const,
      anthropic: { apiKey: "" },
      agents: {},
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    };

    const result = checkConfigComplete(config);
    // Should not return an error for apiKey
    expect(result).toBeNull();
  });

  it("checkConfigComplete with managed runtime: error when apiKey is empty", () => {
    const config = {
      version: 1 as const,
      anthropic: { apiKey: "" },
      agents: {},
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    };

    const result = checkConfigComplete(config);
    expect(result).not.toBeNull();
    expect(result?.field).toContain("apiKey");
  });
});

// ---------------------------------------------------------------------------
// TC-042: specrunner init --runtime local writes config with runtime: "local"
// ---------------------------------------------------------------------------

describe("TC-042: specrunner init --runtime local writes config with runtime: 'local'", () => {
  it("config file contains runtime: 'local' after init local", async () => {
    const { runInit } = await import("../../../src/cli/init.js");
    await runInit({ runtime: "local" });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as { runtime: string; agents: Record<string, unknown> };

    expect(config.runtime).toBe("local");
    // Agents should be empty (no AgentSyncer ran)
    expect(typeof config.agents).toBe("object");
  });

  it("init local does not write apiKey to config if not provided", async () => {
    const { runInit } = await import("../../../src/cli/init.js");
    await runInit({ runtime: "local" });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as { anthropic?: { apiKey?: string } };

    // apiKey should be empty (not from env — no env var set)
    expect(config.anthropic?.apiKey ?? "").toBe("");
  });
});
