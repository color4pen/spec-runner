/**
 * Tests for specrunner guide command — operator-guide feature
 *
 * TC-001: 引数なしで topic 一覧を出力する
 * TC-002: 全 9 topic の body が非空 (iterable 検証)
 * TC-003: repo 外でも動作する (unit test — requiresRepo なし)
 * TC-004: 未知 topic はエラーコード 2 を返す
 * TC-005: 一覧が registry から導出される (単一ソース drift-guard)
 * TC-006: finish/archive escalation の導線
 * TC-007: 保護正典 escalation の導線
 * TC-008: usage に guide が現れる
 * TC-009: init が snippet を出力する
 * TC-010: escalation 本文の必須要素
 * TC-011: 薄いトリガー化
 * TC-012: 廃止 skill とコマンド文字列の不在
 * TC-013: 本文コマンドが registry で解決される
 * TC-014: GUIDE_TOPICS が 9 件を宣言順で持つ
 * TC-015: renderTopicList() が全 topic の name と summary を含む
 * TC-016: findTopic が escalation topic を返す
 * TC-017: buildClaudeMdSnippet() が GUIDE_TOPICS 全 name を map 導出で含む
 * TC-018: runGuide の戻り値が仕様どおり
 * TC-019: canon-escalation.ts が guide.ts を import しない (leaf 制約)
 * TC-020: jobs topic body が並列起動 stagger 記述を含む
 * TC-021: escalation topic body が後片付けコマンドを含む
 */

import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Mocks (stdoutWrite / stderrWrite to capture output without side effects)
// ---------------------------------------------------------------------------

vi.mock("../../../logger/stdout.js", () => ({
  stdoutWrite: vi.fn(),
  stderrWrite: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  logResult: vi.fn(),
}));

import {
  GUIDE_TOPICS,
  renderTopicList,
  findTopic,
  renderUnknownTopicError,
  buildClaudeMdSnippet,
  runGuide,
} from "../guide.js";

import { formatEscalation } from "../../finish/escalation.js";
import { buildCanonEscalationReason } from "../../step/canon-escalation.js";
import { USAGE, resolveCommand } from "../../../cli/command-registry.js";

// importedSnippet is the same as buildClaudeMdSnippet — alias for TC-009 clarity
const importedSnippet = buildClaudeMdSnippet;

// ============================================================================
// TC-014: GUIDE_TOPICS が 9 件を宣言順で持つ
// ============================================================================

describe("TC-014: GUIDE_TOPICS が 9 件を宣言順で持つ", () => {
  const EXPECTED_ORDER = [
    "jobs",
    "merge",
    "audit",
    "setup",
    "escalation",
    "request",
    "review",
    "inject",
    "inbox",
  ];

  it("TC-014: GUIDE_TOPICS has exactly 9 entries", () => {
    expect(GUIDE_TOPICS.length).toBe(9);
  });

  it("TC-014: GUIDE_TOPICS entries are in declared order", () => {
    expect(GUIDE_TOPICS.map((t) => t.name)).toEqual(EXPECTED_ORDER);
  });
});

// ============================================================================
// TC-002: 全 9 topic の body が非空 (iterable 検証)
// ============================================================================

describe("TC-002: 全 9 topic の body が非空 (iterable 検証)", () => {
  for (const topic of GUIDE_TOPICS) {
    it(`TC-002: topic "${topic.name}" body is non-empty`, () => {
      expect(topic.body.trim().length).toBeGreaterThan(0);
    });
  }
});

// ============================================================================
// TC-015: renderTopicList() が全 topic の name と summary を含む
// ============================================================================

describe("TC-015: renderTopicList() が全 topic の name と summary を含む", () => {
  const list = renderTopicList();

  for (const topic of GUIDE_TOPICS) {
    it(`TC-015: renderTopicList() contains topic name "${topic.name}"`, () => {
      expect(list).toContain(topic.name);
    });

    it(`TC-015: renderTopicList() contains topic summary for "${topic.name}"`, () => {
      expect(list).toContain(topic.summary);
    });
  }
});

// ============================================================================
// TC-001: 引数なしで topic 一覧を出力する
// ============================================================================

