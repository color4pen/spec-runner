# Tasks: managed-agent-runner-refactor

## T-01: Create `error-helpers.ts`

**File**: `src/adapter/managed-agent/error-helpers.ts`

ErrorInfo 構築 + throw の定型を集約する adapter 内 helper module を新設する。throw 本体は `executor-helpers.throwWrappedError` / `attachStateAndRethrow` に委譲し再実装しない。

### 実装内容

```typescript
import type { JobState, ErrorInfo } from "../../state/schema.js";
import type { AgentRunResult } from "../../core/port/agent-runner.js";
import { throwWrappedError } from "../../core/step/executor-helpers.js";
import { sessionTerminatedError } from "../../errors.js";

/**
 * SESSION_CREATE_FAILED パターン (5 箇所で使用)。
 * context が指定された場合、message に "(context)" を付加する。
 */
export function throwSessionCreateError(
  errMsg: string,
  stepName: string,
  state: JobState,
  context?: string,
): never {
  const contextSuffix = context ? ` (${context})` : "";
  const errorInfo: ErrorInfo = {
    code: "SESSION_CREATE_FAILED",
    message: `Failed to create ${stepName} session${contextSuffix}: ${errMsg}`,
    hint: "Check your API key and try again.",
  };
  throwWrappedError(errorInfo, state);
}

/**
 * SESSION_CREATE_FAILED (send message 失敗) パターン。
 * throwSessionCreateError と code は同じだが hint が異なる。
 */
export function throwSendMessageError(
  errMsg: string,
  stepName: string,
  state: JobState,
  context?: string,
): never {
  const contextSuffix = context ? ` (${context})` : "";
  const errorInfo: ErrorInfo = {
    code: "SESSION_CREATE_FAILED",
    message: `Failed to send ${context ? "message to" : "initial message to"} ${stepName} session${contextSuffix}: ${errMsg}`,
    hint: "Check your network connection.",
  };
  throwWrappedError(errorInfo, state);
}

/**
 * catch した error から code/message/hint を抽出 + デフォルト値で throw (2 箇所)。
 */
export function throwCaughtAsWrapped(
  err: unknown,
  defaults: { code: string; hint: string },
  state: JobState,
): never {
  const errCode = (err as { code?: string }).code ?? defaults.code;
  const errMsg = (err as Error).message;
  const errHint = (err as { hint?: string }).hint ?? defaults.hint;
  throwWrappedError({ code: errCode, message: errMsg, hint: errHint }, state);
}

/**
 * POLL_TIMEOUT の AgentRunResult 構築 (throw ではなく return、2 箇所)。
 */
export function buildTimeoutResult(
  pollError: { code: string; message: string; hint: string },
  sessionId: string,
): AgentRunResult {
  const timeoutErr = new Error(pollError.message) as Error & { code: string; hint: string };
  timeoutErr.code = pollError.code;
  timeoutErr.hint = pollError.hint;
  return { completionReason: "timeout", resultContent: null, sessionId, error: timeoutErr };
}

/**
 * poll 失敗の ErrorInfo 構築 + throw (2 箇所)。
 * pollResult.error がなければ sessionTerminatedError() をフォールバックに使用。
 */
export function throwPollError(
  pollError: ErrorInfo | undefined,
  state: JobState,
): never {
  const errorInfo = pollError ?? sessionTerminatedError();
  throwWrappedError(errorInfo, state);
}
```

### Acceptance criteria

- [x] `src/adapter/managed-agent/error-helpers.ts` が存在する
- [x] `throwWrappedError` / `attachStateAndRethrow` を import し、throw ロジックを再実装していない
- [x] `executor-helpers.ts` は変更していない
- [x] `bun run typecheck` が green

---

## T-02: Extract shared private methods

**File**: `src/adapter/managed-agent/agent-runner.ts`

design / polling で重複している 3 つの定型を `ManagedAgentRunner` の private メソッドに切り出す。この時点ではまだ stage 抽出はせず、`runDesignStyle` / `runPollingStyle` 内の該当箇所をこれらの呼び出しに置き換えるだけ。

### 2-A: `resolveEffectiveTimeout`

design fallback (L202-208) / polling (L481-487) / design follow-up (L234-236) の 3 箇所で同一の計算:

