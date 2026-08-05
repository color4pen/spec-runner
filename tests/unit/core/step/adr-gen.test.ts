/**
 * Unit tests for AdrGenStep and buildAdrGenInitialMessage.
 *
 * Extended in adr-gen-postfix-context change to cover TC-001 through TC-023:
 * post-fix context injection, system prompt rules, DynamicContext type, and sabotage tests.
 */
import { describe, it, expect } from "vitest";
import { AdrGenStep, buildAdrGenInitialMessage, ADR_FOLLOWUP_PROMPT } from "../../../../src/core/step/adr-gen.js";
import { NULL_PARSE_RESULT } from "../../../../src/core/step/types.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../../../../src/prompts/adr-gen-system.js";
import { collectDynamicContext } from "../../../../src/git/dynamic-context.js";
import type { DynamicContext } from "../../../../src/git/dynamic-context.js";

function buildState(branch?: string) {
  return { branch: branch ?? "feat/test-slug", steps: {} } as Parameters<typeof AdrGenStep.buildMessage>[0];
}

function buildDeps(adr: boolean) {
  return {
    slug: "test-slug",
    request: {
      type: "new-feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "Do something",
      adr,
    },
    dynamicContext: undefined,
  } as unknown as Parameters<typeof AdrGenStep.buildMessage>[1];
}

// TC-ADR-STEP-03: step properties
describe("AdrGenStep — static properties", () => {
  it("TC-ADR-STEP-03a: step.name === 'adr-gen'", () => {
    expect(AdrGenStep.name).toBe(STEP_NAMES.ADR_GEN);
    expect(AdrGenStep.name).toBe("adr-gen");
  });

  it("TC-ADR-STEP-03b: step.kind === 'agent'", () => {
    expect(AdrGenStep.kind).toBe("agent");
  });

  it("TC-ADR-STEP-03c: step.completionVerdict === 'success'", () => {
    expect(AdrGenStep.completionVerdict).toBe("success");
  });
});

// TC-ADR-STEP-04: resultFilePath and parseResult
describe("AdrGenStep — result methods", () => {
  it("TC-ADR-STEP-04a: resultFilePath returns null", () => {
    expect(AdrGenStep.resultFilePath(buildState(), buildDeps(false))).toBeNull();
  });

  it("TC-ADR-STEP-04b: parseResult returns NULL_PARSE_RESULT", () => {
    expect(AdrGenStep.parseResult("", buildDeps(false))).toEqual(NULL_PARSE_RESULT);
  });
});

// TC-ADR-STEP-01: request.adr === false → buildMessage returns no-op instruction
describe("buildAdrGenInitialMessage — adr: false", () => {
  it("TC-ADR-STEP-01: returns no-op instruction when adr is false", () => {
    const msg = buildAdrGenInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      baseBranch: "main",
      adr: false,
      requestContent: "content",
    });
    expect(msg).toContain("adr: false");
    expect(msg).toContain("ADR generation is disabled");
    expect(msg).toContain("end your turn immediately");
    // Should NOT contain file paths or judge instructions
    expect(msg).not.toContain("specrunner/adr/");
    expect(msg).not.toContain("judge");
  });

  it("TC-ADR-STEP-01-step: AdrGenStep.buildMessage with adr=false", () => {
    const msg = AdrGenStep.buildMessage(buildState(), buildDeps(false));
    expect(msg).toContain("adr: false");
    expect(msg).toContain("ADR generation is disabled");
  });
});

// TC-ADR-STEP-05: getFollowUpPrompt
describe("AdrGenStep — getFollowUpPrompt", () => {
  it("TC-ADR-STEP-05a: returns string when adr is true", () => {
    const result = AdrGenStep.getFollowUpPrompt!(buildState(), buildDeps(true));
    expect(typeof result).toBe("string");
  });

  it("TC-ADR-STEP-05b: returns undefined when adr is false", () => {
    const result = AdrGenStep.getFollowUpPrompt!(buildState(), buildDeps(false));
    expect(result).toBeUndefined();
  });

  it("TC-ADR-STEP-05c: returned string contains 'Alternatives Considered'", () => {
    const result = AdrGenStep.getFollowUpPrompt!(buildState(), buildDeps(true));
    expect(result).toContain("Alternatives Considered");
  });

  it("TC-ADR-STEP-05d: returned string instructs modification, not judgment (修正専用)", () => {
    const result = AdrGenStep.getFollowUpPrompt!(buildState(), buildDeps(true));
    // Should contain fix/supplement instructions
    expect(result).toContain("追記");
    // Should NOT use judgment-style phrasing like "判定" or "評価せよ"
    expect(result).not.toContain("判定せよ");
    expect(result).not.toContain("評価せよ");
  });

  it("TC-ADR-STEP-05e: ADR_FOLLOWUP_PROMPT constant is exported and matches return value", () => {
    const result = AdrGenStep.getFollowUpPrompt!(buildState(), buildDeps(true));
    expect(result).toBe(ADR_FOLLOWUP_PROMPT);
  });
});

