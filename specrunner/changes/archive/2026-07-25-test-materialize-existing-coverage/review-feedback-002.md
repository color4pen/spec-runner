# Code Review Feedback — iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Diff scope

`git diff main...HEAD --stat` で 26 ファイル (+2607 行) を確認。

コア実装変更:
- `src/core/verification/test-coverage.ts` (+16 行): `extractMustTcIds` に `categoryManualRe` + `currentIsManual` フラグを追加
- `src/prompts/test-materialize-system.ts` (+6 行): `## Method` 節に manual TC 対象外の記述を追加

docs:
- `docs/test-coverage.md` (+14 行): `## Category: manual の must TC は集計から除外` 節を追記
- `docs/README.md` (+1 行): `test-coverage.md` 説明文に manual 除外を反映

新規テスト (3 ファイル):
- `tests/unit/core/verification/test-coverage-manual-exclusion.test.ts` (+451 行)
- `tests/unit/docs/test-coverage-manual-contract.test.ts` (+143 行)
- `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts` (+137 行)

付随変更:
- `tests/unit/cli/repo-root-exactly-once.test.ts` (+16, -9): grep に `--exclude-dir` 追加、TC-018 フィルタに `specrunner/changes/` を除外追加

### TC Coverage（test-cases.md 照合）

| TC | Priority | カバーファイル | assertions |
|---|---|---|---|
| TC-001: manual かつ must の TC は missing にならない | must | `test-coverage-manual-exclusion.test.ts` | 5 |
| TC-002: unit / integration の判定は従来と同一 | must | `test-coverage-manual-exclusion.test.ts` | 6 |
| TC-003: prompt が manual TC 対象外の記述を含む | must | `test-materialize-manual-scope-contract.test.ts` | 7 |
| TC-004: docs が manual 除外規約を含む | must | `test-coverage-manual-contract.test.ts` | 5 |
| TC-005: bullet / plain 両形式が除外される | should | `test-coverage-manual-exclusion.test.ts` | 4 |
| TC-006: manual TC が foundTcIds / assertionlessTcIds にも現れない | should | `test-coverage-manual-exclusion.test.ts` | 3 |
| TC-007: テンプレート enum 行での誤除外が起きない | could | `test-coverage-manual-exclusion.test.ts` | 3 |
| TC-008: docs/README.md の説明文に manual 除外が反映される | should | `test-coverage-manual-contract.test.ts` | 2 |

全 4 must TC カバー済み。

### 受け入れ基準の確認

- [x] traceability comment 手順が prompt に含まれる — 先行変更で確立済み（`test-materialize-prompt-contract.test.ts` 無改変 green）
- [x] コメント形式 TC-ID fixture で test-coverage passed — 先行変更で確立済み（`test-coverage-comment-form.test.ts` 無改変 green）
- [x] manual かつ must TC が missingTcIds に入らない — TC-001 で 5 assertions により固定
- [x] unit / integration の判定が従来と同一 — TC-002 で 6 assertions により固定
- [x] manual TC 対象外の記述が prompt に含まれる — TC-003 で 7 assertions により固定
- [x] docs に規約（リテラル走査 + トレーサビリティ + manual 除外）が明文化される — TC-004 / TC-008 で固定、`docs/test-coverage.md` の内容を直接確認
- [x] `typecheck && test` green — `bun run typecheck` clean、`bun run test` 9653 passed / 1 skipped を実測確認

### 実装正確性の確認

**D1 (extractMustTcIds)**:
- `categoryManualRe = /\*\*Category\*\*:\s*manual/` を追加（bullet 形式・plain 形式の両方に一致）
- `currentIsManual` フラグを per-section で管理し、`flushCurrent` は `currentTcId && currentIsMust && !currentIsManual` のときのみ push
- section 切替 (`flushCurrent`) で `currentIsManual` をリセット
- 走査方式・assertionless 判定（Step 4b）・`tcIdBoundaryRe` は無変更
- 設計 D1 に完全一致

**D2 (prompt)**:
- 追記は既存 Step 3（既存テスト充足時の手順）の直後に配置
- manual TC の自動テスト化禁止・トレーサビリティコメント禁止・conformance / レビュー gate の管轄の 3 点を明示
- 新規 h2 見出しなし、リポジトリ固有パス参照なし
- 設計 D2 に完全一致

**D3 (docs)**:
- `docs/test-coverage.md`: `## Category: manual の must TC は集計から除外` 節を既存コンテンツの末尾「## まとめ」直前に追記。除外ルール・`totalMustTcs` 非算入・コメント追記不要・conformance / レビュー gate の管轄を明文化。「例外なし」として unit / integration / Category 欄なしは従来通りと注記
- `docs/README.md`: 説明文に `manual TC の coverage 集計除外` を反映
- 設計 D3 に完全一致

**D4 (既存テスト無改変)**:
- `test-coverage.test.ts`・`test-coverage-comment-form.test.ts`・`test-materialize-prompt-contract.test.ts`・`test-coverage-docs-contract.test.ts` の diff が空であることを確認

**付随変更 (repo-root-exactly-once.test.ts)**:
- `grepE` に `--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git` を追加 → `SKIP_DIRS` と整合する改善
- TC-018 フィルタに `!line.includes("specrunner/changes/")` を追加 → 変更フォルダ内ドキュメント（design.md 等）の false positive 除去。適切

### 境界・エッジケースの確認

- TC section 外の `**Category**: manual` 行（HTML コメント等）は `currentTcId == null` のため無視される ✓
- `**Category**: unit | integration | manual` テンプレート enum 行はコロン直後が `unit` のため `categoryManualRe` にマッチしない ✓（TC-007 でテスト固定）
- bullet 形式・plain 形式の両方が除外される ✓（TC-005 でテスト固定）
- manual TC の ID がテストファイルに偶然出現しても `foundTcIds` / `assertionlessTcIds` に現れない（`extractMustTcIds` が返さないため `evaluateTestCoverage` のループ対象に入らない）✓（TC-006 でテスト固定）

## 検証できなかった項目

None

## Findings 詳細

### INFO-001 (iteration 1 から継続): `categoryManualRe` に word-boundary なし

`/\*\*Category\*\*:\s*manual/` は理論上 `**Category**: manually` にも一致する。ただし:
- Category は固定 enum（unit | integration | manual）であり実運用で亜種は出現しない
- `priorityMustRe = /\*\*Priority\*\*:\s*must/` と同型であり、コードベースで一貫したパターン

iteration 1 から変化なし。アクション不要。
