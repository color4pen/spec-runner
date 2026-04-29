# Implementer Decisions

## 2026-04-29

- `StepRun` を `StepResult` に代わる新スキーマとして定義する :: 設計 D1 の通り `attempt / sessionId / outcome / startedAt / endedAt` フィールドを持ち、後方互換 normalization を load 時に行う
- `JobStateStore` の `load()` で旧 schema normalization を行い、`src/state/store.ts` の関数群は内部委譲を維持する :: 既存テストが `src/state/store.ts` の export に直接依存しているため、呼び出し側の変更なしに委譲できる
- `StepOutcome` を `StepRun.outcome` のペイロード型として定義する :: `verdict / sessionId / findingsPath / fileContent / error` を持ち、既存 `StepResult` の情報をすべてカバーする
- `JobState.steps` の型を `Record<string, StepRun[]>` に変更する :: 旧 `StepResult[]` との後方互換は `load()` 内の normalization で担保する
- `src/state/helpers.ts` の `pushStepResult` / `getLatestStepResult` は新スキーマに対応するよう更新する :: 既存テストが依存しているため backward compat な型を維持しつつ内部ロジックを更新
- `src/state/schema.ts` の `validateJobState` は `StepRun[]` 形式の steps を受け入れるよう更新する :: normalization logic を jobstatestore.load() に集約し schema.ts の validateJobState は型整合のみ担当
- `Step` interface は `buildMessage / resultFilePath / parseResult / agent / name / toolHandlers?` を持つ plain interface として定義する :: 設計 D2 の通り class ではなく interface
- `StepExecutor` を新設して既存 3 step の共通 I/O lifecycle を集約する :: 設計 D3 の通り、SessionClient は注入せず PipelineDeps を引き続き受け取る（adapter 層への移行は非 scope）
- `StepExecutor` は `PipelineDeps` を constructor で受け取る形を採用する :: adapter 層 / port interface 分離（D7 完全実装）は本 change の Non-Goals。deps 注入で既存テストとの互換を保つ
- `EventBus` は同期 emit の最小実装とし、subscriber 0 で merge する :: 設計 D6 の reservation seat 意義。subscriber は次 request
- `Pipeline` class は transition table 駆動の state machine として実装する :: 設計 D5。既存 `runLoopUntil` の stdout フォーマットを bit-for-bit 維持する
- `src/core/session.ts` の `getHandler` 呼び出しを `ProposeStep.toolHandlers` 経由に変更する :: global registry 廃止後、tool handler は Step に同居。session.ts は `toolHandlers` を引数で受け取る形に変更
- `src/core/tools/registry.ts` を削除する :: global mutable state（制約違反）であり D4 の廃止対象。既存テストが resetRegistry を呼んでいる箇所は新スキームに合わせる
- 既存テスト `pipeline.test.ts` の `resetRegistry()` / `bootstrapTools()` 呼び出しを削除する :: global registry 廃止後は不要。テストの振る舞い assert は変更しない
- `src/core/loop.ts` は `Pipeline.run` に吸収後に削除する :: 設計 8.1a の通り。既存 `tests/core/loop.test.ts` は Pipeline class の対応テストに置き換え
- `src/core/session-runner.ts` は `StepExecutor` に吸収後に削除する :: 設計 8.1b の通り
- `src/core/steps/` ディレクトリは `src/core/step/` 移植後に削除する :: 設計 8.2 の通り
- `src/state/store.ts` は keep し内部実装を `JobStateStore` に委譲する :: 既存テストが多数依存するため完全削除しない。task 2.9 の通り
- fixture ファイルは `tests/fixtures/` ディレクトリに配置する :: task 2.6 の通り
- `STANDARD_TRANSITIONS` を `propose --success→ end, propose --error→ escalate` に修正する :: 仕様 4.4 が require した transition table に合わせる（propose には file-based verdict なし）
- `src/core/pipeline.ts` は Pipeline class への thin wrapper として書き直す。`runProposePipeline` は legacy `runProposeStep` に委譲する :: Pipeline.run がエラーを state に包むが、既存テスト TC-036/039/041 は re-throw を期待するため
- `session.ts` の `getHandler` fallback を削除し `toolHandlers` map のみを使う :: 設計 D4 の tool co-location 完結。global registry は廃止
- `steps/propose.ts` に `ProposeStep.toolHandlers` を `startProposeSession` に渡す変更を追加 :: session.ts が registry fallback を持たなくなったため、SSE handler dispatch が toolHandlers 経由のみになる
- `src/core/session-runner.ts` の削除は blocked とする :: `executor.ts` がまだ import しており、inlining なしには削除不可。既存テストが依存している
- `src/core/steps/spec-review.ts` と `propose.ts` は保持する :: `executor.ts` と `pipeline.ts` が依存しており、削除はより大きな adapter 層分離（Group 6）と合わせて行う

