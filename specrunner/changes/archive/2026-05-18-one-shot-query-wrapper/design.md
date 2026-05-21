# Design: one-shot-query-wrapper

## Context

`reviewer.ts` の `runReview()` は query() 呼び出しの boilerplate (config 解決 → maxTurns option 構築 → AbortController + timeout → for await loop → result 判定) を手書きしている。このパターンは `agent-runner.ts` の `ClaudeCodeRunner.run()` とほぼ同形。今後 one-shot コマンド (watch リスク評価, request create generator 等) が増えるたびに重複する。

## Design Decisions

### D1: queryOneShot — use case 非依存の薄いラッパー

`src/adapter/claude-code/query-one-shot.ts` に `queryOneShot()` 関数を新規作成する。

責務:
1. config 解決 (`getStepExecutionConfig` 経由、stepName = caller 指定)
2. maxTurns option の条件付き構築 (null → omit)
3. AbortController + timeout 連動 (finally で clearTimeout)
4. for await loop で SDK result 取得
5. success 判定 + `QueryOneShotResult` 構築

result は **raw text 中心**。構造化 parse (JSON block 抽出等) は caller の責務。理由: queryOneShot は汎用基盤であり、review / create / watch で parse 形式が異なる。

```ts
export interface QueryOneShotOptions {
  systemPrompt: string;
  prompt: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
  cwd?: string;
  stepName?: string;       // config 解決の key (default: "one-shot")
  model?: string;          // config chain の stepDefaults.model (default: "claude-sonnet-4-5")
}

export interface QueryOneShotResult {
  text: string;            // assistant の最終 text response (raw)
  sessionId?: string;      // SDK result の session_id (managed runtime では undefined — local only)
  turnCount?: number;      // 未使用 — SDK が turn count を返さないため将来拡張用
  stopReason?: string;     // SDKResultMessage.subtype ("success" / "error_during_execution" 等)
}
```

### D2: config 解決の reuse

`queryOneShot` 内部で既存 `getStepExecutionConfig()` を呼ぶ。resolution chain:

1. `config.steps[stepName]` (stepName は `opts.stepName ?? "one-shot"`)
2. `config.steps.defaults`
3. stepDefaults: `{ model: opts.model ?? "claude-sonnet-4-5", maxTurns: opts.maxTurns, timeoutMs: opts.timeoutMs }`
4. SDK default (null = unlimited / no timeout)

caller が `maxTurns` / `timeoutMs` を渡した場合は stepDefaults レベルで config chain に入る。config.json の step override が優先される。caller が渡さない場合は config default → SDK default (null) にフォールバック。

### D3: agent-runner.ts との分離

`ClaudeCodeRunner` (pipeline step lifecycle 用) と `queryOneShot` (one-shot コマンド用) は **統合しない**。

理由:
- `ClaudeCodeRunner.run()` は `AgentRunContext` (step / state / branch / slug / emit) を必要とする。one-shot コマンドにこれらは存在しない
- `ClaudeCodeRunner` は resultFilePath 読み出し、session resume、modelUsage 抽出、commit lifecycle 等の pipeline 固有ロジックを持つ
- 共通化すると AgentRunContext に optional field が増え、port の型安全性が劣化する

両者の共通コード (AbortController 構築、for await loop) は ~15 行。共通 helper 抽出のメリットがコスト (新ファイル + 間接参照) を上回らないため、現時点では **inline で重複を許容**する。将来 3 件目の one-shot consumer が生まれた時点で helper 抽出を検討する。

### D4: queryFn の DI

テスタビリティのため `queryOneShot` は optional な `queryFn` パラメータを受け取る (既存 `runReview` と同パターン)。production では `@anthropic-ai/claude-agent-sdk` の `query` がデフォルト。

```ts
export async function queryOneShot(
  opts: QueryOneShotOptions,
  config: SpecRunnerConfig,
  queryFn?: QueryFn,  // DI for test — defaults to SDK query
): Promise<QueryOneShotResult>;
```

`QueryFn` 型は `agent-runner.ts` で既に export されている同名の型を reuse する。

### D5: reviewer.ts の置き換え

`runReview()` の Steps 3-9 (config 解決 → query 実行 → result 取得) を `queryOneShot()` 呼び出しに置き換える。

Before (reviewer.ts L204-258): config 解決 + maxTurns option + AbortController + for await + success check + raw text 取得 = ~55 行

After: `queryOneShot()` 呼び出し + error handling = ~15 行

reviewer.ts に残る責務:
- project context 読み込み (L195-201)
- `buildInitialMessage()` でプロンプト構築
- `queryOneShot` 呼び出し
- `parseReviewOutput()` で構造化 JSON 抽出
- SpecRunnerError への変換

### D6: エラーハンドリング

`queryOneShot` は以下のケースで throw する:
- SDK result が success でない場合: `SpecRunnerError("QUERY_ONE_SHOT_FAILED", ...)`
- timeout の場合: `SpecRunnerError("QUERY_ONE_SHOT_TIMEOUT", ...)`

caller は try/catch で受け、use-case 固有のエラーメッセージに変換する。

## Files Changed

| Action | Path | Description |
|--------|------|-------------|
| CREATE | `src/adapter/claude-code/query-one-shot.ts` | queryOneShot 関数 + interfaces |
| MODIFY | `src/core/request/reviewer.ts` | runReview() を queryOneShot 経由に置き換え |
| MODIFY | `src/errors.ts` | QUERY_ONE_SHOT_FAILED / QUERY_ONE_SHOT_TIMEOUT error code 追加 |
| CREATE | `tests/unit/adapter/claude-code/query-one-shot.test.ts` | queryOneShot の unit test |
| MODIFY | `tests/unit/command/request-review.test.ts` | 既存 test の regression 確認 (変更不要の見込み — reviewer.ts の export interface は不変) |

## ADR Candidate

queryOneShot を agent-runner と統合せず別関数として分離する判断 (D3) は ADR 候補。
