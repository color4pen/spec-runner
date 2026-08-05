# Conformance Result — gate-ac-classification — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Evidence Summary

| Category | Checked | Skipped | Unverified |
|----------|---------|---------|------------|
| Request AC (7) | 7 | 0 | 1 |
| Spec Requirements (4) | 4 | 0 | 0 |
| Design Decisions (5) | 5 | 0 | 0 |
| Tasks Checkboxes (5) | 5 | 0 | 0 |
| **Total** | **21** | **0** | **1** |

---

## 検証した項目

### Judgment Item 1: Request Acceptance Criteria

**Source**: `specrunner/changes/gate-ac-classification/request.md`

**AC-1: `Category: gate` の must TC が coverage gate の must 集合から除外されることをテストで固定する（`extractMustTcIds` の単体）。破壊確認込み**

- `tests/unit/core/verification/test-coverage-gate-exclusion.test.ts` に TC-001〜006 が実装されており、`extractMustTcIds` の gate 除外挙動を bullet/plain 両形式・単独/混在ケースで網羅している。verification-result.md の test フェーズが passed (39.8s) であることで全テスト green を確認。
- 破壊確認については「検証できなかった項目」に記載。

**AC-2: `Category: manual` の除外挙動が無変更であることをテストで固定する**

- TC-003 に `**Category**: manual` の must TC が `extractMustTcIds` に含まれない回帰テストあり。TC-006 に manual と gate の共存ケースで manual が引き続き除外されることを確認。
- `categoryManualRe`・`currentIsManual`・`flushCurrent` の manual 条件は diff で一切変更されていないことを `src/core/verification/test-coverage.ts` の実装で確認。

**AC-3: test-case-gen prompt の gate 定義・分類規則の文言存在をテストで固定する**

- `tests/unit/prompts/test-case-gen-gate-contract.test.ts` TC-007 が `TEST_CASE_GEN_SYSTEM_PROMPT` の Category 列挙・gate 定義・分類規則・GWT 省略規則をそれぞれ独立した assertion で固定している。
- 実装（`test-case-gen-system.ts` line 65–69）: gate の定義・分類規則・verification phase 名記録の旨を確認。既存 `unit | integration | manual` が部分文字列として残ることも確認。

**AC-4: test-materialize prompt の gate 実体化スキップとツールチェーン再実行禁止の文言存在をテストで固定する**

- TC-008 が `## Method` 節の gate スキップ・コメント禁止・verification phase 管轄を固定。TC-009 が `## Contract` 節のツールチェーン再実行禁止・subprocess 例外を固定。
- 実装確認:
  - `## Method` 節（lines 82–86）: gate TC には自動テストを書かない / トレーサビリティコメントも付けない（coverage gate の偽装 pass 禁止）/ verification phase 管轄。
  - `## Contract` 節（line 48、write-set 内 bullet）: プロジェクト全体の検証 command の再実行をテスト本体として書かない / gate TC として verification phase が担う / subprocess 実行は禁止しない。

**AC-5: template の Category 行が gate を含むことをテストで固定する**

- `tests/unit/templates/test-cases-template-gate-contract.test.ts` TC-010 が `TEST_CASES_TEMPLATE` の Category 列挙 `unit | integration | manual | gate` と HTML コメント内 gate 形式説明を固定。
- 実装: `src/templates/step-output-templates.ts` の Category 行更新と HTML コメント内 gate TC GWT 省略注記を確認。

**AC-6: 既存テストは無変更で green**

- `verification-result.md` の test フェーズが passed。新規テストファイルは既存ファイルを編集せず別ファイルとして作成（diff で確認）。

**AC-7: `typecheck && test` が green**

- `verification-result.md`: build / typecheck / test / lint すべて passed。

---

### Judgment Item 2: Spec Requirements & Scenarios

**Source**: `specrunner/changes/gate-ac-classification/spec.md`

**Requirement: test-coverage は Category: gate の must TC を coverage 集計から除外する**

- Scenario 1（gate かつ must → missing にならない）: TC-001 が `runTestCoveragePhase` + `extractMustTcIds` の両経路で検証。
- Scenario 2（gate must TC が foundTcIds/assertionlessTcIds にも現れない）: TC-002 が foundTcIds・assertionlessTcIds・totalMustTcs の 3 点で検証。gate TC は `extractMustTcIds` 返り値に含まれないため found/assertionless ループに入らない構造を確認。
- Scenario 3（unit/integration/manual/Category 欄なし の判定は従来と同一）: TC-003 が 4 ケースで回帰保証。
- Scenario 4（gate を含む enum 行で誤除外が起きない）: TC-004 が enum 行 `**Category**: unit | integration | manual | gate` の存在下で unit TC が正常収集されることを確認。正規表現解析（コロン直後が `unit` → `categoryGateRe` `\s*gate` にも `categoryManualRe` `\s*manual` にも不一致）を cross-boundary-invariants-result-001.md で確認済み。

