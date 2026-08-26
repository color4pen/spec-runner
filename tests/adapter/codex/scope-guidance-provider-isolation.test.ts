/**
 * TC-008: Guidance not referenced outside the Codex adapter
 * TC-009: Shared prompt builder output is unchanged
 * TC-012: scope-guidance.ts is a pure constant module with no imports
 * TC-013: CODEX_SCOPE_GUIDANCE constant value matches spec.md exactly
 * TC-016: Core policy type has no new provider-related fields
 *
 * Provider isolation guard tests — verify that the Codex scope guidance is confined
 * to src/adapter/codex/ and does not leak into shared, Claude, managed, or core sources.
 * Also verifies that CODEX_SCOPE_GUIDANCE equals the canonical text in spec.md.
 * Follows the grep-type guard test pattern established by tests/dead-guidance.test.ts.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CODEX_SCOPE_GUIDANCE } from "../../../src/adapter/codex/scope-guidance.js";
import { buildAdditionalInstructions, buildResumeSection } from "../../../src/adapter/shared/prompt-builder.js";
import type { AgentRunContext } from "../../../src/core/port/agent-runner.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { JobState } from "../../../src/state/schema.js";

const SRC_DIR = path.resolve(__dirname, "../../../src");
const CODEX_ADAPTER_DIR = path.join(SRC_DIR, "adapter", "codex");
const SCOPE_GUIDANCE_FILE = path.join(CODEX_ADAPTER_DIR, "scope-guidance.ts");

// Markers that must not appear outside src/adapter/codex/
const FORBIDDEN_MARKERS = [
  "CODEX_SCOPE_GUIDANCE",
  "scope-guidance",
  "SpecRunner execution guidance:",
];

/**
 * Recursively collect non-test production .ts files under a directory,
 * excluding __tests__ subdirectories (mirrors dead-guidance.test.ts helper).
 */
