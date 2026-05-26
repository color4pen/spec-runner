# Tasks: silent-exit-keepalive

## [x] Task 1: KeepAlive class の実装

**ファイル**: `src/core/lifecycle/keepalive.ts` (新規)

- `KeepAlive` class を実装:
  - `acquire()`: 長寿命 `setInterval(() => {}, 0x7FFFFFFF)` を登録。idempotent (既に active なら no-op)
  - `release()`: `clearInterval()` で timer を解放。idempotent (既に released なら no-op)
  - `get isActive(): boolean`: timer が active かどうか
- export: named export (`export class KeepAlive`)

**テスト**: `src/core/lifecycle/__tests__/keepalive.test.ts` (新規)
- acquire → isActive === true
- release → isActive === false
- acquire 2回 → idempotent (timer は 1 つ)
- release 2回 → 安全 (error なし)
- acquire → release → acquire → 再取得可能

**依存**: なし (standalone module)

---

## [x] Task 2: ExitGuard の実装

**ファイル**: `src/core/lifecycle/exit-guard.ts` (新規)

- `registerExitGuard(repoRoot: string)` 関数を実装:
  - `process.on("beforeExit", ...)` を登録
  - handler 内で `.specrunner/jobs/*.json` を scan
  - `status === "running"` の job を `awaiting-resume` に遷移
  - warning を stderr に出力: `[specrunner] warn: process exiting with running job <jobId>, transitioning to awaiting-resume`
  - `fired` boolean guard で一度だけ実行
  - handler 内のすべての I/O を try/catch で包む (best-effort)
- `JobStateStore` を使って状態を読み書きする
- export: named export (`export function registerExitGuard`)

**テスト**: `src/core/lifecycle/__tests__/exit-guard.test.ts` (新規)
- running job が存在する場合 → awaiting-resume に遷移
- running job が存在しない場合 → 何もしない
- handler が 2 回呼ばれた場合 → 2 回目は no-op (fired guard)
- I/O error 発生時 → error を飲み込み crash しない

**依存**: Task 1 不要 (独立)。`JobStateStore` を使用。

---

## [x] Task 3: Pipeline diagnostic logger の実装

**ファイル**: `src/core/lifecycle/diagnostic.ts` (新規)

- `logPipelineDiag(point: string, detail?: string)` 関数を実装:
  - `process.env["SPECRUNNER_DEBUG"]` に `"pipeline"` が含まれるかチェック
  - 含まれない場合は即 return (ゼロ overhead)
  - 含まれる場合は stderr に `[pipeline-diag <ISO timestamp>] <point>: <detail>` を出力
- export: named export (`export function logPipelineDiag`)

**テスト**: `src/core/lifecycle/__tests__/diagnostic.test.ts` (新規)
- `SPECRUNNER_DEBUG` 未設定 → 出力なし
- `SPECRUNNER_DEBUG=pipeline` → stderr 出力あり
- `SPECRUNNER_DEBUG=pipeline,other` → stderr 出力あり
- `SPECRUNNER_DEBUG=other` → 出力なし
- detail あり/なし の出力フォーマット

**依存**: なし (standalone module)

---

## [x] Task 4: KeepAlive を CommandRunner に統合

**ファイル**: `src/core/command/runner.ts` (変更)

- `execute()` メソッドを変更:
  - `prepare()` 成功後、`initVerboseLog` 後に `KeepAlive` を生成・acquire
  - 既存の pipeline 実行・teardown 処理を `try/finally` で包み、`finally` で `keepAlive.release()` を呼ぶ
  - 既存の return 文より前に release が実行されることを保証

変更イメージ:
```typescript
// After initVerboseLog
const keepAlive = new KeepAlive();
keepAlive.acquire();

try {
  // Step 2: setupWorkspace
  // ... existing code ...
  // Step 5: runPipeline
  // ... existing code ...
  // Step 7: teardown
  // ... existing code ...
  return exitCode;
} finally {
  keepAlive.release();
}
```

**テスト**: 既存テストが green であること。追加の unit test は不要 (KeepAlive 自体は Task 1 でテスト済み、統合は Task 12 でカバー)。

**依存**: Task 1

---

## [x] Task 5: KeepAlive を finish orchestrator に統合

**ファイル**: `src/core/finish/orchestrator.ts` (変更)

- `runFinishOrchestrator()` 関数の冒頭で `KeepAlive` を生成・acquire
- 既存処理を `try/finally` で包み、`finally` で `keepAlive.release()` を呼ぶ
- early return (already archived, dry-run) の前に acquire するか、early return パスでは acquire しないかを判断 → **early return パスでは acquire 不要** (silent exit リスクなし)。acquire は `resolveTarget` + state load の後、実質的なフェーズ開始前に配置。

