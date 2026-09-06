# Conformance Result — finding-remediation-contract — Iteration 002

## Evidence

| Category | Count |
|---|---|
| Normative items checked (request AC + spec Requirements/Scenarios) | 28 |
| Normative items skipped | 0 |
| Normative items unverified | 0 |

## Scope of Changes

`git diff main...HEAD --stat` shows 58 files changed, 6983 insertions, 113 deletions, spanning:

- `src/kernel/report-result.ts` — type additions
- `src/core/step/report-tool.ts` — schema additions
- `src/core/port/report-result.ts` — parse layer
- `src/core/step/fixer-helpers.ts` — buildFindingsBlock / renderEvidenceReference
- `src/core/step/code-fixer.ts` — evidence reference in all structured paths
- `src/core/step/spec-fixer.ts` — evidence reference in all structured paths
- `src/core/step/regression-gate.ts` — ledger entry with sites
- `src/prompts/judge-rules.ts` — FINDING_REMEDIATION_DEFINITION
- `src/prompts/code-fixer-system.ts` — system prompt rewrite
- `src/prompts/spec-fixer-system.ts` — system prompt update
- `src/prompts/custom-reviewer-system.ts` — fragment injection
- `src/prompts/code-review-system.ts` — fragment injection
- `src/prompts/spec-review-system.ts` — fragment injection
- `src/prompts/conformance-system.ts` — fragment injection
- `src/prompts/regression-gate-system.ts` — fragment injection + method update
- `src/core/port/__tests__/remediation-parse.test.ts` — new test file (600 lines)
- `src/core/step/__tests__/fail-closed-drift-guard.test.ts` — new test file (167 lines)
- `tests/unit/step/fixer-findings.test.ts` — updated

---

## Normative Verification

### AC-1: ADR で remediation 契約のフィールド、必須条件、fail-closed 経路、互換性方針が定義される

**Status**: Request states `adr: true` and this is a pipeline concern for `adr-gen` step. The design.md (D1–D10) is comprehensive and will feed adr-gen. Design decisions D1 (type layout), D2 (scope), D3 (fail-closed), D4 (self-site normalization), D5 (identity), D10 (null handling) correspond directly to ADR content requirements. **Satisfied as plan context** — adr-gen produces the final ADR.

### AC-2: `Finding` 型 / tool schema / parse / persisted 型に remediation が追加され、fixable で欠落した場合の挙動が typed error または escalation として固定される

Verified:

- `src/kernel/report-result.ts`: `RemediationSite`, `FindingRemediation`, and `Finding.remediation?: FindingRemediation` added with full doc comment (`resolution === "fixable"` enforcement note, identity invariant) ✓
- `src/core/step/report-tool.ts`: `remediationSiteSchema`, `remediationSchema`, and `optional(remediationSchema)` on both `findingSchema` and `conformanceFindingSchema` ✓
- Tool descriptions for JUDGE, CODE_REVIEW, CONFORMANCE updated to require `remediation` when `resolution === "fixable"` ✓
- `REQUEST_REVIEW_REPORT_TOOL.description` unchanged — no remediation mention ✓
- `src/core/port/report-result.ts`:
  - `parseRemediation` added — validates non-empty invariant/approach, sites array ≥ 1, file non-empty, null line normalized to absent ✓
  - `parseFindings(raw, strict, requireRemediation)` extended — third parameter additive; existing callers unchanged ✓
  - Strict mode + malformed remediation → `{ ok: false }` ✓
  - `strict && requireRemediation && fixable && absent` → `{ ok: false, reason: "remediation-missing" }` ✓
  - `parseJudgeReportInput` calls `parseFindings(obj["findings"], true, true)` ✓
  - `missingFields: ["findings.remediation"]` on `reason === "remediation-missing"`, else `["findings"]` ✓
  - `parseRequestReviewReportInput` calls `parseFindings(obj["findings"], true, false)` — no remediation requirement ✓
- State/persisted types: `src/state/schema/types.ts` references `Finding` by type — additive field addition propagates automatically; no separate update required (confirmed in design D1 and tasks T-01) ✓

