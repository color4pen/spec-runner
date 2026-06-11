# Test Cases: カスタムレビューワーの起動条件を宣言的に指定できるようにする

## Summary

- **Total**: 34 cases
- **Automated** (unit/integration): 34
- **Manual**: 0
- **Priority**: must: 24, should: 10, could: 0

---

## Frontmatter パース

### TC-001: paths と requestTypes をパースする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 起動条件の宣言形式 > Scenario: paths と requestTypes をパースする

---

### TC-002: block sequence 記法をパースする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 起動条件の宣言形式 > Scenario: block sequence 記法をパースする

---

### TC-003: 条件無指定は制約なし

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 起動条件の宣言形式 > Scenario: 条件無指定は制約なし

---

## Validation

### TC-004: 空配列は拒否される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 起動条件の validation > Scenario: 空配列は拒否される

---

### TC-005: scaffold 出力が validation を通る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 起動条件の validation > Scenario: scaffold 出力が validation を通る

---

### TC-006: paths 要素に空文字列を含むと拒否される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** `paths: ["src/**", ""]` を持つ reviewer 定義を用意する
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** 空文字列要素を持つ配列として違反が収集され throw する

---

### TC-007: requestTypes 空配列は拒否される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 / design.md > Risks

**GIVEN** `requestTypes: []` を持つ reviewer 定義を用意する
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** 「present 時は非空配列」違反で throw する

---

## Glob マッチャ

### TC-008: `**` は `/` を跨ぐセグメントにマッチする

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** パターン `"**/*.sql"`、ファイルパス `"db/migrations/001.sql"`
**WHEN** `matchGlob(pattern, filePath)` を呼ぶ
**THEN** `true` を返す

---

### TC-009: `*` は `/` を跨がない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** パターン `"src/*.ts"`、ファイルパス `"src/a/b.ts"`
**WHEN** `matchGlob(pattern, filePath)` を呼ぶ
**THEN** `false` を返す（`*` はディレクトリ境界を越えない）

---

### TC-010: リテラルパターンの一致と不一致

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01

**GIVEN** パターン `"src/index.ts"`、ファイルパス `"src/index.ts"` および `"src/other.ts"`
**WHEN** 各々に `matchGlob` を呼ぶ
**THEN** 前者は `true`、後者は `false` を返す

---

## 起動判定（evaluateActivation）

### TC-011: paths 一致で起動する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI 決定論による起動判定 > Scenario: paths 一致で起動する

---

### TC-012: requestTypes 一致で起動・不一致で skip

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI 決定論による起動判定 > Scenario: requestTypes 一致で起動・不一致で skip

---

### TC-013: AND セマンティクス

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI 決定論による起動判定 > Scenario: AND セマンティクス

---

## 変更ファイル観測 seam

### TC-014: reviewer 実行時点の diff を観測する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 変更ファイルの fresh な観測 > Scenario: reviewer 実行時点の diff を観測する

---

### TC-015: 観測失敗でも pipeline を止めない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 変更ファイルの fresh な観測 > Scenario: 観測失敗でも pipeline を止めない

---

### TC-016: listChangedFiles local — git diff 出力を行配列で返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `spawnFn` が `"src/auth/login.ts\nsrc/auth/utils.ts\n"` を返すスタブを用意し、baseBranch=`"main"` を渡す
**WHEN** `local.listChangedFiles("main", cwd, null)` を呼ぶ
**THEN** `["src/auth/login.ts", "src/auth/utils.ts"]` を返す

---

### TC-017: listChangedFiles local — spawn 失敗で空配列

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `spawnFn` が exit code 128 で失敗するスタブを用意する
**WHEN** `local.listChangedFiles("main", cwd, null)` を呼ぶ
**THEN** throw せず `[]` を返す

---

### TC-018: listChangedFiles managed — 常に空配列

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 / design.md > D4

**GIVEN** managed runtime インスタンス
**WHEN** `managed.listChangedFiles("main", cwd, null)` を呼ぶ
**THEN** `[]` を返す（custom reviewer managed 非対応の fail-safe）

