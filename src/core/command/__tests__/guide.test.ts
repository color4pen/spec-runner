/**
 * Tests for specrunner guide command — operator-guide feature
 *
 * TC-001: 引数なしで topic 一覧を出力する
 * TC-002: 全 10 topic の body が非空 (iterable 検証)
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
 * TC-014: GUIDE_TOPICS が 10 件を宣言順で持つ
 * TC-015: renderTopicList() が全 topic の name と summary を含む
 * TC-016: findTopic が escalation topic を返す
 * TC-017: buildClaudeMdSnippet() が GUIDE_TOPICS 全 name を map 導出で含む
 * TC-018: runGuide の戻り値が仕様どおり
 * TC-019: canon-escalation.ts が guide.ts を import しない (leaf 制約)
 * TC-020: jobs topic body が並列起動 stagger 記述を含む
 * TC-021: escalation topic body が後片付けコマンドを含む
 * TC-074: GUIDE_TOPICS が 10 件 (artifact-output 追加後)
 * TC-075: artifact-output topic が制限事項・出力構造を本文に含む
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
import { COMMANDS, USAGE, resolveCommand } from "../../../cli/command-registry.js";

// importedSnippet is the same as buildClaudeMdSnippet — alias for TC-009 clarity
const importedSnippet = buildClaudeMdSnippet;

// ============================================================================
// TC-014 / TC-074: GUIDE_TOPICS が 10 件を宣言順で持つ (artifact-output 追加後)
// ============================================================================

describe("TC-014 / TC-074: GUIDE_TOPICS が 10 件を宣言順で持つ", () => {
  const EXPECTED_ORDER = [
    "jobs",
    "merge",
    "audit",
    "setup",
    "escalation",
    "request",
    "review",
    "inject",
    "artifact-output",
    "inbox",
  ];

  it("TC-014/TC-074: GUIDE_TOPICS has exactly 10 entries", () => {
    expect(GUIDE_TOPICS.length).toBe(10);
  });

  it("TC-014/TC-074: GUIDE_TOPICS entries are in declared order", () => {
    expect(GUIDE_TOPICS.map((t) => t.name)).toEqual(EXPECTED_ORDER);
  });
});

// ============================================================================
// TC-002: 全 10 topic の body が非空 (iterable 検証)
// ============================================================================

describe("TC-002: 全 10 topic の body が非空 (iterable 検証)", () => {
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
  it("TC-001: renderTopicList() returns all 10 topic names", () => {
    const list = renderTopicList();
    const EXPECTED_NAMES = ["jobs", "merge", "audit", "setup", "escalation", "request", "review", "inject", "artifact-output", "inbox"];
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

  it("TC-017: snippet contains all 10 topic names in one contiguous section", () => {
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

  it("TC-018: guide handler returns runGuide return value (dispatch boundary owns process.exit)", async () => {
    const handler = COMMANDS["guide"]!.handler!;
    const result = await handler({ flags: {}, positional: undefined, positionals: [] });
    // runGuide(undefined) returns 0 (no topic → shows list, success)
    expect(result).toBe(0);
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

  // F2: all GUIDE_TOPICS names must appear in USAGE (drift guard for --help summary)
  it("TC-008: USAGE help summary contains all GUIDE_TOPICS names (registry-derived, not hand-written)", () => {
    for (const topic of GUIDE_TOPICS) {
      expect(USAGE, `USAGE must contain topic name: ${topic.name}`).toContain(topic.name);
    }
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
// ============================================================================

describe("TC-012: 廃止 skill とコマンド文字列の不在", () => {
  // From src/core/command/__tests__: 4 ups → repo root → .claude/skills
  const skillsDir = path.join(__dirname, "../../../../.claude/skills");
  const prwDir = path.join(skillsDir, "parallel-request-workflow");

  it("TC-012: parallel-request-workflow directory does not exist", () => {
    expect(fs.existsSync(prwDir)).toBe(false);
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

// ============================================================================
// F1: 直接 resolveCommand assertions for 5 topics with triple-backtick-only commands
// TC-013 の inline-backtick 抽出では掛からない merge/audit/setup/request/inject topic の
// 主要コマンドを resolveCommand で直接検証する (finding: code-review F1)
// ============================================================================

describe("TC-013 direct: merge/audit/setup/request/inject topic コマンドが registry で解決される", () => {
  // merge topic commands
  it("specrunner job ls resolves (merge topic)", () => {
    expect(resolveCommand(["job", "ls"]).status).toBe("ok");
  });

  it("specrunner job archive resolves (merge topic)", () => {
    expect(resolveCommand(["job", "archive"]).status).toBe("ok");
  });

  // audit topic commands
  it("specrunner job ls --all resolves (audit topic)", () => {
    // flags are stripped by extractSpecrunnerCommands; base path is ["job", "ls"]
    expect(resolveCommand(["job", "ls"]).status).toBe("ok");
  });

  // setup topic commands
  it("specrunner init resolves (setup topic)", () => {
    expect(resolveCommand(["init"]).status).toBe("ok");
  });

  it("specrunner doctor resolves (setup topic)", () => {
    expect(resolveCommand(["doctor"]).status).toBe("ok");
  });

  it("specrunner login resolves (setup topic)", () => {
    expect(resolveCommand(["login"]).status).toBe("ok");
  });

  it("specrunner credentials set resolves (setup topic)", () => {
    expect(resolveCommand(["credentials", "set"]).status).toBe("ok");
  });

  it("specrunner request template resolves (setup/request topic)", () => {
    expect(resolveCommand(["request", "template"]).status).toBe("ok");
  });

  it("specrunner request validate resolves (setup/request topic)", () => {
    expect(resolveCommand(["request", "validate"]).status).toBe("ok");
  });

  it("specrunner job start resolves (setup/request topic)", () => {
    expect(resolveCommand(["job", "start"]).status).toBe("ok");
  });

  it("specrunner job wait resolves (setup topic)", () => {
    expect(resolveCommand(["job", "wait"]).status).toBe("ok");
  });

  // inject topic commands
  it("specrunner rules new resolves (inject topic)", () => {
    expect(resolveCommand(["rules", "new"]).status).toBe("ok");
  });

  it("specrunner reviewers new resolves (inject topic)", () => {
    expect(resolveCommand(["reviewers", "new"]).status).toBe("ok");
  });

  it("specrunner config effective resolves (inject topic)", () => {
    expect(resolveCommand(["config", "effective"]).status).toBe("ok");
  });
});

// ============================================================================
// TC-022: review topic does not contain issue-as-canon language
// TC-023: review topic contains request.md as the post-pipeline canonical reference
// ============================================================================

describe("TC-022/TC-023: review topic — 正典モデル記述", () => {
  const topic = findTopic("review");

  it("TC-022: review topic does not contain issue-as-canon language", () => {
    expect(topic!.body).not.toContain("起点 issue の正典を canon とする");
  });

  it("TC-023: review topic contains request.md as post-pipeline normative reference", () => {
    expect(topic!.body).toContain("request.md");
  });
});

// ============================================================================
// TC-024: audit topic does not contain issue-as-canon language
// TC-025: audit topic describes issue comparison as transcription-audit concern
// ============================================================================

describe("TC-024/TC-025: audit topic — 正典モデル記述", () => {
  const topic = findTopic("audit");

  it("TC-024: audit topic does not contain issue-as-canon language", () => {
    expect(topic!.body).not.toContain("起点 issue の正典と照合する");
  });

  it("TC-025: audit topic contains transcription-audit framing", () => {
    expect(topic!.body).toMatch(/転記監査|issue.*request\.md|request\.md.*issue/);
  });
});

// ============================================================================
// TC-026: escalation topic provides job show step before cancel
// TC-027: escalation topic cancel uses jobId argument
// TC-037: escalation topic cancel does not use slug as argument
// ============================================================================

describe("TC-026/TC-027/TC-037: escalation topic — cancel 案内", () => {
  const topic = findTopic("escalation");

  it("TC-026: escalation topic contains job show step before cancel", () => {
    const body = topic!.body;
    const showIdx = body.indexOf("specrunner job show");
    const cancelIdx = body.indexOf("specrunner job cancel");
    expect(showIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(showIdx);
  });

  it("TC-027: escalation topic cancel uses <jobId> argument", () => {
    expect(topic!.body).toContain("job cancel <jobId>");
  });

  it("TC-037: escalation topic cancel does not use <slug> argument", () => {
    expect(topic!.body).not.toContain("job cancel <slug>");
  });
});

// ============================================================================
// TC-028: merge topic uses 8-char jobId prefix notation
// TC-038: merge topic does not use bare slug-jobId path notation
// ============================================================================

describe("TC-028/TC-038: merge topic — worktree path 表記", () => {
  const topic = findTopic("merge");

  it("TC-028: merge topic worktree path uses 8-char jobId prefix notation", () => {
    expect(topic!.body).toMatch(/先頭8|8文字/);
  });

  it("TC-038: merge topic does not use full <slug>-<jobId> notation in worktree path", () => {
    expect(topic!.body).not.toMatch(/<slug>-<jobId>/);
  });
});

// ============================================================================
// TC-029: jobs topic has no stale pre-check instruction
// ============================================================================

describe("TC-029: jobs topic — stale pre-check 不在", () => {
  it("TC-029: jobs topic does not contain stale job ls pre-check", () => {
    const topic = findTopic("jobs");
    expect(topic!.body).not.toContain("job ls で running を確認");
  });
});

// ============================================================================
// TC-030: setup topic init heading reflects actual behavior
// ============================================================================

describe("TC-030: setup topic — init 見出し", () => {
  it("TC-030: setup topic init heading does not say '2 層 config scaffold'", () => {
    const topic = findTopic("setup");
    expect(topic!.body).not.toContain("2 層 config scaffold");
  });
});

// ============================================================================
// TC-031: runner.ts halt output contains guide escalation link
// ============================================================================

describe("TC-031: runner.ts halt 出力への guide 導線", () => {
  it("TC-031: runner.ts halt output contains specrunner guide escalation link", () => {
    const runnerPath = path.join(__dirname, "../runner.ts");
    const source = fs.readFileSync(runnerPath, "utf-8");
    const haltIdx = source.indexOf("Pipeline halted at step");
    expect(haltIdx).toBeGreaterThan(-1);
    const searchWindow = source.slice(haltIdx, haltIdx + 500);
    expect(searchWindow).toContain("specrunner guide escalation");
  });
});

// ============================================================================
// TC-032: コードブロック内 specrunner コマンドの invocation contract
// TC-033: skip パターンが silent でないこと
// TC-034: job cancel <slug> が violation を返す
// TC-039: job cancel <jobId> が violation なし
// ============================================================================

/**
 * Lines matching these patterns are excluded from invocation contract validation.
 * Each entry MUST carry a reason explaining why mechanical verification is not possible.
 * Patterns are tested against the line AFTER <placeholder> tokens are stripped
 * (stripPlaceholders) — placeholder angle brackets and in-placeholder pipes
 * (`<slug|file>`) must never be mistaken for shell metacharacters, otherwise
 * every placeholder example is silently excluded and the contract never runs.
 */