async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "__tests__") {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: Guidance markers not referenced outside src/adapter/codex/
// Spec Requirement: Non-Codex providers are unaffected by the guidance
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-008: guidance markers not referenced outside src/adapter/codex/", () => {
  it("no production source file outside src/adapter/codex/ contains CODEX_SCOPE_GUIDANCE, scope-guidance, or SpecRunner execution guidance:", async () => {
    const allTsFiles = await collectTsFiles(SRC_DIR);
    // Exclude files inside src/adapter/codex/ — those are the allowed home of the guidance
    const outsideFiles = allTsFiles.filter(
      (f) => !f.startsWith(CODEX_ADAPTER_DIR + path.sep) && f !== CODEX_ADAPTER_DIR,
    );

    const violations: { file: string; line: number; marker: string; content: string }[] = [];

    for (const filePath of outsideFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const marker of FORBIDDEN_MARKERS) {
          if (line.includes(marker)) {
            violations.push({
              file: path.relative(SRC_DIR, filePath),
              line: i + 1,
              marker,
              content: line.trim(),
            });
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} [${v.marker}]: ${v.content}`)
        .join("\n");
      throw new Error(
        `Found guidance reference outside src/adapter/codex/ (forbidden):\n${report}`,
      );
    }

    expect(violations.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: scope-guidance.ts is a pure constant module with no imports
// Design D3: small prompt constant module, no logic, no dependencies
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-012: scope-guidance.ts is a pure constant module with no imports", () => {
  it("src/adapter/codex/scope-guidance.ts contains no import or require statements", async () => {
    const content = await fs.readFile(SCOPE_GUIDANCE_FILE, "utf-8");
    const lines = content.split("\n");

    // Check for actual import/require STATEMENTS (lines that start with these keywords after
    // trimming whitespace). This avoids false positives from comments that mention "import"
    // as an ordinary word, while still catching any real import declaration.
    const violations: { line: number; pattern: string; content: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const trimmed = line.trimStart();
      if (trimmed.startsWith("import ") || trimmed.startsWith("import(") || trimmed.startsWith("require(")) {
        violations.push({ line: i + 1, pattern: trimmed.split(" ")[0] ?? "import", content: trimmed });
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  line ${v.line} [${v.pattern}]: ${v.content}`)
        .join("\n");
      throw new Error(
        `scope-guidance.ts must be a pure constant module with no imports:\n${report}`,
      );
    }

    expect(violations.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: Shared prompt builder output is unchanged
// Spec Requirement: Non-Codex providers are unaffected by the guidance
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-009: shared prompt builder output contains no guidance", () => {
  function makeMinimalCtx(): AgentRunContext {
    const step: AgentStep = {
      kind: "agent",
      name: "implementer",
      agent: { name: "specrunner-implementer", role: "implementer", model: "claude-sonnet-5", system: "implement", tools: [] },
      toolHandlers: undefined,
      buildMessage: () => "build message",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    };
    const state: JobState = {
      version: 2,
      jobId: "test-job",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: "implementer",
      status: "running",
      branch: "feat/test",
      history: [],
      error: null,
      steps: {},
    };
    const config: SpecRunnerConfig = { version: 1, runtime: "local", agents: {} };
    return {
      step,
      state,
      branch: "feat/test",
      slug: "test-slug",
      cwd: "/tmp/test-cwd",
      input: { requestContent: "test request", requestAdr: false },
      session: { resumePrompt: "some resume context" },
      policy: {},
      requestType: "bug-fix",
      config,
      emit: () => {},
    } as AgentRunContext;
  }

  it("buildAdditionalInstructions does not contain guidance markers", () => {
    const ctx = makeMinimalCtx();
    const result = buildAdditionalInstructions(ctx);
    for (const marker of FORBIDDEN_MARKERS) {
      expect(result).not.toContain(marker);
    }
  });

  it("buildResumeSection does not contain guidance markers", () => {
    const ctx = makeMinimalCtx();
    const result = buildResumeSection(ctx);
    for (const marker of FORBIDDEN_MARKERS) {
      expect(result).not.toContain(marker);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: CODEX_SCOPE_GUIDANCE constant value matches the canonical text exactly
// Source: tasks.md > T-01 Acceptance Criteria
// The canonical text is frozen here verbatim (originally specified in the
// change's spec.md). It is NOT read from the change folder at runtime: the
// archive step moves specrunner/changes/<slug>/ under changes/archive/, so a
// runtime path into the live change folder breaks after archive.
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-013: CODEX_SCOPE_GUIDANCE value matches canonical spec text exactly", () => {
  it("character-for-character equality with the frozen canonical guidance text", () => {
    const canonicalText = `SpecRunner execution guidance:

- Do not invent requirements beyond the supplied request/spec/reviewer criteria.
- Prioritize issues that materially affect correctness or normal supported execution.
- Do not promote merely theoretical, extremely unlikely, or speculative edge cases to blocking findings.
- A finding must explain the concrete user/runtime impact that justifies changing the implementation.
- If an issue is technically possible but does not justify blocking completion, report it as an observation or omit it.
- Do not broaden the scope in order to make the implementation more defensive or general.`;

    // Character-for-character equality — no paraphrasing, no omission, no extra whitespace
    expect(CODEX_SCOPE_GUIDANCE).toBe(canonicalText);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: Core policy type has no new provider-related fields
// Spec Requirement: The guidance is a single-source adapter-local constant
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-016: src/core/port/agent-runner.ts has no provider guidance fields", () => {
  it("agent-runner.ts policy type does not reference scope-guidance or providerGuidance", async () => {
    const filePath = path.join(SRC_DIR, "core", "port", "agent-runner.ts");
    const content = await fs.readFile(filePath, "utf-8");

    const forbidden = ["scope-guidance", "providerGuidance", "CODEX_SCOPE_GUIDANCE", "SpecRunner execution guidance"];
    const violations: { pattern: string; line: number; content: string }[] = [];

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      for (const pattern of forbidden) {
        if (line.includes(pattern)) {
          violations.push({ pattern, line: i + 1, content: line.trim() });
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  line ${v.line} [${v.pattern}]: ${v.content}`)
        .join("\n");
      throw new Error(
        `src/core/port/agent-runner.ts must not contain provider guidance protocol fields:\n${report}`,
      );
    }

    expect(violations.length).toBe(0);
  });
});
