## 1. DynamicContext 型と収集関数

- [x] 1.1 `src/git/dynamic-context.ts` に `DynamicContext` インターフェースを定義する。フィールド: `gitLog: string`, `diffStat: string`, `specsList: string[]`, `changesList: string[]`
- [x] 1.2 同ファイルに `collectDynamicContext(cwd: string, branch: string): Promise<DynamicContext>` を実装する。`node:child_process` の `execFile` を使用し、`src/adapter/` からは import しない
  - `git log main..HEAD --oneline -n 20` → `gitLog`
  - `git diff main..HEAD --stat` → `diffStat`
  - `openspec/specs/` 配下の `.md` ファイル一覧を `fs.readdir` で取得 → `specsList`
  - `openspec/changes/` 配下のディレクトリ一覧を `fs.readdir` で取得（`archive` を除外）→ `changesList`
  - 各コマンド/読み取りが失敗した場合は空文字列/空配列にフォールバック。関数は throw しない

## 2. StepContext / PipelineDeps への追加

- [x] 2.1 `src/core/types.ts` の `StepContext` (L17) に `dynamicContext?: DynamicContext` を追加する（import も追加）
  - `PipelineDeps` は `extends StepContext` なので自動的に継承される
  - 既存の StepContext 構築箇所は optional のため変更不要

## 3. CommandRunner での注入

- [x] 3.1 `src/core/command/runner.ts` の `execute()` メソッド内、`buildDeps()` 呼び出し後（L105 付近）に `collectDynamicContext()` を呼び出し、`deps.dynamicContext` に設定する
  - `collectDynamicContext(workspace.cwd, jobState.branch ?? "main")` を使用
  - collect 自体が throw した場合も catch して `deps.dynamicContext` を undefined のままにする（pipeline を止めない）

## 4. AgentRunContext への追加と転送

- [x] 4.1 `src/core/port/agent-runner.ts` の `AgentRunContext` (L25) に `dynamicContext?: DynamicContext` を追加する（import も追加）
- [x] 4.2 `src/core/step/executor.ts` の `runAgentStep()` (L108-120) で ctx 組み立てに `dynamicContext: deps.dynamicContext` を含める
- [x] 4.3 `src/adapter/claude-code/agent-runner.ts` の `run()` (L85-97) で `stepCtx: StepContext` に `dynamicContext: ctx.dynamicContext` を含める
- [x] 4.4 `src/adapter/managed-agent/agent-runner.ts` の `runPollingStyle()` (L261-273) で `stepCtx: StepContext` に `dynamicContext: ctx.dynamicContext` を含める

## 5. buildMessage での動的コンテキスト利用

- [x] 5.1 `src/prompts/propose-system.ts` の `buildInitialMessage()` を拡張する。`dynamicContext?: DynamicContext` をオプション引数で受け取り、`specsList` と `changesList` が存在する場合にリポジトリコンテキストセクションを追加する。undefined の場合はセクションを省略
- [x] 5.2 `src/core/step/propose.ts` の `buildMessage()` で `deps.dynamicContext` を `buildInitialMessage()` に渡す
- [x] 5.3 `src/core/step/implementer.ts` の `buildImplementerInitialMessage()` を拡張する。opts に `dynamicContext?: DynamicContext` を追加し、`gitLog` と `diffStat` が存在する場合にセクションを追加する
- [x] 5.4 `src/core/step/implementer.ts` の `buildMessage()` で `deps.dynamicContext` を opts に渡す
- [x] 5.5 `src/core/step/code-review.ts` の `buildCodeReviewInitialMessage()` を拡張する。opts に `dynamicContext?: DynamicContext` を追加し、`diffStat` が存在する場合にセクションを追加する
- [x] 5.6 `src/core/step/code-review.ts` の `buildMessage()` で `deps.dynamicContext` を opts に渡す

## 6. テスト

- [x] 6.1 `collectDynamicContext()` のユニットテスト: 正常時に git コマンドの出力をパースして正しい型を返すこと
- [x] 6.2 `collectDynamicContext()` のユニットテスト: git コマンドが失敗した場合にフォールバック値（空文字列/空配列）を返すこと
- [x] 6.3 `collectDynamicContext()` のユニットテスト: `openspec/specs/` や `openspec/changes/` が存在しない場合に空配列を返すこと
- [x] 6.4 `collectDynamicContext()` のユニットテスト: `changesList` が `archive` ディレクトリを除外すること
- [x] 6.5 propose の `buildInitialMessage()` テスト: dynamicContext あり/なしで正しく動作すること
- [x] 6.6 implementer の `buildImplementerInitialMessage()` テスト: dynamicContext あり/なしで正しく動作すること
- [x] 6.7 code-review の `buildCodeReviewInitialMessage()` テスト: dynamicContext あり/なしで正しく動作すること
- [x] 6.8 型チェック: `bun run typecheck` が green であること
- [x] 6.9 全テスト: `bun run test` が green であること
