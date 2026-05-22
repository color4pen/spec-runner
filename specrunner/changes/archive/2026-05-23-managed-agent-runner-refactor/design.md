# Design: managed-agent-runner-refactor

## Summary

`agent-runner.ts` (633 行) の `runDesignStyle` / `runPollingStyle` を private stage メソッドに縦抽出し、ErrorInfo 組み立て + throw の定型を adapter 内 helper に集約する構造リファクタ。振る舞い・port 契約は不変。

## Background

`src/adapter/managed-agent/agent-runner.ts` は冒頭コメントで「4 stages に分割」と謳うが、実コードは全ロジックが `runDesignStyle` (184 行) / `runPollingStyle` (274 行) にインライン展開されている。ErrorInfo 構築 + throw の定型は 11-12 箇所で反復。resume fallback だけで ~76 行。テスト境界が不明瞭で、stage 単位の責務分離ができていない。

## Design Decisions

### D1: Stage 抽出戦略 — 各 style 内で縦に分割、横断統合しない

design と polling は完了判定（SSE end_turn vs polling idle）、resume fallback（polling のみ）、guard（design は verifyBranch + verifyChangeFolder、polling は requiresCommit + fetchResult）が根本的に異なる。横断統合すると条件分岐の海になり可読性が悪化するため、各 style 内で縦に割る。

**runDesignStyle** を以下の private stage に分割:

| Stage | 責務 | 行数目安 |
|-------|------|---------|
| `createDesignSession(ctx)` | agentId 解決 + session 作成 | ~20 |
| `streamWithPollingFallback(sessionId, ctx)` | SSE stream + terminated 判定 + polling fallback | ~50 |
| `verifyDesignArtifacts(ctx)` | branch 存在確認 + change folder 確認 | ~25 |

`runDesignStyle` 自体は上記 stage + follow-up + usage read + result 組み立ての薄い orchestrator (~25 行) になる。

**runPollingStyle** を以下の private stage に分割:

| Stage | 責務 | 行数目安 |
|-------|------|---------|
| `preparePollingMessage(ctx)` | agentId 解決 + stepCtx 組立 + enrichContext + buildMessage + push instruction 注入 + branch guard + preSessionHeadSha snapshot | ~60 |
| `createOrResumePollingSession(ctx, agentId, message)` | resume 試行 → fallback create → normal create + send | ~65 |
| `guardCommit(step, state, preHeadSha)` | requiresCommit guard (HEAD SHA 比較) | ~15 |
| `fetchResultFile(step, state, stepCtx)` | result file fetch + not-found error | ~20 |

`runPollingStyle` 自体は上記 stage + poll + timeout 判定 + follow-up + usage read + result 組み立ての薄い orchestrator (~35 行) になる。

poll 呼び出しは orchestrator に残す。理由: timeout 時の early return (`return { completionReason: "timeout", ... }`) が stage メソッド内にあると戻り値型が `AgentRunResult | void` に分裂し、caller の型ガードが冗長になる。

### D2: 共通 private メソッド — 真に重複している 3 つの定型のみ

| メソッド | 重複箇所 | 内容 |
|---------|---------|------|
| `resolveEffectiveTimeout(config, stepName, model)` | design fallback / polling / follow-up の 3 箇所 | `getStepExecutionConfig` → `timeoutMs > 0 ? timeoutMs : DEFAULT_POLL_TIMEOUT_MS` |
| `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` | design / polling の 2 箇所 | sendUserMessage + pollUntilComplete + warn on failure。呼び出し条件は caller が判断（design: `sseEndTurn && shouldRunFollowUp`、polling: `shouldRunFollowUp`） |
| `readSessionUsage(sessionId, model)` | design / polling の 2 箇所 | `getSessionUsage` → `Record<string, ModelUsage> | undefined` |

design の follow-up 実行条件（`sseEndTurn = !needsPollingFallback` で SSE end_turn のみ follow-up 実行）と polling の条件（常に shouldRunFollowUp）が異なる点は、共通メソッドではなく呼び出し元の if 文で吸収する。これが follow-up 共通化の最大の落とし穴（request.md 記載）への対処。

### D3: Error helper module — `src/adapter/managed-agent/error-helpers.ts`

