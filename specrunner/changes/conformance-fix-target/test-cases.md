# Test Cases: conformance needs-fix の戻り先 step 導出

## Summary

- **Total**: 38 cases
- **Automated** (unit/integration): 37
- **Manual**: 1
- **Priority**: must: 21, should: 16, could: 1

---

## fixTarget 型・parse・schema

### TC-001: conformance report tool が fixTarget を受理する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: conformance findings に戻り先分類 fixTarget を付与する > Scenario: conformance report tool が fixTarget を受理する

---

### TC-002: fixTarget 省略は implementer 扱い

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: conformance findings に戻り先分類 fixTarget を付与する > Scenario: fixTarget 省略は implementer 扱い

---

### TC-003: 他 judge step は fixTarget を広告しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: conformance findings に戻り先分類 fixTarget を付与する > Scenario: 他 judge step は fixTarget を広告しない

---

### TC-004: 不正な fixTarget 値は無視される

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** conformance agent が `fixTarget: "unknown-value"` を含む finding を report する
**WHEN** CLI が `parseFindings` で parse する
**THEN** `fixTarget` は `undefined` となり、missingFields にも追加されない

---

### TC-005: ConformanceStep.reportTool は CONFORMANCE_REPORT_TOOL

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** `ConformanceStep` インスタンスを生成する
**WHEN** `reportTool` プロパティを参照する
**THEN** 値は `CONFORMANCE_REPORT_TOOL` と同一（`===` identity）である

---

### TC-006: CONFORMANCE_REPORT_TOOL の findings schema に fixTarget が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** `CONFORMANCE_REPORT_TOOL` の findings 要素 JSON schema を取得する
**WHEN** スキーマの properties を検査する
**THEN** `fixTarget` フィールドが存在し、値は `"implementer" | "code-fixer" | "spec-fixer"` のいずれかのみ許容する optional フィールドである

---

### TC-007: CONFORMANCE_SYSTEM_PROMPT に fixTarget 指示が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md T-04

**GIVEN** `CONFORMANCE_SYSTEM_PROMPT`（または `CONFORMANCE_BASE`）文字列を取得する
**WHEN** 内容を検査する
**THEN** `fixTarget`、`spec-fixer`、`implementer`、`code-fixer` の各語が含まれる

---

## verdict 導出（deriveConformanceVerdict）

### TC-008: 単一 fixTarget の戻り先導出

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が fixTarget から戻り先を集約導出する > Scenario: 単一 fixTarget の戻り先導出

---

### TC-009: 複数 fixTarget 混在時の優先則

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が fixTarget から戻り先を集約導出する > Scenario: 複数 fixTarget 混在時の優先則

---

### TC-010: fixTarget 全省略は needs-fix:implementer

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が fixTarget から戻り先を集約導出する > Scenario: fixTarget 全省略は needs-fix:implementer

---

### TC-011: approved / escalation は据え置き

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CLI が fixTarget から戻り先を集約導出する > Scenario: approved / escalation は据え置き

---

### TC-012: ok=false および decision-needed 1 件で escalation

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** `deriveConformanceVerdict` に `ok: false` の入力を渡す（findings あり/なし両方）
**WHEN** 関数を呼び出す
**THEN** verdict は `"escalation"` を返す。また `ok: true` かつ `decision-needed` 1 件以上の場合も同様に `"escalation"` を返す

---

### TC-013: conformance findings の非実在参照は escalation へフォールバック

**Category**: unit
**Priority**: should
**Source**: tasks.md T-06

**GIVEN** conformance の toolResult に、実在しないファイル参照を持つ finding が含まれる
**WHEN** executor が verdict 導出を行う
**THEN** verdict は `"escalation"` となり（`verifyFindingRefs` が従来どおり発火する）、`needs-fix:*` にはならない

---

