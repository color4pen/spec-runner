# Test Cases: remove-prose-parse-invariants

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

- **Total**: 19 cases
- **Automated** (unit/integration): 19
- **Manual**: 0
- **Priority**: must: 15, should: 4, could: 0

---

## T-01: review-verdict.ts 削除 / parseResult no-op 化

### TC-001: review-verdict.ts ファイルの削除確認

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, design.md D1

**GIVEN** T-01 の実装が完了している
**WHEN** `src/core/parser/review-verdict.ts` の存在を fs でチェックする
**THEN** ファイルが存在しない（`fs.existsSync` が false を返す）

---

### TC-002: spec-review.ts の parseResult が no-op を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, design.md D1

**GIVEN** `src/core/step/spec-review.ts` の `parseResult` が no-op 実装に置換されている
**WHEN** 任意の content 文字列を引数として `parseResult(content)` を呼び出す
**THEN** `{ verdict: null, findingsPath: null, fileContent: content }` が返る

---

### TC-003: code-review.ts の parseResult が no-op を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, design.md D1

**GIVEN** `src/core/step/code-review.ts` の `parseResult` が no-op 実装に置換されている
**WHEN** 任意の content 文字列を引数として `parseResult(content)` を呼び出す
**THEN** `{ verdict: null, findingsPath: null, fileContent: content }` が返る

---

### TC-004: spec-review / code-review に parseReviewVerdict 依存が残っていない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** T-01 の実装が完了している
**WHEN** `src/core/step/spec-review.ts` と `src/core/step/code-review.ts` の内容を grep で検索する
**THEN** `parseReviewVerdict` および `review-verdict` の文字列が 1 件も存在しない

---

## T-02: review-findings.ts の関数削除（interface 維持）

### TC-005: parseFixableFindings 関数の削除確認

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02, design.md D2

**GIVEN** T-02 の実装が完了している
**WHEN** `src/core/parser/review-findings.ts` の内容を grep で検索する
**THEN** `parseFixableFindings` 関数定義が存在しない

---

### TC-006: parseFindingSeverityCounts 関数の削除確認

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02, design.md D2

**GIVEN** T-02 の実装が完了している
**WHEN** `src/core/parser/review-findings.ts` の内容を grep で検索する
**THEN** `parseFindingSeverityCounts` 関数定義が存在しない

---

### TC-007: FindingSeverityCounts interface の維持確認

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02, design.md D2

**GIVEN** T-02 の実装が完了している
**WHEN** `src/core/parser/review-findings.ts` の内容を確認する
**THEN** `FindingSeverityCounts` interface の定義が存在する（`types.ts` の `ParsedStepResult.scores` 参照が壊れない）

---

## T-03: dead テストの削除

### TC-008: 4 つの dead テストファイルが削除されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03, design.md D5

**GIVEN** T-03 の実装が完了している
**WHEN** 以下 4 ファイルの存在を fs でチェックする
- `tests/unit/parser/review-verdict.test.ts`
- `tests/unit/parser/review-findings.test.ts`
- `tests/spec-review-verdict.test.ts`
- `tests/unit/step/code-review-verdict.test.ts`
**THEN** 4 ファイルすべてが存在しない

---

## T-04: golden 床の typed 移行

### TC-009: GC-TYPED-01 — approved=true → verdict "approved"

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04, design.md D3

**GIVEN** `golden-cases.test.ts` に GC-TYPED-01 が追加されている
**WHEN** `toolResult.approved = true` を持つ judge step に対して `StepExecutor.finalizeStep` を実行する
**THEN** `pushStepResult` で記録された verdict が `"approved"` である

---

### TC-010: GC-TYPED-02 — approved=false ∧ fixableCount=0 の矛盾を needs-fix に倒す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04, design.md D3, contract/golden-cases.md

**GIVEN** `golden-cases.test.ts` に GC-TYPED-02 が追加されている
**WHEN** `toolResult.approved = false` かつ `toolResult.fixableCount = 0` を持つ judge step に対して `StepExecutor.finalizeStep` を実行する
**THEN** `pushStepResult` で記録された verdict が `"needs-fix"` である（矛盾入力が approved に化けない）

