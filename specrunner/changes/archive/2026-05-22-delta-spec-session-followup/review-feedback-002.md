# Review Feedback 002: delta-spec-session-followup

- **iteration**: 2
- **reviewer**: code-reviewer
- **verdict**: needs-fix

---

## Summary

実装・型チェック・テストはすべて green。core の 2 段実行ロジック・shared helper・3 adapter の follow-up 実装はいずれも正しい。ただし must-scenario の TC-25 が「functional test は claude-code/agent-runner.test.ts にある」とコメントに書かれているが実際には存在せず、TC-05/TC-06（executor 転記）の unit test も未実装。

---

## Findings

### F-01: TC-25 functional test が存在しない（must-scenario 未カバー）

- **severity**: high
- **file**: `tests/unit/core/step/types.test.ts` L133 / `tests/unit/adapter/claude-code/agent-runner.test.ts`
- **test-case**: TC-25 (must)

`types.test.ts` TC-48 に「The functional aspect is tested by TC-25 in claude-code/agent-runner.test.ts」とコメントがあるが、`claude-code/agent-runner.test.ts` の follow-up describe ブロックに対応するテストが存在しない。

test-cases.md の TC-25 シナリオは:
```
GIVEN ctx.followUpPrompt が指定され、AbortController が abort される
WHEN abort が 1 回目の turn 実行中に発生する
THEN 2 回目の turn が開始されず、timeout による completion が返る
```

TC-032 (timeout) のテストは `followUpPrompt` を設定せずに abort を検証しており、TC-25 の「followUpPrompt 指定 + work turn abort → follow turn 不起動」は直接カバーされていない。

`types.test.ts` の TC-47/TC-48 は構造チェック（ファイル内容の文字列確認）であり、行動テストの代替にはならない。

**fix**: `claude-code/agent-runner.test.ts` の follow-up describe 内に以下を追加する。

```typescript
it("work turn が abort されたとき follow turn が開始されず timeout が返る", async () => {
  let callCount = 0;
  const queryFn: QueryFn = async function* (params) {
    callCount++;
    const abortCtrl = params.options?.["abortController"] as AbortController | undefined;
    await new Promise<void>((_, reject) => {
      if (abortCtrl) {
        abortCtrl.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
        }, { once: true });
      }
    });
    yield {} as never; // never reached
  } as QueryFn;

  const config: SpecRunnerConfig = { ...makeConfig(), steps: { defaults: { timeoutMs: 50 } } };
  const runner = new ClaudeCodeRunner({ cwd: tempDir, _queryFn: queryFn });
  const ctx: AgentRunContext = {
    step: makeAgentStep({ followUpPrompt: "fix format" }),
    followUpPrompt: "fix format",
    state: makeJobState(),
    branch: "feat/test",
    slug: "test-slug",
    cwd: tempDir,
    requestContent: "content",
    config,
    emit: vi.fn(),
  };

  const result = await runner.run(ctx);
  expect(result.completionReason).toBe("timeout");
  expect(callCount).toBe(1); // follow turn not started
});
```

---

### F-02: TC-05/TC-06 — executor.ts の `followUpPrompt` 転記に unit test なし（must-scenario 未カバー）

- **severity**: medium
- **file**: `tests/unit/step/executor.test.ts`
- **test-case**: TC-05, TC-06 (must)

executor.ts に `followUpPrompt: step.followUpPrompt` を追加したが、`executor.test.ts` に `followUpPrompt` に関する記述がない（grep で 0 件）。

TC-05「executor が step.followUpPrompt を ctx.followUpPrompt に転記する」と TC-06「followUpPrompt 未設定の step では ctx.followUpPrompt が undefined」は must だが、直接検証するテストが存在しない。

adapter unit tests は `ctx.followUpPrompt` を直接設定しているため転記ロジックは迂回されており、executor の転記責務は未検証のまま。

**fix**: `executor.test.ts` のモック runner の ctx キャプチャ部分に以下を追加する。

