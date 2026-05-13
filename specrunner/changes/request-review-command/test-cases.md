# Test Cases: request-review-command

## Summary

`specrunner request review <file>` の architect レビューコマンド実装に対するテストシナリオ。
stateless one-shot コマンドとして、CLI 統合・フォーマット検証・レビュー実行・出力制御・エラー処理の各側面を網羅する。

---

## TC-01: コマンド登録

- **Category**: CLI Integration
- **Priority**: must
- **Source**: req#1, T-03

**GIVEN** `specrunner` が起動できる状態である  
**WHEN** `specrunner request review --help` を実行する  
**THEN** `request review <file> [--json]` の使い方が USAGE に表示される

---

## TC-02: positional 引数なしでのコマンド呼び出し

- **Category**: CLI Integration
- **Priority**: must
- **Source**: req#1, T-03

**GIVEN** `specrunner` が起動できる状態である  
**WHEN** `specrunner request review` を引数なしで実行する  
**THEN** 必須引数不足のエラーが表示され、exit code 非ゼロで終了する

---

## TC-03: 存在するファイルを指定して正常実行（デフォルトモード）

- **Category**: Review Execution
- **Priority**: must
- **Source**: req#1, req#3, req#9, design.md

**GIVEN** 有効な request.md フォーマットのファイルが存在する  
**WHEN** `specrunner request review <file>` を実行する  
**THEN**
- stdout にエージェントの markdown レビュー全文が出力される
- `## Findings Summary` テーブルが出力に含まれる
- `## Verdict: <approve|needs-discussion|reject>` 行が含まれる
- 末尾に ` ```json ` ブロックが含まれる

---

## TC-04: verdict が approve のとき exit code 0 で終了する

- **Category**: Verdict & Exit Code
- **Priority**: must
- **Source**: req#10

**GIVEN** 要件が明確でリスクが低い request.md がある  
**WHEN** `specrunner request review <file>` を実行し、エージェントが `approve` を返す  
**THEN** exit code が `0` で終了する

---

## TC-05: verdict が needs-discussion のとき exit code 0 で終了する

- **Category**: Verdict & Exit Code
- **Priority**: must
- **Source**: req#10

**GIVEN** 設計判断が必要な HIGH finding が 1 件ある request.md がある  
**WHEN** `specrunner request review <file>` を実行し、エージェントが `needs-discussion` を返す  
**THEN** exit code が `0` で終了する（Unix 慣例準拠、非エラー）

---

## TC-06: verdict が reject のとき exit code 1 で終了する

- **Category**: Verdict & Exit Code
- **Priority**: must
- **Source**: req#10

**GIVEN** 要件矛盾・構造破綻を含む HIGH finding が複数ある request.md がある  
**WHEN** `specrunner request review <file>` を実行し、エージェントが `reject` を返す  
**THEN** exit code が `1` で終了する

---

## TC-07: --json フラグで構造化出力を得る

- **Category**: JSON Output
- **Priority**: must
- **Source**: req#11, req#12

**GIVEN** 有効な request.md ファイルが存在する  
**WHEN** `specrunner request review <file> --json` を実行する  
**THEN**
- stdout が valid JSON のみとなる
- JSON が `{ verdict, findings, summary }` のスキーマに準拠している
- `verdict` が `"approve"` / `"needs-discussion"` / `"reject"` のいずれかである
- `findings` が配列で、各要素が `{ severity: "HIGH"|"MEDIUM"|"LOW", category: string, description: string }` を持つ
- `summary` が文字列である
- stderr への余分な出力がない

---

## TC-08: --json フラグのときの exit code

- **Category**: JSON Output
- **Priority**: must
- **Source**: req#10, req#11

**GIVEN** `--json` フラグを指定して実行する  
**WHEN** verdict が `approve` または `needs-discussion` のとき  
**THEN** exit code が `0` で終了する  
**AND** verdict が `reject` のとき exit code が `1` で終了する

---

## TC-09: フォーマット不正な request.md のチェック

- **Category**: Format Validation
- **Priority**: must
- **Source**: req#2, T-02

**GIVEN** `## Meta` セクションが欠落した不正な request.md がある  
**WHEN** `specrunner request review <file>` を実行する  
**THEN**
- フォーマットエラーが stderr に出力される
- exit code が `1` で終了する
- LLM の query() は呼ばれない

---

## TC-10: 存在しないファイルのエラー処理

- **Category**: Error Handling
- **Priority**: must
- **Source**: design.md Error Handling, T-02

**GIVEN** 指定したパスにファイルが存在しない  
**WHEN** `specrunner request review /path/to/nonexistent.md` を実行する  
**THEN**
- ファイル読み込みエラーが stderr に出力される
- exit code が `1` で終了する

