# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### tasks.md — チェックボックス完了確認

T-01〜T-04 の全チェックボックスが `[x]` で完了済み。

### design.md — D1〜D4 実装確認

**D1: extractMustTcIds への Category: manual 除外組み込み**

`src/core/verification/test-coverage.ts` を確認:
- `currentIsManual` フラグ（line 116）追加済み
- `categoryManualRe = /\*\*Category\*\*:\s*manual/`（line 110）追加済み
- `flushCurrent` が `currentTcId && currentIsMust && !currentIsManual` のときのみ push（line 119）
- JSDoc Algorithm に Step 4（manual 検出・除外）追記（lines 86–98）
- bullet / plain 両形式を受理（regex に先頭 `- ` を要求しない）
- edge case: `**Category**: unit | integration | manual` 行はコロン直後が `unit` のため regex 不一致、誤除外なし

**D2: prompt への manual TC 対象外記述追加**

`src/prompts/test-materialize-system.ts` lines 73–78 を確認:
- `## Method` 節 Step 3 の末尾に manual 除外ブロック追記
- 内容: 自動テスト化不可・トレーサビリティコメント作成不可・検証は conformance / レビュー gate 管轄
- 新規 h2 見出し未追加
- リポジトリ固有パス参照なし
- 5 節骨格（Question / Contract / Method / Evidence / Completion）維持

**D3: docs/test-coverage.md への manual 除外明文化**

`docs/test-coverage.md` を確認:
- 新節「## Category: manual の must TC は集計から除外」追記
- manual TC が `totalMustTcs` に数えられないこと、`missingTcIds` に入らないこと、トレーサビリティコメント不要であること、検証は conformance / レビュー gate 管轄であることが明記
- 既存の TC-ID リテラル走査・トレーサビリティコメント規約・既存テスト追記規約の記述を維持
- `docs/README.md` の `test-coverage.md` エントリに「manual TC の coverage 集計除外」への言及追加

**D4: 新規挙動は新規テストファイルで固定・先行変更テストは無改変**

保護対象ファイル（4 件）の diff を確認 → いずれも無改変:
- `tests/unit/prompts/test-materialize-prompt-contract.test.ts`
- `tests/unit/core/verification/test-coverage-comment-form.test.ts`
- `tests/unit/core/verification/test-coverage.test.ts`
- `tests/unit/docs/test-coverage-docs-contract.test.ts`

新規テストファイル 3 件作成確認:
- `tests/unit/core/verification/test-coverage-manual-exclusion.test.ts`（TC-001/002/005/006/007）
- `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts`（TC-003）
- `tests/unit/docs/test-coverage-manual-contract.test.ts`（TC-004/008）

**`tests/unit/cli/repo-root-exactly-once.test.ts` の変更について**:
build-fixer による infrastructure 修正（2 箇所）:
1. `grepE` ヘルパーに `--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git` を追加 — node_modules 走査による 57s+ タイムアウト対策
2. TC-018 フィルタに `!line.includes("specrunner/changes/")` を追加 — この変更の `verification-result.md` が B-13+CWD 文字列を含み grep に偽陽性が出た対策

この変更は semantic assertion を変更しておらず、テスト suite を green に保つために必要だった。ただし D4 の「先行変更のテストは無改変で維持する」から逸脱している。

### spec.md — Requirements / Scenarios 適合確認

**Requirement 1（manual 除外）の Scenario 2 件**:
- Scenario「manual かつ must の TC はテストファイルに ID 出現がなくても missing にならない」→ TC-001 fixture テスト 5 件が green
- Scenario「unit / integration の must TC の判定は従来と同一」→ TC-002 regression テスト 6 件が green

**Requirement 2（prompt 記述）の Scenario 1 件**:
- Scenario「prompt が manual TC 対象外の記述を含む」→ TC-003 contract テスト 6 件が green

**Requirement 3（docs 明文化）の Scenario 1 件**:
- Scenario「docs が manual 除外規約を含む」→ TC-004/TC-008 docs contract テストが green

### request.md — 受け入れ基準確認

| 受け入れ基準 | 状態 |
|---|---|
| test-materialize prompt に既存テスト充足時のトレーサビリティコメント手順が含まれる（prompt contract テストで固定） | ✅ 先行変更の `test-materialize-prompt-contract.test.ts` が無改変で green |
| TC-ID がコメント形式でのみ既存 test file に出現する fixture で test-coverage が passed | ✅ 先行変更の `test-coverage-comment-form.test.ts` が無改変で green |
| `**Category**: manual` かつ `**Priority**: must` の TC がテストファイルに ID 出現なしでも `missingTcIds` に入らない | ✅ TC-001 fixture が green |
| manual 以外（unit / integration）の must TC の判定が従来と同一 | ✅ TC-002 regression が green |
| test-materialize の prompt に manual TC が対象外であることが含まれる | ✅ TC-003 contract が green |
| docs に規約（リテラル走査 + トレーサビリティコメント + manual 除外）が明文化 | ✅ TC-004/TC-008 docs contract が green |
| `typecheck && test` が green | ✅ 650 test files passed, 9653 tests passed |

### スコープ外侵犯なし確認

- `test-cases.md` への `covered-by` フィールド追加 → なし
- test-coverage 走査方式・assertionless 判定の変更 → なし
- `docs/guarantees.md` 保証番号・版号変更 → なし（`git diff main...HEAD -- docs/guarantees.md` が empty）

## 検証できなかった項目

None

## Findings 詳細

**Finding 1（low）**: `tests/unit/cli/repo-root-exactly-once.test.ts` が D4 の「先行変更のテストは無改変で維持する」の文言と照らして微逸脱。変更内容は infrastructure 修正（node_modules 除外 + CI artifact 除外フィルタ）であり、本変更の semantic assertion を変更していない。build-fixer が test suite を green に保つために必要な修正として実施。tasks.md の保護対象ファイルリストには含まれていない。
