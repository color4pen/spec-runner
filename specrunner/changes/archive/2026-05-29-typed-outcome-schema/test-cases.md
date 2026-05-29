# Test Cases: typed-outcome-schema

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

- **Total**: 28 cases
- **Automated** (unit/integration): 21
- **Manual**: 7
- **Priority**: must: 25, should: 3, could: 0

---

## parseProducerReportInput

### TC-001: parseProducerReportInput — status "success" がセットされる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseProducerReportInput` が import されている
**WHEN** `{ ok: true, status: "success" }` を渡す
**THEN** `{ ok: true, value: { ok: true, status: "success" } }` が返る（status が "success" で非 undefined）

---

### TC-002: parseProducerReportInput — status "error" がセットされる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseProducerReportInput` が import されている
**WHEN** `{ ok: true, status: "error" }` を渡す
**THEN** `{ ok: true, value: { ok: true, status: "error" } }` が返る（status が "error" で非 undefined）

---

### TC-003: parseProducerReportInput — status なしでも base は正常 parse される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06; design.md D2

**GIVEN** `parseProducerReportInput` が import されている
**WHEN** `{ ok: true }` を渡す（status フィールドなし）
**THEN** `{ ok: true, value: { ok: true } }` が返り、value.status は undefined である（missingFields に含まれない）

---

### TC-004: parseProducerReportInput — 不正な status 値は無視される

**Category**: unit
**Priority**: should
**Source**: tasks.md T-06; design.md D2

**GIVEN** `parseProducerReportInput` が import されている
**WHEN** `{ ok: true, status: "invalid" }` を渡す
**THEN** parse が成功し、value.status は undefined である（不正値で missingFields に追加されない）

---

### TC-005: parseProducerReportInput — ok 欠如で missingFields が返る

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseProducerReportInput` が import されている
**WHEN** `{}` を渡す（ok フィールドなし）
**THEN** `{ ok: false, missingFields: ["ok"] }` が返る（既存挙動維持）

---

## parseJudgeReportInput

### TC-006: parseJudgeReportInput — approved: true がセットされる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseJudgeReportInput` が import されている
**WHEN** `{ ok: true, approved: true }` を渡す
**THEN** value に `approved: true` が含まれる（非 undefined）

---

### TC-007: parseJudgeReportInput — approved: false がセットされる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseJudgeReportInput` が import されている
**WHEN** `{ ok: true, approved: false }` を渡す
**THEN** value に `approved: false` が含まれる（false は有効値として保持される）

---

### TC-008: parseJudgeReportInput — approved なしでも base は正常 parse される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06; design.md D2

**GIVEN** `parseJudgeReportInput` が import されている
**WHEN** `{ ok: true }` を渡す（approved フィールドなし）
**THEN** `{ ok: true, value: { ok: true } }` が返り、value.approved は undefined である

---

### TC-009: parseJudgeReportInput — ok 欠如で missingFields が返る

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseJudgeReportInput` が import されている
**WHEN** `{}` を渡す
**THEN** `{ ok: false, missingFields: ["ok"] }` が返る

---

## parseCodeReviewReportInput

### TC-010: parseCodeReviewReportInput — 全新フィールドがセットされる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseCodeReviewReportInput` が import されている
**WHEN** `{ ok: true, approved: true, fixableCount: 3 }` を渡す
**THEN** value に `approved: true`、`fixableCount: 3` が含まれる（両フィールドが非 undefined）

---

### TC-011: parseCodeReviewReportInput — fixableCount: 0 は有効値として保持される

**Category**: unit
**Priority**: should
**Source**: tasks.md T-06; design.md D2

**GIVEN** `parseCodeReviewReportInput` が import されている
**WHEN** `{ ok: true, approved: false, fixableCount: 0 }` を渡す
**THEN** value に `fixableCount: 0` が含まれる（0 は falsy だが有効値として保持）

---

### TC-012: parseCodeReviewReportInput — 新フィールドなしで base のみ parse 成功

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06; design.md D2

**GIVEN** `parseCodeReviewReportInput` が import されている
**WHEN** `{ ok: true }` を渡す
**THEN** `{ ok: true, value: { ok: true } }` が返り、value.approved と value.fixableCount は両方 undefined

---

### TC-013: parseCodeReviewReportInput — ok 欠如で missingFields が返る

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01, T-06

**GIVEN** `parseCodeReviewReportInput` が import されている
**WHEN** `{}` を渡す
**THEN** `{ ok: false, missingFields: ["ok"] }` が返る

---

## ReportToolSpec 定義

### TC-014: PRODUCER_REPORT_TOOL の zodSchema に status フィールドが optional で含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02; design.md D3

**GIVEN** `PRODUCER_REPORT_TOOL` が import されている
**WHEN** `PRODUCER_REPORT_TOOL.zodSchema` を参照する
**THEN** `status` キーが存在し、optional（`"success" | "error"` の union）であること

---

### TC-015: JUDGE_REPORT_TOOL の zodSchema に approved フィールドが optional で含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02; design.md D3

**GIVEN** `JUDGE_REPORT_TOOL` が import されている
**WHEN** `JUDGE_REPORT_TOOL.zodSchema` を参照する
**THEN** `approved` キーが存在し、optional（boolean）であること

---