adapter 内に新設。throw 本体は既存 `executor-helpers.throwWrappedError` / `attachStateAndRethrow` に委譲し再実装しない。coupling 方向（adapter→core）を維持。

| Helper | 集約対象 | 箇所数 |
|--------|---------|-------|
| `throwSessionCreateError(errMsg, stepName, state, context?)` | SESSION_CREATE_FAILED の ErrorInfo 構築 + throw | 5 |
| `throwCaughtAsWrapped(err, defaults, state)` | catch した error から code/message/hint 抽出 + デフォルト値で throw | 2 |
| `buildTimeoutResult(pollError, sessionId)` | POLL_TIMEOUT の AgentRunResult 構築 (throw ではなく return) | 2 |
| `throwPollError(pollResult, state, stepName?)` | poll 失敗の ErrorInfo 構築 + throw | 2 |

残り 4 箇所（terminated / branchNotSet / noCommitDetected / resultFileNotFound）は各 1 回出現で domain-specific な構築ロジックを持つため、無理にhelper 化せずインライン維持またはstage メソッド内に留める。

`executor-helpers.ts`（executor 寄り・`JobStateStore` 依存）には寄せない。理由: `ManagedAgentRunner` は `JobStateStore` を持たない（Design D3 stepcontext-type-separation）ため cohesion が崩れる。

### D4: リファクタ後のファイル構成

```
src/adapter/managed-agent/
├── agent-runner.ts       ← ~350 行 (633 → 縮小)
├── error-helpers.ts      ← NEW (~60 行)
├── ...（既存ファイル変更なし）
```

`agent-runner.ts` 内の class 構成:

```
ManagedAgentRunner
├── run()                              — dispatch (既存・変更なし)
├── useSseStrategy()                   — dispatch 判定 (既存・変更なし)
│
├── runDesignStyle()                   — thin orchestrator (名前・シグネチャ維持)
│   ├── createDesignSession()          — NEW private
│   ├── streamWithPollingFallback()    — NEW private
│   └── verifyDesignArtifacts()        — NEW private (既存 verify ロジックの stage 化)
│
├── runPollingStyle()                  — thin orchestrator (名前・シグネチャ維持)
│   ├── preparePollingMessage()        — NEW private
│   ├── createOrResumePollingSession() — NEW private
│   ├── guardCommit()                  — NEW private
│   └── fetchResultFile()             — NEW private
│
├── resolveEffectiveTimeout()          — NEW shared private
├── executeFollowUpTurn()              — NEW shared private
├── readSessionUsage()                 — NEW shared private
│
├── verifyBranchViaPort()              — 既存 private (変更なし)
└── verifyChangeFolderViaPort()        — 既存 private (変更なし)
```

## Scope

### In scope

- `src/adapter/managed-agent/agent-runner.ts` の内部構造変更
- `src/adapter/managed-agent/error-helpers.ts` の新設

### Out of scope

- `AgentRunner` interface / `SessionClient` port の契約変更
- `runDesignStyle` / `runPollingStyle` のメソッド名・シグネチャ変更
- `createManagedAgentRunner` / `ManagedAgentRunnerDeps` / `buildManagedGitPushInstruction` の変更
- managed runtime 以外（claude-code adapter 等）
- spec の method 名依存問題の是正（別 issue）

## Regression Risks

- **timeout fallback の二段ロジック**: `resolveEffectiveTimeout` に移す際、`timeoutMs > 0 ? timeoutMs : DEFAULT_POLL_TIMEOUT_MS` の条件を 1:1 で保つ
- **resume fallback の二重 catch**: `createOrResumePollingSession` 内で createSession 失敗と sendUserMessage 失敗の error code / message が異なる — 診断メッセージを変えない
- **`sseEndTurn = !needsPollingFallback` による follow-up 条件**: `streamWithPollingFallback` の戻り値で caller に伝搬。`executeFollowUpTurn` に条件を埋め込まない
- **design 側 verify の選択的 catch**: `verifyBranchViaPort` は warn 非 fatal、`verifyChangeFolderViaPort` は `CHANGE_FOLDER_NOT_FOUND` / `GITHUB_TOKEN_EXPIRED` のみ rethrow — warn と throw の振り分けを `verifyDesignArtifacts` に 1:1 で移す
- **`void completedAt`**: polling style の error path 参照を切らない
