# Test Cases: post-work の決定論的 self-check を outputContract（detect→repair）へ移す

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
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
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration): 31
- **Manual**: 0
- **Priority**: must: 25, should: 6, could: 0

---

## 汎用 content-format kind（純関数・基本動作）

### TC-001: 全 check が match すれば violation 0 件

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 汎用 content 形式検査契約 kind を追加する > Scenario: 全 check が match すれば violation 0 件

---

### TC-002: match しない check があれば失敗ラベルを列挙する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 汎用 content 形式検査契約 kind を追加する > Scenario: match しない check があれば失敗ラベルを列挙する

---

### TC-003: HTML コメント内の例文では合格しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 汎用 content 形式検査契約 kind を追加する > Scenario: HTML コメント内の例文では合格しない

---

### TC-004: local runtime が worktree 上の違反 content を検証する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: content-format 検出は local / managed 両 runtime で決定論的に動作する > Scenario: local runtime が worktree 上の content を検証する

---

### TC-005: managed runtime が branch git state 上の違反 content を local と同一判定で検証する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: content-format 検出は local / managed 両 runtime で決定論的に動作する > Scenario: managed runtime が branch git state 上の content を検証する

---

### TC-006: spec.md 形式が正しければ検査由来の追撃は発火しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: design の spec 形式検査を spec 必須 type 限定の follow-up 契約へ移す > Scenario: spec.md 形式が正しければ検査由来の追撃は発火しない

---

### TC-007: spec.md 形式に違反があれば同一 session の repair が発火する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: design の spec 形式検査を spec 必須 type 限定の follow-up 契約へ移す > Scenario: spec.md 形式に違反があれば同一 session の repair が発火する

---

### TC-008: spec-exempt type では形式契約を宣言しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: design の spec 形式検査を spec 必須 type 限定の follow-up 契約へ移す > Scenario: spec-exempt type では形式契約を宣言しない

---

### TC-009: テーブル形式が正しければ検査由来の追撃は発火しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: code-review のテーブル形式検査を follow-up 契約へ移す > Scenario: テーブル形式が正しければ検査由来の追撃は発火しない

---

### TC-010: テーブル形式違反があれば同一 session の repair が発火する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: code-review のテーブル形式検査を follow-up 契約へ移す > Scenario: テーブル形式違反があれば同一 session の repair が発火する

---

### TC-011: 違反は修復されて step は前進する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 形式違反は従来どおり修復され、通常経路の観測挙動は不変である > Scenario: 違反は修復されて step は前進する

---

### TC-012: 予算枯渇後も残る形式違反は commit 前に halt する

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 形式違反は従来どおり修復され、通常経路の観測挙動は不変である > Scenario: 予算枯渇後も残る形式違反は commit 前に halt する

---

## OutputContract port 型定義（T-01）

### TC-013: OutputContractKind に "content-format" が追加され ContentFormatCheck が export される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/port/output-contract.ts` を参照する
**WHEN** `OutputContractKind` 型と `ContentFormatCheck` interface と `OutputContract.checks` フィールドを検査する
**THEN** `OutputContractKind` が `"produced" | "tasks-complete" | "content-format"` であり、`ContentFormatCheck` が `label: string`・`pattern: string`・`flags?: string` で export され、`OutputContract.checks` が `ContentFormatCheck[] | undefined` 型を持つ

---

## 検査純関数・repair 文言（T-02）

### TC-014: stripHtmlComments が単一・複数行コメントを除去しコメント外テキストを保持する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** 単一行 HTML コメント（`<!-- foo -->`）・複数行 HTML コメント・コメントと通常テキストが混在する文字列を用意する
**WHEN** `stripHtmlComments` を適用する
**THEN** HTML コメント部分が除去され、コメント外のテキストがそのまま残る

---

### TC-015: evaluateContentFormatChecks が null content で全 label を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** checks に複数の check を宣言し、content に `null` を渡す
**WHEN** `evaluateContentFormatChecks(null, checks)` を呼ぶ
**THEN** 返却値が全 check の label 配列である

---

### TC-016: buildOutputFollowUpPrompt が content-format の path と失敗 label を repair prompt に含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `kind: "content-format"`・`path: "foo/spec.md"`・`detail: ["label-A", "label-B"]` の violation を渡す
**WHEN** `buildOutputFollowUpPrompt` を呼ぶ
**THEN** 返却プロンプトに対象 path（`foo/spec.md`）と失敗 label（`label-A`、`label-B`）が含まれる

---

### TC-017: content-format repair 文言が report_result を含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `kind: "content-format"` の violation を渡す
**WHEN** `buildOutputFollowUpPrompt` を呼ぶ
**THEN** 返却プロンプトに `report_result` が含まれない（越境不変）

---

### TC-018: 既存 tasks-complete / produced の output-verify 分岐が無変更

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `kind: "tasks-complete"` または `kind: "produced"` の violation を渡す
**WHEN** `buildOutputFollowUpPrompt` を呼ぶ
**THEN** 返却値が content-format 追加前と同一の文言になる（既存テストが無改変で green）

