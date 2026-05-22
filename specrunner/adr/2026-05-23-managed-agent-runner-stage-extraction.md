# ADR-20260523: ManagedAgentRunner を縦 stage 抽出 + adapter 内 error helper に集約する

**Date**: 2026-05-23
**Status**: accepted

## Context

`src/adapter/managed-agent/agent-runner.ts` は 633 行で、`runDesignStyle`（184 行）と `runPollingStyle`（274 行）の 2 メソッドが session 作成 / message 送信 / poll / fallback / follow-up / verify / fetch をすべてインライン展開していた。冒頭コメントは「4 stages に分割」と謳っていたが実コードは private stage メソッドへの切り出しがなく、テスト境界が不明瞭な状態だった。

加えて `ErrorInfo` 構築 + throw の定型が 11–12 箇所で反復しており、error-wrap パターンの変更が全箇所への追跡を強いる構造になっていた。

## Decision

### D1: Stage 抽出は各 style 内で縦に分割し、design/polling を横断統合しない

design と polling は表面的に似た名前の処理（session 作成・follow-up・usage read 等）を持つが、実体は根本的に異なる:

- **完了判定**: design = SSE `end_turn`、polling = polling idle
- **resume fallback**: polling のみ存在（3 段階: warn → fallback create → fallback send）
- **guard**: design = `verifyBranch` + `verifyChangeFolder`（selective catch）、polling = `requiresCommit` + `fetchResult`

横断統合すると条件分岐の海になり可読性が悪化するため、各 style 内で縦に割る。

**runDesignStyle** の stage 分割:
| Stage | 責務 |
|-------|------|
| `createDesignSession(ctx)` | agentId 解決 + session 作成 |
| `streamWithPollingFallback(sessionId, ctx)` | SSE stream + terminated 判定 + polling fallback |
| `verifyDesignArtifacts(ctx)` | branch 存在確認 + change folder 確認（selective catch 保持） |

**runPollingStyle** の stage 分割:
| Stage | 責務 |
|-------|------|
| `preparePollingMessage(ctx)` | agentId 解決 + stepCtx 組立 + enrichContext + buildMessage + branch guard + preSessionHeadSha snapshot |
| `createOrResumePollingSession(ctx, agentId, message)` | resume 試行 → fallback create → normal create + send |
| `guardCommit(step, state, preHeadSha)` | requiresCommit guard（HEAD SHA 比較） |
| `fetchResultFile(step, state, stepCtx)` | result file fetch + not-found error |

`runDesignStyle` / `runPollingStyle` 自体はメソッド名・シグネチャを維持したまま stage 組み立ての薄い orchestrator になる。poll 呼び出しは orchestrator に残す（理由: timeout 時の early return が stage 内にあると戻り値型が分裂し caller の型ガードが冗長になる）。

### D2: 真に重複している 3 つの定型のみを共通 private 化する

| メソッド | 重複箇所 | 内容 |
|---------|---------|------|
| `resolveEffectiveTimeout(config, stepName, model)` | design fallback / polling / follow-up の 3 箇所 | `getStepExecutionConfig` → `timeoutMs > 0 ? timeoutMs : DEFAULT_POLL_TIMEOUT_MS` |
| `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` | design / polling の 2 箇所 | sendUserMessage + pollUntilComplete + warn on failure |
| `readSessionUsage(sessionId, model)` | design / polling の 2 箇所 | `getSessionUsage` → usage record |

follow-up の実行条件（design: `sseEndTurn && shouldRunFollowUp`、polling: `shouldRunFollowUp` のみ）は共通メソッド内に埋め込まず、caller の if 文で吸収する。これが follow-up 共通化の最大の落とし穴への対処。

### D3: Error helper を adapter 内に新設し、throw 本体は executor-helpers に委譲する

`src/adapter/managed-agent/error-helpers.ts` を新設。`ErrorInfo` 構築 + throw の定型パターンを集約する。実体の throw は既存 `executor-helpers.throwWrappedError` / `attachStateAndRethrow` に委譲し再実装しない。

`executor-helpers.ts`（executor 寄り・`JobStateStore` 依存）には寄せない。`ManagedAgentRunner` は `JobStateStore` を持たないため cohesion が崩れる。coupling 方向（adapter → core）は維持。

