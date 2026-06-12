import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfigWithSourceMetadata } from "../../src/config/store.js";

let tempDir: string;
let originalXdg: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "specrunner-config-source-"));
  originalXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = join(tempDir, "xdg");
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = originalXdg;
  await rm(tempDir, { recursive: true, force: true });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf-8");
}

function globalPath(): string {
  return join(tempDir, "xdg", "specrunner", "config.json");
}

function projectPath(repoRoot: string): string {
  return join(repoRoot, ".specrunner", "config.json");
}

describe("loadConfigWithSourceMetadata", () => {
  it("loads user-only config and records missing project path", async () => {
    await writeJson(globalPath(), {
      version: 1,
      runtime: "local",
      steps: { defaults: { model: "claude-sonnet-4-6" } },
    });
    const repoRoot = join(tempDir, "repo");
    await mkdir(repoRoot, { recursive: true });

    const result = await loadConfigWithSourceMetadata(repoRoot);

    expect(result.config.steps?.defaults?.model).toBe("claude-sonnet-4-6");
    expect(result.userGlobal.exists).toBe(true);
    expect(result.projectLocal.exists).toBe(false);
    expect(result.projectLocal.path).toBe(projectPath(repoRoot));
  });

  it("loads project-only config as a standalone config", async () => {
    const repoRoot = join(tempDir, "repo");
    await writeJson(projectPath(repoRoot), {
      version: 1,
      runtime: "local",
      steps: { defaults: { model: "claude-opus-4-6" } },
    });

    const result = await loadConfigWithSourceMetadata(repoRoot);

    expect(result.config.steps?.defaults?.model).toBe("claude-opus-4-6");
    expect(result.userGlobal.exists).toBe(false);
    expect(result.projectLocal.exists).toBe(true);
  });

  it("deep-merges user global with partial project local without standalone project validation", async () => {
    await writeJson(globalPath(), {
      version: 1,
      runtime: "local",
      steps: { defaults: { model: "claude-sonnet-4-6", maxTurns: 20 } },
    });
    const repoRoot = join(tempDir, "repo");
    await writeJson(projectPath(repoRoot), {
      steps: { defaults: { model: "gpt-5.5" } },
    });

    const result = await loadConfigWithSourceMetadata(repoRoot);

    expect(result.config.steps?.defaults?.model).toBe("gpt-5.5");
    expect(result.config.steps?.defaults?.maxTurns).toBe(20);
    expect(result.userGlobal.exists).toBe(true);
    expect(result.projectLocal.exists).toBe(true);
  });
});
