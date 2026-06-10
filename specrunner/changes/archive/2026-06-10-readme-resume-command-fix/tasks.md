# Tasks: readme-resume-command-fix

## T-01: README の誤記コマンド `specrunner resume` を `specrunner job resume` に修正する

対象ファイル: `README.md`（Troubleshooting「Silent exit」節）。`README.md:411` と `:418` の
2 箇所のみを編集する。それ以外の節・行は変更しない。

- [x] `README.md:411` を修正する
  - 変更前: `` If `specrunner run` or `specrunner resume` exits unexpectedly without error output: ``
  - 変更後: `` If `specrunner run` or `specrunner job resume` exits unexpectedly without error output: ``
- [x] `README.md:418` を修正する（`<slug>` 引数を保つ）
  - 変更前: ``...by the exit guard. Run `specrunner resume <slug>` to continue.``
  - 変更後: ``...by the exit guard. Run `specrunner job resume <slug>` to continue.``
- [x] 同じ行内の `awaiting-resume`（状態名）と直前行の `specrunner run` は変更しないこと

**Acceptance Criteria**:
- `README.md` に bare な `specrunner resume`（直後に `job` を伴わない）表記が 1 件も残っていない
- README 内の resume コマンド参照は `specrunner job resume` のみ
- `:418` の `<slug>` 引数が保持されている
- `awaiting-resume` / `specrunner run` の表記が変更されていない

## T-02: README コマンド表記の drift-guard 回帰テストを追加する

新規ファイル `tests/unit/docs/readme-resume-command.test.ts` を作成する。既存の
`tests/unit/docs/readme-pipeline-sync.test.ts` を雛形として、README.md 本文を読み込み、
bare な `specrunner resume` 表記を含まないことを assert する。

- [x] vitest（`describe` / `it` / `expect`）で実装する
- [x] `README.md` を `node:fs/promises` の `readFile` で読み込む（パスは `path.resolve(process.cwd(), "README.md")`）
- [x] bare な `specrunner resume` を含まないことを assert する（例: `expect(content).not.toContain("specrunner resume")`、
      または境界つき regex `/specrunner resume\b/` が一致しないこと）。`specrunner job resume` は部分文字列
      `specrunner resume` を含まないため正しく pass する
- [x] テストの意図（README が存在しない top-level resume コマンドを案内しないことを保証する drift guard）を
      ファイル冒頭コメントに記す

**Acceptance Criteria**:
- 新規テストは現在の（T-01 修正後の）README に対して pass する
- README に bare `specrunner resume` を意図的に書き戻すと当該テストが fail する
- テストは `specrunner job resume` を誤検知して fail しない

## T-03: typecheck と test が green であることを確認する

- [x] `bun run typecheck` が成功する
- [x] `bun run test` が成功する（T-02 の新規テストを含め全件 pass）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が exit 0 で完了する
- 既存テストに regression がない
