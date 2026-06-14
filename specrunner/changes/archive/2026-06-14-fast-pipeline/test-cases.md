# Test Cases: 軽量 fast pipeline profile を追加する — permissionScope を宣言する最初の利用者

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration): 28
- **Manual**: 3
- **Priority**: must: 25, should: 6, could: 0

---

### TC-001: fast が registry に登録され、削った step が steps に無い

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry は `fast` profile を提供し、その steps から深さ・重複レビュー step を除く > Scenario: fast が registry に登録され、削った step が steps に無い

---

### TC-002: fast の startStep は request-review

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: registry は `fast` profile を提供し、その steps から深さ・重複レビュー step を除く > Scenario: fast の startStep は request-review

---

### TC-003: design 完了は implementer へ直結する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast は design 後に spec-review を介さず implementer へ進み、conformance approved で pr-create へ向かう > Scenario: design 完了は implementer へ直結する

---

### TC-004: conformance approved は pr-create へ向かう

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast は design 後に spec-review を介さず implementer へ進み、conformance approved で pr-create へ向かう > Scenario: conformance approved は pr-create へ向かう

---

### TC-005: code-review の clean approved は conformance へ進む

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast は design 後に spec-review を介さず implementer へ進み、conformance approved で pr-create へ向かう > Scenario: code-review の clean approved は conformance へ進む

---

### TC-006: checkpoint は conformance（judge step）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast は permissionScope を conformance checkpoint で 3 surfaces 宣言する > Scenario: checkpoint は conformance（judge step）

---

### TC-007: forbidden は 3 surfaces を glob で表す

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast は permissionScope を conformance checkpoint で 3 surfaces 宣言する > Scenario: forbidden は 3 surfaces を glob で表す

---

### TC-008: forbidden surface に触れた変更は conformance で escalation になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出可能 runtime では conformance で 3 surfaces を機械評価し、超過を escalation する > Scenario: forbidden surface に触れた変更は conformance で escalation になる

---

### TC-009: forbidden に触れない変更は scope による影響を受けない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 導出可能 runtime では conformance で 3 surfaces を機械評価し、超過を escalation する > Scenario: forbidden に触れない変更は scope による影響を受けない

---

### TC-010: managed fake で fast を選ぶと着手前に reject し state を作らない

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: fast は導出不能 runtime を着手前 gate で reject する（gate を継承する） > Scenario: managed fake で fast を選ぶと着手前に reject し state を作らない

---

### TC-011: gate 判定は profile 名でなく permissionScope の有無に依る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: fast は導出不能 runtime を着手前 gate で reject する（gate を継承する） > Scenario: gate 判定は profile 名でなく permissionScope の有無に依る

---

### TC-012: pipeline 未指定は standard に解決する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存 profile・既定経路・finding resolution 体系は不変 > Scenario: pipeline 未指定は standard に解決する

---

### TC-013: FindingResolution は 2 値のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存 profile・既定経路・finding resolution 体系は不変 > Scenario: FindingResolution は 2 値のまま

---

### TC-014: PIPELINE_IDS.FAST が文字列 "fast" を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `PIPELINE_IDS` に `FAST` が追加された状態
**WHEN** `PIPELINE_IDS.FAST` を評価する
**THEN** 文字列 `"fast"` が返る

---

### TC-015: PipelineId 型が "fast" を含む

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** `PipelineId` 型定義（`typeof PIPELINE_IDS[keyof typeof PIPELINE_IDS]` による union）
**WHEN** `"fast"` を `PipelineId` 型変数に代入する（型レベル）
**THEN** 型エラーが発生しない（`bun run typecheck` green）

---

### TC-016: conformance needs-fix:implementer は implementer へ遷移する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `FAST_TRANSITIONS`
**WHEN** `conformance` が `needs-fix:implementer` を返したときの遷移先を引く
**THEN** 遷移先は `implementer` である

---

### TC-017: conformance needs-fix:code-fixer は code-fixer へ遷移する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `FAST_TRANSITIONS`
**WHEN** `conformance` が `needs-fix:code-fixer` を返したときの遷移先を引く
**THEN** 遷移先は `code-fixer` である

---

### TC-018: conformance needs-fix（flat legacy）は implementer へ遷移する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02 / design.md D2

**GIVEN** `FAST_TRANSITIONS`
**WHEN** `conformance` が `needs-fix`（フラット、legacy catch-all）を返したときの遷移先を引く
**THEN** 遷移先は `implementer` である

---

### TC-019: conformance needs-fix:spec-fixer の遷移行が FAST_TRANSITIONS に存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 / design.md D2

**GIVEN** `FAST_TRANSITIONS`
**WHEN** `conformance` / `needs-fix:spec-fixer` の組み合わせに一致する遷移行を探す
**THEN** 一致行が存在しない（`pipeline.ts:298` の `?? "escalate"` フォールバックが発火する設計どおり）