```typescript
private resolveEffectiveTimeout(
  config: SpecRunnerConfig,
  stepName: string,
  model: string,
): number {
  const resolved = getStepExecutionConfig(config, stepName, { model });
  return resolved.timeoutMs && resolved.timeoutMs > 0
    ? resolved.timeoutMs
    : DEFAULT_POLL_TIMEOUT_MS;
}
```

### 2-B: `executeFollowUpTurn`

design (L231-245) / polling (L506-516) でほぼ同形の try/catch ブロック。呼び出し条件は caller が判断する。

```typescript
private async executeFollowUpTurn(
  sessionId: string,
  step: AgentStep,
  followUpPrompt: string,
  timeoutMs: number,
): Promise<void> {
  try {
    await this.sessionClient.sendUserMessage(sessionId, followUpPrompt);
    const followPollResult = await this.sessionClient.pollUntilComplete(
      sessionId, { timeoutMs },
    );
    if (followPollResult.status !== "idle") {
      stderrWrite(
        `[specrunner] warn: follow-up turn for '${step.name}' did not complete (status: ${followPollResult.status}). Continuing with work turn result.\n`,
      );
    }
  } catch (followErr) {
    stderrWrite(
      `[specrunner] warn: follow-up turn failed for '${step.name}' (session: ${sessionId}): ${(followErr as Error).message}. Continuing with work turn result.\n`,
    );
  }
}
```

### 2-C: `readSessionUsage`

design (L248-252) / polling (L519-522) で完全重複:

```typescript
private async readSessionUsage(
  sessionId: string,
  model: string,
): Promise<Record<string, ModelUsage> | undefined> {
  const sessionUsage = await this.sessionClient.getSessionUsage(sessionId);
  if (sessionUsage) {
    return { [model]: sessionUsage };
  }
  return undefined;
}
```

### Acceptance criteria

- [x] `resolveEffectiveTimeout` / `executeFollowUpTurn` / `readSessionUsage` が private メソッドとして存在する
- [x] `runDesignStyle` / `runPollingStyle` 内の該当箇所がこれらの呼び出しに置き換わっている
- [x] follow-up の呼び出し条件: design は `sseEndTurn && shouldRunFollowUp(ctx, "success")`、polling は `shouldRunFollowUp(ctx, "success")` — 条件の差異が保持されている
- [x] `bun run typecheck && bun run test` が green

---

## T-03: Extract design-style stages

**File**: `src/adapter/managed-agent/agent-runner.ts`

`runDesignStyle` から 3 つの private stage メソッドを抽出し、orchestrator を薄くする。error-helpers を使って ErrorInfo 構築を簡潔化する。

### 3-A: `createDesignSession(ctx)` → `string`

現行 L133-159 に相当。agentId 解決 + `sessionClient.createSession` + error handling。
- error handling: `throwSessionCreateError` (T-01) を使用。既存の `"Failed to create session: ..."` メッセージと同等。design は stepName が暗黙的に "design" なので message に含める（`session` → `design session` の差異は許容。ただし既存が `"Failed to create session: ${errMsg}"` なのでそのまま保つ場合は stepName を空にするか、元の message をそのまま使う）。

**注意**: 既存の design 側 SESSION_CREATE_FAILED は `"Failed to create session: ${errMsg}"` で stepName を含まない。polling 側は `"Failed to create ${step.name} session: ${errMsg}"` で stepName を含む。この差異を保つ。

### 3-B: `streamWithPollingFallback(sessionId, ctx)` → `boolean` (sseEndTurn)

現行 L163-227 に相当。AbortController 生成 / toolHandlers 構築 / effectiveRequestContent 構築 / streamEvents / terminated 判定 / needsPollingFallback 判定 / polling fallback 実行。

戻り値は `sseEndTurn` (`!needsPollingFallback`)。caller はこの値で follow-up 条件を判断する。

- terminated 判定: `attachStateAndRethrow` をそのまま使用（unique pattern、helper 化不要）
- polling fallback の timeout: `this.resolveEffectiveTimeout()` (T-02) を使用
- POLL_TIMEOUT: `buildTimeoutResult` (T-01) を使用 — ただしこの stage は boolean を返すため、timeout result を直接返せない。**対処**: timeout の場合は orchestrator で catch するか、戻り値を `boolean | AgentRunResult` にするか。最もシンプルなのは stage 内で throw して orchestrator の上位で catch せず、timeout 時は stage から AgentRunResult を返す union 型にする。