const INVOCATION_CONTRACT_SKIP_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /[|$>]/,
    reason: "contains shell metacharacters (redirect / pipe / variable) outside placeholders — not a standalone specrunner invocation",
  },
];

/** Remove <placeholder> tokens so skip patterns only see real shell syntax. */
function stripPlaceholders(line: string): string {
  return line.replace(/<[^>]*>/g, "");
}

function isSkippedByContract(line: string): boolean {
  return INVOCATION_CONTRACT_SKIP_PATTERNS.some((p) => p.pattern.test(stripPlaceholders(line)));
}

/**
 * Extract `specrunner ...` lines from triple-backtick code blocks.
 * Strips trailing # comments and truncates at optional-block marker `[`.
 */
function extractSpecrunnerLinesFromCodeBlocks(body: string): string[] {
  const lines: string[] = [];
  const codeBlockRegex = /```[^\n]*\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(body)) !== null) {
    for (const line of match[1]!.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("specrunner ")) continue;
      // Strip trailing comment
      const withoutComment = trimmed.replace(/\s+#.*$/, "");
      // Truncate at optional block
      const optIdx = withoutComment.indexOf("[");
      const cleaned = optIdx >= 0 ? withoutComment.slice(0, optIdx).trim() : withoutComment;
      lines.push(cleaned);
    }
  }
  return lines;
}

interface ParsedInvocation {
  pathTokens: string[];
  positionals: string[]; // placeholder names (from <name>)
  flagNames: string[]; // flag names (from --flag)
  rawLine: string;
}

function parseInvocation(line: string): ParsedInvocation {
  const content = line.startsWith("specrunner ") ? line.slice("specrunner ".length) : line;
  const tokens = content.split(/\s+/).filter(Boolean);
  const pathTokens: string[] = [];
  const positionals: string[] = [];
  const flagNames: string[] = [];
  let pathDone = false;
  let lastWasFlag = false;

  for (const token of tokens) {
    if (token.startsWith("--")) {
      flagNames.push(token.slice(2));
      pathDone = true;
      lastWasFlag = true;
      continue;
    }
    if (token.startsWith("<")) {
      pathDone = true;
      if (lastWasFlag) {
        // flag value placeholder — skip
        lastWasFlag = false;
        continue;
      }
      positionals.push(token.replace(/[<>]/g, ""));
      lastWasFlag = false;
      continue;
    }
    if (!pathDone && /^[a-z][a-z0-9-]*$/.test(token)) {
      pathTokens.push(token);
    }
    lastWasFlag = false;
  }
  return { pathTokens, positionals, flagNames, rawLine: line };
}

interface InvocationViolation {
  kind: "unknown-command" | "unknown-flag" | "positional-name-mismatch";
  detail: string;
}

function validateInvocation(parsed: ParsedInvocation): InvocationViolation[] {
  const violations: InvocationViolation[] = [];
  const result = resolveCommand(parsed.pathTokens);
  if (result.status !== "ok") {
    violations.push({ kind: "unknown-command", detail: parsed.pathTokens.join(" ") });
    return violations; // cannot check flags/positionals without spec
  }
  const spec = result.spec;
  // (b) flag existence
  for (const flag of parsed.flagNames) {
    if (!spec.flags || !(flag in spec.flags)) {
      violations.push({
        kind: "unknown-flag",
        detail: `--${flag} not in spec.flags for '${parsed.pathTokens.join(" ")}'`,
      });
    }
  }
  // (c) positional name match
  const argsSpec = spec.args ?? [];
  for (let i = 0; i < parsed.positionals.length; i++) {
    const placeholder = parsed.positionals[i]!;
    const arg = argsSpec[i];
    if (!arg) continue; // extra positionals: skip (variadic)
    const allowed = arg.name.split(/[| ]/);
    // Composite placeholders (`<slug|file>`) match when every alternative is allowed
    const parts = placeholder.split("|");
    if (!parts.every((p) => allowed.includes(p))) {
      violations.push({
        kind: "positional-name-mismatch",
        detail: `placeholder '<${placeholder}>' does not match args[${i}].name '${arg.name}' for '${parsed.pathTokens.join(" ")}'`,
      });
    }
  }
  return violations;
}

describe("TC-032: コードブロック内 specrunner コマンドの invocation contract", () => {
  for (const topic of GUIDE_TOPICS) {
    const lines = extractSpecrunnerLinesFromCodeBlocks(topic.body);

    for (const line of lines) {
      if (isSkippedByContract(line)) continue;

      it(`TC-032: '${line}' in topic '${topic.name}' passes invocation contract`, () => {
        const parsed = parseInvocation(line);
        const violations = validateInvocation(parsed);
        expect(violations, `violations for: ${line}\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
      });
    }
  }
});