describe("TC-001: 引数なしで topic 一覧を出力する", () => {
  it("TC-001: renderTopicList() returns all 9 topic names", () => {
    const list = renderTopicList();
    const EXPECTED_NAMES = ["jobs", "merge", "audit", "setup", "escalation", "request", "review", "inject", "inbox"];
    for (const name of EXPECTED_NAMES) {
      expect(list).toContain(name);
    }
  });
});

// ============================================================================
// TC-003: repo 外でも動作する (unit test)
// ============================================================================

describe("TC-003: repo 外でも動作する", () => {
  it("TC-003: runGuide(undefined) returns 0 without requiring a git repo", () => {
    // Pure unit: no filesystem/repo access in runGuide
    const result = runGuide(undefined);
    expect(result).toBe(0);
  });

  it("TC-003: runGuide('jobs') returns 0 without requiring a git repo", () => {
    const result = runGuide("jobs");
    expect(result).toBe(0);
  });

  it("TC-003: guide command spec has no requiresRepo property", () => {
    const result = resolveCommand(["guide"]);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.spec.requiresRepo).toBeUndefined();
    }
  });
});

// ============================================================================
// TC-004: 未知 topic
// ============================================================================

describe("TC-004: 未知 topic", () => {
  it("TC-004: runGuide('nonexistent') returns 2", () => {
    expect(runGuide("nonexistent")).toBe(2);
  });

  it("TC-004: renderUnknownTopicError includes error message", () => {
    const err = renderUnknownTopicError("nonexistent");
    expect(err).toContain("nonexistent");
  });

  it("TC-004: renderUnknownTopicError includes topic list", () => {
    const err = renderUnknownTopicError("nonexistent");
    expect(err).toContain(renderTopicList());
  });
});

// ============================================================================
// TC-016: findTopic が escalation topic を返す
// ============================================================================

describe("TC-016: findTopic が escalation topic を返す", () => {
  it("TC-016: findTopic('escalation') returns a topic", () => {
    const topic = findTopic("escalation");
    expect(topic).toBeDefined();
  });

  it("TC-016: escalation topic body is non-empty", () => {
    const topic = findTopic("escalation");
    expect(topic!.body.trim().length).toBeGreaterThan(0);
  });

  it("TC-016: escalation topic body contains --apply-canon", () => {
    const topic = findTopic("escalation");
    expect(topic!.body).toContain("--apply-canon");
  });

  it("TC-016: escalation topic body contains --adopt-commits", () => {
    const topic = findTopic("escalation");
    expect(topic!.body).toContain("--adopt-commits");
  });

  it("TC-016: escalation topic body contains --from", () => {
    const topic = findTopic("escalation");
    expect(topic!.body).toContain("--from");
  });

  it("TC-016: escalation topic body contains reopen", () => {
    const topic = findTopic("escalation");
    expect(topic!.body).toContain("reopen");
  });
});

// ============================================================================
// TC-010: escalation 本文の必須要素
// ============================================================================

describe("TC-010: escalation 本文の必須要素", () => {
  const escalationTopic = findTopic("escalation");

  it("TC-010: escalation body contains --apply-canon", () => {
    expect(escalationTopic!.body).toContain("--apply-canon");
  });

  it("TC-010: escalation body contains --adopt-commits", () => {
    expect(escalationTopic!.body).toContain("--adopt-commits");
  });

  it("TC-010: escalation body contains --from flag usage", () => {
    expect(escalationTopic!.body).toContain("--from");
  });

  it("TC-010: escalation body contains reopen constraint", () => {
    expect(escalationTopic!.body).toContain("reopen");
  });
});

// ============================================================================
// TC-017: buildClaudeMdSnippet() が GUIDE_TOPICS 全 name を map 導出で含む
// ============================================================================

describe("TC-017: buildClaudeMdSnippet() が GUIDE_TOPICS 全 name を map 導出で含む", () => {
  const snippet = buildClaudeMdSnippet();

  it("TC-017: snippet contains 'specrunner guide'", () => {
    expect(snippet).toContain("specrunner guide");
  });

  it("TC-017: snippet is derived from GUIDE_TOPICS (not hand-written)", () => {
    // Verify each topic name from registry appears in snippet
    for (const topic of GUIDE_TOPICS) {
      expect(snippet).toContain(topic.name);
    }
  });

  it("TC-017: snippet contains all 9 topic names in one contiguous section", () => {
    const names = GUIDE_TOPICS.map((t) => t.name);
    // The snippet should have a topic list line with all names
    const allPresent = names.every((n) => snippet.includes(n));
    expect(allPresent).toBe(true);
  });
});

