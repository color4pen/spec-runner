# Tasks: codex-typed-outcome

## T-01: `CodexThread` interface に `outputSchema` option を追加

- [x] `src/adapter/codex/agent-runner.ts` の `CodexThread` interface を拡張:
  ```
  run(prompt: string, opts?: { signal?: AbortSignal; outputSchema?: unknown }): Promise<Turn>;
  ```
- [x] `TurnOptions` 相当の optional fields を `CodexThread.run()` の第 2 引数に追加（既存の `signal` はそのまま保持）

**Acceptance Criteria**:
- `CodexThread.run()` が `outputSchema` option を受け付ける型定義になっている
- 既存の `signal` option が保持されている
- `bun run typecheck` が green

## T-02: `ReportToolSpec` から outputSchema 用 JSON Schema を生成する helper

- [x] `src/adapter/codex/agent-runner.ts` 内（または shared module）に `buildOutputSchema(reportTool: ReportToolSpec): object` を追加
- [x] 実装: `toJSONSchema(object(reportTool.zodSchema))` を呼び出して JSON Schema object を返す（`report-tool.ts` の `toCustomToolSpec` と同じ変換を再利用）
- [x] import: `import { object, toJSONSchema } from "zod/v4-mini"` を使用

**Acceptance Criteria**:
- `buildOutputSchema(PRODUCER_REPORT_TOOL)` が `{ type: "object", properties: { ok: ..., reason: ..., status: ... }, required: ["ok"] }` 相当の JSON Schema を返す
- `bun run typecheck` が green

## T-03: main work ターンに `outputSchema` を注入

- [x] `CodexAgentRunner.run()` で `ctx.policy.reportTool` が set されている場合:
  - `buildOutputSchema(ctx.policy.reportTool)` で JSON schema を生成
  - `activeThread.run(fullPrompt, { signal: abortController.signal, outputSchema })` に渡す
- [x] `ctx.policy.reportTool` が未設定の場合は従来通り outputSchema なし（backward compat）

**Acceptance Criteria**:
- `reportTool` set 時に `thread.run()` の第 2 引数に `outputSchema` が含まれる
- `reportTool` 未設定時は `outputSchema` が含まれない

## T-04: `finalResponse` を parse して `toolResult` を構築

- [x] main work ターン完了後、`turn.finalResponse` を `JSON.parse` → `ctx.policy.reportTool.parseInput()` で validation
- [x] parse 成功（`parseResult.ok === true`）: `capturedToolResult = parseResult.value`
- [x] `JSON.parse` 失敗 or `parseInput` 失敗: `capturedToolResult` は `null` のまま（D4 follow-up retry へ）
- [x] `toolResult: null` 固定の既存コード（L275-276: `Frozen behavior: toolResult = null, followUpAttempts = 0`）を削除し、上記ロジックに置換

**Acceptance Criteria**:
- `finalResponse` が valid JSON かつ `parseInput` 成功 → `toolResult` が populated
- `finalResponse` が invalid → `toolResult` が `null`（follow-up retry に進む）
- frozen behavior のコメントと `toolResult: null` 固定コードが削除されている

## T-05: follow-up retry ループの実装

- [x] `capturedToolResult === null` かつ `ctx.policy.reportTool` set かつ main turn 成功時:
  - `DEFAULT_TOOL_RETRY`（または `ctx.policy.toolReportRetry`）の `maxAttempts` 回まで retry
  - 各 retry: `activeThread.run(retryPrompt, { signal, outputSchema })` で同一 thread に follow-up
  - retry prompt: `retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" })`
  - 各 retry 後に `turn.finalResponse` を parse → 成功なら break
- [x] retry 中の usage 加算: 既存 follow-up turn と同様の per-turn 加算ロジック
- [x] 全 retry 枯渇: `toolResult: null`, `followUpAttempts: maxAttempts`

**Acceptance Criteria**:
- parse 失敗時に最大 `maxAttempts` 回の retry が実行される
- retry 中に parse 成功したら即座に break
- 全 retry 枯渇後は `toolResult: null`, `followUpAttempts` = 実施回数
- usage が retry 分を含めて正しく加算される

## T-06: `postWorkPrompts` ターンには `outputSchema` を付けない

- [x] 既存の follow-up turns（`shouldRunFollowUp` + `postWorkPrompts`）のコードは `outputSchema` を渡さないことを確認
- [x] frozen behavior コメント（L180: `Frozen behavior: ctx.policy.reportTool is ignored — toolResult always null`）を削除

**Acceptance Criteria**:
- postWorkPrompts ターンの `thread.run()` 呼び出しに `outputSchema` が含まれない
- frozen behavior 関連の全コメントが削除されている（L10-13, L180, L275-276）

## T-07: 既存テストの更新

- [x] `tests/adapter/codex/agent-runner.test.ts` の `makeThread` helper に `outputSchema` サポートを追加（mock が option を受け取れるように）
- [x] 新規テスト追加:
  - `reportTool` set 時に `thread.run()` が `outputSchema` 付きで呼ばれる
  - `finalResponse` が valid JSON → `toolResult` populated, `followUpAttempts: 0`
  - `finalResponse` が invalid → follow-up retry 実行 → retry で valid JSON → `toolResult` populated, `followUpAttempts: 1`
  - 全 retry 枯渇 → `toolResult: null`, `followUpAttempts: maxAttempts`
  - `reportTool` 未設定時 → 従来通り `toolResult: null`（backward compat）
- [x] 既存テストが壊れないことを確認（`toolResult: null` を返す既存テストは `reportTool` 未設定なので影響なし）

**Acceptance Criteria**:
- 上記 5 パターンのテストが存在し green
- 既存テスト全件 green
- `bun run typecheck && bun run test` が green

## T-08: delta spec の生成

- [x] `specrunner/changes/codex-typed-outcome/specs/tool-driven-step-completion/spec.md` を作成
- [x] baseline の「Codex adapter の frozen behavior」MUST 要件を削除（`## Removed` セクション）
- [x] 新しい「Codex adapter の outputSchema 経由 typed outcome」要件を追加（`## Requirements` セクション）

**Acceptance Criteria**:
- delta spec が正しいパスに存在する
- 「Codex adapter の frozen behavior」要件が `## Removed` に記載されている
- 新しい要件が `## Requirements` に `SHALL` / `MUST` キーワード付きで記載されている
- 少なくとも 1 つの Scenario（Given/When/Then）が含まれている