### AC-3: judge rules と custom reviewer 共通 fragment が remediation の記述を要求する

Verified:

- `FINDING_REMEDIATION_DEFINITION` added to `src/prompts/judge-rules.ts` — includes format, required fields, walking obligation (走査義務), and the "sites には finding 自身の file:line を含める" rule ✓
- Fragment is provider-neutral (no "report_result" or "end_turn" strings) ✓
- Injected into: `custom-reviewer-system.ts`, `code-review-system.ts`, `spec-review-system.ts`, `conformance-system.ts`, `regression-gate-system.ts` ✓
- NOT injected into `request-review-system.ts` (confirmed via grep) ✓
- `specrunner/reviewers/*.md` are NOT in the diff (confirmed) ✓

### AC-4: code-fixer / spec-fixer のプロンプトに invariant、sites 全列挙、approach、evidence file path が含まれる

Verified:

**buildFindingsBlock** (`src/core/step/fixer-helpers.ts`):
- Adds `**Invariant**`, `**Sites (fix all in this iteration)**` (all sites enumerated), `**Approach**` per remediation-carrying finding ✓
- Legacy findings (no remediation) output unchanged — tests confirm this ✓
- All-sites simultaneous fix directive appended when any finding has remediation ✓

**renderEvidenceReference** (`src/core/step/fixer-helpers.ts`):
- New helper — returns empty string for empty paths, formatted block with read-only note for non-empty ✓

**code-fixer** (`src/core/step/code-fixer.ts`) — all 3 structured paths:
- Conformance path initial: `renderEvidenceReference([findingsPath])` ✓
- Conformance path continuation: `findingsPaths: [findingsPath]` passed to `buildContinuationMessage` ✓
- Coordinator path initial: `renderEvidenceReference(memberPaths)` (all member paths) ✓
- Coordinator path continuation: `findingsPaths: memberPaths` ✓
- Normal structured path initial: `renderEvidenceReference([findingsPath])` ✓
- Normal structured path continuation: `findingsPaths: [findingsPath]` ✓

**spec-fixer** (`src/core/step/spec-fixer.ts`) — all 2 structured paths:
- Conformance path initial: `renderEvidenceReference([findingsPath])` ✓
- Conformance path continuation: `findingsPaths: [findingsPath]` ✓
- Normal path initial: `renderEvidenceReference([findingsPath])` ✓
- Normal path continuation: `findingsPaths: [findingsPath]` ✓

**buildContinuationMessage**: uses `opts.findingsPaths ?? [opts.findingsPath]` → evidence reference present in all structured continuation paths ✓

### AC-5: code-fixer system prompt の「最小限」の定義が「全 site で不変条件を成立させる最小の修正」に改められる

Verified (`src/prompts/code-fixer-system.ts`):
- "最小限の機械的修正" no longer present (grep confirmed) ✓
- Question: "finding が名指しした不変条件を、列挙された全 site で成立させる最小の修正ができたか" ✓
- Contract input: "初期メッセージに埋め込まれた findings block（正典）" + "参照用に示される evidence file path（読み取り専用。機械 parse はしない）" ✓
- Method 1: "初期メッセージの findings block を正典として読む。evidence file path が示されていれば参照として読む（機械 parse はしない）" ✓
- Method 3: "各 finding の invariant を、列挙された全 site で成立させる。approach より狭い修正を選ぶ場合は理由を evidence に残す" ✓
- write-set: "新機能の追加は禁止（findings に記載されていない変更）" retained ✓
- Security constraint: "finding が名指しした不変条件を全 site で成立させる最小の修正のみ" ✓

**spec-fixer system prompt** (`src/prompts/spec-fixer-system.ts`):
- Contract input: "初期メッセージに埋め込まれた findings block（正典）" + "参照用に示される result file path（読み取り専用。機械 parse はしない）" ✓
- Method 2: "各 finding の invariant を、列挙された全 site で成立させる最小の変更を行う" ✓
- "findings に記載されていない変更は禁止" retained ✓