describe("TC-033: skip パターンが silent でないこと", () => {
  it("TC-033: INVOCATION_CONTRACT_SKIP_PATTERNS has no empty reason", () => {
    for (const entry of INVOCATION_CONTRACT_SKIP_PATTERNS) {
      expect(entry.reason.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("TC-034/TC-039: invocation contract が placeholder 名不一致を検出する", () => {
  it("TC-034: 'specrunner job cancel <slug> --restore-draft' produces positional-name-mismatch", () => {
    const parsed = parseInvocation("specrunner job cancel <slug> --restore-draft");
    const violations = validateInvocation(parsed);
    const mismatch = violations.filter((v) => v.kind === "positional-name-mismatch");
    expect(mismatch.length).toBeGreaterThan(0);
    expect(mismatch[0]!.detail).toContain("slug");
  });

  it("TC-039: 'specrunner job cancel <jobId> --restore-draft' produces no violations", () => {
    const parsed = parseInvocation("specrunner job cancel <jobId> --restore-draft");
    const violations = validateInvocation(parsed);
    expect(violations).toEqual([]);
  });
});

// ============================================================================
// TC-041: inline backtick specrunner コマンドの invocation contract
// TC-042: placeholder 行が skip されないこと (fail-open 再発防止)
// ============================================================================

/** Extract full `specrunner ...` strings from inline backtick references. */
function extractSpecrunnerLinesInline(body: string): string[] {
  const lines: string[] = [];
  const backtickRegex = /`(specrunner [^`]+)`/g;
  let match;
  while ((match = backtickRegex.exec(body)) !== null) {
    const withoutComment = match[1]!.replace(/\s+#.*$/, "");
    const optIdx = withoutComment.indexOf("[");
    lines.push(optIdx >= 0 ? withoutComment.slice(0, optIdx).trim() : withoutComment);
  }
  return lines;
}

describe("TC-041: inline backtick specrunner コマンドの invocation contract", () => {
  for (const topic of GUIDE_TOPICS) {
    for (const line of extractSpecrunnerLinesInline(topic.body)) {
      if (isSkippedByContract(line)) continue;
      it(`TC-041: '${line}' in topic '${topic.name}' passes invocation contract`, () => {
        const violations = validateInvocation(parseInvocation(line));
        expect(violations, `violations for: ${line}\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
      });
    }
  }
});