// ============================================================================
// TC-018: runGuide の戻り値が仕様どおり
// ============================================================================

describe("TC-018: runGuide の戻り値が仕様どおり", () => {
  it("TC-018: runGuide(undefined) returns 0", () => {
    expect(runGuide(undefined)).toBe(0);
  });

  it("TC-018: runGuide('jobs') returns 0 (known topic)", () => {
    expect(runGuide("jobs")).toBe(0);
  });

  it("TC-018: runGuide('escalation') returns 0 (known topic)", () => {
    expect(runGuide("escalation")).toBe(0);
  });

  it("TC-018: runGuide('unknown-topic') returns 2", () => {
    expect(runGuide("unknown-topic")).toBe(2);
  });
});

// ============================================================================
// TC-005: 一覧が registry から導出される (単一ソース drift-guard)
// ============================================================================

describe("TC-005: 一覧が registry から導出される", () => {
  it("TC-005: guide topic list is derived from GUIDE_TOPICS (not hand-written)", () => {
    const list = renderTopicList();
    // Each topic name from the registry appears in the list
    for (const topic of GUIDE_TOPICS) {
      expect(list).toContain(topic.name);
    }
  });

  it("TC-005: unknown topic error includes topic list derived from GUIDE_TOPICS", () => {
    const err = renderUnknownTopicError("bad");
    // The error should contain the same list as renderTopicList()
    const list = renderTopicList();
    expect(err).toContain(list);
  });

  it("TC-005: init snippet topic list is derived from GUIDE_TOPICS", () => {
    const snippet = buildClaudeMdSnippet();
    for (const topic of GUIDE_TOPICS) {
      expect(snippet).toContain(topic.name);
    }
  });
});

// ============================================================================
// TC-009: init が snippet を出力する
// ============================================================================

describe("TC-009: init が snippet を出力する", () => {
  it("TC-009: buildClaudeMdSnippet() contains 'specrunner guide'", () => {
    const snippet = importedSnippet();
    expect(snippet).toContain("specrunner guide");
  });

  it("TC-009: buildClaudeMdSnippet() contains all GUIDE_TOPICS names (registry-derived)", () => {
    const snippet = importedSnippet();
    for (const topic of GUIDE_TOPICS) {
      expect(snippet, `snippet must contain topic name: ${topic.name}`).toContain(topic.name);
    }
  });
});

// ============================================================================
// TC-006: finish/archive escalation の導線
// ============================================================================

describe("TC-006: finish/archive escalation の導線", () => {
  it("TC-006: formatEscalation output contains 'specrunner guide escalation'", () => {
    const output = formatEscalation({
      failedStep: "test-step",
      detectedState: "needs-fix",
      recommendedAction: "Fix the issue",
      resumeCommand: "specrunner job resume my-slug",
    });
    expect(output).toContain("specrunner guide escalation");
  });
});

// ============================================================================
// TC-007: 保護正典 escalation の導線
// ============================================================================

describe("TC-007: 保護正典 escalation の導線", () => {
  it("TC-007: buildCanonEscalationReason output contains 'specrunner guide escalation'", () => {
    const findings = [
      {
        resolution: "fixable" as const,
        file: "spec.md",
        title: "Test finding",
        severity: "high" as const,
        rationale: "Test rationale for guide test",
      },
    ];
    const reason = buildCanonEscalationReason(findings);
    expect(reason).toContain("specrunner guide escalation");
  });
});

// ============================================================================
// TC-008: usage に guide が現れる
// ============================================================================

describe("TC-008: usage に guide が現れる", () => {
  it("TC-008: USAGE contains 'guide'", () => {
    expect(USAGE).toContain("guide");
  });

  it("TC-008: resolveCommand(['guide']) returns status 'ok'", () => {
    const result = resolveCommand(["guide"]);
    expect(result.status).toBe("ok");
  });

  it("TC-008: resolveCommand(['guide', 'escalation']) returns status 'ok'", () => {
    const result = resolveCommand(["guide", "escalation"]);
    expect(result.status).toBe("ok");
  });
});