### TC-014: executor が conformance toolResult から deriveConformanceVerdict を呼ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** executor が `stepReportTool === CONFORMANCE_REPORT_TOOL` の step を処理している
**WHEN** toolResult に high severity finding（`fixTarget: "code-fixer"`）が含まれる report が到着する
**THEN** executor が `deriveConformanceVerdict` を呼び、verdict として `"needs-fix:code-fixer"` を導出する（`deriveJudgeVerdict` 経由ではない）

---

## 遷移表

### TC-015: 3 方向の戻り先遷移

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 戻り先別の遷移を定義する > Scenario: 3 方向の戻り先遷移

---

### TC-016: 旧 plain needs-fix は implementer へ（後方互換）

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 戻り先別の遷移を定義する > Scenario: 旧 plain needs-fix は implementer へ

---

### TC-017: 戻り先 step の後続は既存遷移が引き受ける

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: 戻り先別の遷移を定義する > Scenario: 戻り先 step の後続は既存遷移が引き受ける

---

### TC-018: STANDARD_TRANSITIONS に 3 エントリと旧 needs-fix 行が存在する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-07

**GIVEN** `STANDARD_TRANSITIONS` 配列を取得する
**WHEN** `CONFORMANCE` step の遷移エントリを抽出する
**THEN** `needs-fix:spec-fixer → SPEC_FIXER`、`needs-fix:implementer → IMPLEMENTER`、`needs-fix:code-fixer → CODE_FIXER`、`needs-fix → IMPLEMENTER`（後方互換）の 4 行がすべて存在する

---

## conformance findings 注入（getConformanceFixContext）

### TC-019: conformance 起点入場で conformance findings を注入する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 戻り先 step に conformance findings を注入する > Scenario: conformance 起点入場で conformance findings を注入する

---

### TC-020: reviewer 起点入場では conformance findings を注入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 戻り先 step に conformance findings を注入する > Scenario: reviewer 起点入場では conformance findings を注入しない

---

### TC-021: 通常の最初の実装では注入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 戻り先 step に conformance findings を注入する > Scenario: 通常の最初の実装では注入しない

---

### TC-022: conformance 未実行で getConformanceFixContext が null

**Category**: unit
**Priority**: should
**Source**: tasks.md T-09

**GIVEN** state に conformance の StepRun が一件も存在しない
**WHEN** `getConformanceFixContext(state, "code-fixer")` を呼ぶ
**THEN** `null` を返す

---

### TC-023: verdict が plain needs-fix で getConformanceFixContext が null

**Category**: unit
**Priority**: should
**Source**: tasks.md T-09

**GIVEN** 最新 conformance run の verdict が `"needs-fix"`（`needs-fix:` 接頭を持たない旧形式）
**WHEN** `getConformanceFixContext(state, "code-fixer")` を呼ぶ
**THEN** `null` を返す

---

### TC-024: target 不一致で getConformanceFixContext が null

**Category**: unit
**Priority**: should
**Source**: tasks.md T-09

**GIVEN** 最新 conformance run の verdict が `"needs-fix:spec-fixer"`
**WHEN** `getConformanceFixContext(state, "code-fixer")` を呼ぶ（target 不一致）
**THEN** `null` を返す

---

## 戻り先 step への注入配線（buildMessage / reads）

### TC-025: conformance→spec-fixer 初期メッセージに conformance findings が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md T-10

**GIVEN** 最新 conformance run の verdict が `"needs-fix:spec-fixer"` で、conformance が spec-review より新しく完了している state
**WHEN** `SpecFixerStep.buildMessage(state, ...)` を呼ぶ
**THEN** メッセージに「Conformance non-conformities」ブロックが含まれ、conformance findings が埋め込まれている

---

### TC-026: conformance→implementer 初期メッセージに conformance findings が含まれる

**Category**: unit
**Priority**: should
**Source**: tasks.md T-10

**GIVEN** 最新 conformance run の verdict が `"needs-fix:implementer"` で、conformance が implementer の前回 run より新しく完了している state
**WHEN** `ImplementerStep.buildMessage(state, ...)` を呼ぶ
**THEN** メッセージに「Conformance non-conformities（must resolve）」セクションが追記されている

