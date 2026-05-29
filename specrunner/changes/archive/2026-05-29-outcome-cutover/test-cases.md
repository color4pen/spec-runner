# Test Cases: outcome-cutover

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 29 cases
- **Automated** (unit/integration): 29
- **Manual**: 0
- **Priority**: must: 20, should: 9, could: 0

---

## Judge Verdict — typed toolResult から導出

### TC-001: judge + approved:true → verdict "approved"

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2

**GIVEN** spec-review step（`reportTool === JUDGE_REPORT_TOOL`）で `agentResult.toolResult = { ok: true, approved: true }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"approved"` になり、prose parse（`step.parseResult`）は呼ばれない

---

### TC-002: judge + approved:false → verdict "needs-fix"

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2

**GIVEN** spec-review step（`reportTool === JUDGE_REPORT_TOOL`）で `agentResult.toolResult = { ok: true, approved: false }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"needs-fix"` になる

---

### TC-003: judge + approved:undefined → verdict "needs-fix"（保守側）

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2 / request.md 受け入れ基準 #5

**GIVEN** spec-review step で `agentResult.toolResult = { ok: true }` （`approved` フィールドが存在しない）
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"needs-fix"` になる（`"approved"` にも `"escalation"` にもならない）

---

### TC-004: code-review judge + approved:true → verdict "approved"

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2 / design.md D6

**GIVEN** code-review step（`reportTool === CODE_REVIEW_REPORT_TOOL`）で `agentResult.toolResult = { ok: true, approved: true, fixableCount: 0 }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"approved"` になる（fixableCount は verdict ではなく routing で使用される）

---

### TC-005: code-review judge + approved:false + fixableCount:3 → verdict "needs-fix"

**Category**: unit
**Priority**: should
**Source**: T-01 AC / design.md D2

**GIVEN** code-review step で `agentResult.toolResult = { ok: true, approved: false, fixableCount: 3 }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"needs-fix"` になる（fixableCount はこのケースの verdict に影響しない）

---

## Producer Verdict — typed toolResult から導出

### TC-006: producer + status:"success" → verdict completionVerdict（"success"）

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2

**GIVEN** implementer step（producer, `completionVerdict` 未設定）で `agentResult.toolResult = { ok: true, status: "success" }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"success"` になる

---

### TC-007: producer + status:"success" + completionVerdict="approved" → verdict "approved"

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2

**GIVEN** `completionVerdict = "approved"` の producer step で `agentResult.toolResult = { ok: true, status: "success" }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"approved"` になる（遷移表の `on: "approved"` にマッチする）

---

### TC-008: producer + status:"error" → verdict "error"

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D2

**GIVEN** producer step で `agentResult.toolResult = { ok: true, status: "error" }`
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `"error"` になる

---

### TC-009: producer + status:undefined → verdict completionVerdict fallback

**Category**: unit
**Priority**: should
**Source**: T-01 AC / design.md D2

**GIVEN** producer step で `agentResult.toolResult = { ok: true }` （`status` フィールドが存在しない）
**WHEN** `finalizeStep` が呼ばれる
**THEN** verdict が `completionVerdict`（デフォルト `"success"`）になる

---

## Null toolResult（no-tool-call）→ halt しない / proceed

### TC-010: judge + toolResult null → "needs-fix" で proceed（halt しない）

**Category**: unit
**Priority**: must
**Source**: T-02 AC / design.md D3 / request.md 受け入れ基準 #4 #5

**GIVEN** spec-review step で `agentResult.toolResult === null`（no-tool-call / idle）
**WHEN** executor が runResult を処理する
**THEN** `stepHaltedNoToolCallError` を throw せず、`"needs-fix"` で次 step へ proceed する

---

### TC-011: code-review judge + toolResult null → "needs-fix" で proceed

**Category**: unit
**Priority**: must
**Source**: T-02 AC / design.md D3

**GIVEN** code-review step で `agentResult.toolResult === null`
**WHEN** executor が runResult を処理する
**THEN** halt せず、verdict `"needs-fix"` で次 step（fixer）へ進む

---

### TC-012: producer + toolResult null → completionVerdict("success") で proceed

**Category**: unit
**Priority**: must
**Source**: T-02 AC / design.md D3 / request.md 受け入れ基準 #6

**GIVEN** implementer step（producer）で `agentResult.toolResult === null`
**WHEN** executor が runResult を処理する
**THEN** halt せず、verdict `completionVerdict`（`"success"`）で proceed する

---

## Escalation 遷移の削除（judge のみ）

### TC-013: spec-review の escalation 遷移が存在しない

**Category**: unit
**Priority**: must
**Source**: T-03 AC / design.md D4 / request.md 受け入れ基準 #3

**GIVEN** `STANDARD_TRANSITIONS` の定義
**WHEN** `step === "spec-review"` かつ `on === "escalation"` の行を検索する
**THEN** 該当する遷移行が存在しない

---

### TC-014: code-review の escalation 遷移が存在しない

**Category**: unit
**Priority**: must
**Source**: T-03 AC / design.md D4 / request.md 受け入れ基準 #3

**GIVEN** `STANDARD_TRANSITIONS` の定義
**WHEN** `step === "code-review"` かつ `on === "escalation"` の行を検索する
**THEN** 該当する遷移行が存在しない

---

### TC-015: delta-spec-validation の escalation 遷移が維持されている

**Category**: unit
**Priority**: must
**Source**: T-03 AC / design.md D4 / request.md 受け入れ基準 #3

**GIVEN** `STANDARD_TRANSITIONS` の定義
**WHEN** `step === "delta-spec-validation"` かつ `on === "escalation"` の行を検索する
**THEN** `to: "escalate"` の遷移行が存在する（grounded step の escalation は維持）

---

### TC-016: verification の escalation 遷移が維持されている

**Category**: unit
**Priority**: must
**Source**: T-03 AC / design.md D4

**GIVEN** `STANDARD_TRANSITIONS` の定義
**WHEN** `step === "verification"` かつ `on === "escalation"` の行を検索する
**THEN** `to: "escalate"` の遷移行が存在する

---

## Fixable Routing — toolResult.fixableCount による routing

### TC-017: code-review approved + fixableCount:3 → code-fixer へ routing

**Category**: unit
**Priority**: must
**Source**: T-04 AC / design.md D5 / request.md 受け入れ基準 #2

**GIVEN** code-review step が verdict `"approved"` で完了し、`lastReview.outcome.toolResult = { ok: true, approved: true, fixableCount: 3 }`
**WHEN** 遷移表の `when` predicate が評価される
**THEN** `fixableCount > 0` が true となり、code-fixer へ routing される

---

### TC-018: code-review approved + fixableCount:0 → delta-spec-validation へ routing

**Category**: unit
**Priority**: must
**Source**: T-04 AC / design.md D5

**GIVEN** code-review step が verdict `"approved"` で完了し、`lastReview.outcome.toolResult = { ok: true, approved: true, fixableCount: 0 }`
**WHEN** 遷移表の `when` predicate が評価される
**THEN** `fixableCount > 0` が false となり、通常の approved path（delta-spec-validation）へ進む

---

### TC-019: code-review approved + fixableCount:undefined → 0 fallback → delta-spec-validation

**Category**: unit
**Priority**: should
**Source**: T-04 AC / design.md D5

**GIVEN** code-review step が verdict `"approved"` で完了し、`lastReview.outcome.toolResult = { ok: true, approved: true }` （`fixableCount` なし）
**WHEN** 遷移表の `when` predicate が評価される
**THEN** `?? 0` fallback が適用されて `0 > 0` が false となり、delta-spec-validation へ進む

---

### TC-020: code-review approved + toolResult null → 0 fallback → delta-spec-validation

**Category**: unit
**Priority**: should
**Source**: T-04 AC / design.md D5

**GIVEN** code-review step が verdict `"approved"` で完了し、`lastReview.outcome.toolResult === null`
**WHEN** 遷移表の `when` predicate が評価される
**THEN** `toolResult` が null なので fixableCount は `0` 扱い、delta-spec-validation へ進む

---

## Grounded Step — 既存の prose parse path が維持されている

### TC-021: verification step は toolResult を持たず prose parse path を通る

**Category**: unit
**Priority**: must
**Source**: T-01 AC / design.md D1

**GIVEN** verification step（grounded step, `reportTool` なし）
**WHEN** `finalizeStep` が呼ばれる
**THEN** toolResult が存在しないため prose parse（`step.parseResult`）path を通り、verdict を確定する

---

### TC-022: delta-spec-validation step は toolResult を持たず prose parse path を通る

**Category**: unit
**Priority**: should
**Source**: design.md D1

**GIVEN** delta-spec-validation step（grounded step, `reportTool` なし）
**WHEN** `finalizeStep` が呼ばれる
**THEN** toolResult が存在しないため prose parse path を通る（grounded step の挙動は不変）

---

## Adapter Retry — malformed / no-tool-call の区別

### TC-023: malformed JSON（invalid-input）は adapter 内で追撃し、3回目で halt

**Category**: unit
**Priority**: should
**Source**: T-02 AC / design.md D3 / request.md 受け入れ基準 #7

**GIVEN** agent が malformed JSON を返し、adapter が `reason: "invalid-input"` を検出する
**WHEN** adapter が DEFAULT_TOOL_RETRY（2回）を消費する
**THEN** 2回目まではリトライ、3回目で halt する（executor の no-tool-call 変更の影響外）

---

### TC-024: no-tool-call（idle）は adapter が toolResult:null を返し executor が proceed

**Category**: unit
**Priority**: should
**Source**: T-02 AC / design.md D3 / request.md 受け入れ基準 #4 #7

**GIVEN** agent が tool を呼ばず idle 状態で終了し、adapter が `reason: "no-tool-call"`, `toolResult: null` を返す
**WHEN** executor が runResult を受け取る
**THEN** halt せず proceed する（`reason: "invalid-input"` と `reason: "no-tool-call"` は adapter が区別して両ケースの挙動を維持している）

---

## Regression / Golden Cases

### TC-025: R1 golden case — judge approved → verdict "approved"

**Category**: unit
**Priority**: must
**Source**: T-06 AC / T-07 AC / request.md 受け入れ基準 #8

**GIVEN** `tests/unit/contract/golden-cases.test.ts` の既存 golden case（judge が approved を返すケース）
**WHEN** `bun run test` を実行する
**THEN** テストが pass する（regression なし）

---

### TC-026: R1 golden case — 空/壊れた toolResult → 非 approved

**Category**: unit
**Priority**: must
**Source**: T-06 AC / design.md D2 / request.md 受け入れ基準 #5

**GIVEN** `tests/unit/contract/golden-cases.test.ts` の golden case（JSON が空または壊れているケース）
**WHEN** `bun run test` を実行する
**THEN** テストが pass する（verdict が `"approved"` にならないことを確認）

---

### TC-027: bun run typecheck && bun run test が全 green

**Category**: unit
**Priority**: must
**Source**: T-07 AC / request.md 受け入れ基準 #9

**GIVEN** T-01〜T-05 の全変更が適用された状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** exit code が 0（全テスト pass、型エラーなし）

---

## 静的検証 — 削除済みコードパスの確認

### TC-028: types.ts に parseFixableFindings の import が残っていない

**Category**: unit
**Priority**: should
**Source**: T-04 AC / T-07 AC

**GIVEN** T-04 の変更が適用された `src/core/pipeline/types.ts`
**WHEN** `parseFixableFindings` の import 行を検索する
**THEN** `types.ts` 内に `parseFixableFindings` の import が存在しない

---

### TC-029: executor.ts の verdict 確定で parseReviewVerdict を直接呼んでいない

**Category**: unit
**Priority**: should
**Source**: T-07 AC

**GIVEN** T-01 の変更が適用された `src/core/step/executor.ts`
**WHEN** `parseReviewVerdict` の直接呼び出し箇所を検索する
**THEN** `executor.ts` 内の verdict 確定ロジックが `parseReviewVerdict` を直接参照していない（grounded step 用の `step.parseResult` 経由は許容）

---

## Result

```yaml
result: completed
total: 29
automated: 29
manual: 0
must: 20
should: 9
could: 0
blocked_reasons: []
```