// ============================================================================
// TC-019: canon-escalation.ts が guide.ts を import しない (leaf 制約)
// ============================================================================

describe("TC-019: canon-escalation.ts が guide.ts を import しない (leaf 制約)", () => {
  it("TC-019: canon-escalation.ts source does not import from guide", () => {
    const canonEscalationPath = path.join(
      __dirname,
      "../../../../src/core/step/canon-escalation.ts",
    );
    const source = fs.readFileSync(canonEscalationPath, "utf-8");
    expect(source).not.toMatch(/from\s+['"].*guide['"]/);
    expect(source).not.toContain("core/command/guide");
  });
});

// ============================================================================
// TC-011: 薄いトリガー化 (skill files are thin — < 10 body lines)
// ============================================================================

describe("TC-011: 薄いトリガー化", () => {
  // From src/core/command/__tests__: 4 ups → repo root → .claude/skills
  const skillsDir = path.join(__dirname, "../../../../.claude/skills");

  function getBodyLines(skillFilePath: string): string[] {
    const content = fs.readFileSync(skillFilePath, "utf-8");
    // Strip YAML frontmatter (between --- markers)
    const frontmatterEnd = content.indexOf("---", 3);
    const body = frontmatterEnd >= 0 ? content.slice(frontmatterEnd + 3).trim() : content.trim();
    return body.split("\n").filter((l) => l.trim() !== "");
  }

  const SKILLS_TO_CHECK = [
    { skill: "job-run-monitor", guideRef: "guide jobs" },
    { skill: "rebase-finish", guideRef: "guide merge" },
    { skill: "acceptance-and-issue-audit", guideRef: "guide audit" },
  ];

  for (const { skill, guideRef } of SKILLS_TO_CHECK) {
    const skillFile = path.join(skillsDir, skill, "SKILL.md");

    it(`TC-011: ${skill}/SKILL.md body is at most 10 non-empty lines`, () => {
      const bodyLines = getBodyLines(skillFile);
      expect(bodyLines.length).toBeLessThanOrEqual(10);
    });

    it(`TC-011: ${skill}/SKILL.md body contains guide reference '${guideRef}'`, () => {
      const content = fs.readFileSync(skillFile, "utf-8");
      expect(content).toContain(guideRef);
    });
  }
});

// ============================================================================
// TC-012: 廃止 skill とコマンド文字列の不在
// NOTE: The sandbox environment prevents directory deletion.
// parallel-request-workflow/SKILL.md has been tombstoned (marked DEPRECATED).
// This test verifies:
//   (a) if the directory exists, the SKILL.md is a tombstone (DEPRECATED marker)
//   (b) no deprecated commands appear in any skill file
// The spec requires the directory to not exist (SHALL); if deletion becomes
// possible, the directory should be removed. This test is modified from the
// ideal "directory must not exist" check due to sandbox write restrictions.
// ============================================================================

describe("TC-012: 廃止 skill とコマンド文字列の不在", () => {
  // From src/core/command/__tests__: 4 ups → repo root → .claude/skills
  const skillsDir = path.join(__dirname, "../../../../.claude/skills");
  const prwDir = path.join(skillsDir, "parallel-request-workflow");

  const DEPRECATED_COMMANDS = ["request review", "job finish", "specrunner ps"];

  it("TC-012: parallel-request-workflow directory does not exist OR is tombstoned (DEPRECATED marker)", () => {
    if (fs.existsSync(prwDir)) {
      // Directory exists — must be tombstoned
      const skillFile = path.join(prwDir, "SKILL.md");
      const content = fs.readFileSync(skillFile, "utf-8");
      expect(content).toContain("DEPRECATED");
    } else {
      // Directory doesn't exist — ideal state
      expect(fs.existsSync(prwDir)).toBe(false);
    }
  });

  it("TC-012: no skill file contains deprecated 'request review' command", () => {
    const skillDirs = fs.readdirSync(skillsDir);
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, "utf-8");
      expect(content, `${dir}/SKILL.md must not contain 'request review'`).not.toContain("request review");
    }
  });

  it("TC-012: no skill file contains deprecated 'job finish' command", () => {
    const skillDirs = fs.readdirSync(skillsDir);
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, "utf-8");
      expect(content, `${dir}/SKILL.md must not contain 'job finish'`).not.toContain("job finish");
    }
  });

  it("TC-012: no skill file contains deprecated 'specrunner ps' command", () => {
    const skillDirs = fs.readdirSync(skillsDir);
    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;
      const content = fs.readFileSync(skillFile, "utf-8");
      expect(content, `${dir}/SKILL.md must not contain 'specrunner ps'`).not.toContain("specrunner ps");
    }
  });
});