---

## TC-11: project.md が存在しないとき警告して続行

- **Category**: Error Handling
- **Priority**: must
- **Source**: design.md Error Handling (project.md 不在), req#6

**GIVEN** 有効な request.md が存在するが、`specrunner/project.md` が存在しない環境  
**WHEN** `specrunner request review <file>` を実行する  
**THEN**
- stderr に警告メッセージが出力される
- レビューは続行され、verdict が返る
- exit code はレビュー結果に従う（ファイル不在自体は fatal にならない）

---

## TC-12: config.json が存在しない（init 未実行）での動作

- **Category**: Error Handling
- **Priority**: must
- **Source**: design.md Config Resolution

**GIVEN** `specrunner init` を実行していない環境（config.json なし）  
**WHEN** `specrunner request review <file>` を実行する  
**THEN**
- エラー終了せずデフォルト設定（model: claude-opus-4-5, maxTurns: 30）でレビューが実行される
- verdict が返る

---

## TC-13: query() が失敗したときのエラー処理

- **Category**: Error Handling
- **Priority**: must
- **Source**: design.md Error Handling

**GIVEN** 有効な request.md が存在するが、SDK query() が例外を投げる状況（API エラー等）  
**WHEN** `specrunner request review <file>` を実行する  
**THEN**
- エラーメッセージが stderr に出力される
- exit code が `1` で終了する

---

## TC-14: エージェント出力の JSON パース失敗時のフォールバック

- **Category**: Error Handling
- **Priority**: must
- **Source**: T-02 2-b, design.md Output Parsing Strategy

**GIVEN** エージェントが末尾に有効な ```json ブロックを含まないテキストを返す  
**WHEN** `parseReviewOutput(text)` を呼ぶ  
**THEN**
- `verdict: "needs-discussion"` が返る
- `findings` に `{ severity: "HIGH", category: "parse-error", description: "Could not parse structured output from reviewer" }` が含まれる
- `summary` にテキストの先頭 500 文字が使われる
- 例外は投げられない

---

## TC-15: Pipeline machinery を使わないことの確認

- **Category**: Review Execution
- **Priority**: must
- **Source**: req#3, design.md

**GIVEN** `executeReview` の実装コード  
**WHEN** コードを静的に確認する  
**THEN**
- `StepExecutor` / `AgentStep` / `JobState` をインポートまたは使用していない
- `query()` が直接呼ばれている

---

## TC-16: Verdict 型が pipeline の Verdict と独立定義されている

- **Category**: Type Safety
- **Priority**: must
- **Source**: req#8, T-02 2-a

**GIVEN** `src/core/command/request-review.ts` の型定義  
**WHEN** コードを静的に確認する  
**THEN**
- `RequestReviewVerdict = "approve" | "needs-discussion" | "reject"` が定義されている
- pipeline の `Verdict` 型（`"approved" | "needs-fix" | ...`）とは別ファイル・別型で定義されている

---

## TC-17: unit test - parseReviewOutput 正常系

- **Category**: Unit Test
- **Priority**: must
- **Source**: T-04

**GIVEN** 末尾に有効な ```json ブロックを含むエージェント出力テキスト  
**WHEN** `parseReviewOutput(text)` を呼ぶ  
**THEN**
- `verdict` / `findings` / `summary` が正しく抽出される
- `verdict` が `"approve"` | `"needs-discussion"` | `"reject"` のいずれかである

---

## TC-18: unit test - parseReviewOutput 無効な verdict のフォールバック

- **Category**: Unit Test
- **Priority**: must
- **Source**: T-04

