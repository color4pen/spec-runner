/**
 * Test suite: Anthropic step 既定モデルの世代更新 (sonnet-4-6 → sonnet-5 / opus-4-6[1m] → opus-5)
 *
 * TC-001: config 無しで test-case-gen step の既定モデルが解決される
 * TC-002: 全 13 step の built-in 既定が同一世代である
 * TC-003: design step の既定モデルが claude-opus-5 に解決される
 * TC-004: 新規 anthropic scaffold が sonnet-5 を書き既存の design block を持たない
 * TC-005: 既存 config は init で上書きされない
 * TC-006: config でモデル未指定の one-shot query が sonnet-5 を使う (should)
 * TC-007: 新既定モデルが provider anthropic に解決される
 * TC-008: 旧モデル key も解決可能なまま残る
 * TC-009: PROVIDER_DEFAULTS.anthropic.designModel が undefined である
 * TC-010: preserve 系 fixture シナリオが保全される
 * TC-011: step/command ディレクトリに旧モデル文字列が残らない (gate)
 * TC-012: model-registry.ts の旧モデル文字列が registry key 行のみに残る (gate)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  PROVIDER_DEFAULTS,
  DEFAULT_ONE_SHOT_MODEL,
  BUILTIN_MODEL_REGISTRY,
  mergeModelRegistry,
  resolveProvider,
} from "../src/config/model-registry.js";
import type { SpecRunnerConfig } from "../src/config/schema.js";

// Step imports
import { TestCaseGenStep } from "../src/core/step/test-case-gen.js";
import { BuildFixerStep } from "../src/core/step/build-fixer.js";
import { CodeFixerStep } from "../src/core/step/code-fixer.js";
import { AdrGenStep } from "../src/core/step/adr-gen.js";
import { SpecFixerStep } from "../src/core/step/spec-fixer.js";
import { ImplementerStep } from "../src/core/step/implementer.js";
import { createCustomReviewerStep } from "../src/core/step/custom-reviewer.js";
import { ConformanceStep } from "../src/core/step/conformance.js";
import { SpecReviewStep } from "../src/core/step/spec-review.js";
import { RequestReviewStep } from "../src/core/step/request-review.js";
import { TestMaterializeStep } from "../src/core/step/test-materialize.js";
import { createRegressionGateStep } from "../src/core/step/regression-gate.js";
import { CodeReviewStep } from "../src/core/step/code-review.js";
import { DesignStep } from "../src/core/step/design.js";
import type { ReviewerSnapshot } from "../src/kernel/reviewer-snapshot.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {}, ...overrides };
}

const SONNET_5 = "claude-sonnet-5";
const OPUS_5 = "claude-opus-5";
const OLD_SONNET_46 = "claude-sonnet-4-6";
const OLD_OPUS_46_1M = "claude-opus-4-6[1m]";
const OLD_SONNET_45 = "claude-sonnet-4-5";

/** Minimal ReviewerSnapshot with no model override — falls through to DEFAULT_REVIEW_MODEL */
function makeReviewerSnapshot(): ReviewerSnapshot {
  return {
    name: "test-reviewer",
    maxIterations: 3,
    model: undefined,
    purpose: "test",
    criteria: "test",
    judgment: "test",
    freeText: "",
  };
}

// ---------------------------------------------------------------------------
// TC-001: config 無しで test-case-gen step の既定モデルが解決される
// ---------------------------------------------------------------------------

describe("TC-001: TestCaseGenStep の built-in 既定モデルは claude-sonnet-5 である", () => {
  it("TC-001: TestCaseGenStep.agent.model === 'claude-sonnet-5'", () => {
    expect(TestCaseGenStep.agent.model).toBe(SONNET_5);
  });
});

// ---------------------------------------------------------------------------
// TC-002: 全 13 step の built-in 既定が同一世代である
// ---------------------------------------------------------------------------