| Helper | 集約対象 |
|--------|---------|
| `throwSessionCreateError(errMsg, stepName, state, context?)` | SESSION_CREATE_FAILED の ErrorInfo 構築 + throw（polling 側 5 箇所） |
| `throwSendMessageError(errMsg, stepName, state, context?)` | SESSION_SEND_MESSAGE_FAILED の ErrorInfo 構築 + throw |
| `throwCaughtAsWrapped(err, defaults, state)` | catch した error から code/message/hint 抽出 + デフォルト値で throw |
| `buildTimeoutResult(pollError, sessionId)` | POLL_TIMEOUT の AgentRunResult 構築（throw ではなく return） |
| `throwPollError(pollResult, state, stepName?)` | poll 失敗の ErrorInfo 構築 + throw |

design 側の SESSION_CREATE_FAILED（`createDesignSession`）は stepName なしで元のメッセージを保持する必要があるため、inline ErrorInfo 構築のまま残す。この非対称は `createDesignSession` の JSDoc に明記。

## Alternatives Considered

### Alternative 1: design/polling を横断統合する共通 run メソッドを作る

```ts
private async runStyle(ctx, prepareSession, guardFn, ...): Promise<AgentRunResult>
```

- **Pros**: コード量が最小
- **Cons**: 完了判定・resume fallback・guard の有無が style ごとに異なるため、引数に多数の option/callback が必要になり条件分岐の海になる。可読性が悪化し regression リスクが増す
- **Why not**: 設計上の共通性よりも実体の差異が大きい。縦抽出を選択

### Alternative 2: error helper を executor-helpers.ts に寄せる

- **Pros**: 既存ファイルへの追加で新設不要
- **Cons**: `executor-helpers.ts` は `JobStateStore` 依存を持つ executor 寄りのモジュール。`ManagedAgentRunner` から参照すると cohesion が崩れ、adapter/core の境界が曖昧になる
- **Why not**: coupling 方向（adapter → core）を保つため adapter 内新設を選択

### Alternative 3: error helper を agent-runner.ts 内の private static メソッドとして定義する

- **Pros**: ファイル分割なし
- **Cons**: `error-helpers.ts` の独立したテスト（`error-helpers.test.ts`）が書けない。将来 adapter 内の他クラスから参照できない
- **Why not**: testability と将来の reuse を考慮して独立モジュール化

## Consequences

### Positive

- `runDesignStyle` / `runPollingStyle` が薄い orchestrator になり、stage 単位で責務が明確になった
- `agent-runner.ts` が 633 → 618 行に縮小（combined: 618 + 89 = 707 行）
- `error-helpers.ts` が独立したユニットテストを持ち、ErrorInfo 構築パターンの変更が 1 箇所で済む
- resume fallback の二重 catch・sseEndTurn による follow-up 条件・verify の selective catch 等の regression 注意箇所が stage 内に局所化され、把握しやすくなった

### Negative

- Combined adapter サイズは +12%（垂直抽出リファクタでは method signature + JSDoc が増えるため必然的なトレードオフ）
- design 側 SESSION_CREATE_FAILED の inline ErrorInfo が残り、error helper の統一が完全ではない（design 側はメッセージ形式が polling 側と異なるため意図的）

### Known Debt

- `managed-agent-runtime/spec.md` が `ManagedAgentRunner.runDesignStyle(ctx)` / `runPollingStyle(ctx)` の internal method 名を明示参照している設計負債は本件では触らない（修正すると真の spec-change になり refactoring 型と自己矛盾）。別 issue 候補。
- design 側 `createDesignSession` の SESSION_CREATE_FAILED は inline ErrorInfo 構築のまま。`throwSessionCreateError` を raw message override 対応に拡張すれば統一できる。

## References

- Request: `specrunner/changes/managed-agent-runner-refactor/request.md`
- Design: `specrunner/changes/managed-agent-runner-refactor/design.md`
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（AgentRunner port の確立）
- Related: `specrunner/adr/2026-04-29-module-architecture-style.md`（hexagonal-lite + module-boundary 原則）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（DI パターン・coupling 方向の前例）
