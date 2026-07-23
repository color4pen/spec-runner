# Code Review Feedback — test-materialize-existing-coverage — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### スコープ確認

- `git diff main...HEAD --stat`: 20 files (+1986 / -3)
- 実装ファイル: `src/prompts/test-materialize-system.ts`、`docs/test-coverage.md`（新規）、`docs/README.md`
- テストファイル（新規）: `tests/unit/prompts/test-materialize-prompt-contract.test.ts`、`tests/unit/core/verification/test-coverage-comment-form.test.ts`、`tests/unit/docs/test-coverage-docs-contract.test.ts`

### AC1: test-materialize prompt — Method 節へのトレーサビリティ手順追記

`src/prompts/test-materialize-system.ts` lines 61–70 を読み、`## Method` 節に step 3 として追記されていることを確認:

- `// TC-001: <TC 名>` リテラルが含まれる（TC-001 の機械固定）
- 「既存テスト」という汎用語（リポジトリ固有パスなし）
- 「新規テストを重複作成してはならない（重複禁止）」
- 「充足不能として停止しない」
- assertion 必須の注意（assertionless 判定への言及）
- step 3 の subheading は `**bold**` 形式（`##` 見出しを新規追加していない）

`COMMIT_DISCIPLINE`（`## git operations`）と `COMPLETION_DIRECTIVE`（`## Completion`）は `## Evidence` の後に appendされ、5節構成の順序（Question/Contract/Method/Evidence/Completion）を維持 ✓

`architecture/` がプロンプト全体に含まれないことを確認 ✓

**プロンプト契約テスト** (`tests/unit/prompts/test-materialize-prompt-contract.test.ts`):
- TC-001: `extractSection("Method")` の抽出結果に対し 4 assertions（`// TC-`、既存テスト参照、重複禁止、停止禁止）
- TC-002: `architecture/` がプロンプト全体・Method 節に含まれないことを assert
- TC-003: 5節の存在・順序 + Method 節内に `// TC-` が存在 + Method 節内に内側 `##` がないことを assert

### AC2: コメント形式 TC-ID の coverage 判定

`src/core/verification/test-coverage.ts` が main と bit-identical であることを md5sum で確認:
- main: `39bc3cbcb2e905a3df068a7697169b46`
- HEAD: `39bc3cbcb2e905a3df068a7697169b46`

評価ロジックを読み確認:
- リテラル走査は形式非依存（`re.test(text)`）
- assertion 判定は per-file（`filesWithTc.some(text => ASSERTION_RE.test(text))`）
- コメント形式 TC-ID + assertion あり → passed が現行実装で成立すること確認

**フィクスチャテスト** (`tests/unit/core/verification/test-coverage-comment-form.test.ts`):
- TC-004: 3 ケース（単一コメント形式、コロンなし形式、複数 TC コメント）→ `status: 'passed'`
- TC-005: 3 ケース（assertion なし → assertionless failed、stdout 確認、dual-file で assertion あり側が勝つ → passed）
- TC-057 dual-file ケース: `.some` ロジックにより assertion ありファイルが 1 つでも存在すれば assertionless にならない ✓

新規テストファイルは `tests/unit/core/verification/test-coverage-comment-form.test.ts`（既存の `test-coverage.test.ts` は無改変）✓
vitest config `include: ["tests/**/*.test.ts"]` で収集されることを確認 ✓

### AC3: docs への規約明文化

`docs/test-coverage.md`（新規）を読み確認:
- TC-ID リテラル走査の説明（「リテラルとして出現すること」「出現形式の区別なし」）
- `// TC-0XX: <TC 名>` トレーサビリティコメントの規約（コード例付き）
- assertion 必須の警告（assertionless 判定の説明）
- まとめ表（3ケース）

`docs/README.md`: `test-coverage.md` が docs/ ファイル一覧表に追加されていることを確認 ✓

`docs/guarantees.md`: diff に含まれていない。版号 G1 および G1-1~G1-6 を確認 — 変更なし ✓

**docs 契約テスト** (`tests/unit/docs/test-coverage-docs-contract.test.ts`):
- TC-006: ファイル存在、リテラル走査記述、トレーサビリティコメント記述、既存テスト記述、assertion 警告記述
- TC-007: README に `test-coverage.md` エントリが存在

### AC4: test-coverage.ts 無変更

md5sum で bit-identical を確認（上記）✓

### AC5: typecheck && test green

`verification-result.md` を読み確認 — 全 5 フェーズ passed:
- build: 0 (1.0s)
- typecheck: 0 (5.2s)
- test: 0 (640 test files, 9470 passed, 1 skipped, 32.8s)
- lint: 0 (0 warnings, 5.9s)
- changed-line-coverage: passed

### TC Coverage

| TC | Priority | 確認方法 |
|---|---|---|
| TC-001 | must | `test-materialize-prompt-contract.test.ts` — 4 assertions on Method section |
| TC-002 | must | `test-materialize-prompt-contract.test.ts` — architecture/ absence |
| TC-003 | must | `test-materialize-prompt-contract.test.ts` — skeleton + inner-h2 check |
| TC-004 | must | `test-coverage-comment-form.test.ts` — 3 sub-cases, status passed |
| TC-005 | must | `test-coverage-comment-form.test.ts` — 3 sub-cases, assertionless failed |
| TC-006 | must | `test-coverage-docs-contract.test.ts` — 5 assertions on doc content |
| TC-007 | must | `test-coverage-docs-contract.test.ts` — README entry |
| TC-008 | should | `docs/guarantees.md` not in diff; G1 / G1-1~G1-6 confirmed unchanged |
| TC-009 | should | md5sum で test-coverage.ts が main と bit-identical |
| TC-010 | could | 新規ファイルのパス確認; `test-coverage.test.ts` は無改変 |

must 7 件すべて自動アサーションで固定 ✓

### スコープ外の非違反確認

- `covered-by` フィールドなし ✓
- test-coverage.ts 検査ロジック変更なし ✓
- test-cases.md フィールド変更なし ✓
- write-scope 変更なし ✓

## 検証できなかった項目

None — 全 must AC および TC を観測事実で確認した。

## Findings 詳細

指摘なし。