## 2026-04-29 Task 8.2-finish + Group 7 + Group 9

- `fetchSpecReviewResult` と `runSpecReviewStep` を `src/core/step/spec-review.ts` に移動する :: `executor.ts` が `fetchSpecReviewResult` を直接使っており、steps/ 削除には step/ 側への移植が必要。テスト backward compat も step/spec-review.js からの re-export で維持
- `runProposeStepLegacy` を `src/core/pipeline.ts` にインライン化する :: `runProposePipeline` は legacy mock client shape（beta.sessions.create / events.stream）を前提とするテストが依存。Pipeline class 経由にすると SessionClient port 呼び出しになり既存テストが壊れる。インライン化でエラー re-throw セマンティクスを維持
- `src/core/steps/` ディレクトリを削除する :: propose.ts と spec-review.ts の全 import を step/ / pipeline.ts に移植後、インポート 0 を確認して削除。テストの import パスも更新
- stdout snapshot テストの期待値は実際の pipeline.ts 出力フォーマットに合わせる :: `[iter N/M] starting <loop>` と `[iter N] <loop> verdict: X → Y` が正しいフォーマット（TC-027/028/029）
- TypeScript エラー数は変化なし（515 行）を確認する :: AbortController / fetch / @types/node 未設定による環境起因エラー。実装由来の新規エラーなし
- `openspec validate 2026-04-29-step-abstraction-refactor --strict` が pass する :: spec delta 5 種の構造が有効

## 2026-04-29 Group 6 + 8.1b/8.2 cleanup

- `SessionClient` port interface を `src/core/port/session-client.ts` に定義する :: core 層が adapter 層（Anthropic SDK）を直接参照しない。PipelineDeps.client を `Anthropic` から `SessionClient` に変更
- `GitHubClient` port interface を `src/core/port/github-client.ts` に定義する :: GitHub fetch logic を adapter 層に移動。core 層はインターフェースのみ参照
- `AnthropicSessionClient` を `src/adapter/anthropic/session-client.ts` に実装する :: @anthropic-ai/sdk の唯一の直接 import 場所。factory: `createAnthropicSessionClient(client: Anthropic)`
- `GitHubApiClient` を `src/adapter/github/github-client.ts` に実装する :: 既存 githubFetch ロジックを移植。factory: `createGitHubClient(fetchFn, token)`
- `src/core/completion.ts` は SDK import を除去し self-contained な `client: any` 型実装に書き直す :: adapter 再 export は 6.5 grep に引っかかるため不可。legacy steps/ が直接利用
- `src/core/session.ts` は SDK import を除去し local structural type `SdkClient` で代替する :: tests TC-018/025 が session.ts の特定文字列を grep するため、ファイル自体は保持
- `src/core/steps/propose.ts` と `spec-review.ts` は `deps.client as any` キャストを追加する :: PipelineDeps.client が SessionClient 型になったため、旧 SDK メソッド呼び出し側で any にキャスト
- `src/cli/run.ts`（composition root）で `createAnthropicSessionClient` を使い SessionClient を生成する :: Anthropic raw client を SessionClient port でラップして PipelineDeps に渡す
- `src/core/session-runner.ts` を削除する（8.1b 完了） :: importers ゼロを grep で確認後削除。tests は adapter パスに直接 import 済み
- `src/core/steps/propose.ts` + `spec-review.ts` は保持する（8.2 の scope 外） :: pipeline.ts と executor.ts が依存しており Group 6 scope では削除しない
- 6.5 grep 検証: `^import.*from "@anthropic-ai/sdk" in core/` = 0, `^import.*from "*/adapter/" in core/` = 0, `^import.*from "*/core/(pipeline|step|agent|event)" in adapter/` = 0
