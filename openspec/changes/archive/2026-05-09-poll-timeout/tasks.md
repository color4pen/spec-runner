# Tasks: poll-timeout

## 1. Error Code 追加

- [x] 1.1 `src/errors.ts` の `ERROR_CODES` に `POLL_TIMEOUT: "POLL_TIMEOUT"` を追加する
- [x] 1.2 `src/errors.ts` に `pollTimeoutError(sessionId: string, elapsedMs: number): SpecRunnerError` factory を追加する。message に sessionId と経過時間を含める。hint は `"Session may still be running on Anthropic side. Use 'specrunner resume' to retry or 'specrunner cancel' to abort."` とする

## 2. pollUntilComplete にタイムアウトを追加

- [x] 2.1 `src/adapter/managed-agent/completion.ts` に `export const DEFAULT_POLL_TIMEOUT_MS = 900_000;` を追加する
- [x] 2.2 `PollOptions` interface に `timeoutMs?: number` フィールドを追加する
- [x] 2.3 `pollUntilComplete` 関数の冒頭で `const deadline = opts?.timeoutMs != null ? Date.now() + opts.timeoutMs : null;` を計算する
- [x] 2.4 while ループ内の `await sleepFn(intervalMs)` の後、session 取得の前に `if (deadline != null && Date.now() >= deadline) { throw pollTimeoutError(sessionId, opts!.timeoutMs!); }` を追加する
- [x] 2.5 JSDoc の `Wall-clock timeout has been removed` コメントを更新する

## 3. SessionClient Port 更新

- [x] 3.1 `src/core/port/session-client.ts` の `pollUntilComplete` メソッド opts に `timeoutMs?: number` を追加する
- [x] 3.2 JSDoc の `Wall-clock timeout has been removed` コメントを更新する

## 4. SessionClient Adapter 更新

- [x] 4.1 `src/adapter/managed-agent/session-client.ts` の `AnthropicSessionClient.pollUntilComplete` で、inner `pollUntilComplete` 呼び出しの `PollOptions` に `timeoutMs: opts?.timeoutMs` を追加する

## 5. ManagedAgentRunner 更新

- [x] 5.1 `src/adapter/managed-agent/agent-runner.ts` に `getStepExecutionConfig` と `DEFAULT_POLL_TIMEOUT_MS` を import する
- [x] 5.2 `runPollingStyle` メソッドで、poll 呼び出し前に step config から `timeoutMs` を解決する。`getStepExecutionConfig(config, step.name, { model: step.agent.model })` で `resolvedConfig` を取得し、`const timeoutMs = resolvedConfig.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;` とする
- [x] 5.3 `runPollingStyle` の `this.sessionClient.pollUntilComplete(sessionId!)` 呼び出しに `{ timeoutMs }` を渡す
- [x] 5.4 `runPollingStyle` の `pollResult.status !== "idle"` 分岐で、`pollResult.error?.code === "POLL_TIMEOUT"` の場合に `return { completionReason: "timeout", resultContent: null, sessionId: sessionId!, error: ... }` を返す（`throwWrappedError` は呼ばない）
- [x] 5.5 `runProposeStyle` の polling fallback 分岐でも同様に `timeoutMs` を解決して `pollUntilComplete` に渡す。`POLL_TIMEOUT` を検出した場合は `return { completionReason: "timeout", resultContent: null, sessionId: sessionId! }` を返す

## 6. StepExecutor 更新

- [x] 6.1 `src/core/step/executor.ts` の `runAgentStep` メソッドで、`runResult.completionReason !== "success"` の分岐を `"timeout"` と `"error"` に分ける
- [x] 6.2 `completionReason === "timeout"` の場合: errorInfo を構築し、`recordFailedStepResult` で step result を記録。state を `awaiting-resume` に設定（`status: "awaiting-resume"`, `resumePoint: { step, reason, iterationsExhausted: 0 }`, `error: errorInfo`）。`store.persist(state)` で永続化。history に `{step}-timeout` エントリを追加。`attachStateAndRethrow(err, state)` で error に state を付与して throw する

## 7. テスト追加・更新

- [x] 7.1 `tests/completion.test.ts` に POLL_TIMEOUT テストケースを追加する。小さい `timeoutMs`（例: 1ms）と遅い `sleepFn`（例: 50ms sleep）を使い、`pollUntilComplete` が `PollTimeoutError` を throw することを検証する。error code が `POLL_TIMEOUT` であることを assert する
- [x] 7.2 `tests/completion.test.ts` に、`timeoutMs` 未指定時はタイムアウトしないテストケースを追加する（既存の idle 到達テストが該当するが、明示的に `timeoutMs` なしで動作を確認する）
- [x] 7.3 `tests/unit/remove-session-timeout.test.ts` の TC-008 を更新する。session-client.ts の `expect(content).not.toContain("timeoutMs")` アサーションを削除する（`timeoutMs` が port に戻ったため）。`SESSION_TIMEOUT` 不在のアサーションは維持する
- [x] 7.4 `tests/unit/remove-session-timeout.test.ts` の TC-011 を更新する。`expect(content).not.toContain("timeoutMs")` アサーションを削除する。代わりに `expect(content).not.toContain("SESSION_TIMEOUT")` が引き続き pass することを確認する

## 8. 検証

- [x] 8.1 `bun run typecheck` が pass することを確認する
- [x] 8.2 `bun run test` が pass することを確認する（既存テストが壊れていないこと）
- [x] 8.3 `grep -r "SESSION_TIMEOUT" src/adapter/managed-agent/completion.ts` で SESSION_TIMEOUT が混入していないことを確認する