describe("TC-042: placeholder 行が skip されないこと (fail-open 再発防止)", () => {
  it("TC-042: escalation topic の job cancel 行が invocation contract の検証対象に含まれる", () => {
    const lines = extractSpecrunnerLinesFromCodeBlocks(findTopic("escalation")!.body);
    const cancelLine = lines.find((l) => l.includes("job cancel"));
    expect(cancelLine).toBeDefined();
    expect(isSkippedByContract(cancelLine!)).toBe(false);
  });

  it("TC-042: placeholder のみを含む行は shell metacharacter skip に掛からない", () => {
    expect(isSkippedByContract("specrunner job start <slug|file> --detach")).toBe(false);
  });

  it("TC-042: 実 redirect を含む行は skip される", () => {
    expect(isSkippedByContract("specrunner request template > specrunner/drafts/<slug>.md")).toBe(true);
  });
});

// ============================================================================
// TC-035: SKILL.md に parallel-request-workflow が存在しないこと
// ============================================================================

describe("TC-035: acceptance-and-issue-audit SKILL.md", () => {
  it("TC-035: acceptance-and-issue-audit SKILL.md has no parallel-request-workflow reference", () => {
    const skillPath = path.join(__dirname, "../../../../.claude/skills/acceptance-and-issue-audit/SKILL.md");
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).not.toContain("parallel-request-workflow");
  });
});