---

### TC-011: GC-TYPED-03 — null toolResult → verdict "needs-fix"

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04, design.md D3, contract/golden-cases.md

**GIVEN** `golden-cases.test.ts` に GC-TYPED-03 が追加されている
**WHEN** `toolResult = null`（JSON が取れなかった judge step）に対して `StepExecutor.finalizeStep` を実行する
**THEN** `pushStepResult` で記録された verdict が `"needs-fix"` である（safe default; 空・壊れた結果が approved にならない）

---

### TC-012: prose golden 参照が golden-cases.test.ts から除去されている

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** T-04 の実装が完了している
**WHEN** `tests/unit/contract/golden-cases.test.ts` の内容を grep で検索する
**THEN** `parseFixableFindings` import、T-02 セクションの describe ブロック、`TC-018` / `TC-021` のコメント参照がすべて存在しない

---

## T-05: arch test 新設（INV-1〜3）

### TC-013: INV-1 — transition when 述語が fileContent を参照しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05, contract/invariants.md INV-1

**GIVEN** `tests/unit/contract/invariants.test.ts` が新設されており、INV-1 テストが実装されている
**WHEN** `src/core/pipeline/types.ts`（または STANDARD_TRANSITIONS 定義箇所）の `when` 関数群のソースコードを静的に検索する
**THEN** `fileContent` の文字列が 1 件も含まれない（routing が typed フィールドのみを参照していることを確認）

---

### TC-014: INV-2 — review-verdict.ts 不在 + src/core に parseReviewVerdict が存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05, contract/invariants.md INV-2

**GIVEN** T-01 が完了し、`tests/unit/contract/invariants.test.ts` に INV-2 テストが実装されている
**WHEN** INV-2 テストを実行する（`fs.existsSync` + grep）
**THEN** `src/core/parser/review-verdict.ts` が存在せず、`src/core/` 配下に `parseReviewVerdict` 文字列が存在しない → テスト green

---

### TC-015: INV-3 — 全 agent step が reportTool を持つ

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05, contract/invariants.md INV-3, design.md D4

**GIVEN** `tests/unit/contract/invariants.test.ts` に INV-3 テストが実装されている
**WHEN** `src/core/step/` 配下の全 agent step 定義を静的に検索し `reportTool` フィールドの有無を検証する
**THEN** 全 agent step に `reportTool` が定義されている → テスト green（prose parse への fall-through 経路がない）

---

### TC-016: INV-1 regression guard — when 述語に fileContent を追加するとテストが fail する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05, contract/invariants.md INV-1

**GIVEN** `invariants.test.ts` の INV-1 テストが実装されている
**WHEN** transition の `when` 述語に `fileContent` を参照するコードを追加した状態でテストを実行する
**THEN** INV-1 テストが fail する（arch test が回帰を検知できる）

---

### TC-017: INV-2 regression guard — parseReviewVerdict を src/core に戻すとテストが fail する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05, contract/invariants.md INV-2

**GIVEN** `invariants.test.ts` の INV-2 テストが実装されている
**WHEN** `parseReviewVerdict` 関数を `src/core/` 配下のいずれかのファイルに追加した状態でテストを実行する
**THEN** INV-2 テストが fail する（prose パーサの再導入を arch test が阻止できる）

---

## T-06: 最終検証

### TC-018: typecheck + test 全 green

**Category**: integration
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** T-01〜T-05 の実装がすべて完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** typecheck エラーゼロ、テストスイート全 green（既存テストが壊れていない）

---

### TC-019: executor typed path が parseResult no-op に影響されない

**Category**: unit
**Priority**: should
**Source**: design.md D1, request.md 振る舞い不変

**GIVEN** spec-review / code-review の `parseResult` が no-op に置換されている
**WHEN** executor が `reportTool` を持つ agent step の verdict を `toolResult.approved` から導出する
**THEN** verdict 導出結果が R3 以前と同一（`parseResult` が呼ばれないため no-op 化による行動変化はゼロ）

---

## Result

```yaml
result: completed
total: 19
automated: 19
manual: 0
must: 15
should: 4
could: 0
blocked_reasons: []
```