### TC-016: CODE_REVIEW_REPORT_TOOL の zodSchema に approved + fixableCount が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02; design.md D3

**GIVEN** `CODE_REVIEW_REPORT_TOOL` が import されている
**WHEN** `CODE_REVIEW_REPORT_TOOL.zodSchema` を参照する
**THEN** `approved`（optional boolean）と `fixableCount`（optional number）の両フィールドが存在すること

---

### TC-017: toCustomToolSpec が新フィールドを含む JSON Schema を生成する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02; design.md D3

**GIVEN** `toCustomToolSpec` が import されている
**WHEN** `toCustomToolSpec(PRODUCER_REPORT_TOOL)` を呼ぶ
**THEN** 返却された `CustomToolSpec.input_schema.properties` に `status` フィールドが含まれること

---

### TC-018: 既存の REPORT_TOOL / REPORT_TOOL_CUSTOM_TOOL_SPEC が引き続き export されている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02; design.md D3, D5; request.md 要件1

**GIVEN** `report-tool.ts` を import する
**WHEN** `REPORT_TOOL` および `REPORT_TOOL_CUSTOM_TOOL_SPEC` を参照する
**THEN** 両シンボルが存在し、既存コードと互換の型・値を持つ（後方互換維持）

---

## Adapter 経由の presence テスト（integration）

### TC-019: adapter — producer step の toolResult に status が到達する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-07; design.md D6

**GIVEN** claude-code adapter が PRODUCER_REPORT_TOOL を使う producer step で動作している
**WHEN** mock tool call で `{ ok: true, status: "success" }` を report_result として返す
**THEN** `runResult.toolResult` を `Record<string, unknown>` にキャストしたとき `status === "success"` であること

---

### TC-020: adapter — judge step の toolResult に approved が到達する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-07; design.md D6

**GIVEN** claude-code adapter が JUDGE_REPORT_TOOL を使う spec-review step で動作している
**WHEN** mock tool call で `{ ok: true, approved: true }` を report_result として返す
**THEN** `runResult.toolResult` を `Record<string, unknown>` にキャストしたとき `approved === true` であること

---

### TC-021: adapter — code-review step の toolResult に approved + fixableCount が到達する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-07; design.md D6

**GIVEN** claude-code adapter が CODE_REVIEW_REPORT_TOOL を使う code-review step で動作している
**WHEN** mock tool call で `{ ok: true, approved: true, fixableCount: 2 }` を report_result として返す
**THEN** `runResult.toolResult` を `Record<string, unknown>` にキャストしたとき `approved === true` かつ `fixableCount === 2` であること

---

## Step 定義の切り替え確認（manual）

### TC-022: 8 つの producer step が PRODUCER_REPORT_TOOL / toCustomToolSpec を使っている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03; design.md D4

**GIVEN** design.ts / implementer.ts / spec-fixer.ts / delta-spec-fixer.ts / code-fixer.ts / build-fixer.ts / test-case-gen.ts / adr-gen.ts を確認する
**WHEN** 各ファイルの import と AgentDefinition を確認する
**THEN** 8 ファイル全てで `PRODUCER_REPORT_TOOL` と `toCustomToolSpec` を参照しており、`REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` への直接参照が残っていないこと

---

### TC-023: spec-review が JUDGE_REPORT_TOOL / toCustomToolSpec を使っている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-04; design.md D4

**GIVEN** spec-review.ts を確認する
**WHEN** import と AgentDefinition を確認する
**THEN** `JUDGE_REPORT_TOOL` と `toCustomToolSpec` を参照しており、`REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` への直接参照が残っていないこと

---

### TC-024: code-review が CODE_REVIEW_REPORT_TOOL / toCustomToolSpec を使っている

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05; design.md D4

**GIVEN** code-review.ts を確認する
**WHEN** import と AgentDefinition を確認する
**THEN** `CODE_REVIEW_REPORT_TOOL` と `toCustomToolSpec` を参照しており、`REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` への直接参照が残っていないこと

---

## 振る舞い不変の確認（manual）

### TC-025: executor.ts に差分がない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-08; design.md D5; request.md 要件3

**GIVEN** ブランチの diff を確認する
**WHEN** `git diff main -- src/core/step/executor.ts` を実行する
**THEN** 出力が空である（executor.ts に一切変更が加わっていない）

---

### TC-026: pipeline/types.ts に差分がない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-08; design.md D5; request.md 要件3

**GIVEN** ブランチの diff を確認する
**WHEN** `git diff main -- src/core/pipeline/types.ts` を実行する
**THEN** 出力が空である（transition table に一切変更が加わっていない）

---

### TC-027: bun run typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03, T-04, T-05, T-08; request.md 受け入れ基準

**GIVEN** 全タスクの実装が完了している
**WHEN** `bun run typecheck` を実行する
**THEN** エラーなく終了する

---

### TC-028: bun run test が green（既存テストを含む）

**Category**: manual
**Priority**: must
**Source**: tasks.md T-08; request.md 受け入れ基準

**GIVEN** 全タスクの実装が完了している
**WHEN** `bun run test` を実行する
**THEN** 全テストが pass する（新規テスト + 既存テスト、いずれも failure なし）

---

## Result

```yaml
result: completed
total: 28
automated: 21
manual: 7
must: 25
should: 3
could: 0
blocked_reasons: []
```
