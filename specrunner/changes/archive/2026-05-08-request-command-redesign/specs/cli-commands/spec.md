## REMOVED Requirements

### Requirement: `specrunner create` は対話的に request.md を生成する（廃止）

`specrunner create` コマンドとその関連機能（対話 REPL、draft 永続化、スピナー、FINAL_DRAFT/SLUG_PROPOSAL マーカー検出）を廃止する。

**廃止理由**: Local Runtime ユーザーは Claude Code の対話 UI を利用できるため、specrunner が SDK 内部ストリームを消費して自前 REPL を構築する必要がない。テンプレート出力とバリデーションに特化した `request` サブコマンドグループに責務を移管する。

**削除対象**:
- `src/core/command/create-dialog.ts` — 対話 REPL 実装
- `src/core/command/create.ts` — create コアロジック（`buildScaffoldTemplate()` は request.ts に移動）
- `src/cli/create.ts` — CLI facade
- `src/prompts/create-dialog.ts` — 対話用プロンプトビルダー
- `src/state/draft-store.ts` — draft 永続化
- `src/cli/spinner.ts` — TTY スピナー
- `src/adapter/claude-code/message-types.ts#isToolUseStart` — tool_use 検出型ガード（create-dialog のみが使用）

## ADDED Requirements

### Requirement: `specrunner request template` は type に応じた request.md テンプレートを stdout に出力する

`specrunner request template [--type <type>]` は MUST 指定された type に対応する request.md テンプレートをプレースホルダー付きで stdout に出力し、exit code 0 で終了する。`--type` 省略時は `new-feature` をデフォルトとする。

テンプレートは `buildScaffoldTemplate()` をシングルソースとし、以下のセクションを SHALL 含む:
- `# <タイトルを記入>` — Level-1 見出し（プレースホルダー）
- `## Meta` — `type` と `slug` フィールド（slug はプレースホルダー）
- `## 背景` — 空セクション
- `## 要件` — 空セクション
- `## スコープ外` — 空セクション
- `## 受け入れ基準` — チェックリスト形式（`bun run typecheck && bun run test` が green を含む）
- `## Workflow Options` — `enabled: []`

#### Scenario: type 省略時にデフォルトテンプレートが出力される

- **WHEN** `specrunner request template` を引数なしで実行する
- **THEN** stdout に `- **type**: new-feature` を含む request.md テンプレートが出力される
- **AND** exit code 0 で終了する

#### Scenario: --type bug-fix でテンプレートが出力される

- **WHEN** `specrunner request template --type bug-fix` を実行する
- **THEN** stdout に `- **type**: bug-fix` を含む request.md テンプレートが出力される
- **AND** exit code 0 で終了する

#### Scenario: --type=spec-change でテンプレートが出力される

- **WHEN** `specrunner request template --type=spec-change` を実行する
- **THEN** stdout に `- **type**: spec-change` を含む request.md テンプレートが出力される

### Requirement: `specrunner request validate` は request.md のフォーマットを検証する

`specrunner request validate <file>` は MUST 指定されたファイルを読み込み、`parseRequestMdContent()` でパースを試み、成功時は exit code 0、失敗時は具体的なエラーメッセージを stderr に出力して exit code 1 で終了する。

ファイルが存在しない場合も SHALL exit code 1 でエラーメッセージを stderr に出力する。

#### Scenario: 有効な request.md を検証する

- **WHEN** title、type、slug が揃った正しい request.md を `specrunner request validate` に渡す
- **THEN** exit code 0 で終了する

#### Scenario: type が欠落した request.md を検証する

- **WHEN** Meta セクションに type がない request.md を渡す
- **THEN** stderr に `missing 'type' in Meta section` を含むエラーメッセージが出力される
- **AND** exit code 1 で終了する

#### Scenario: slug が欠落した request.md を検証する

- **WHEN** Meta セクションに slug がない request.md を渡す
- **THEN** stderr に `missing 'slug' in Meta section` を含むエラーメッセージが出力される
- **AND** exit code 1 で終了する

#### Scenario: ファイルが存在しない

- **WHEN** 存在しないファイルパスを `specrunner request validate` に渡す
- **THEN** stderr にファイル不在のエラーメッセージが出力される
- **AND** exit code 1 で終了する

#### Scenario: file 引数が省略された場合

- **WHEN** `specrunner request validate` を file 引数なしで実行する
- **THEN** stderr に usage を出力し exit code 2 で終了する

### Requirement: `specrunner request` のサブコマンドが不明な場合は usage を表示する

`specrunner request` に不明なサブコマンドまたはサブコマンドなしが渡された場合は MUST request 用の usage を stderr に出力し exit code 2 で終了する。

#### Scenario: サブコマンドなしで実行

- **WHEN** `specrunner request` をサブコマンドなしで実行する
- **THEN** stderr に `template` と `validate` の usage が出力される
- **AND** exit code 2 で終了する

#### Scenario: 不明なサブコマンド

- **WHEN** `specrunner request foobar` を実行する
- **THEN** stderr に usage が出力される
- **AND** exit code 2 で終了する

## MODIFIED Requirements

### Requirement: `specrunner` バイナリのサブコマンド一覧を更新する

USAGE 文字列から `create` コマンドの記述を削除し、`request template` / `request validate` の記述を追加する。`create` は SHALL NOT コマンドとして認識される（`Unknown command: create` で exit 2）。

#### Scenario: create コマンドが認識されない

- **WHEN** `specrunner create "description"` を実行する
- **THEN** stderr に `Unknown command: create` を含むメッセージが出力される
- **AND** exit code 2 で終了する

#### Scenario: USAGE に request サブコマンドが表示される

- **WHEN** `specrunner --help` を実行する
- **THEN** stdout に `request template` と `request validate` の記述が含まれる
- **AND** `create` の記述が含まれない