**Requirement: test-case-gen prompt は gate 分類規則を定義する**

- Scenario（prompt に gate 定義と分類規則が含まれる）: TC-007 が 4 assertion で固定。`## Method` 節内 Summary に gate 定義・分類規則・GWT 省略規則の全要素が実装済みで確認。

**Requirement: test-materialize prompt は gate TC を実体化しない**

- Scenario（prompt に gate 実体化スキップの記述が含まれる）: TC-008 が 8 assertion で固定（gate 除外・コメント禁止・coverage 偽装 pass 禁止・verification phase 管轄・5 節骨格・順序・h2 追加なし・リポジトリ固有パスなし）。

**Requirement: test-materialize prompt はツールチェーン再実行をテスト本体として書くことを禁止する**

- Scenario（prompt にツールチェーン再実行禁止の記述が含まれる）: TC-009 が 5 assertion で固定（テスト本体として書かない旨・gate TC として verification phase 管轄・subprocess 例外・5 節骨格・Contract < Method 順序）。

**Requirement: template / docs は gate 分類を明文化する**

- Scenario（TEST_CASES_TEMPLATE の Category 行が gate を含む）: TC-010 が 8 assertion で固定。
- Scenario（docs が gate 除外規約を含む）: TC-011（docs/test-coverage.md）が 4 assertion で固定、TC-012（docs/README.md）が gate 言及を確認。
- `docs/test-coverage.md` に `## Category: gate の must TC は集計から除外` 節が追加済み。既存の literal 走査・traceability・manual 除外の各節は維持。
- `docs/README.md` の `test-coverage.md` 行の説明に「manual / gate TC の coverage 集計除外」が追記済み。

---

### Judgment Item 3: Design Decisions

**Source**: `specrunner/changes/gate-ac-classification/design.md`

- D1（extractMustTcIds に gate 除外を manual と同型で追加）: `categoryGateRe`・`currentIsGate`・`flushCurrent` 拡張・JSDoc 更新を実装で確認。評価判定点は `extractMustTcIds` の 1 箇所のみ（第二判定点追加なし）。
- D2（gate TC の phase 記録は散文注記・機械 parse 対象フィールドなし）: `test-cases.md` に新フィールド定義なし、`extractMustTcIds` が phase 記録を machine-parse しないことを確認。
- D3（test-case-gen prompt に gate 定義と分類規則を追加）: 既存 `unit | integration | manual` を部分文字列として残しつつ `| gate` を追記、5 節骨格内側・新規 h2 なし。
- D4（test-materialize prompt に gate スキップ (Method) とツールチェーン禁止 (Contract) を追加）: 既存 manual block は無変更、5 節骨格・順序を TC-008・TC-009 が確認。
- D5（template / docs を追随）: template Category 行更新・HTML コメント追記・`Category determination:` テーブル追加なし（TC-012 の禁止遵守）・docs/test-coverage.md gate 除外節追加・docs/README.md 説明行更新をすべて確認。

---

### Judgment Item 4: Tasks Checkboxes

**Source**: `specrunner/changes/gate-ac-classification/tasks.md`

| Task | Checkbox | 実装確認 |
|------|----------|---------|
| T-01: extractMustTcIds に Category: gate 除外を追加 | [x] | `categoryGateRe`・`currentIsGate`・`flushCurrent` 拡張・JSDoc 更新を確認 |
| T-02: test-case-gen prompt に gate 定義・分類規則を追加 | [x] | `## Method` 節 Summary の Category 列挙更新・gate 定義行追加を確認 |
| T-03: test-materialize prompt に gate 実体化スキップとツールチェーン再実行禁止を追加 | [x] | `## Method` gate block・`## Contract` 禁止行の追加を確認 |
| T-04: template / docs を gate を含む形に追随 | [x] | template Category 行・docs/test-coverage.md gate 除外節・docs/README.md 説明行を確認 |
| T-05: 検証（typecheck && test green） | [x] | verification-result.md: build/typecheck/test/lint すべて passed |

全タスクのチェックボックスが [x] 済みであることを確認。

---

## 検証できなかった項目

### U-1: 破壊確認（sabotage proof）の正式記録が存在しない

`extractMustTcIds` から `!currentIsGate` 条件を一時除去した場合に gate 除外テスト（TC-001〜006）が fail することの正式確認記録が verification-result.md にない。

tasks.md は「verification / code-review の過程で確認」と規定しており、永続的なサボタージュテストの追加は要求していない。cross-boundary-invariants-result-001.md も「コードを破壊するステップは review の範囲外」と判断し、TC-001〜006 が実装前 RED だった設計（tasks.md に明記）を「歯の実在」の間接証拠とした（非ブロッキング扱い）。

この間接証拠の評価は妥当（実装前 RED → 実装後 GREEN という設計が gate 除外の機能的証明になっている）と判断し、unverified として記録するが、ブロッキング扱いはしない。

---

## Findings 詳細

None（typed findings なし）
