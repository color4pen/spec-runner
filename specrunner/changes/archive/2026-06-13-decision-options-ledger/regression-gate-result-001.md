# Regression Gate Result — decision-options-ledger — iteration 1

- **verdict**: needs-fix

## Ledger Verification (8 findings)

### [MEDIUM] TC-025 gap: malformed /resume 1= token with open decisions
- **file**: src/core/inbox/planner.ts
- **status**: fixed
- **evidence**: `hasInvalidDecisionTokens` flag added to `ParsedResumeInput`. `planResumes` checks `parsed.hasInvalidDecisionTokens` with open findings and skips resume creation. TC-025 test at `tests/unit/inbox/planner.test.ts:756` asserts `result.length === 0`.

### [LOW] TC-024 planner-level coverage missing for 0=1 token with open decisions
- **file**: tests/unit/inbox/planner.test.ts
- **status**: fixed
- **evidence**: TC-024 test at line 769 — job with one open decision, `/resume 0=1`, asserts `result.length === 0`.

### [LOW] TC-030 not tested: escapePlainText omits Markdown emphasis escaping
- **file**: src/core/notify/issue-notifier.ts
- **status**: regression
- **severity**: low
- **resolution**: fixable
- **rationale**: `review-feedback-001.md` finding #3 (Fix: yes) required adding `TC-N-030` to `tests/unit/core/notify/issue-notifier.test.ts`. The test was not added. `grep -c "TC-N-030|TC-030|escapePlainText"` returns 0 matches in the test file. `escapePlainText` is implemented and correct but the deliberate scope (no Markdown emphasis escaping) is not pinned by any test, leaving it unguarded against future unintended changes.

### [LOW] Redundant d.step === step guard in isFindingDecided
- **file**: src/core/decision/decision-ledger.ts:56
- **status**: regression
- **severity**: low
- **resolution**: fixable
- **rationale**: `review-feedback-001.md` finding #4 (Fix: yes) required removing `d.step === step &&` from `isFindingDecided`. Line 56 still reads `decisions.some((d) => d.step === step && d.findingKey === key)`. `computeFindingKey` encodes `step` as the first key segment, so `d.findingKey === key` already implies `d.step === step`; the extra guard is structurally impossible to be meaningful and is misleading.

### [HIGH] JUDGE_REPORT_TOOL / CODE_REVIEW_REPORT_TOOL / REQUEST_REVIEW_REPORT_TOOL / CONFORMANCE_REPORT_TOOL の description に options が記載されていない
- **file**: src/core/step/report-tool.ts
- **status**: fixed
- **evidence**: All 4 tool descriptions updated to include `options?: [{label: string, consequence: string}]` and the sentence "When resolution is 'decision-needed', options is REQUIRED and must contain at least 2 entries".

### [MEDIUM] conformance system prompt に DECISION_NEEDED_DEFINITION が含まれず options 要件を学べない
- **file**: src/prompts/conformance-system.ts
- **status**: fixed
- **evidence**: `DECISION_NEEDED_DEFINITION` imported and inserted at line 84. fragment-coverage.test.ts verifies `CONFORMANCE_SYSTEM_PROMPT contains DECISION_NEEDED_DEFINITION`.

### [LOW] 全judge/reviewer promptのJSON例がdecision-needed findingのoptionsフィールドを示していない
- **file**: src/prompts/spec-review-system.ts (and 4 others)
- **status**: intentionally deferred — not a regression
- **evidence**: `cross-boundary-invariants-result-002.md` explicitly classified this as "残存・非ブロッキング" and issued `approved`. Tool descriptions (F1 fix) and `DECISION_NEEDED_DEFINITION` text provide two-layer coverage; JSON examples not updated is a deliberate choice by the reviewer.

### [LOW] filterUndecidedFindings called redundantly up to 3× per judge step finalization
- **file**: src/core/step/executor.ts:634
- **status**: intentionally approved — not a regression
- **evidence**: `scale-tolerance-result-001.md` found the issue (LOW severity) and issued `approved`. Calls are now 2× max (one from if/else branch + one for finding-refs). The "compute once before branches" optimization was not implemented but the reviewer deemed it negligible at current scales.

## Regressions Found

| # | Severity | File | Description | Resolution |
|---|----------|------|-------------|------------|
| 1 | low | `tests/unit/core/notify/issue-notifier.test.ts` | TC-N-030 test absent — `escapePlainText` scope not pinned by any test | fixable |
| 2 | low | `src/core/decision/decision-ledger.ts:56` | Redundant `d.step === step &&` guard not removed from `isFindingDecided` | fixable |