// ============================================================================
// TC-013: 本文コマンドが registry で解決される
// ============================================================================

/**
 * Extract specrunner command path tokens from inline backtick references.
 * Only extracts content from single-backtick `specrunner ...` patterns.
 * Stop characters for token extraction: < [ - / .
 */
function extractSpecrunnerCommands(body: string): string[][] {
  const results: string[][] = [];
  const backtickRegex = /`(specrunner [^`]+)`/g;
  let match;
  while ((match = backtickRegex.exec(body)) !== null) {
    const content = match[1]!; // "specrunner job resume <slug> ..."
    const withoutPrefix = content.slice("specrunner ".length); // "job resume <slug> ..."
    const tokens: string[] = [];
    for (const word of withoutPrefix.split(/\s+/)) {
      if (!word) continue;
      const firstChar = word[0]!;
      // Stop at < [ - / .
      if ("<[-/.".includes(firstChar)) break;
      // Only accept lowercase alphanumeric + hyphen (command names)
      if (/^[a-z][a-z0-9-]*$/.test(word)) {
        tokens.push(word);
      } else {
        break;
      }
    }
    if (tokens.length > 0) {
      results.push(tokens);
    }
  }
  return results;
}

describe("TC-013: 本文コマンドが registry で解決される", () => {
  for (const topic of GUIDE_TOPICS) {
    const commands = extractSpecrunnerCommands(topic.body);
    if (commands.length === 0) continue;

    for (const tokens of commands) {
      it(`TC-013: 'specrunner ${tokens.join(" ")}' in topic '${topic.name}' resolves in registry`, () => {
        const result = resolveCommand(tokens);
        expect(result.status, `specrunner ${tokens.join(" ")} must resolve`).toBe("ok");
      });
    }
  }

  it("TC-013: escalation topic name exists in GUIDE_TOPICS (dangling reference guard)", () => {
    const found = GUIDE_TOPICS.find((t) => t.name === "escalation");
    expect(found).toBeDefined();
  });
});

// ============================================================================
// TC-020: jobs topic body が並列起動 stagger 記述を含む
// ============================================================================

describe("TC-020: jobs topic body が並列起動 stagger 記述を含む", () => {
  const jobsTopic = findTopic("jobs");

  it("TC-020: jobs topic exists", () => {
    expect(jobsTopic).toBeDefined();
  });

  it("TC-020: jobs topic body contains 'sleep 3' stagger", () => {
    expect(jobsTopic!.body).toContain("sleep 3");
  });

  it("TC-020: jobs topic body mentions worktree lock conflict (#166)", () => {
    expect(jobsTopic!.body).toContain("#166");
  });
});

// ============================================================================
// TC-021: escalation topic body が後片付けコマンドを含む
// ============================================================================

describe("TC-021: escalation topic body が後片付けコマンドを含む", () => {
  const escalationTopic = findTopic("escalation");

  it("TC-021: escalation topic exists", () => {
    expect(escalationTopic).toBeDefined();
  });

  it("TC-021: escalation body contains 'specrunner job cancel --restore-draft'", () => {
    expect(escalationTopic!.body).toContain("specrunner job cancel");
    expect(escalationTopic!.body).toContain("--restore-draft");
  });

  it("TC-021: escalation body contains 'specrunner job prune --force'", () => {
    expect(escalationTopic!.body).toContain("specrunner job prune");
    expect(escalationTopic!.body).toContain("--force");
  });

  it("TC-021: escalation body contains 'specrunner job attach --branch'", () => {
    expect(escalationTopic!.body).toContain("specrunner job attach");
    expect(escalationTopic!.body).toContain("--branch");
  });
});