**テスト**: 既存テストが green であること。

**依存**: Task 1

---

## [x] Task 6: ExitGuard を CLI entry points に統合

**ファイル**: `src/cli/run.ts`, `src/cli/resume.ts`, `src/cli/finish.ts` (変更)

- 各ファイルの core 関数 (`runRunCore`, `runResumeCore`, finish handler) の冒頭で `registerExitGuard(cwd)` を呼ぶ
- `registerExitGuard` は idempotent ではない (複数登録で複数回実行される可能性) が、process lifecycle 上 1 command = 1 process なので問題なし

**テスト**: 既存テストが green であること。

**依存**: Task 2

---

## [x] Task 7: Diagnostic log を 13 境界ポイントに配置

**ファイル**:
- `src/core/pipeline/pipeline.ts` (変更) — 6 ポイント
- `src/core/step/executor.ts` (変更) — 4 ポイント
- `src/adapter/claude-code/agent-runner.ts` (変更) — 3 ポイント

各ポイントに `logPipelineDiag()` 呼び出しを追加:

| # | Point ID | ファイル | 配置位置 |
|---|---|---|---|
| 1 | `pipeline:run:entry` | pipeline.ts | `run()` の先頭 |
| 2 | `pipeline:step:pre-execute` | pipeline.ts | `executor.execute(step, ...)` の直前 |
| 3 | `pipeline:step:post-execute` | pipeline.ts | `executor.execute(step, ...)` の直後 (catch 後含む) |
| 4 | `pipeline:transition:resolved` | pipeline.ts | transition lookup 結果取得後 |
| 5 | `pipeline:terminal` | pipeline.ts | `nextStep === "end" \|\| "escalate"` の分岐内 |
| 6 | `pipeline:loop:exhausted` | pipeline.ts | loop exhaustion 検出時 |
| 7 | `executor:step:dispatch` | executor.ts | `runStepInternal()` の kind 判定直後 |
| 8 | `executor:agent:pre-run` | executor.ts | `this.runner.run(ctx)` の直前 |
| 9 | `executor:agent:post-run` | executor.ts | `this.runner.run(ctx)` の直後 |
| 10 | `executor:commit:pre` | executor.ts | `commitAndPush()` の直前 |
| 11 | `executor:commit:post` | executor.ts | `commitAndPush()` の直後 |
| 12 | `query:start` | agent-runner.ts | `this.queryFn()` 呼び出し直前 |
| 13 | `query:complete` | agent-runner.ts | `for await` ループ完了直後 |

各ポイントの `detail` には step 名・outcome・transition 先など、デバッグに有用な情報を含める。

**テスト**: `SPECRUNNER_DEBUG=pipeline` を設定した状態で各ポイントが stderr に出力されることを確認。既存テストが green であること。

**依存**: Task 3

---

## [x] Task 8: Agent tool redirect の実装

**ファイル**: `src/adapter/claude-code/agent-runner.ts` (変更)

### Step 8a: `disallowedTools` の検証と実装

queryOptions に `disallowedTools: ["Agent", "Task"]` を追加:

```typescript
const queryOptions: Record<string, unknown> = {
  cwd,
  allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
  disallowedTools: ["Agent", "Task"],   // ← 追加
  permissionMode: "bypassPermissions",
  // ...
};
```

実機検証:
1. SDK が `disallowedTools` option をエラーなく受け付けるか
2. LLM の init tools list から `Task` / `Agent` が除外されるか
3. LLM が Agent tool を呼ばなくなるか

### Step 8b: `disallowedTools` が無効な場合の fallback

`disallowedTools` が効かない場合、以下の代替を順に検証:

**(b-1) `agents` option に no-op handler を登録**:
```typescript
// SDK が agents option をサポートする場合
const agentRedirectCounter = { count: 0 };
queryOptions["agents"] = {
  Agent: {
    handler: async () => {
      agentRedirectCounter.count++;
      if (agentRedirectCounter.count > 3) {
        abortController.abort();
      }
      return {
        text: "Subagent invocation is not available in this environment. "
            + "Use Read, Grep, Edit, Bash, Write, and Glob tools directly "
            + "to complete the task yourself.",
      };
    },
  },
};
```

**(b-2) additionalInstructions にルール追加** (常に併用):
```typescript
// buildAdditionalInstructions の出力に追記
const agentBlockInstruction =
  "IMPORTANT: Do not use the Agent or Task tool. These tools are not available. "
  + "Complete all tasks yourself using Read, Grep, Edit, Bash, Write, and Glob tools directly.";
```