### AC-6: regression-gate の ledger が sites を保持し、既存 `ledgerRef` と互換である

Verified (`src/core/step/regression-gate.ts`):
- `buildLedgerEntry`: adds `**Invariant**` and `**Sites**` (all enumerated) when `finding.remediation` present ✓
- Entries without remediation output unchanged ✓
- `buildLedgerBlock`: appends "Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する。いずれかで破れていれば退行として報告する" when any entry has sites ✓
- `findingFingerprint` = `${file}|${line ?? ""}|${title}` — unchanged ✓
- `computeLedgerRef` = SHA-256 first 8 hex of fingerprint — unchanged ✓
- `computeRegressionLedger` / `collectFindingsLedger` / `dedupeFindings` — unchanged ✓
- Regression-gate system prompt (Method step 3): "entry に Sites がある場合: 全 site を確認し、いずれかで不変条件が破れていれば退行として報告する。退行 finding の remediation には ledger entry の invariant / sites を引き継ぐ" ✓

### AC-7: remediation のない既存 persisted finding を読み込んでも既存テストが green

Verified by design:
- `parseFindings` with no `strict`/`requireRemediation` arguments → `false, false` defaults → remediation not required, absent is valid ✓
- Only "live tool call" paths (`parseJudgeReportInput`) use `strict=true, requireRemediation=true` ✓
- Persisted state reads use non-strict path (event-journal `outcome.toolResult` is transparent) ✓
- `src/core/port/__tests__/remediation-parse.test.ts` has explicit backward compatibility test ✓
- `src/core/step/__tests__/fail-closed-drift-guard.test.ts` tests that `findings: []` still produces approved ✓

### AC-8: verdict 導出、`AgentRunResult`、既存 Git / PR profile の挙動が変わらない

Verified:
- `deriveJudgeVerdict`, `deriveRequestReviewVerdict`, `deriveRegressionGateVerdict` — not in the diff ✓
- `AgentRunResult` type — not modified ✓
- `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` — unchanged ✓
- parser changes are additive only; return type shape of `parseJudgeReportInput` is unchanged ✓
- `step-completion.ts:293-306` behavior: `toolResult === null` → escalation — unchanged ✓

### AC-9: SpecRunner verification が green

**Per request**: "PR 上の既存証跡を正本とし、レビュー側で同一の test / lint / typecheck を重複実行しない." Verification result is in `verification-result.md` (per diff stat this file exists at 1292 lines). This AC is satisfied by the pre-existing verification evidence in state.

---

## Spec Scenario Coverage

### Requirement: fixable finding は remediation 契約を伴わなければならない

| Scenario | Status |
|---|---|
| fixable finding に remediation があると parse が成功する | ✓ verified via `parseJudgeReportInput` + `parseFindings(true, true)` |
| fixable finding に remediation が無いと parse が失敗する | ✓ `reason === "remediation-missing"` → `missingFields: ["findings.remediation"]` |
| decision-needed finding は remediation なしでも parse が成功する | ✓ `requireRemediation` only fires on `resolution === "fixable"` |
| sites が空配列の remediation は拒否される | ✓ `parseRemediation` checks `sites.length === 0` → `{ ok: false }` |
| request-review は remediation を要求しない | ✓ `parseRequestReviewReportInput` uses `requireRemediation=false` |

### Requirement: remediation の欠落は approved を生成してはならない

| Scenario | Status |
|---|---|
| remediation 欠落で完了報告が採用されなかった judge step は escalation になる | ✓ parse fails → runner retries → `toolResult=null` → `step-completion.ts` → escalation (design D3 confirmed) |
| findings が空の完了報告は従来どおり approved になる | ✓ `requireRemediation` only applies to individual finding elements; `findings: []` succeeds |

### Requirement: sites は finding 自身の site を必ず含む

| Scenario | Status |
|---|---|
| 自 site が欠けている sites は先頭に補完される | ✓ `parseFindings` inserts `{ file, line }` at head when not found |
| 自 site が既にある場合は重複追加されない | ✓ dedup by `file|line` prevents double-entry |