**GIVEN** ```json ブロックに `"verdict": "unknown"` が含まれるテキスト  
**WHEN** `parseReviewOutput(text)` を呼ぶ  
**THEN** fallback の `needs-discussion` verdict が返る

---

## TC-19: unit test - verdictToExitCode

- **Category**: Unit Test
- **Priority**: must
- **Source**: T-04, req#10

**GIVEN** `verdictToExitCode` 関数  
**WHEN** `"approve"` を渡す → `0`、`"needs-discussion"` を渡す → `0`、`"reject"` を渡す → `1`  
**THEN** それぞれ期待する exit code が返る

---

## TC-20: unit test - buildInitialMessage のタグ構造

- **Category**: Unit Test
- **Priority**: must
- **Source**: T-04, T-02 2-d

**GIVEN** `buildInitialMessage(requestContent, projectContext)` 関数  
**WHEN** 任意の requestContent と projectContext を渡す  
**THEN**
- `<project-context>` タグで projectContext が囲まれている
- `<request>` タグで requestContent が囲まれている

---

## TC-21: allowedTools が Read / Grep / Glob に限定される

- **Category**: Review Execution
- **Priority**: should
- **Source**: req#4, design.md query() Invocation Pattern

**GIVEN** `executeReview` の実装コード  
**WHEN** query() 呼び出し時の allowedTools を確認する  
**THEN** `["Read", "Grep", "Glob"]` の read-only ツールセットが指定されている

---

## TC-22: config.json に request-review の model 設定があるとき上書きされる

- **Category**: Config Resolution
- **Priority**: should
- **Source**: design.md Config Resolution, T-02 2-e

**GIVEN** config.json の steps に `request-review.model: "claude-sonnet-4-5"` が設定されている  
**WHEN** `specrunner request review <file>` を実行する  
**THEN** 指定されたモデルでレビューが実行される（デフォルトの claude-opus-4-5 ではない）

---

## TC-23: request validate と request review でフォーマット検証の挙動が一致する

- **Category**: Format Validation
- **Priority**: should
- **Source**: req#2, design.md

**GIVEN** フォーマット不正な request.md ファイル  
**WHEN** `specrunner request validate <file>` と `specrunner request review <file>` をそれぞれ実行する  
**THEN** フォーマットエラーの内容・形式が一致している（同じ `parseRequestMdContent` を使用）

---

## TC-24: default モードの stdout にマークダウンが含まれる

- **Category**: Review Execution
- **Priority**: should
- **Source**: design.md Output Behavior

**GIVEN** 有効な request.md ファイルが存在する  
**WHEN** `specrunner request review <file>`（--json なし）を実行する  
**THEN**
- stdout に markdown 形式のレビューが出力される
- テキスト出力の中に末尾の JSON ブロックも含まれる

---

## TC-25: --json モードの stdout に markdown が混在しない

- **Category**: JSON Output
- **Priority**: should
- **Source**: design.md Output Behavior, req#11

**GIVEN** 有効な request.md ファイルが存在する  
**WHEN** `specrunner request review <file> --json` を実行する  
**THEN**
- stdout が JSON のみであり、markdown テキストが含まれない
- `JSON.parse(stdout)` が成功する

---

## TC-26: レビュー出力にレビュー観点が含まれる

- **Category**: Review Execution
- **Priority**: should
- **Source**: req#6

**GIVEN** 有効な request.md ファイルが存在する  
**WHEN** `specrunner request review <file>` を実行する  
**THEN** stdout の出力が以下の観点を含む：
- 要件の明確性・網羅性への言及
- スコープ評価への言及
- 既存アーキテクチャとの整合性への言及
- リスク評価への言及

---

## TC-27: system prompt ファイルが独立した TypeScript モジュールとして存在する

- **Category**: Code Structure
- **Priority**: must
- **Source**: req#5, T-01

**GIVEN** 実装後のファイルシステム  
**WHEN** `src/prompts/request-review-system.ts` の存在を確認する  
**THEN**
- ファイルが存在する
- `REQUEST_REVIEW_SYSTEM_PROMPT` がエクスポートされている
- system prompt に architect レビュープロセスの 6 ステップが含まれている

---

## TC-28: delta spec ファイルが存在する

- **Category**: Documentation
- **Priority**: must
- **Source**: T-05

**GIVEN** 実装後のファイルシステム  
**WHEN** `specrunner/changes/request-review-command/delta-spec/cli-commands.md` を確認する  
**THEN**
- ファイルが存在する
- `R-request-review-command` 要件が ADDED として記載されている

---

## TC-29: bun run typecheck が green

- **Category**: Build
- **Priority**: must
- **Source**: req 受け入れ基準, T-04

**GIVEN** 実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーがゼロで終了する

---

## TC-30: bun run test が green

- **Category**: Build
- **Priority**: must
- **Source**: req 受け入れ基準, T-04

**GIVEN** 実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** `request-review.test.ts` を含む全テストが通過する

---

## TC-31: query() の subtype が success 以外のときエラー処理

- **Category**: Error Handling
- **Priority**: should
- **Source**: T-02 2-e step 8, design.md

**GIVEN** query() が subtype: "error" の result message を返す  
**WHEN** `executeReview` がその result を受け取る  
**THEN**
- エラー内容が stderr に出力される
- exit code が `1` で返る

---

## TC-32: request.ts を変更しないこと

- **Category**: Code Structure
- **Priority**: must
- **Source**: design.md Modified Files

**GIVEN** 実装後の git diff  
**WHEN** `src/core/command/request.ts` の変更を確認する  
**THEN** `src/core/command/request.ts` は変更されていない
