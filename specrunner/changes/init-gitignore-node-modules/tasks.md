# Tasks: init-gitignore-node-modules

## T-01: ensureDotSpecrunnerGitignore に node_modules/ エントリを追加する

対象ファイル: `src/util/gitignore.ts`

- [x] `NODE_MODULES_LINE = "node_modules/"` 定数を追加する
- [x] `.specrunner/*` ペアの処理（Step 3）の後に、`NODE_MODULES_LINE` の存在チェックを追加する。非コメント行として存在する場合は何もしない
- [x] 存在しない場合、ファイル末尾の trailing newline の直前に `NODE_MODULES_LINE` を挿入する（既存の `insertAt` パターンを踏襲）

**Acceptance Criteria**:
- `.gitignore` が空の状態で関数を呼ぶと `node_modules/` が含まれる
- `node_modules/` 既載の `.gitignore` で関数を呼んでも出現数が増えない
- 既存の `.specrunner/*` / `!.specrunner/config.json` の挿入ロジックが変わらない

## T-02: node_modules/ 管理のテストを追加する

対象ファイル: `tests/unit/util/gitignore.test.ts`

- [x] TC-GI-NM-01: `.gitignore` が存在しない状態で init すると `node_modules/` を含む `.gitignore` が生成されることを確認する
- [x] TC-GI-NM-02: `node_modules/` 既載の `.gitignore` に対して重複追記しないことを確認する（出現数 === 1）
- [x] TC-GI-NM-03: `node_modules/` がコメント行（`# node_modules/`）として存在する場合、非コメント行として追記されることを確認する
- [x] TC-GI-NM-04: 2 回呼び出しても結果が変わらない（idempotent）ことを確認する

**Acceptance Criteria**:
- 4 件のテストがすべて green になる
- TC-GI-01〜TC-GI-12 および `preserves existing content when appending` テストが引き続き green になる

## T-03: typecheck && test を実行して green を確認する

- [x] `bun run typecheck` が通ること
- [x] `bun run test` が通ること（全テスト green）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` がエラーなしで完了する