**設計判断**: `streamWithPollingFallback` の戻り値を `{ sseEndTurn: boolean } | AgentRunResult` にする。timeout 時は `AgentRunResult` を返し、orchestrator で `if ('completionReason' in streamResult) return streamResult;` で early return。poll 失敗の throw は stage 内で throwPollError を使用。

### 3-C: `verifyDesignArtifacts(ctx)` → `void`

現行 L255-282 に相当。effectiveBranch 解決 + `verifyBranchViaPort` (warn / GITHUB_TOKEN_EXPIRED rethrow) + `verifyChangeFolderViaPort` (CHANGE_FOLDER_NOT_FOUND / GITHUB_TOKEN_EXPIRED rethrow)。

**regression 注意**: verifyBranch は warn 非 fatal だが GITHUB_TOKEN_EXPIRED は rethrow。verifyChangeFolder は CHANGE_FOLDER_NOT_FOUND と GITHUB_TOKEN_EXPIRED のみ rethrow、それ以外は warn。この振り分けを 1:1 で移す。

### 3-D: `runDesignStyle` の thin orchestrator 化

抽出後の `runDesignStyle`:

```typescript
private async runDesignStyle(ctx: AgentRunContext): Promise<AgentRunResult> {
  const sessionId = await this.createDesignSession(ctx);
  const streamResult = await this.streamWithPollingFallback(sessionId, ctx);
  if ("completionReason" in streamResult) return streamResult; // timeout early return

  const sseEndTurn = streamResult.sseEndTurn;
  const effectiveTimeoutMs = this.resolveEffectiveTimeout(ctx.config, ctx.step.name, ctx.step.agent.model);

  if (sseEndTurn && shouldRunFollowUp(ctx, "success")) {
    await this.executeFollowUpTurn(sessionId, ctx.step, ctx.followUpPrompt!, effectiveTimeoutMs);
  }

  const modelUsage = await this.readSessionUsage(sessionId, ctx.step.agent.model);
  await this.verifyDesignArtifacts(ctx);

  logVerbose("session", "session completed", { sessionId, stepName: ctx.step.name, runtime: "managed" });
  return mergeFollowUpResult(
    { completionReason: "success", resultContent: null, sessionId, modelUsage },
    null,
  );
}
```

### Acceptance criteria

- [x] `createDesignSession` / `streamWithPollingFallback` / `verifyDesignArtifacts` が private メソッドとして存在する
- [x] `runDesignStyle` が名前・シグネチャを維持したまま薄い orchestrator になっている
- [x] SSE end_turn → follow-up 実行、terminated → throw、polling fallback → timeout return の振る舞いが保持されている
- [x] verifyBranch の warn / GITHUB_TOKEN_EXPIRED の振り分けが保持されている
- [x] verifyChangeFolder の CHANGE_FOLDER_NOT_FOUND / GITHUB_TOKEN_EXPIRED rethrow が保持されている
- [x] `bun run typecheck && bun run test` が green

---

## T-04: Extract polling-style stages

**File**: `src/adapter/managed-agent/agent-runner.ts`

`runPollingStyle` から 4 つの private stage メソッドを抽出し、orchestrator を薄くする。

### 4-A: `preparePollingMessage(ctx)` → `{ agentId, initialMessage, preSessionHeadSha, stepCtx }`

現行 L317-395 に相当。agentId 解決 / stepCtx 組立 / enrichContext / buildMessage / projectContext 注入 / git push instruction 注入 / branch guard / preSessionHeadSha snapshot。

- agentId 解決 error: `throwCaughtAsWrapped` (T-01) を使用。defaults: `{ code: "CONFIG_INCOMPLETE", hint: "Run 'specrunner managed setup'..." }`
- buildMessage error: `throwCaughtAsWrapped` (T-01) を使用。defaults: `{ code: "BUILD_MESSAGE_FAILED", hint: "Check step preconditions." }`
- branch guard: `branchNotSetError` → ErrorInfo → `throwWrappedError` をインラインで保持（1 箇所のみ）

### 4-B: `createOrResumePollingSession(ctx, agentId, initialMessage)` → `string` (sessionId)

現行 L397-476 に相当。resume fallback の二重 catch 構造を 1:1 で移す。

**regression 注意**: resume fallback 内の error handling は 3 段階:
1. `sendUserMessage(resumeSessionId)` 失敗 → warn + fallback へ
2. fallback `createSession` 失敗 → `throwSessionCreateError(errMsg, step.name, state, "fallback after resume failure")`
3. fallback `sendUserMessage` 失敗 → `throwSendMessageError(errMsg, step.name, state, "fallback")`

