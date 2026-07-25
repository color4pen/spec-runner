# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 現状コードの前提アサーション（6件）

1. **test-coverage.ts:1-11** — ファイルヘッダコメントとインポートを確認。`*.test.ts` 等のリテラル走査、`node_modules/dist/.git` 除外の記述が正確であることを確認。✅ 正確

2. **test-coverage.ts:95-135** — `extractMustTcIds` 関数を確認（実際は lines 95-135）。`priorityMustRe = /\*\*Priority\*\*:\s*must/` のみで判定し、`**Category**: manual` を一切参照しないことを確認。manual の must TC が集計に含まれることを実測で確認。✅ 正確（修正が必要）

3. **step-output-templates.ts** — `**Category**: unit | integration | manual` が必須フィールドとして定義されていることを確認（line 123）。✅ 正確

4. **test-materialize.ts:47-50** — JSDoc コメント（lines 47-50）が `outputContracts()` による test-coverage 契約宣言を記述し、実際の実装が lines 87-97 にあることを確認。契約の内容（must TC ごとに test file entry を要求）は正確。✅ 正確

5. **test-materialize-system.ts:61/:117** — **要注意**: request.md は「既存テストが TC を充足している場合の指示が存在しない」と記述しているが、**現在のコードでは PR #924（commit 1411c9933）により Step 3「各 must TC について、変更前から存在する既存テストが当該振る舞いを既に検証しているかを確認する」が既に追加済み**。line 61 にトレーサビリティコメント手順の指示が存在する。❌ **現状コードの前提が陳腐化（stale）**

6. **write-scope.ts:33** — `GUARDED_WRITE_STEPS` の定義（lines 33-39）内に `"test-materialize"` が含まれること（line 37）を確認。既存 test file の編集が write-scope 上可能であることを確認。✅ 正確（line 33 はセットの開始、test-materialize は line 37）

### 関連ファイルの状態確認

- **docs/test-coverage.md** — ファイルが存在し、リテラル走査・assertion 確認・トレーサビリティコメント規約が文書化されていることを確認。ただし `manual TC が集計対象外` の記述は**存在しない**（要件 3 の一部が未完了）。

- **tests/unit/prompts/test-materialize-prompt-contract.test.ts** — TC-001/002/003 としてトレーサビリティコメント手順のプロンプトコントラクトテストが既に存在する。受け入れ基準「既存テスト充足時のトレーサビリティコメント手順が含まれることを prompt contract テストで固定する」は**既に充足済み**。

- **tests/unit/core/verification/test-coverage-comment-form.test.ts** — TC-004/005 としてコメント形式 TC-ID の fixture テストが既に存在する。受け入れ基準「TC-ID がコメント形式でのみ既存 test file に出現する fixture で test-coverage が passed になることをテストで固定する」は**既に充足済み**。

- **tests/unit/core/verification/test-coverage.test.ts** — `extractMustTcIds` のテストに manual TC 除外のケースが存在しないことを確認。受け入れ基準「manual の TC が missingTcIds に入らない」「manual 以外の判定が従来と同一」のテストは**未充足**。

- **git log** — PR #924（commit 1411c9933）が main にマージ済みで、要件 1 の実装が base branch に含まれていることを確認。

### 未実装の確認

- `extractMustTcIds`（test-coverage.ts）に `**Category**: manual` 除外ロジックが存在しないことを確認 → 要件 5 は未実装
- `TEST_MATERIALIZE_SYSTEM_PROMPT` に manual TC が対象外である旨の記述が存在しないことを確認 → 要件 6 は未実装

## 検証できなかった項目

None

## Findings 詳細

### Finding 1: 現状コードの前提（test-materialize-system.ts）が陳腐化している

**severity**: warning

`request.md` の「現状コードの前提」セクションは `src/prompts/test-materialize-system.ts` について「既存テストが TC を充足している場合の指示が存在しない」と記述しているが、PR #924（commit `1411c9933`）が 0.4.6 リリース前に main にマージされており、現在の `test-materialize-system.ts` の line 61 にはすでにトレーサビリティコメント手順（Step 3）が含まれている。

これに伴い、以下の受け入れ基準も既に充足済みである（テストが存在し通過する）:
- 「test-materialize の system prompt に既存テスト充足時のトレーサビリティコメント手順が含まれることを prompt contract テストで固定する」（`test-materialize-prompt-contract.test.ts` TC-001/002/003）
- 「TC-ID がコメント形式でのみ既存 test file に出現する fixture で test-coverage が passed になることをテストで固定する」（`test-coverage-comment-form.test.ts` TC-004/005）

設計ステップがコードの現状を確認せずに「現状コードの前提」を信頼すると、トレーサビリティコメント手順を重複実装するリスクがある。設計ステップは `test-materialize-system.ts` の現在の内容を必ず事前確認すること。

**残作業（真に未実装）**:
- 要件 5: `extractMustTcIds` での `**Category**: manual` TC 除外ロジック
- 要件 6: `test-materialize-system.ts` への manual TC 対象外の明記
- 要件 3（一部）: `docs/test-coverage.md` への manual TC 集計除外の追記
- 上記3件に対する受け入れ基準テスト（fixture テスト + prompt contract テスト）

要件自体の記述は明確・実装可能であり、request は進行可能。
