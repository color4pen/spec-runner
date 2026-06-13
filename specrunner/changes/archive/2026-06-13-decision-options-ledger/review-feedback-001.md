# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | correctness | `src/core/inbox/planner.ts` | **TC-025 gap: malformed `/resume 1=` treated as prose, not blocked** — TC-025 (must-priority) requires that `/resume 1=` (missing option number) with open decisions leaves the job awaiting-resume. `parseResumeDecisionInput` correctly treats `1=` as prose (not matching `\d+=\d+$`), but `planResumes` then sees `selections.length === 0` and falls through to the prose-only path, creating a ResumeAction. The design (D6) explicitly states: "when malformed decision tokens are present for a job with open decisions, the implementation should leave the job awaiting resume." This case is also untested at the `planResumes` level. | In `planResumes`, after `parseResumeDecisionInput`, detect whether the raw body contains patterns that look like intended-but-broken decision tokens (e.g. `/\d+=(?!\d)/` or similar) when open decisions exist. Alternatively, extend `ParsedResumeInput` with a `hasInvalidTokens` flag set when the parser encounters an invalid `N=`-prefixed word, and use that flag in `planResumes` to block resumption when there are open decisions. Add a `planResumes` test: job with one open decision, comment `/resume 1=`, expect `result.length === 0`. | yes |
| 2 | low | testing | `tests/unit/inbox/planner.test.ts` | **TC-024 planner-level coverage missing for `0=1` with open decisions** — TC-024 (should-priority) says `/resume 0=1` with open decisions leaves job awaiting-resume. `parseResumeDecisionInput` correctly returns `{ selections: [], resumePrompt: "0=1" }` (tested), but there is no `planResumes`-level test asserting the job stays awaiting-resume. In practice `0=1` also passes through as prose-only resume, same root cause as finding #1. | Add a `planResumes` test: job with one open decision, comment `/resume 0=1`, expect `result.length === 0`. Fix requires the same planner guard as finding #1. | yes |
| 3 | low | security | `src/core/notify/issue-notifier.ts` | **TC-030 not tested: `escapePlainText` skips Markdown emphasis chars** — Design D5 requires that model-controlled text "cannot introduce Markdown structure." `escapePlainText` escapes `<`, `>`, `&`, and flattens newlines, which blocks HTML and `/resume` command spoofing. However, it intentionally does NOT escape `*`, `_`, `` ` `` etc., so a finding title like `**bold**` renders with Markdown emphasis in the GitHub comment. The practical risk is cosmetic (no command injection due to newline flattening), but TC-030 (should-priority) is missing from the test suite and the implementation diverges from the spec contract. | Add a test `TC-N-030` in `issue-notifier.test.ts`: finding title `"**bold** option"` → rendered output contains `**bold**` as literal text (escaped) or confirm the deliberate design choice and update test-cases.md to reflect it as a known deviation. | yes |
| 4 | low | maintainability | `src/core/decision/decision-ledger.ts` | **Redundant `d.step === step` guard in `isFindingDecided`** — `computeFindingKey` encodes `step` as the first segment of the key (`${step}|...`), so `d.findingKey === key` already implies `d.step === step`. The extra guard is harmless but misleading — it suggests the ledger could contain records with `findingKey` matching but `step` not matching, which is structurally impossible. | Remove the `d.step === step &&` clause from the `.some()` predicate in `isFindingDecided`, leaving only `d.findingKey === key`. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 7 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 7.90

## Summary

The implementation delivers all core features: schema enforcement with strict/lenient dual-mode, escalation comment rendering with numbered options, `/resume N=M` parsing, decision ledger persistence, executor filtering of decided findings, and backward-compatible state loading. `typecheck && test` is green. All must-priority acceptance criteria except TC-025 are covered by tests.

The primary issue is a must-priority correctness gap: a malformed `/resume 1=` token (missing option number) with open decisions is silently treated as a prose-only resume rather than blocking the job, contrary to design D6. This needs a guard in `planResumes` and a corresponding test. The remaining findings are low-severity: missing planner-level test for `0=1`, missing TC-030 escaping test, and a redundant condition in `isFindingDecided`.