// ============================================================================
// TC-036: ADR が tombstone アプローチを記述しないこと
// ============================================================================

describe("TC-036: ADR 実状態整合", () => {
  it("TC-036: ADR does not describe tombstone approach for parallel-request-workflow", () => {
    const adrPath = path.join(
      __dirname,
      "../../../../specrunner/adr/2026-08-17-cli-operational-knowledge-registry.md",
    );
    const content = fs.readFileSync(adrPath, "utf-8");
    expect(content).not.toContain("tombstone を置いて実質削除する");
  });
});

// ============================================================================
// TC-074: GUIDE_TOPICS が 10 件 (artifact-output 追加後)
// TC-075: artifact-output topic が制限事項・出力構造を本文に含む
// ============================================================================

describe("TC-074: artifact-output topic は 10 番目 (inbox の前)", () => {
  it("TC-074: GUIDE_TOPICS.length === 10", () => {
    expect(GUIDE_TOPICS.length).toBe(10);
  });

  it("TC-074: artifact-output topic exists", () => {
    const topic = findTopic("artifact-output");
    expect(topic).toBeDefined();
  });

  it("TC-074: artifact-output appears before inbox in GUIDE_TOPICS", () => {
    const names = GUIDE_TOPICS.map((t) => t.name);
    const aoIdx = names.indexOf("artifact-output");
    const inboxIdx = names.indexOf("inbox");
    expect(aoIdx).toBeGreaterThan(-1);
    expect(inboxIdx).toBeGreaterThan(-1);
    expect(aoIdx).toBeLessThan(inboxIdx);
  });
});

describe("TC-075: artifact-output topic body contains required sections", () => {
  const topic = findTopic("artifact-output");

  it("TC-075: topic exists", () => {
    expect(topic).toBeDefined();
  });

  it("TC-075: body contains 'manifest.json'", () => {
    expect(topic!.body).toContain("manifest.json");
  });

  it("TC-075: body contains 'APPLY.md' (not auto-applied)", () => {
    expect(topic!.body).toContain("APPLY.md");
  });

  it("TC-075: body contains unsupported operations table", () => {
    expect(topic!.body).toContain("PR 作成・マージ");
  });

  it("TC-075: body contains resume.supported = false note", () => {
    expect(topic!.body).toContain("resume.supported");
    expect(topic!.body).toContain("false");
  });

  it("TC-075: body contains 'changes.patch' reference", () => {
    expect(topic!.body).toContain("changes.patch");
  });

  it("TC-075: body contains 'verification.json' reference", () => {
    expect(topic!.body).toContain("verification.json");
  });

  it("TC-075: body is non-empty and longer than 100 chars", () => {
    expect(topic!.body.trim().length).toBeGreaterThan(100);
  });
});