normal path:
1. `createSession` 失敗 → `throwSessionCreateError(errMsg, step.name, state)`
2. `sendUserMessage` 失敗 → `throwSendMessageError(errMsg, step.name, state)`

各 catch の error code は全て `SESSION_CREATE_FAILED` だが message / hint が異なる。この差異を T-01 の helper で吸収する。

### 4-C: `guardCommit(step, state, preSessionHeadSha)` → `void`

現行 L525-541 に相当。`requiresCommit` フラグチェック + HEAD SHA 比較 + `noCommitDetectedError` throw。

### 4-D: `fetchResultFile(step, state, stepCtx)` → `string | null`

現行 L543-565 に相当。`step.resultFilePath` → null なら skip、非 null なら `githubClient.getRawFile` + not-found error。

### 4-E: `runPollingStyle` の thin orchestrator 化

抽出後の `runPollingStyle`:

```typescript
private async runPollingStyle(ctx: AgentRunContext): Promise<AgentRunResult> {
  const { agentId, initialMessage, preSessionHeadSha, stepCtx } =
    await this.preparePollingMessage(ctx);

  const sessionId = await this.createOrResumePollingSession(ctx, agentId, initialMessage);

  const effectiveTimeoutMs = this.resolveEffectiveTimeout(ctx.config, ctx.step.name, ctx.step.agent.model);
  const pollResult = await this.sessionClient.pollUntilComplete(sessionId, { timeoutMs: effectiveTimeoutMs });
  const completedAt = new Date().toISOString();

  if (pollResult.status !== "idle") {
    if (pollResult.error?.code === "POLL_TIMEOUT") {
      return buildTimeoutResult(pollResult.error, sessionId);
    }
    stderrWrite(`${ctx.step.name} session was terminated by Anthropic.`);
    throwPollError(pollResult.error, ctx.state);
  }

  if (shouldRunFollowUp(ctx, "success")) {
    await this.executeFollowUpTurn(sessionId, ctx.step, ctx.followUpPrompt!, effectiveTimeoutMs);
  }

  const modelUsage = await this.readSessionUsage(sessionId, ctx.step.agent.model);
  await this.guardCommit(ctx.step, ctx.state, preSessionHeadSha);
  const fileContent = await this.fetchResultFile(ctx.step, ctx.state, stepCtx);

  void completedAt;
  logVerbose("session", "session completed", { sessionId, stepName: ctx.step.name, runtime: "managed" });
  return mergeFollowUpResult(
    { completionReason: "success", resultContent: null, sessionId, modelUsage },
    fileContent,
  );
}
```

### Acceptance criteria

- [x] `preparePollingMessage` / `createOrResumePollingSession` / `guardCommit` / `fetchResultFile` が private メソッドとして存在する
- [x] `runPollingStyle` が名前・シグネチャを維持したまま薄い orchestrator になっている
- [x] resume fallback の二重 catch 構造（createSession 失敗と sendUserMessage 失敗で message/hint が異なる）が保持されている
- [x] polling follow-up は `shouldRunFollowUp(ctx, "success")` のみで条件判定（design の `sseEndTurn` 条件を混入しない）
- [x] `void completedAt` の参照関係が保持されている
- [x] `bun run typecheck && bun run test` が green

---

## T-05: Final verification

既存テストが全て green であることを確認する。新規テストは追加しない（構造リファクタで振る舞い不変のため、既存テストがそのまま regression guard になる）。

```bash
bun run typecheck && bun run test
```

### Acceptance criteria

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] `agent-runner.ts` の行数が 633 行から有意に縮小している（350 行級は努力目標）
- [x] `error-helpers.ts` が存在し、`throwWrappedError` / `attachStateAndRethrow` に委譲している
- [x] `runDesignStyle` / `runPollingStyle` のメソッド名・シグネチャが変更されていない

---

## Dependencies

```
T-01 ──┐
       ├──→ T-03 ──┐
T-02 ──┤           ├──→ T-05
       ├──→ T-04 ──┘
       │
```

- T-01 (error-helpers) と T-02 (shared methods) は互いに独立、並列可能
- T-03 (design stages) と T-04 (polling stages) は T-01 + T-02 に依存。互いには独立だが、同一ファイルを編集するため逐次実行が安全
- T-05 (verification) は T-03 + T-04 完了後