---

### TC-020: verificationの reverification ガード付き行が無条件行より前にある

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `FAST_TRANSITIONS` の verification ループ部分
**WHEN** `passed` アウトカムの全行をインデックス順に列挙する
**THEN** `when: conformanceApprovedLatest` 付きの `passed→pr-create` 行のインデックスが、無条件の `passed→code-review` 行のインデックスより小さい（先頭一致で先に評価される）

---

### TC-021: conformance の reverification ガード付き行が無条件 approved 行より前にある

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** `FAST_TRANSITIONS` の conformance 部分
**WHEN** `approved` アウトカムの全行をインデックス順に列挙する
**THEN** `when: codeChangedSinceLastVerification` 付きの `approved→verification` 行のインデックスが、無条件の `approved→pr-create` 行のインデックスより小さい（先頭一致で先に評価される）

---

### TC-022: loopFixerPairs に spec-review→spec-fixer が含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-03

**GIVEN** `FAST_DESCRIPTOR.loopFixerPairs`
**WHEN** キーの集合を列挙する
**THEN** `spec-review` キーが存在せず、`code-review` と `verification` のみが存在する

---

### TC-023: PIPELINE_REGISTRY がちょうど 3 本を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md T-07 / design.md D8

**GIVEN** 更新後の `PIPELINE_REGISTRY`
**WHEN** キー集合を列挙する
**THEN** `standard` / `design-only` / `fast` の 3 本が含まれ、総数がちょうど 3 である

---

### TC-024: fast のみが permissionScope を宣言し standard と design-only は宣言しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-07 / design.md D8

**GIVEN** `PIPELINE_REGISTRY` 全 descriptor
**WHEN** `permissionScope` が `undefined` でない descriptor を列挙する
**THEN** `fast` ちょうど 1 件のみが `permissionScope` を持ち、`standard` と `design-only` の `permissionScope` が `undefined` である

---

### TC-025: checkpoint 以外の step では scope 合成が走らない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-05

**GIVEN** `FAST_DESCRIPTOR.permissionScope` と `canDeriveChangedFiles()===true` の runtime fake
**WHEN** `code-review` step（非 checkpoint）を同 `permissionScope` で executor に渡して実行する
**THEN** `listChangedFiles` が呼ばれず、scope finding が合成されない（checkpoint の単一性確認）

---

### TC-026: assertRuntimeSupportsScope は canDeriveChangedFiles が true または absent の場合に通過する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** `FAST_DESCRIPTOR`（`permissionScope` あり）と `canDeriveChangedFiles: () => true` の runtime、または `canDeriveChangedFiles` が未定義（absent）の runtime
**WHEN** `assertRuntimeSupportsScope(FAST_DESCRIPTOR, runtime)` を呼ぶ
**THEN** `UnsupportedRuntimeCapabilityError` が throw されない（通過する）

---

### TC-027: src/ に pipelineId === "fast" のような profile 名分岐が存在しない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-06 / design.md D4

**GIVEN** 全タスク実装後の `src/` ディレクトリ
**WHEN** `"fast"` の文字列リテラルによる分岐を diff または grep で確認する
**THEN** `pipelineId === "fast"` / `pipeline === "fast"` 等のハードコード profile 名分岐が `src/` に存在しない（gate は `permissionScope` の有無から導出する）

---

### TC-028: bun run typecheck && bun run test が全 green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-08

**GIVEN** 全タスク（T-01〜T-07）を実装し、既存テストが T-07 の意図的更新を除き無改変である状態
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 型エラーがなく全テストが pass する

---

### TC-029: arch 不変条件（B-1〜B-11 + DSM closure）が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-08

**GIVEN** `FAST_DESCRIPTOR`（`registry.ts`、domain）・`FAST_TRANSITIONS`（`types.ts`、domain）を追加した状態
**WHEN** arch 不変条件チェックを実行する
**THEN** B-1〜B-11 + DSM closure がすべて green であり、新規逆 edge が導入されていない

---

### TC-030: loopName が loopNames の要素に含まれる

**Category**: unit
**Priority**: should
**Source**: design.md D7

**GIVEN** `FAST_DESCRIPTOR`
**WHEN** `loopName` と `loopNames` を読む
**THEN** `loopName`（`code-review`）が `loopNames` 配列の要素に含まれる（制約 `loopName ∈ loopNames` を満たす）

---

### TC-031: summaryStep が steps に存在する

**Category**: unit
**Priority**: should
**Source**: design.md D7

**GIVEN** `FAST_DESCRIPTOR`
**WHEN** `summaryStep` と steps の step 名集合を読む
**THEN** `summaryStep`（`code-review`）が steps の step 名集合に含まれる（制約 `summaryStep ∈ steps` を満たす）

---

## Result

```yaml
result: completed
total: 31
automated: 28
manual: 3
must: 25
should: 6
could: 0
blocked_reasons: []
```