describe("TC-002: 全 13 非 design step の built-in 既定モデルはすべて claude-sonnet-5 である", () => {
  it("TC-002: TestCaseGenStep.agent.model === 'claude-sonnet-5'", () => {
    expect(TestCaseGenStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: BuildFixerStep.agent.model === 'claude-sonnet-5'", () => {
    expect(BuildFixerStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: CodeFixerStep.agent.model === 'claude-sonnet-5'", () => {
    expect(CodeFixerStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: AdrGenStep.agent.model === 'claude-sonnet-5'", () => {
    expect(AdrGenStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: SpecFixerStep.agent.model === 'claude-sonnet-5'", () => {
    expect(SpecFixerStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: ImplementerStep.agent.model === 'claude-sonnet-5'", () => {
    expect(ImplementerStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: createCustomReviewerStep (no model override) の既定モデルは claude-sonnet-5", () => {
    const step = createCustomReviewerStep(makeReviewerSnapshot());
    expect(step.agent.model).toBe(SONNET_5);
  });

  it("TC-002: ConformanceStep.agent.model === 'claude-sonnet-5'", () => {
    expect(ConformanceStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: SpecReviewStep.agent.model === 'claude-sonnet-5'", () => {
    expect(SpecReviewStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: RequestReviewStep.agent.model === 'claude-sonnet-5'", () => {
    expect(RequestReviewStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: TestMaterializeStep.agent.model === 'claude-sonnet-5'", () => {
    expect(TestMaterializeStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: createRegressionGateStep の既定モデルは claude-sonnet-5", () => {
    const step = createRegressionGateStep();
    expect(step.agent.model).toBe(SONNET_5);
  });

  it("TC-002: CodeReviewStep.agent.model === 'claude-sonnet-5'", () => {
    expect(CodeReviewStep.agent.model).toBe(SONNET_5);
  });

  it("TC-002: 旧世代 'claude-sonnet-4-6' を持つ step は存在しない", () => {
    const allModels = [
      TestCaseGenStep.agent.model,
      BuildFixerStep.agent.model,
      CodeFixerStep.agent.model,
      AdrGenStep.agent.model,
      SpecFixerStep.agent.model,
      ImplementerStep.agent.model,
      createCustomReviewerStep(makeReviewerSnapshot()).agent.model,
      ConformanceStep.agent.model,
      SpecReviewStep.agent.model,
      RequestReviewStep.agent.model,
      TestMaterializeStep.agent.model,
      createRegressionGateStep().agent.model,
      CodeReviewStep.agent.model,
    ];
    expect(allModels.every((m) => m === SONNET_5)).toBe(true);
    expect(allModels.some((m) => m === OLD_SONNET_46)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-003: design step の既定モデルが claude-opus-5 に解決される
// ---------------------------------------------------------------------------

describe("TC-003: DesignStep の built-in 既定モデルは claude-opus-5 である（[1m] なし）", () => {
  it("TC-003: DesignStep.agent.model === 'claude-opus-5'", () => {
    expect(DesignStep.agent.model).toBe(OPUS_5);
  });

  it("TC-003: DesignStep.agent.model に [1m] サフィックスが含まれない", () => {
    expect(DesignStep.agent.model).not.toContain("[1m]");
  });

  it("TC-003: DesignStep.agent.model が claude-opus-4-6[1m] でない", () => {
    expect(DesignStep.agent.model).not.toBe(OLD_OPUS_46_1M);
  });
});

// ---------------------------------------------------------------------------
// TC-004: 新規 anthropic scaffold が sonnet-5 を書き既存の design block を持たない
// ---------------------------------------------------------------------------

let tempDir: string;
let originalXdgConfigHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-model-refresh-test-"));
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

describe("TC-004: 新規 anthropic scaffold が sonnet-5 を書き steps.design を省略する", () => {
  it("TC-004: provider: anthropic で runInit すると steps.defaults.model === 'claude-sonnet-5'", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({ provider: "anthropic", repoRoot: tempDir });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe(SONNET_5);
  });

  it("TC-004: provider: anthropic で runInit しても steps.design block は出力されない", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({ provider: "anthropic", repoRoot: tempDir });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.design).toBeUndefined();
  });

  it("TC-004: provider フラグなし（non-TTY 既定 anthropic）でも steps.defaults.model === 'claude-sonnet-5'", async () => {
    const { runInit } = await import("../src/cli/init.js");
    await runInit({ repoRoot: tempDir });

    const configPath = path.join(tempDir, "specrunner", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe(SONNET_5);
  });
});

// ---------------------------------------------------------------------------
// TC-005: 既存 config は init で上書きされない
// ---------------------------------------------------------------------------

describe("TC-005: 既存 config の steps.defaults.model は runInit で上書きされない", () => {
  it("TC-005: existingConfig に claude-sonnet-4-6 がある場合、runInit 後も claude-sonnet-4-6 のまま", async () => {
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: OLD_SONNET_46, maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ repoRoot: tempDir });

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe(OLD_SONNET_46);
  });

  it("TC-005: --provider openai を渡しても既存 config は上書きされない（provider flag ignored）", async () => {
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: OLD_SONNET_46, maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ provider: "openai", repoRoot: tempDir });

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    expect(config.steps?.defaults?.model).toBe(OLD_SONNET_46);
    expect(config.steps?.design).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-006 (should): config でモデル未指定の one-shot query が sonnet-5 を使う
// ---------------------------------------------------------------------------

describe("TC-006: DEFAULT_ONE_SHOT_MODEL は claude-sonnet-5 である (should)", () => {
  it("TC-006: DEFAULT_ONE_SHOT_MODEL === 'claude-sonnet-5'", () => {
    expect(DEFAULT_ONE_SHOT_MODEL).toBe(SONNET_5);
  });
});

// ---------------------------------------------------------------------------
// TC-007: 新既定モデルが provider anthropic に解決される
// ---------------------------------------------------------------------------

describe("TC-007: 新既定モデル（claude-sonnet-5 / claude-opus-5）は registry で anthropic に解決される", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("TC-007: resolveProvider('claude-sonnet-5') === 'anthropic'", () => {
    expect(resolveProvider(SONNET_5, merged)).toBe("anthropic");
  });

  it("TC-007: resolveProvider('claude-opus-5') === 'anthropic'", () => {
    expect(resolveProvider(OPUS_5, merged)).toBe("anthropic");
  });

  it("TC-007: resolveProvider はいずれも CONFIG_INVALID を throw しない", () => {
    expect(() => resolveProvider(SONNET_5, merged)).not.toThrow();
    expect(() => resolveProvider(OPUS_5, merged)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-008: 旧モデル key も解決可能なまま残る
// ---------------------------------------------------------------------------

describe("TC-008: 旧モデル key は registry から削除されず解決可能なまま残る", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("TC-008: resolveProvider('claude-sonnet-4-6') === 'anthropic'（backward-compat）", () => {
    expect(resolveProvider(OLD_SONNET_46, merged)).toBe("anthropic");
  });

  it("TC-008: resolveProvider('claude-opus-4-6[1m]') === 'anthropic'（backward-compat）", () => {
    expect(resolveProvider(OLD_OPUS_46_1M, merged)).toBe("anthropic");
  });

  it("TC-008: resolveProvider('claude-sonnet-4-5') === 'anthropic'（backward-compat）", () => {
    expect(resolveProvider(OLD_SONNET_45, merged)).toBe("anthropic");
  });

  it("TC-008: BUILTIN_MODEL_REGISTRY に旧モデル key が存在する", () => {
    expect(BUILTIN_MODEL_REGISTRY[OLD_SONNET_46]).toBeDefined();
    expect(BUILTIN_MODEL_REGISTRY[OLD_OPUS_46_1M]).toBeDefined();
    expect(BUILTIN_MODEL_REGISTRY[OLD_SONNET_45]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-009: PROVIDER_DEFAULTS.anthropic.designModel が undefined である
// ---------------------------------------------------------------------------

describe("TC-009: PROVIDER_DEFAULTS.anthropic は designModel を持たず defaultModel は claude-sonnet-5 である", () => {
  it("TC-009: PROVIDER_DEFAULTS.anthropic.designModel === undefined", () => {
    expect(PROVIDER_DEFAULTS.anthropic.designModel).toBeUndefined();
  });

  it("TC-009: PROVIDER_DEFAULTS.anthropic.defaultModel === 'claude-sonnet-5'", () => {
    expect(PROVIDER_DEFAULTS.anthropic.defaultModel).toBe(SONNET_5);
  });
});

// ---------------------------------------------------------------------------
// TC-010: preserve 系シナリオ — 既存 config の旧モデルが保全される
// ---------------------------------------------------------------------------

describe("TC-010: preserve 系シナリオ — existingConfig の claude-sonnet-4-6 は runInit で保全される", () => {
  it("TC-010: existingConfig.steps.defaults.model が claude-sonnet-4-6 → runInit 後も claude-sonnet-4-6", async () => {
    const configDir = path.join(tempDir, "specrunner");
    await fs.mkdir(configDir, { recursive: true });
    const existingConfig = {
      version: 1,
      agents: {},
      steps: { defaults: { model: OLD_SONNET_46, maxTurns: null, timeoutMs: null } },
    };
    const configPath = path.join(configDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify(existingConfig), { mode: 0o600 });

    const { runInit } = await import("../src/cli/init.js");
    await runInit({ repoRoot: tempDir });

    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    // Preserve: 既存 config の明示値は新既定で上書きされない
    expect(config.steps?.defaults?.model).toBe(OLD_SONNET_46);
  });
});

// ---------------------------------------------------------------------------
// TC-011: step/command ディレクトリに旧モデル文字列が残らない (gate)
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(__dirname, "../src");
const OLD_MODEL_PATTERN = /claude-sonnet-4-6|claude-opus-4-6\[1m\]|claude-sonnet-4-5/;

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name as string);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && (entry.name as string).endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("TC-011: src/core/step/ と src/core/command/ に旧モデル文字列が残らない (gate)", () => {
  it("TC-011: src/core/step/ の .ts ファイルに旧モデル名が含まれない（__tests__ 除外）", async () => {
    const stepDir = path.join(SRC_DIR, "core", "step");
    const files = (await collectTsFiles(stepDir)).filter(
      (f) => !f.includes("__tests__"),
    );

    const violations: { file: string; line: number; content: string }[] = [];
    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (OLD_MODEL_PATTERN.test(line)) {
          violations.push({
            file: path.relative(SRC_DIR, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(
        `TC-011: 旧モデル文字列が src/core/step/ に残存:\n${report}`,
      );
    }
    expect(violations.length).toBe(0);
  });

  it("TC-011: src/core/command/ の .ts ファイルに旧モデル名が含まれない（__tests__ 除外）", async () => {
    const commandDir = path.join(SRC_DIR, "core", "command");
    const files = (await collectTsFiles(commandDir)).filter(
      (f) => !f.includes("__tests__"),
    );

    const violations: { file: string; line: number; content: string }[] = [];
    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (OLD_MODEL_PATTERN.test(line)) {
          violations.push({
            file: path.relative(SRC_DIR, filePath),
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(
        `TC-011: 旧モデル文字列が src/core/command/ に残存:\n${report}`,
      );
    }
    expect(violations.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: model-registry.ts の旧モデル文字列が registry key 行のみに残る (gate)
// ---------------------------------------------------------------------------

describe("TC-012: src/config/model-registry.ts の旧モデル文字列は BUILTIN_MODEL_REGISTRY の key 行のみ (gate)", () => {
  it("TC-012: model-registry.ts の defaultModel / DEFAULT_ONE_SHOT_MODEL / コメントに旧モデル名が残らない", async () => {
    const registryPath = path.join(SRC_DIR, "config", "model-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");
    const lines = content.split("\n");

    // Lines that are registry key entries (inside BUILTIN_MODEL_REGISTRY) are allowed.
    // We detect these by checking if the line looks like `"model-name": { provider: ...` indent pattern.
    const REGISTRY_KEY_LINE = /^\s+"(?:claude|gpt)[^"]*":\s*\{/;

    const violations: { line: number; content: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (OLD_MODEL_PATTERN.test(line) && !REGISTRY_KEY_LINE.test(line)) {
        violations.push({ line: i + 1, content: line.trim() });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  line ${v.line}: ${v.content}`)
        .join("\n");
      throw new Error(
        `TC-012: 旧モデル文字列が registry key 行以外に残存 (model-registry.ts):\n${report}`,
      );
    }
    expect(violations.length).toBe(0);
  });

  it("TC-012: src/cli/init.ts の対象コメントに旧モデル名が残らない", async () => {
    const initPath = path.join(SRC_DIR, "cli", "init.ts");
    const content = await fs.readFile(initPath, "utf-8");

    // Only check for the opus-4-6[1m] reference — the init.ts comment should be updated to opus-5
    expect(content).not.toContain(OLD_OPUS_46_1M);
  });
});