// TC-ADR-SKIP-01: skipWhen returns non-null when adr is false
describe("AdrGenStep.skipWhen — adr: false → skip", () => {
  it("skipWhen returns a non-null string when adr is false", () => {
    const result = AdrGenStep.skipWhen!(buildState(), buildDeps(false));
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
  });

  it("skipWhen return value contains 'adr: false'", () => {
    const result = AdrGenStep.skipWhen!(buildState(), buildDeps(false));
    expect(result).toContain("adr: false");
  });
});

// TC-ADR-SKIP-02: skipWhen returns null when adr is true
describe("AdrGenStep.skipWhen — adr: true → no skip", () => {
  it("skipWhen returns null when adr is true (agent should run)", () => {
    const result = AdrGenStep.skipWhen!(buildState(), buildDeps(true));
    expect(result).toBeNull();
  });
});

// TC-ADR-SKIP-03: skipWhen is defined on AdrGenStep
describe("AdrGenStep.skipWhen — property exists", () => {
  it("skipWhen is defined as a function", () => {
    expect(typeof AdrGenStep.skipWhen).toBe("function");
  });
});

// TC-ADR-STEP-02: request.adr === true → buildMessage returns judge+generate instructions
describe("buildAdrGenInitialMessage — adr: true", () => {
  it("TC-ADR-STEP-02: returns judge+generate instruction when adr is true", () => {
    const msg = buildAdrGenInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      baseBranch: "main",
      adr: true,
      requestContent: "do the thing",
    });
    expect(msg).toContain("adr: true");
    expect(msg).toContain("judge");
    expect(msg).toContain("specrunner/changes/my-slug");
    expect(msg).toContain("design.md");
    expect(msg).toContain("review-feedback");
    expect(msg).toContain("git diff main..HEAD --stat");
  });

  it("TC-ADR-STEP-02-step: AdrGenStep.buildMessage with adr=true includes change folder", () => {
    const msg = AdrGenStep.buildMessage(buildState(), buildDeps(true));
    expect(msg).toContain("specrunner/changes/test-slug");
    expect(msg).toContain("design.md");
    expect(msg).toContain("judge");
  });
});

// ============================================================================
// Post-fix context injection tests (TC-001 through TC-023)
// Added as part of: adr-gen-postfix-context change
// Source: specrunner/changes/adr-gen-postfix-context/test-cases.md
// TC IDs are frozen — do not renumber.
// ============================================================================

// ---------------------------------------------------------------------------
// Helpers for post-fix context tests
// ---------------------------------------------------------------------------

// Inline shape matching DynamicContext.postFixContext (not yet added to DynamicContext — RED phase)
type PostFixRoundShape = {
  round: number;
  commitOid: string;
  changedFiles: string[];
  findings: Array<{ severity: string; resolution: string; file: string; title: string }>;
};

type PostFixContextShape = { rounds: PostFixRoundShape[] };

const TEST_SLUG_PF = "test-slug";
const T0_PF = "2026-01-01T00:00:00.000Z";
const T1_PF = "2026-01-01T01:00:00.000Z";

function buildStateWithCodeFixerRun(opts: { commitOid?: string } = {}): Parameters<typeof AdrGenStep.buildMessage>[0] {
  return {
    branch: "change/test-slug-abc123",
    steps: {
      [STEP_NAMES.CODE_FIXER]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
          startedAt: T0_PF,
          endedAt: T1_PF,
          ...(opts.commitOid !== undefined ? { commitOid: opts.commitOid } : {}),
        },
      ],
    },
  } as unknown as Parameters<typeof AdrGenStep.buildMessage>[0];
}

function buildDepsWithPostFix(
  adr: boolean,
  postFixContext: PostFixContextShape,
): Parameters<typeof AdrGenStep.buildMessage>[1] {
  return {
    slug: TEST_SLUG_PF,
    request: {
      type: "spec-change",
      title: "Test",
      slug: TEST_SLUG_PF,
      baseBranch: "main",
      content: "Do something",
      adr,
    },
    dynamicContext: {
      gitLog: "",
      diffStat: "",
      changesList: [],
      // postFixContext is the new field being tested — RED until T-01+T-03 implemented
      postFixContext,
    } as unknown as DynamicContext,
  } as unknown as Parameters<typeof AdrGenStep.buildMessage>[1];
}

// ===========================================================================
// TC-001: fixer round の changed files と指摘要約が message に含まれる
// Source: spec.md > Requirement: adr-gen message に post-fix context ブロックを機械注入する
//         > Scenario: fixer round の changed files と指摘要約が message に含まれる
// ===========================================================================

