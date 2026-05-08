## 1. request コマンドのコアロジック新設

- [x] 1.1 `src/core/command/request.ts` を新規作成し、`buildScaffoldTemplate()` を `src/core/command/create.ts` から移動する
- [x] 1.2 `executeTemplate(type: string): number` を実装する。`buildScaffoldTemplate()` をプレースホルダー引数（`title: "<タイトルを記入>"`, `slug: "<slug を記入>"`）で呼び、結果を stdout に書き出して 0 を返す
- [x] 1.3 `executeValidate(filePath: string): Promise<number>` を実装する。ファイルを読み込み `parseRequestMdContent()` を呼び、成功時は exit 0、SpecRunnerError 時は message + hint を stderr に書いて exit 1、ファイル不在時はエラーメッセージを stderr に書いて exit 1 を返す

## 2. CLI エントリポイントの更新

- [x] 2.1 `bin/specrunner.ts` から `import { runCreate }` と `case "create"` ブロック（L15, L138-202）を削除する
- [x] 2.2 `bin/specrunner.ts` に `case "request"` を追加し、第 2 引数で `template` / `validate` に分岐する。template は `--type` フラグをパースし、validate は第 3 引数をファイルパスとして受け取る。サブコマンド不明時は request usage を stderr に出し exit 2
- [x] 2.3 USAGE 文字列を更新する: `create` の行を削除し、`request template [--type <type>]` と `request validate <file>` の行を追加する。Create Options セクションを Request Options セクションに置き換える

## 3. ソースファイルの削除

- [x] 3.1 `src/core/command/create-dialog.ts` を削除する
- [x] 3.2 `src/core/command/create.ts` を削除する（`buildScaffoldTemplate()` は 1.1 で移動済み）
- [x] 3.3 `src/cli/create.ts` を削除する
- [x] 3.4 `src/prompts/create-dialog.ts` を削除する
- [x] 3.5 `src/state/draft-store.ts` を削除する
- [x] 3.6 `src/cli/spinner.ts` を削除する

## 4. テストファイルの削除

- [x] 4.1 `tests/unit/core/command/create-dialog.test.ts` を削除する
- [x] 4.2 `tests/unit/core/command/create.test.ts` を削除する
- [x] 4.3 `tests/unit/core/command/create-polish-and-resume.test.ts` を削除する
- [x] 4.4 `tests/unit/prompts/create-dialog.test.ts` を削除する
- [x] 4.5 `tests/unit/state/draft-store.test.ts` を削除する
- [x] 4.6 `tests/unit/cli/spinner.test.ts` を削除する

## 5. 部分削除

- [x] 5.1 `src/adapter/claude-code/message-types.ts` から `isToolUseStart` 関数（L70-88）を削除する。他の型ガード（`isResultMessage`, `isStreamEvent`, `isTextDelta`）は保持する
- [x] 5.2 `tests/unit/adapter/claude-code/message-types.test.ts` から TC-MT-005 の describe ブロック（`isToolUseStart()` テスト）と import の `isToolUseStart` を削除する

## 6. 新規テストの追加

- [x] 6.1 `tests/unit/core/command/request.test.ts` を新規作成する。以下をテストする:
  - `buildScaffoldTemplate()` が type / title / slug を埋め込んだテンプレートを返す
  - `executeTemplate("new-feature")` が stdout にテンプレートを書き出し 0 を返す
  - `executeTemplate("bug-fix")` が type フィールドに `bug-fix` を含むテンプレートを出力する
  - `executeValidate()` が有効な request.md で 0 を返す
  - `executeValidate()` が不正な request.md で 1 を返し stderr にエラーを書く
  - `executeValidate()` が存在しないファイルで 1 を返す

## 7. Delta Spec

- [x] 7.1 `openspec/changes/request-command-redesign/specs/cli-commands/spec.md` に `create` コマンド廃止と `request template` / `request validate` の Requirements を記述する

## 8. 検証

- [x] 8.1 `bun run typecheck` が green
- [x] 8.2 `bun run test` が green
- [x] 8.3 削除対象の 12 ファイル（6 ソース + 6 テスト）が存在しないことを確認する