### Step 8c: redirect counter を stream 監視で実装 (最終 fallback)

`disallowedTools` も `agents` option も効かない場合、`for await` ループ内で `isToolUse` を使い Agent/Task の呼び出しを検出:

```typescript
for await (const message of messages) {
  emitToolProgress(message, ctx.emit, step.name);
  // Agent/Task tool 検出
  if (isToolUse(message)) {
    const toolName = extractToolName(message);
    if (toolName === "Agent" || toolName === "Task") {
      agentRedirectCounter.count++;
      if (agentRedirectCounter.count > 3) {
        abortController.abort();
        break;
      }
    }
  }
  if (message.type === "result") {
    lastResult = message as SDKResultMessage;
  }
}
```

注意: stream 監視は SDK が内部で hang する場合には効かない。最終 safety net は timeout。

**テスト**: `src/adapter/claude-code/__tests__/agent-redirect.test.ts` (新規)
- `disallowedTools` が queryOptions に含まれることを確認
- redirect message の文言テスト
- redirect counter が 3 回超過で abort されることを確認 (agents option 使用時)

**依存**: なし (独立して実装可能)

---

## [x] Task 9: additionalInstructions に Agent tool 禁止ルール追加

**ファイル**: `src/adapter/shared/prompt-builder.ts` (変更)

- `buildAdditionalInstructions()` の出力に Agent/Task tool 使用禁止の指示を追加
- 全 step 共通で適用 (step 名による分岐不要)

追加する文言:
```
Do not use the Agent or Task tool. These tools are not available in this environment.
Complete all tasks yourself using the available tools directly.
```

**テスト**: 既存の `prompt-builder.test.ts` に assertion 追加。

**依存**: なし

---

## [x] Task 10: 統合テスト — KeepAlive + Pipeline

**ファイル**: `src/core/lifecycle/__tests__/keepalive-integration.test.ts` (新規)

- KeepAlive が active な間に pipeline step 遷移が完了することを検証
- mock executor を使い、step 間の async gap で process が exit しないことを検証
- KeepAlive release 後に正常 exit することを検証
- step timeout 発火時に KeepAlive が release され process が exit/escalate することを検証

**依存**: Task 1, Task 4

---

## [x] Task 11: 統合テスト — Agent redirect

**ファイル**: `src/adapter/claude-code/__tests__/agent-redirect-integration.test.ts` (新規)

- mock queryFn が Agent tool_use を含む stream を返した場合の挙動を検証
- redirect counter 超過で abort されることを検証
- 正常な tool 使用 (Read, Bash 等) が影響を受けないことを検証

**依存**: Task 8

---

## [x] Task 12: 既存テスト green 確認

`bun run typecheck && bun run test` を実行し、全テストが green であることを確認。

**依存**: Task 1-11 すべて

---

## [x] Task 13: ドキュメント更新

**ファイル**:
- `specrunner/project.md` (変更): lifecycle binding 設計の概要を 1 段落追記
  - 「spec-runner は pipeline / process lifecycle binding (KeepAlive sentinel timer) を使い、Bun event loop の premature exit を防止する。`SPECRUNNER_DEBUG=pipeline` で境界診断ログを有効化できる。」程度の簡潔な記述
- `README.md` (変更): troubleshooting セクションに追記
  - 「silent exit が起きた場合: `SPECRUNNER_DEBUG=pipeline bun run ...` で境界ログを有効化し、どの境界で exit したかを特定する」程度の簡潔な記述

**依存**: Task 12

---

## 実行順序

```
Task 1 (KeepAlive) ──┐
Task 2 (ExitGuard) ──┤
Task 3 (Diagnostic) ─┤
                      ├─→ Task 4 (Runner 統合) ──┐
                      ├─→ Task 5 (Finish 統合) ──┤
                      ├─→ Task 6 (CLI 統合) ─────┤
                      ├─→ Task 7 (Diag 配置) ────┤
                      │                           ├─→ Task 12 (Green 確認)
Task 8 (Agent redirect) ─┤                       │         │
Task 9 (Prompt rule) ────┤                       │         ├─→ Task 13 (Doc)
                          ├─→ Task 10 (統合 KeepAlive)     │
                          ├─→ Task 11 (統合 Agent) ────────┘
```

Task 1, 2, 3, 8, 9 は並列実行可能。
Task 4-7 は Task 1-3 完了後に並列実行可能。
Task 10, 11 は対応する統合先の完了後。
Task 12 は全実装完了後。
Task 13 は Task 12 完了後。