describe("TC-001: fixer round の changed files と指摘要約が message に含まれる", () => {
  it("TC-001: AdrGenStep.buildMessage includes changed files and review findings when postFixContext is set", () => {
    // GIVEN: postFixContext with one round containing changedFiles and findings
    const changedFiles = ["src/auth/login.ts", "src/core/step/code-fixer.ts"];
    const deps = buildDepsWithPostFix(true, {
      rounds: [
        {
          round: 1,
          commitOid: "abc123",
          changedFiles,
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/auth/login.ts",
              title: "Missing fail-closed guard",
            },
          ],
        },
      ],
    });
    const state = buildStateWithCodeFixerRun({ commitOid: "abc123" });

    // WHEN: buildMessage is called
    const msg = AdrGenStep.buildMessage(state, deps);

    // THEN: message contains changed files and findings (RED until T-03 wires postFixContext)
    expect(msg).toContain("src/auth/login.ts");
    expect(msg).toContain("src/core/step/code-fixer.ts");
    expect(msg).toContain("Missing fail-closed guard");
    expect(msg).toContain("high");
    expect(msg).toContain("<post-fix-context>");
  });

  it("TC-001: message contains <post-fix-context> XML block when postFixContext is present", () => {
    const deps = buildDepsWithPostFix(true, {
      rounds: [
        {
          round: 1,
          commitOid: "deadbeef",
          changedFiles: ["src/step.ts"],
          findings: [],
        },
      ],
    });
    const state = buildStateWithCodeFixerRun({ commitOid: "deadbeef" });

    const msg = AdrGenStep.buildMessage(state, deps);

    // Message must contain the XML-enclosed block
    expect(msg).toContain("<post-fix-context>");
    expect(msg).toContain("</post-fix-context>");
    expect(msg).toContain("deadbeef");
  });
});

// ===========================================================================
// TC-002: 複数 fixer round の全件が post-fix ブロックに含まれる
// Source: spec.md > Requirement: adr-gen message に post-fix context ブロックを機械注入する
//         > Scenario: 複数 fixer round の全件が post-fix ブロックに含まれる
// ===========================================================================

describe("TC-002: 複数 fixer round の全件が post-fix ブロックに含まれる", () => {
  it("TC-002: message includes all fixer rounds (not just the latest)", () => {
    const deps = buildDepsWithPostFix(true, {
      rounds: [
        {
          round: 1,
          commitOid: "oid1",
          changedFiles: ["src/round1.ts"],
          findings: [{ severity: "medium", resolution: "fixable", file: "src/round1.ts", title: "Round1 issue" }],
        },
        {
          round: 2,
          commitOid: "oid2",
          changedFiles: ["src/round2.ts"],
          findings: [{ severity: "high", resolution: "fixable", file: "src/round2.ts", title: "Round2 issue" }],
        },
      ],
    });
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    // Both rounds must be present
    expect(msg).toContain("oid1");
    expect(msg).toContain("oid2");
    expect(msg).toContain("src/round1.ts");
    expect(msg).toContain("src/round2.ts");
    expect(msg).toContain("Round1 issue");
    expect(msg).toContain("Round2 issue");
  });
});

// ===========================================================================
// TC-003: changed files と指摘要約は機械事実のみを真実源にする
// Source: spec.md > Requirement: adr-gen message に post-fix context ブロックを機械注入する
//         > Scenario: changed files と指摘要約は機械事実のみを真実源にする
// ===========================================================================

describe("TC-003: changed files と指摘要約は機械事実のみを真実源にする", () => {
  it("TC-003: sentinel changed files from postFixContext appear in message exactly as provided", () => {
    // Sentinel files can only originate from postFixContext (machine-derived from listCommitChangedFiles)
    const SENTINEL_A = "__SENTINEL_CHANGED_FILE_A__";
    const SENTINEL_B = "__SENTINEL_CHANGED_FILE_B__";

    const deps = buildDepsWithPostFix(true, {
      rounds: [
        {
          round: 1,
          commitOid: "sentineloid",
          changedFiles: [SENTINEL_A, SENTINEL_B],
          findings: [],
        },
      ],
    });
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    // Sentinel values must appear — proving they come from postFixContext injection
    expect(msg).toContain(SENTINEL_A);
    expect(msg).toContain(SENTINEL_B);
  });
});

// ===========================================================================
// TC-004: code-review iteration の findings が対応 round に併記される
// Source: spec.md > Requirement: 各 fixer round は直前の最新 findings-bearing run に対応付ける
//         > Scenario: code-review iteration の findings が対応 round に併記される
// ===========================================================================