---

## local runtime 検出（T-03）

### TC-019: local runtime で valid ファイルに対し violation 0 件

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** worktree 上のファイルが宣言された全 checks の正規表現に match する
**WHEN** local runtime の `validateStepOutputs` が content-format 契約を検証する
**THEN** violation が 0 件で返る

---

### TC-020: local runtime で対象ファイルが欠落時に violation を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** worktree 上に contract.path が存在しない
**WHEN** local runtime の `validateStepOutputs` が content-format 契約を検証する
**THEN** throw せず、violation を 1 件返す

---

## managed runtime 検出（T-04）

### TC-021: managed runtime で valid ファイルに対し violation 0 件

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `getRawFile` mock が全 checks に match する content を返す
**WHEN** managed runtime の `validateStepOutputs` が content-format 契約を検証する
**THEN** violation が 0 件で返り、managed 側に正規表現が置かれていない

---

### TC-022: managed runtime で getRawFile が null を返す時に violation を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `getRawFile` mock が `null` を返す（ファイル欠落扱い）
**WHEN** managed runtime の `validateStepOutputs` が content-format 契約を検証する
**THEN** throw せず、violation を 1 件返す

---

### TC-023: managed runtime で branch が null の時に violation を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** managed runtime の branch が `null`（未設定）
**WHEN** managed runtime の `validateStepOutputs` が content-format 契約を処理する
**THEN** 既存分岐と同様に violation として扱われる

---

## design step 移設（T-05）

### TC-024: DesignStep.followUpPrompt が undefined である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `DesignStep` インスタンスを参照する
**WHEN** `followUpPrompt` プロパティを検査する
**THEN** `followUpPrompt` が `undefined` であり、移設した Requirement / Scenario / SHALL 形式検査の記述が含まれない

---

### TC-025: spec 必須 type で design outputContracts が spec.md の content-format 契約を 1 件返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** request.type が new-feature / spec-change / refactoring / bug-fix のいずれか（`isSpecRequired` = true）
**WHEN** `DesignStep.outputContracts(state, deps)` を呼ぶ
**THEN** 返却配列に `kind: "content-format"`・`policy: "follow-up"`・`path: "*/spec.md"` を持つ契約が 1 件含まれ、checks に `### Requirement:` / `#### Scenario:` / normative keyword の 3 件が宣言されている

---

## code-review step 移設（T-06）

### TC-026: 空テーブル（approved、本体行なし）の review-feedback で violation 0 件

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** review-feedback がヘッダー行と区切り行のみを持つ空テーブル（finding なし）である
**WHEN** local runtime の `validateStepOutputs` が code-review の content-format 契約を検証する
**THEN** violation が 0 件で返り、approved ケースで false positive が発生しない

---

### TC-027: code-review followUpPrompt に移設した決定論的形式検査の記述が無い

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `CodeReviewStep` インスタンスの `followUpPrompt` を取得する
**WHEN** テーブル形式指示（区切り行・ヘッダー行の要求）と 7 カラム列挙の記述を検索する
**THEN** それらの記述が `followUpPrompt` に含まれない

---

### TC-028: code-review followUpPrompt が Fix 値・severity 残余と Read/修正指示を保持し report_result を含まない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `CodeReviewStep` インスタンスの `followUpPrompt` を取得する
**WHEN** 残余項目の存在と report_result の非存在を検査する
**THEN** Fix カラム値（yes/no）・severity 定義整合の指示と review-feedback の Read tool 参照・修正指示が含まれ、`report_result` は含まれない

---

## 出力ゲート halt メッセージ（T-07）

### TC-029: halt メッセージに content-format 違反の path と失敗 label が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `kind: "content-format"`・`path: "foo/spec.md"`・`detail: ["label-X"]` の violation を持つ halt を組み立てる
**WHEN** `makeOutputGateHalt` を呼ぶ
**THEN** エラーメッセージに `foo/spec.md` と `label-X` が含まれる

---

### TC-030: 既存 tasks-complete / produced の halt メッセージは無変更

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `kind: "tasks-complete"` または `kind: "produced"` の violation を持つ halt を組み立てる
**WHEN** `makeOutputGateHalt` を呼ぶ
**THEN** エラーメッセージが content-format 追加前と同一の形式になる（既存テストが無改変で green）

---

## 観測挙動保存・全体検証（T-08 / T-09）

### TC-031: 既存 pipeline / executor の観測挙動が移設起因の変更以外で不変

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** 形式検査移設前の既存 pipeline / executor / agent-runner テストスイートを実行する
**WHEN** `bun run test` を走らせる
**THEN** 形式検査の移設で期待が変わる箇所以外の既存テストが全て無改変で green となり、verdict 導出・pipeline 遷移の観測挙動が不変である

---

## Result

```yaml
result: completed
total: 31
automated: 31
manual: 0
must: 25
should: 6
could: 0
blocked_reasons: []
```
