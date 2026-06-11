/**
 * Tests for src/core/command/rules-new.ts
 *
 * TC-RULES-001: valid step-name + rule-slug → file created, exit 0, stdout has path
 * TC-RULES-002: invalid step-name → exit 2, stderr shows candidate list
 * TC-RULES-003: CLI step names (verification, pr-create, delta-spec-validation) → exit 2
 * TC-RULES-004: existing files in dir → next number used (01 → 02, gaps handled)
 * TC-RULES-005: slug with '_' → warning + '-' conversion + file created
 * TC-RULES-006: slug with space → warning + '-' conversion + file created
 * TC-RULES-007: invalid slug (path traversal, uppercase) → exit 2
 * TC-RULES-008: slug-level collision → exit 1 (same slug exists in dir with any prefix)
 * TC-RULES-009: empty directory → starts from '01-'
 * TC-RULES-010: template has 3 recommended sections and leading comment
 * TC-RULES-011: README.md (no numeric prefix) → NaN excluded, numbering correct
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { AGENT_STEP_NAMES } from "../../../../src/core/step/step-names.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-rules-new-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function invokeExecuteRulesNew(stepName: string, ruleSlug: string, cwd = tempDir) {
  const { executeRulesNew } = await import("../../../../src/core/command/rules-new.js");
  return executeRulesNew(stepName, ruleSlug, cwd);
}

function getStdout(): string {
  return (vi.mocked(process.stdout.write).mock.calls as unknown[][])
    .map((c) => String(c[0]))
    .join("");
}

function getStderr(): string {
  return (vi.mocked(process.stderr.write).mock.calls as unknown[][])
    .map((c) => String(c[0]))
    .join("");
}

// ─── TC-RULES-001: 基本正常系 ────────────────────────────────────────────────

describe("TC-RULES-001: valid step-name + rule-slug creates file", () => {
  it("creates file and returns 0, stdout contains relative path", async () => {
    const result = await invokeExecuteRulesNew("implementer", "no-inline-comment");
    expect(result).toBe(0);

    const filePath = path.join(tempDir, "specrunner", "rules", "implementer", "01-no-inline-comment.md");
    await expect(fs.access(filePath).then(() => undefined)).resolves.toBeUndefined();

    expect(getStdout()).toContain("specrunner/rules/implementer/01-no-inline-comment.md");
  });
});

// ─── TC-RULES-002: 既存ファイルあり → 次番号で採番 ───────────────────────────

describe("TC-RULES-004: existing file → next number used", () => {
  it("creates 02- when 01- already exists", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "implementer");
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, "01-existing.md"), "# existing\n");

    const result = await invokeExecuteRulesNew("implementer", "new-rule");
    expect(result).toBe(0);

    await expect(fs.access(path.join(rulesDir, "02-new-rule.md")).then(() => undefined)).resolves.toBeUndefined();
  });

  it("creates 04- when 01, 03 exist (gap at 02)", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "code-review");
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, "01-a.md"), "# a\n");
    await fs.writeFile(path.join(rulesDir, "03-c.md"), "# c\n");

    const result = await invokeExecuteRulesNew("code-review", "baz");
    expect(result).toBe(0);

    // max=3, next=4
    await expect(fs.access(path.join(rulesDir, "04-baz.md")).then(() => undefined)).resolves.toBeUndefined();
  });
});

// ─── TC-RULES-002: 無効な step-name → exit 2 + 候補一覧 ─────────────────────

describe("TC-RULES-002: invalid step-name returns exit 2 with candidates", () => {
  it("returns 2 and stderr shows error message and valid step names", async () => {
    const result = await invokeExecuteRulesNew("implmentor", "my-rule");
    expect(result).toBe(2);

    const stderr = getStderr();
    expect(stderr).toContain("implmentor");
    expect(stderr).toContain("implementer");
  });

  it("typo 'code-reveiw' also shows candidates", async () => {
    const result = await invokeExecuteRulesNew("code-reveiw", "my-rule");
    expect(result).toBe(2);
    expect(getStderr()).toContain("code-review");
  });
});

// ─── TC-RULES-003: CLI step names → exit 2 ───────────────────────────────────

describe("TC-RULES-003: CLI step names are rejected", () => {
  it("returns 2 for 'verification'", async () => {
    expect(await invokeExecuteRulesNew("verification", "my-rule")).toBe(2);
  });

  it("returns 2 for 'pr-create'", async () => {
    expect(await invokeExecuteRulesNew("pr-create", "my-rule")).toBe(2);
  });

  it("returns 2 for 'delta-spec-validation'", async () => {
    expect(await invokeExecuteRulesNew("delta-spec-validation", "my-rule")).toBe(2);
  });
});

// ─── TC-RULES-005: slug に '_' → warning + 変換 ────────────────────────────

describe("TC-RULES-005: slug with underscore → warning + conversion", () => {
  it("converts underscores to hyphens and creates file", async () => {
    const result = await invokeExecuteRulesNew("implementer", "no_inline_comment");
    expect(result).toBe(0);

    const stderr = getStderr();
    expect(stderr).toContain("Warning");
    expect(stderr).toContain("no-inline-comment");

    await expect(
      fs.access(path.join(tempDir, "specrunner", "rules", "implementer", "01-no-inline-comment.md")).then(() => undefined),
    ).resolves.toBeUndefined();
  });
});

// ─── TC-RULES-006: slug に空白 → warning + 変換 ────────────────────────────

describe("TC-RULES-006: slug with space → warning + conversion", () => {
  it("converts spaces to hyphens and creates file", async () => {
    const result = await invokeExecuteRulesNew("implementer", "no inline comment");
    expect(result).toBe(0);

    expect(getStderr()).toContain("Warning");

    await expect(
      fs.access(path.join(tempDir, "specrunner", "rules", "implementer", "01-no-inline-comment.md")).then(() => undefined),
    ).resolves.toBeUndefined();
  });
});

// ─── TC-RULES-007: 無効な slug → exit 2 ─────────────────────────────────────

describe("TC-RULES-007: invalid slug rejected with exit 2", () => {
  it("returns 2 for path traversal '../../evil'", async () => {
    const result = await invokeExecuteRulesNew("implementer", "../../evil");
    expect(result).toBe(2);
    expect(getStderr()).toContain("Invalid");
  });

  it("returns 2 for slug with uppercase 'NoInlineComment'", async () => {
    expect(await invokeExecuteRulesNew("implementer", "NoInlineComment")).toBe(2);
  });

  it("returns 2 for slug starting with hyphen", async () => {
    expect(await invokeExecuteRulesNew("implementer", "-bad-start")).toBe(2);
  });
});

// ─── TC-RULES-008: slug-level collision → exit 1 ────────────────────────────

describe("TC-RULES-008: slug-level collision returns exit 1", () => {
  it("returns 1 when a file with the same slug already exists (any prefix)", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "implementer");
    await fs.mkdir(rulesDir, { recursive: true });
    // Manually create "01-no-inline-comment.md" (as if from a previous CLI invocation)
    await fs.writeFile(path.join(rulesDir, "01-no-inline-comment.md"), "# existing\n");

    // Running again with the same slug → slug-level collision detected → exit 1
    const result = await invokeExecuteRulesNew("implementer", "no-inline-comment");
    expect(result).toBe(1);

    const stderr = getStderr();
    expect(stderr).toContain("no-inline-comment");
    expect(stderr).toContain("01-no-inline-comment.md");
  });

  it("does not collide when using a DIFFERENT slug in same dir", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "implementer");
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, "01-other-rule.md"), "# other\n");

    // Different slug → no collision
    const result = await invokeExecuteRulesNew("implementer", "my-new-rule");
    expect(result).toBe(0);

    await expect(fs.access(path.join(rulesDir, "02-my-new-rule.md")).then(() => undefined)).resolves.toBeUndefined();
  });
});

// ─── TC-RULES-009: 空ディレクトリ → 01- から開始 ──────────────────────────

describe("TC-RULES-009: empty directory starts from 01-", () => {
  it("creates 01- when directory does not exist yet", async () => {
    const result = await invokeExecuteRulesNew("code-fixer", "first-rule");
    expect(result).toBe(0);

    await expect(
      fs.access(path.join(tempDir, "specrunner", "rules", "code-fixer", "01-first-rule.md")).then(() => undefined),
    ).resolves.toBeUndefined();

    expect(getStdout()).toContain("01-first-rule.md");
  });

  it("creates 01- when directory is empty", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "adr-gen");
    await fs.mkdir(rulesDir, { recursive: true });

    const result = await invokeExecuteRulesNew("adr-gen", "bootstrap");
    expect(result).toBe(0);

    await expect(fs.access(path.join(rulesDir, "01-bootstrap.md")).then(() => undefined)).resolves.toBeUndefined();
  });
});

// ─── TC-RULES-010: template に推奨見出しと冒頭コメント ──────────────────────

describe("TC-RULES-010: template contains required content", () => {
  it("generated file has leading comment and 3 recommended headings", async () => {
    await invokeExecuteRulesNew("design", "my-template-test");

    const filePath = path.join(tempDir, "specrunner", "rules", "design", "01-my-template-test.md");
    const content = await fs.readFile(filePath, "utf-8");

    // Leading comment
    expect(content).toContain("<!--");
    expect(content).toContain("CLI はこのファイルの中身を解釈しません");
    expect(content).toContain("番号 prefix");
    expect(content).toContain("recency bias");

    // 3 recommended sections
    expect(content).toContain("## やめてほしいこと");
    expect(content).toContain("## こうしてほしいこと");
    expect(content).toContain("## 例外");
  });
});

// ─── TC-RULES-011: README.md (数値プレフィックスなし) を無視 ─────────────────

describe("TC-RULES-011: README.md does not affect numbering", () => {
  it("starts from 01- when only README.md exists (parseInt = NaN)", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "spec-review");
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, "README.md"), "# readme\n");

    const result = await invokeExecuteRulesNew("spec-review", "my-rule", tempDir);
    expect(result).toBe(0);

    await expect(fs.access(path.join(rulesDir, "01-my-rule.md")).then(() => undefined)).resolves.toBeUndefined();
  });

  it("computes correct next number ignoring README.md", async () => {
    const rulesDir = path.join(tempDir, "specrunner", "rules", "build-fixer");
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, "README.md"), "# readme\n");
    await fs.writeFile(path.join(rulesDir, "03-existing.md"), "# existing\n");

    // numbers=[3] (README.md → NaN filtered), max=3, next=4
    const result = await invokeExecuteRulesNew("build-fixer", "new-rule", tempDir);
    expect(result).toBe(0);

    await expect(fs.access(path.join(rulesDir, "04-new-rule.md")).then(() => undefined)).resolves.toBeUndefined();
  });
});

// ─── All AGENT_STEP_NAMES are valid ─────────────────────────────────────────

describe("All AGENT_STEP_NAMES are accepted as valid step names", () => {
  it.each(AGENT_STEP_NAMES as unknown as string[])("step '%s' is accepted", async (step) => {
    vi.restoreAllMocks();
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const freshDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-step-test-"));
    try {
      const { executeRulesNew } = await import("../../../../src/core/command/rules-new.js");
      const result = await executeRulesNew(step, "test-rule", freshDir);
      expect(result).toBe(0);
    } finally {
      await fs.rm(freshDir, { recursive: true, force: true });
    }
  });
});