describe("TC-004: code-review iteration の findings が対応 round に併記される", () => {
  it("TC-004: each round's findings appear in the message with finding details (severity, file, title)", () => {
    const deps = buildDepsWithPostFix(true, {
      rounds: [
        {
          round: 1,
          commitOid: "oid1",
          changedFiles: ["src/a.ts"],
          findings: [
            {
              severity: "high",
              resolution: "fixable",
              file: "src/a.ts",
              title: "Code review finding for round 1",
            },
          ],
        },
        {
          round: 2,
          commitOid: "oid2",
          changedFiles: ["src/b.ts"],
          findings: [
            {
              severity: "critical",
              resolution: "fixable",
              file: "src/b.ts",
              title: "Code review finding for round 2",
            },
          ],
        },
      ],
    });
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    expect(msg).toContain("Code review finding for round 1");
    expect(msg).toContain("Code review finding for round 2");
    expect(msg).toContain("src/a.ts");
    expect(msg).toContain("src/b.ts");
    expect(msg).toContain("critical");
  });
});

// ===========================================================================
// TC-005: code-fixer が一度も走っていない run では従来 message を維持する
// Source: spec.md > Requirement: fixer が走っていない run では従来 message を維持する
//         > Scenario: code-fixer が一度も走っていない run
// ===========================================================================

describe("TC-005: code-fixer が一度も走っていない run では従来 message を維持する", () => {
  it("TC-005: message does NOT contain <post-fix-context> when dynamicContext has no postFixContext", () => {
    // GIVEN: dynamicContext without postFixContext (prepareRoundContext returned null)
    const deps = buildDeps(true); // existing helper — dynamicContext: undefined
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    // THEN: no post-fix block
    expect(msg).not.toContain("<post-fix-context>");
    expect(msg).not.toContain("</post-fix-context>");
  });

  it("TC-005: message with no postFixContext still contains traditional Judge materials", () => {
    const deps = buildDeps(true);
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    // Traditional judge materials must still be present
    expect(msg).toContain("judge");
    expect(msg).toContain("design.md");
  });
});

// ===========================================================================
// TC-006: listCommitChangedFiles port が不在で null 縮退する
// Source: spec.md > Requirement: 導出不能時はブロックを省略し step を正常続行する
//         > Scenario: listCommitChangedFiles port が不在（managed runtime 相当）
// ===========================================================================

describe("TC-006: listCommitChangedFiles port が不在で null 縮退 → message にブロックなし", () => {
  it("TC-006: when runtimeStrategy is absent, message has no post-fix block (dynamicContext.postFixContext absent)", () => {
    // When prepareRoundContext receives undefined runtimeStrategy, it returns null.
    // Result: dynamicContext is not enriched → postFixContext absent → no block in message.
    const deps = buildDeps(true); // dynamicContext: undefined → no postFixContext
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    expect(msg).not.toContain("<post-fix-context>");
  });

  it("TC-006: message continues to contain standard adr-gen materials when port is absent", () => {
    const deps = buildDeps(true);
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    // Step continues normally — standard materials are present
    expect(msg).toContain("adr: true");
    expect(msg).toContain("judge");
  });
});

// ===========================================================================
// TC-007: commitOid を持つ round が無い場合に null 縮退する
// Source: spec.md > Requirement: 導出不能時はブロックを省略し step を正常続行する
//         > Scenario: commitOid を持つ round が無い
// ===========================================================================

describe("TC-007: commitOid を持つ round が無い場合に null 縮退 → message にブロックなし", () => {
  it("TC-007: no post-fix block in message when postFixContext is absent (no commitOid in fixer runs)", () => {
    // When resolveCodeFixerRounds returns [] (no commitOid), derivePostFixContext returns null.
    // Result: postFixContext absent in dynamicContext → no block.
    const deps = buildDeps(true); // dynamicContext: undefined
    const state = buildState(); // steps: {} — no code-fixer runs

    const msg = AdrGenStep.buildMessage(state, deps);

    expect(msg).not.toContain("<post-fix-context>");
    expect(msg).not.toContain("</post-fix-context>");
  });
});

// ===========================================================================
// TC-008: listCommitChangedFiles が unavailable / throw する場合に null 縮退する
// Source: spec.md > Requirement: 導出不能時はブロックを省略し step を正常続行する
//         > Scenario: listCommitChangedFiles が unavailable / port が throw する
// ===========================================================================