---

### TC-027: 非 conformance 入場では従来の findings/message を維持

**Category**: unit
**Priority**: should
**Source**: tasks.md T-10

**GIVEN** code-review → code-fixer の通常入場（conformance run 不在 または conformance が code-review より古い）
**WHEN** `CodeFixerStep.buildMessage(state, ...)` を呼ぶ
**THEN** メッセージは code-review findings を使い、conformance findings ブロックは含まれない（既存挙動維持）

---

### TC-028: conformance 入場時 reads() が STEP_INPUT_MISSING を起こさない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-10

**GIVEN** conformance が `needs-fix:code-fixer` を返した後、code-fixer への入場が発生する状態（conformance 結果ファイルが存在する）
**WHEN** `CodeFixerStep.reads(state, ...)` を呼ぶ
**THEN** 返されるファイルパスがすべて存在し、`STEP_INPUT_MISSING` エラーが発生しない

---

## 単一収束予算（CONFORMANCE_RETRIES_EXHAUSTED）

### TC-029: code-fixer 経由でも conformance 予算で打ち切る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 単一収束予算で打ち切る > Scenario: code-fixer 経由でも conformance 予算で打ち切る

---

### TC-030: spec-fixer 経由でも conformance 予算で打ち切る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 単一収束予算で打ち切る > Scenario: spec-fixer 経由でも conformance 予算で打ち切る

---

### TC-031: implementer 経由でも conformance 予算で打ち切る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 単一収束予算で打ち切る > Scenario: implementer 経由でも conformance 予算で打ち切る

---

### TC-032: conformance 起点の fixer 入場で内側予算がリセットされる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 単一収束予算で打ち切る > Scenario: conformance 起点の fixer 入場で内側予算がリセットされる

---

### TC-033: conformance→spec-fixer 入場で spec-fixer/spec-review 予算がリセット

**Category**: integration
**Priority**: should
**Source**: tasks.md T-08

**GIVEN** spec-review phase で spec-fixer が既に maxIterations 近く走った後、conformance が `"needs-fix:spec-fixer"` を返す
**WHEN** pipeline が spec-fixer へ入場する
**THEN** `fixerIters["spec-fixer"]` と `loopIters["spec-review"]` が 0 にリセットされる

---

### TC-034: 通常 reviewer→fixer 入場ではリセットなし

**Category**: integration
**Priority**: should
**Source**: tasks.md T-08

**GIVEN** code-review が `needs-fix` を返して code-fixer へ入場する（currentStep ≠ conformance）
**WHEN** pipeline が遷移を処理する
**THEN** `fixerIters["code-fixer"]` と `loopIters["code-review"]` はリセットされない（既存 TC-072/074 が green のまま）

---

### TC-035: 進捗イベントが needs-fix:* でも発火する

**Category**: integration
**Priority**: could
**Source**: design.md D7

**GIVEN** conformance の outcome が `"needs-fix:code-fixer"`
**WHEN** pipeline がイテレーション後の verdict イベントを発行する
**THEN** `pipeline:iteration:verdict`（action: fixer 相当）イベントが発火し、outcome が `"needs-fix"` のときと同等のイベントが生成される

---

## 後方互換 resume

### TC-036: 旧 needs-fix history の resume が成功する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 旧形式 history の resume 後方互換 > Scenario: 旧 needs-fix history の resume が成功する

---

### TC-037: fixTarget 不在の run では誤注入しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 旧形式 history の resume 後方互換 > Scenario: fixTarget 不在の run では誤注入しない

---

## 仕上げ

### TC-038: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-13

**GIVEN** 本 change の全タスク（T-01〜T-12）が実装済み
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーなし、テスト失敗なしで終了する

---

## Result

```yaml
result: completed
total: 38
automated: 37
manual: 1
must: 21
should: 16
could: 1
blocked_reasons: []
```