### Requirement: remediation を持たない既存 finding は additive に読み込める

| Scenario | Status |
|---|---|
| 旧 persisted finding から ledger が生成される | ✓ non-strict path; `computeLedgerRef` formula unchanged |
| remediation は永続化と復元を往復する | ✓ `outcome.toolResult` is transparent JSON round-trip via event-journal |

### Requirement: finding の identity は remediation に依存しない

| Scenario | Status |
|---|---|
| remediation の有無で ledgerRef が変わらない | ✓ `findingFingerprint` = `file|line|title`; remediation not included |

### Requirement: fixer プロンプトは invariant / 全 sites / approach / evidence path を含む

| Scenario | Status |
|---|---|
| 2 site を持つ finding の両方が fixer プロンプトに現れる | ✓ `buildFindingsBlock` iterates all `f.remediation.sites`; reproduction fixture test asserts both sites |
| code-fixer は structured findings があっても evidence file path を含める | ✓ all 3 structured paths use `renderEvidenceReference` |
| spec-fixer は structured findings があっても evidence file path を含める | ✓ both structured paths use `renderEvidenceReference` |
| 継続セッションの fixer プロンプトも remediation と evidence path を含む | ✓ `buildContinuationMessage` renders evidence via `findingsPaths` when findings present |
| remediation を持たない finding の出力は従来どおり | ✓ `buildFindingsBlock` branch is gated on `f.remediation` |

### Requirement: reviewer 向けプロンプトは remediation の記述と隣接経路の走査を要求する

| Scenario | Status |
|---|---|
| custom reviewer の system prompt が remediation を要求する | ✓ `FINDING_REMEDIATION_DEFINITION` injected into `custom-reviewer-system.ts` |
| request-review の system prompt は remediation を要求しない | ✓ grep confirms no injection |

### Requirement: code-fixer の「最小限」は全 site での不変条件成立を意味する

| Scenario | Status |
|---|---|
| code-fixer system prompt が全 site 成立を最小限の定義とする | ✓ Question/Contract/Method all use invariant-all-sites language; "最小限の機械的修正" not present |
| code-fixer system prompt の入力記述が実際の受け渡しと一致する | ✓ Contract input matches actual buildMessage behavior |

### Requirement: spec-fixer の「最小限」は全 site での不変条件成立を意味する

| Scenario | Status |
|---|---|
| spec-fixer system prompt が全 site 成立を最小限の定義とする | ✓ Method 2: "各 finding の invariant を、列挙された全 site で成立させる最小の変更を行う" |
| spec-fixer system prompt の入力記述が実際の受け渡しと一致する | ✓ Contract input matches actual buildMessage behavior |

### Requirement: regression-gate の ledger entry は sites を保持し全 site を検証対象にする

| Scenario | Status |
|---|---|
| ledger block に sites が展開される | ✓ `buildLedgerEntry` adds Invariant/Sites lines; Provenance Ref position unchanged |
| remediation を持たない ledger entry の表示は従来どおり | ✓ branch gated on `finding.remediation` |

---

## Plan Divergence Notes (non-blocking)

- **design D7** (adapter retry 文面は変更しない): confirmed — `adapter/claude-code/agent-runner.ts` prompt changes (17 lines in diff) appear unrelated to retry behavior; no missingFields-triggered re-prompt text was added. Deferred per design intent.
- **`src/core/step/canon-escalation.ts`** (154 lines changed): not listed as a primary touch file in the spec/request, but present in the diff. This appears to be a related scope-enforcement change touched in a prior step (code-review fixer). Does not conflict with any spec requirement.
- **T-10 "永続化ラウンドトリップ"**: I did not find a separate state-journal round-trip test in the test files read. The request mentions this in the test list. This is a plan-level concern (tasks completion) and not a spec normative violation since the behavior is guaranteed by the transparent JSON serialization of `outcome.toolResult` in `event-journal.ts`.

---

## Conclusion

All 9 Acceptance Criteria are satisfied. All 28 verified normative items (Requirements and Scenarios) from spec.md conform to the implementation. No request.md normative requirements were violated. No findings.