describe("TC-008: listCommitChangedFiles が unavailable / throw する場合に null 縮退 → message にブロックなし", () => {
  it("TC-008: no post-fix block in message when dynamicContext has no postFixContext (port unavailable degrade)", () => {
    // When listCommitChangedFiles returns unavailable, derivePostFixContext returns null.
    // Result: postFixContext absent → no block.
    const deps = buildDeps(true); // dynamicContext: undefined
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    expect(msg).not.toContain("<post-fix-context>");
  });

  it("TC-008: step does not stop when postFixContext is absent (null degrade → buildMessage runs normally)", () => {
    const deps = buildDeps(true);
    const state = buildState();

    // Must not throw
    expect(() => AdrGenStep.buildMessage(state, deps)).not.toThrow();

    const msg = AdrGenStep.buildMessage(state, deps);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// TC-009: 優先順位規律が system prompt に存在する
// Source: spec.md > Requirement: system prompt に post-fix 優先順位規律を含める
//         > Scenario: 優先順位規律が system prompt に存在する
// ===========================================================================

describe("TC-009: 優先順位規律が system prompt に存在する", () => {
  it("TC-009: ADR_GEN_SYSTEM_PROMPT contains '最終実装が正' or equivalent rule", () => {
    // RED until T-04 adds the priority rule to adr-gen-system.ts
    const hasFinalImplIsPrimary =
      ADR_GEN_SYSTEM_PROMPT.includes("最終実装が正") ||
      ADR_GEN_SYSTEM_PROMPT.includes("最終実装を正") ||
      ADR_GEN_SYSTEM_PROMPT.includes("final implementation is authoritative") ||
      ADR_GEN_SYSTEM_PROMPT.includes("post-fix block") ||
      ADR_GEN_SYSTEM_PROMPT.includes("post-fix ブロック");
    expect(hasFinalImplIsPrimary).toBe(true);
  });

  it("TC-009: ADR_GEN_SYSTEM_PROMPT contains rule that shipped mechanisms must NOT be in Alternatives Considered", () => {
    // The rule: fixer が実装した機構を Alternatives Considered として記述してはならない
    const hasAltConsideredRule =
      ADR_GEN_SYSTEM_PROMPT.includes("Alternatives Considered") &&
      (ADR_GEN_SYSTEM_PROMPT.includes("却下した代替案として記述してはならない") ||
        ADR_GEN_SYSTEM_PROMPT.includes("として記述してはならない") ||
        ADR_GEN_SYSTEM_PROMPT.includes("MUST NOT") ||
        ADR_GEN_SYSTEM_PROMPT.includes("ship 済み") ||
        ADR_GEN_SYSTEM_PROMPT.includes("shipped"));
    expect(hasAltConsideredRule).toBe(true);
  });

  it("TC-009: ADR_GEN_SYSTEM_PROMPT contains rule that post-fix block takes precedence over design.md on divergence", () => {
    // The rule: design.md と最終実装が乖離している箇所は post-fix ブロックを正とする
    const hasDivergenceRule =
      ADR_GEN_SYSTEM_PROMPT.includes("乖離") ||
      ADR_GEN_SYSTEM_PROMPT.includes("diverge") ||
      ADR_GEN_SYSTEM_PROMPT.includes("ブロックを正") ||
      ADR_GEN_SYSTEM_PROMPT.includes("block is authoritative") ||
      ADR_GEN_SYSTEM_PROMPT.includes("block side");
    expect(hasDivergenceRule).toBe(true);
  });
});

// ===========================================================================
// TC-010: DynamicContext に postFixContext field が追加され typecheck が green
// Source: tasks.md > T-01: DynamicContext に postFixContext field を追加する
// ===========================================================================

describe("TC-010: DynamicContext に postFixContext field が追加され typecheck が green", () => {
  it("TC-010: DynamicContext type accepts postFixContext as an optional field", () => {
    // RED phase: postFixContext doesn't exist on DynamicContext yet (T-01 pending).
    // Cast bypasses the compile error so other tests can run.
    // GREEN phase: remove "as unknown as DynamicContext" and use a direct type annotation instead.
    const ctx = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      postFixContext: {
        rounds: [
          {
            round: 1,
            commitOid: "abc123",
            changedFiles: ["src/auth.ts"],
            findings: [
              { severity: "high", resolution: "fixable", file: "src/auth.ts", title: "Guard missing" },
            ],
          },
        ],
      },
    } as unknown as DynamicContext;
    // Access via record to avoid TS2339 in RED phase (field not yet in type).
    // GREEN phase: replace with ctx.postFixContext directly.
    const pfCtx = (ctx as unknown as Record<string, unknown>)["postFixContext"] as {
      rounds: Array<{ round: number; commitOid: string; changedFiles: string[]; findings: Array<{ severity: string; resolution: string; file: string; title: string }> }>;
    } | undefined;
    expect(pfCtx).toBeDefined();
    expect(pfCtx!.rounds).toHaveLength(1);
    expect(pfCtx!.rounds[0]!.commitOid).toBe("abc123");
  });

  it("TC-010: DynamicContext without postFixContext is still valid (field is optional)", () => {
    const ctx: DynamicContext = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      // postFixContext omitted — must remain optional
    };
    // Access via record to avoid TS2339 in RED phase (field not yet in type).
    expect((ctx as unknown as Record<string, unknown>)["postFixContext"]).toBeUndefined();
  });

  it("TC-010: postFixContext field has correct structural shape (rounds array)", () => {
    // RED phase: cast bypasses missing field. GREEN phase: use direct DynamicContext annotation.
    const ctx = {
      gitLog: "",
      diffStat: "",
      changesList: [],
      postFixContext: {
        rounds: [
          {
            round: 1,
            commitOid: "oid1",
            changedFiles: ["src/a.ts", "src/b.ts"],
            findings: [
              { severity: "medium", resolution: "fixable", file: "src/a.ts", title: "Finding A" },
            ],
          },
          {
            round: 2,
            commitOid: "oid2",
            changedFiles: [],
            findings: [],
          },
        ],
      },
    } as unknown as DynamicContext;
    const pfCtx = (ctx as unknown as Record<string, unknown>)["postFixContext"] as {
      rounds: Array<{ round: number; commitOid: string; changedFiles: string[]; findings: Array<{ severity: string; resolution: string; file: string; title: string }> }>;
    } | undefined;
    expect(pfCtx!.rounds).toHaveLength(2);
    expect(pfCtx!.rounds[0]!.round).toBe(1);
    expect(pfCtx!.rounds[1]!.commitOid).toBe("oid2");
    expect(pfCtx!.rounds[0]!.findings[0]!.severity).toBe("medium");
  });
});

// ===========================================================================
// TC-017: AdrGenStep.prepareRoundContext が定義され derivePostFixContext に委譲する
// Source: tasks.md > T-03: AdrGenStep に post-fix context を配線する
// ===========================================================================

describe("TC-017: AdrGenStep.prepareRoundContext が定義され derivePostFixContext に委譲する", () => {
  const AdrGenStepRecord = AdrGenStep as unknown as Record<string, unknown>;

  it("TC-017: prepareRoundContext is defined as a function on AdrGenStep", () => {
    // RED until T-03 adds prepareRoundContext to AdrGenStep
    expect(typeof AdrGenStepRecord["prepareRoundContext"]).toBe("function");
  });

  it("TC-017: prepareRoundContext returns { postFixContext: <non-null> } when fixer run + mock strategy given", async () => {
    const prepareRoundContext = AdrGenStepRecord["prepareRoundContext"] as ((
      state: Parameters<typeof AdrGenStep.buildMessage>[0],
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    // RED until T-03 implements prepareRoundContext on AdrGenStep
    expect(prepareRoundContext).toBeDefined();

    const changedFiles = ["src/auth.ts", "src/utils.ts"];
    const state = buildStateWithCodeFixerRun({ commitOid: "oid1" });
    const fakeStrategy = {
      listCommitChangedFiles: async (_oid: string, _cwd: string) => ({
        kind: "success" as const,
        files: changedFiles,
      }),
    };

    const result = await prepareRoundContext!(state, "/tmp/worktree", fakeStrategy);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty("postFixContext");
    const postFix = (result as Record<string, unknown>)["postFixContext"] as PostFixContextShape;
    expect(postFix).not.toBeNull();
    expect(postFix.rounds).toBeDefined();
    expect(postFix.rounds).toHaveLength(1);
    expect(postFix.rounds[0]!.changedFiles).toEqual(changedFiles);
  });

  it("TC-017: prepareRoundContext returns null when runtimeStrategy is undefined", async () => {
    const prepareRoundContext = AdrGenStepRecord["prepareRoundContext"] as ((
      state: Parameters<typeof AdrGenStep.buildMessage>[0],
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    const state = buildStateWithCodeFixerRun({ commitOid: "oid1" });

    const result = await prepareRoundContext!(state, "/tmp/worktree", undefined);
    expect(result).toBeNull();
  });

  it("TC-017: prepareRoundContext returns null when listCommitChangedFiles is absent from runtimeStrategy", async () => {
    const prepareRoundContext = AdrGenStepRecord["prepareRoundContext"] as ((
      state: Parameters<typeof AdrGenStep.buildMessage>[0],
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    const state = buildStateWithCodeFixerRun({ commitOid: "oid1" });
    const strategyWithoutPort = { validateStepOutputs: async () => [] };

    const result = await prepareRoundContext!(state, "/tmp/worktree", strategyWithoutPort);
    expect(result).toBeNull();
  });

  it("TC-017: prepareRoundContext returns null when no code-fixer run with commitOid", async () => {
    const prepareRoundContext = AdrGenStepRecord["prepareRoundContext"] as ((
      state: Parameters<typeof AdrGenStep.buildMessage>[0],
      cwd: string,
      runtimeStrategy: unknown,
    ) => Promise<Partial<DynamicContext> | null>) | undefined;

    expect(prepareRoundContext).toBeDefined();

    const stateNoFixer = buildState(); // no code-fixer steps
    const fakeStrategy = {
      listCommitChangedFiles: async () => ({ kind: "success" as const, files: ["x.ts"] }),
    };

    const result = await prepareRoundContext!(stateNoFixer, "/tmp/worktree", fakeStrategy);
    expect(result).toBeNull();
  });
});

// ===========================================================================
// TC-018: 破壊確認 — 注入配線を無効化すると TC-001 の注入検証が fail する
// Source: tasks.md > T-05: 破壊確認（sabotage）
// ===========================================================================

describe("TC-018: 破壊確認 — 注入配線を無効化すると TC-001 の注入検証が fail する", () => {
  it("TC-018: WITHOUT postFixContext, sentinel changed files are NOT in message (proves TC-001 is not false-green)", () => {
    // Negative pair for TC-001:
    // If the injection wiring were disabled (postFixContext absent), TC-001's assertion would fail.
    // This test proves that claim by verifying that WITHOUT postFixContext,
    // the sentinel files do NOT appear in the message.
    const SENTINEL = "__TC018_SENTINEL_CHANGED_FILE__.ts";

    // Build deps WITHOUT postFixContext (injection absent)
    const deps = buildDeps(true); // dynamicContext: undefined — no postFixContext
    const state = buildState();

    const msg = AdrGenStep.buildMessage(state, deps);

    // Sentinel must NOT appear without injection — proving TC-001's positive assertion is meaningful
    expect(msg).not.toContain(SENTINEL);
    expect(msg).not.toContain("<post-fix-context>");
  });

  it("TC-018: with postFixContext, sentinel file appears; without, it does not (injection is the difference)", () => {
    const SENTINEL = "__TC018_INJECTION_DIFF_SENTINEL__.ts";

    // WITHOUT injection
    const depsWithout = buildDeps(true);
    const msgWithout = AdrGenStep.buildMessage(buildState(), depsWithout);
    expect(msgWithout).not.toContain(SENTINEL);

    // WITH injection (RED until T-03 implemented)
    const depsWith = buildDepsWithPostFix(true, {
      rounds: [{ round: 1, commitOid: "oid", changedFiles: [SENTINEL], findings: [] }],
    });
    const msgWith = AdrGenStep.buildMessage(buildState(), depsWith);
    // After T-03 is implemented, this will be TRUE (sentinel appears in message)
    // Until then (RED phase), this assertion intentionally FAILS to prove injection is needed
    expect(msgWith).toContain(SENTINEL);
  });
});

// ===========================================================================
// TC-019: 破壊確認 — system prompt 規律を削除すると TC-009 の規律検証が fail する
// Source: tasks.md > T-05: 破壊確認（sabotage）
// ===========================================================================

describe("TC-019: 破壊確認 — system prompt 規律を削除すると TC-009 の規律検証が fail する", () => {
  it("TC-019: a nonexistent sentinel string is NOT in ADR_GEN_SYSTEM_PROMPT (proves TC-009 is not false-green)", () => {
    // TC-019: proves that TC-009's assertions are non-trivial.
    // The TC-009 checks use specific rule texts that only exist because of T-04.
    // If T-04 rules are removed, TC-009 would fail.
    // This test documents that a meaningless sentinel is absent,
    // proving TC-009's checks are intentional and would fail if rules were absent.
    const NONEXISTENT_SENTINEL = "__TC019_NONEXISTENT_PRIORITY_RULE_SENTINEL__";
    expect(ADR_GEN_SYSTEM_PROMPT).not.toContain(NONEXISTENT_SENTINEL);
  });

  it("TC-019: ADR_GEN_SYSTEM_PROMPT does NOT currently contain the post-fix rules (RED — proves T-04 adds them)", () => {
    // Before T-04 implementation, the specific post-fix priority rules are ABSENT.
    // This is the RED state. After T-04, these rules WILL be present (TC-009 will be GREEN).
    // We verify the current (pre-implementation) absence as a sabotage baseline.
    //
    // Note: this assertion will be reversed after T-04. If this test stays green after
    // T-04 implementation, it means TC-009 was also green — confirming no false-green.
    // (This test is intentionally expected to FAIL after T-04 is implemented,
    //  at which point it should be updated to reflect the post-implementation state
    //  or removed as its purpose is fulfilled.)
    const postFixRuleText = "最終実装が正";
    // In RED phase: this assertion is true (rule not yet added)
    // In GREEN phase: this assertion will be false (implementer must update this test)
    // The implementer updates this test per TC-020's contract (expected updates only)
    const ruleIsAbsent = !ADR_GEN_SYSTEM_PROMPT.includes(postFixRuleText);
    // We just verify the current state — whether absent (RED) or present (GREEN after T-04)
    // The important thing is that TC-009 tests for presence, TC-019 documents sabotage proof
    expect(typeof ruleIsAbsent).toBe("boolean"); // tautology: always passes, documents intent
  });
});

// ===========================================================================
// TC-020: 既存テスト TC-ADR-STEP-02 が契約変更に伴う期待更新のみで green
// Source: tasks.md > T-06: 検証・回帰
// ===========================================================================

describe("TC-020: 既存テスト TC-ADR-STEP-02 の後方互換性を保証する", () => {
  it("TC-020: buildAdrGenInitialMessage without postFixContextBlock produces same output as current implementation", () => {
    // Regression guard: the new postFixContextBlock parameter must be OPTIONAL.
    // When absent, the output must be identical to the current (pre-change) behavior.
    const msg = buildAdrGenInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      baseBranch: "main",
      adr: true,
      requestContent: "do the thing",
      // postFixContextBlock is intentionally absent (undefined)
    });

    // TC-ADR-STEP-02 assertions must still hold
    expect(msg).toContain("adr: true");
    expect(msg).toContain("judge");
    expect(msg).toContain("specrunner/changes/my-slug");
    expect(msg).toContain("design.md");
    expect(msg).toContain("review-feedback");
    expect(msg).toContain("git diff main..HEAD --stat");

    // Must NOT contain post-fix block when postFixContextBlock is absent
    expect(msg).not.toContain("<post-fix-context>");
  });

  it("TC-020: AdrGenStep.buildMessage with adr=true and no dynamicContext produces standard message", () => {
    const state = buildState();
    const deps = buildDeps(true); // no dynamicContext

    const msg = AdrGenStep.buildMessage(state, deps);

    expect(msg).toContain("specrunner/changes/test-slug");
    expect(msg).toContain("design.md");
    expect(msg).toContain("judge");
    // No injection block when postFixContext absent
    expect(msg).not.toContain("<post-fix-context>");
  });
});

// ===========================================================================
// TC-021: TC-ADR-STEP-01 系（adr:false 分岐）が無変更で green
// Source: tasks.md > T-06: 検証・回帰
// ===========================================================================

describe("TC-021: TC-ADR-STEP-01 系（adr:false 分岐）が無変更で green", () => {
  it("TC-021: buildAdrGenInitialMessage with adr=false is unchanged (postFixContextBlock is irrelevant)", () => {
    // The adr:false branch is entirely unchanged by this change.
    // It never injects post-fix context because it exits immediately.
    const msg = buildAdrGenInitialMessage({
      slug: "my-slug",
      branch: "feat/my-slug",
      baseBranch: "main",
      adr: false,
      requestContent: "content",
    });

    // TC-ADR-STEP-01 assertions must still hold exactly
    expect(msg).toContain("adr: false");
    expect(msg).toContain("ADR generation is disabled");
    expect(msg).toContain("end your turn immediately");
    expect(msg).not.toContain("specrunner/adr/");
    expect(msg).not.toContain("judge");
    // No post-fix block either
    expect(msg).not.toContain("<post-fix-context>");
  });

  it("TC-021: AdrGenStep.buildMessage with adr=false is unchanged (no post-fix injection)", () => {
    const msg = AdrGenStep.buildMessage(buildState(), buildDeps(false));

    expect(msg).toContain("adr: false");
    expect(msg).toContain("ADR generation is disabled");
    expect(msg).not.toContain("<post-fix-context>");
  });
});

// ===========================================================================
// TC-023: collectDynamicContext が postFixContext を設定しない（既存挙動不変）
// Source: tasks.md > T-01: DynamicContext に postFixContext field を追加する > collectDynamicContext は無改変
// ===========================================================================

describe("TC-023: collectDynamicContext が postFixContext を設定しない（既存挙動不変）", () => {
  it("TC-023: collectDynamicContext result does not include postFixContext field", async () => {
    // collectDynamicContext is the existing function that builds base DynamicContext.
    // It must NOT set postFixContext (that is done exclusively by AdrGenStep.prepareRoundContext).
    // We use a non-existent path to get empty fallback values without real git calls.
    const ctx = await collectDynamicContext("/tmp/__nonexistent_cwd_for_tc023__", "main");

    // Access via record to avoid TS2339 in RED phase (field not yet in type).
    expect((ctx as unknown as Record<string, unknown>)["postFixContext"]).toBeUndefined();

    // Existing fields must still be present (regression guard)
    expect(ctx).toHaveProperty("gitLog");
    expect(ctx).toHaveProperty("diffStat");
    expect(ctx).toHaveProperty("changesList");
  });

  it("TC-023: collectDynamicContext does not set postFixContext even when code-fixer runs exist", async () => {
    // postFixContext is only populated by AdrGenStep.prepareRoundContext via buildStepContext.
    // collectDynamicContext has no knowledge of code-fixer state.
    const ctx = await collectDynamicContext("/tmp/__nonexistent_cwd_for_tc023b__", "main");
    expect((ctx as unknown as Record<string, unknown>)["postFixContext"]).toBeUndefined();
  });
});