---

## skip 記録（state / journal）

### TC-019: paths 不一致 reviewer が理由付きで journal に記録される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skip を approved と区別して記録する > Scenario: paths 不一致 reviewer が理由付きで journal に記録される

---

### TC-020: skip ≠ approved が state に残る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skip を approved と区別して記録する > Scenario: skip ≠ approved が state に残る

---

### TC-021: skip した reviewer の agent は起動しない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: skip を approved と区別して記録する > Scenario: skip した reviewer の agent は起動しない

---

### TC-022: verdict:skipped + skipReason が persist/load で round-trip する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `verdict: "skipped"`, `skipReason: "paths not matched"` を持つ StepRun を state に push する
**WHEN** state を persist し、fold で journal から復元する
**THEN** `verdict` / `skipReason` が保持されて一致する

---

## Executor ゲート

### TC-023: activation 未設定 step でゲートが評価されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `activation` を持たない step（組み込み step または条件無指定 reviewer）と spawnFn スタブ
**WHEN** `runAgentStep` を実行する
**THEN** `evaluateActivation` も `listChangedFiles` も呼ばれず、現行の agent 実行経路をそのまま通る

---

### TC-024: 一致 reviewer で従来どおり agent が起動する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-07

**GIVEN** `activation: { paths: ["src/auth/**"] }` を持つ step と、`listChangedFiles` が `["src/auth/login.ts"]` を返すスタブ
**WHEN** `runAgentStep` を実行する
**THEN** ゲートが `activated: true` を返し、agent runner が呼ばれる

---

## Skip transition

### TC-025: skip は次の reviewer へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: skip の transition は次へ進む > Scenario: skip は次の reviewer へ進む

---

### TC-026: 末尾 reviewer の skip は conformance へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: skip の transition は次へ進む > Scenario: 末尾 reviewer の skip は conformance へ進む

---

### TC-027: skipped transition が code-fixer を to に持たない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `buildReviewerChainTransitions(["code-review", "A", "B"])` が返す transition 行全体
**WHEN** `on: "skipped"` の行を抽出する
**THEN** すべての `to` が `"code-fixer"` 以外である

---

## 無条件 reviewer / reviewers 不存在

### TC-028: 条件無指定 reviewer は常時起動する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 無条件 reviewer / reviewers 不存在の完全一致 > Scenario: 条件無指定 reviewer は常時起動する

---

### TC-029: reviewers/ 不存在で既存挙動と一致

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 無条件 reviewer / reviewers 不存在の完全一致 > Scenario: reviewers/ 不存在で既存挙動と一致

---

## Step factory

### TC-030: paths/requestTypes を持つ snapshot → activation が設定される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** `paths: ["src/auth/**"]` / `requestTypes: ["new-feature"]` を持つ `ReviewerSnapshot`
**WHEN** `createCustomReviewerStep(snapshot)` を呼ぶ
**THEN** 生成 step の `activation.paths` と `activation.requestTypes` がそれぞれ snapshot の値と一致する

---

### TC-031: 両方不在の snapshot → activation が undefined

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** `paths` も `requestTypes` も持たない `ReviewerSnapshot`
**WHEN** `createCustomReviewerStep(snapshot)` を呼ぶ
**THEN** 生成 step の `activation` が `undefined`（executor ゲートを通らない）

---

## Scaffold コマンド

### TC-032: scaffold が雛形を生成する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewers new scaffold コマンド > Scenario: scaffold が雛形を生成する

---

### TC-033: 不正な name を拒否する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewers new scaffold コマンド > Scenario: 不正な name を拒否する

---

### TC-034: 既存ファイルとの衝突を拒否する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: reviewers new scaffold コマンド > Scenario: 既存ファイルとの衝突を拒否する

---

## Result

```yaml
result: completed
total: 34
automated: 34
manual: 0
must: 24
should: 10
could: 0
blocked_reasons: []
```