```typescript
it("TC-05: step.followUpPrompt が ctx.followUpPrompt に転記される", async () => {
  let capturedCtx: AgentRunContext | undefined;
  const mockRunner: AgentRunner = {
    run: vi.fn().mockImplementation((ctx: AgentRunContext) => {
      capturedCtx = ctx;
      return Promise.resolve({ completionReason: "success", resultContent: null });
    }),
  };
  const executor = new StepExecutor(makeEventBus(), mockRunner);
  const step = makeAgentStep({ followUpPrompt: "fix format violations" });
  await executor.execute(step, makeJobState(), makeDeps());
  expect(capturedCtx?.followUpPrompt).toBe("fix format violations");
});

it("TC-06: followUpPrompt 未設定の step では ctx.followUpPrompt が undefined", async () => {
  let capturedCtx: AgentRunContext | undefined;
  const mockRunner: AgentRunner = {
    run: vi.fn().mockImplementation((ctx: AgentRunContext) => {
      capturedCtx = ctx;
      return Promise.resolve({ completionReason: "success", resultContent: null });
    }),
  };
  const executor = new StepExecutor(makeEventBus(), mockRunner);
  const step = makeAgentStep(); // no followUpPrompt
  await executor.execute(step, makeJobState(), makeDeps());
  expect(capturedCtx?.followUpPrompt).toBeUndefined();
});
```

---

### F-03: SSE polling fallback + followUpPrompt のテストシナリオが test-cases.md に未定義（low）

- **severity**: low
- **file**: `specrunner/changes/delta-spec-session-followup/test-cases.md`
- **test-case**: TC-36 周辺

設計 (D6 / T-07) は「SSE が end_turn 以外 (terminated / polling fallback) で終了した場合は follow turn を実行しない」と明記しており、実装も `sseEndTurn = !needsPollingFallback` で正しく制御されている。

しかし test-cases.md には「SSE terminated → follow turn 不実行」(TC-36) のみあり、「SSE polling fallback → follow turn 不実行」のシナリオが定義されていない。TC-36 のテストは `terminated = true` で throw するパスを検証しており、polling fallback パス（`terminated = false` かつ `end_turn` でない SSE disconnection）は検証されていない。

動作は正しいが must シナリオの抜けとして記録する。fix は任意（should）。

---

### F-04: `shouldRunFollowUp` の `baseCompletionReason` 引数が全 adapter で `"success"` リテラル固定（note）

- **severity**: low (style / future-proofing)
- **file**: `src/adapter/claude-code/agent-runner.ts` L206, `src/adapter/codex/agent-runner.ts` L175, `src/adapter/managed-agent/agent-runner.ts` L230 / L497

3 adapter すべてで `shouldRunFollowUp(ctx, "success")` と呼ばれており、`baseCompletionReason` パラメータが意味を持っていない（呼び出し前に既に成功を確認済みのため）。将来 `shouldRunFollowUp` を他の理由でも呼ぶ可能性があるなら有用だが、現状は `!!ctx.followUpPrompt` と同義。動作上の問題はない。

---

## Must-scenario Coverage Matrix

| TC | Priority | Status |
|---|---|---|
| TC-01〜TC-04 (interface) | must | ✅ typecheck green |
| TC-05 (executor 転記) | must | ❌ unit test なし (F-02) |
| TC-06 (executor undefined) | must | ❌ unit test なし (F-02) |
| TC-07 (executor 無改修) | must | ✅ verified by diff |
| TC-08 (FIXER_STEP_NAMES 無改修) | must | ✅ TC-52 structural check |
| TC-09〜TC-18 (shared helper) | must | ✅ follow-up.test.ts |
| TC-19〜TC-22 (Claude 2-turn) | must | ✅ |
| TC-23 (Claude modelUsage cumulative) | must | ✅ |
| TC-24 (Claude follow error → error) | must | ✅ |
| TC-25 (Claude abort propagation) | must | ❌ functional test なし (F-01) |
| TC-27〜TC-33 (Codex) | must | ✅ |
| TC-34〜TC-42 (Managed SSE / polling) | must | ✅ |
| TC-43〜TC-46 (DesignStep wiring) | must | ✅ |
| TC-47〜TC-48 (AbortController) | must | ⚠️ structural check のみ (F-01 と関連) |
| TC-49〜TC-52 (pipeline integrity) | must | ✅ |
| TC-54〜TC-55 (typecheck/test green) | must | ✅ green |

---

## Positive Observations

- **shared/follow-up.ts** は runtime 型・usage 意味論を一切 import しない純粋関数として正確に実装されている。依存方向 (adapter → shared) も守られている。
- **Codex の usage 加算** (`turn1Usage = { ...turn.usage }` でコピーしてから加算) は turn 1 上書き防止を正確に実装している。
- **Managed graceful degradation** (`try/catch` で follow-up 失敗を非致命的に処理) は 2 adapter (SSE / polling) ともに正しく実装されている。
- **executor 無改修原則** — `followUpPrompt: step.followUpPrompt` の 1 行追加のみ。finalizeStep・state machine・FIXER_STEP_NAMES は無改修。
- **TypeCheck** と **2566 tests** がすべて green。
