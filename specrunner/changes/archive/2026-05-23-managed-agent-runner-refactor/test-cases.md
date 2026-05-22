# Test Cases: managed-agent-runner-refactor

## Overview

リファクタリング（構造変更のみ・振る舞い不変）のため、テストは「contract 保持」「regression 防止」「構造的受け入れ基準」の3軸で設計する。新規テストコードは追加せず、既存テストが green であることが主たる合否基準（T-05）。

---

## T-01: error-helpers.ts

### TC-01-01: throwSessionCreateError が SESSION_CREATE_FAILED を投げる

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 AC / design D3

**GIVEN** `error-helpers.ts` が `src/adapter/managed-agent/` に存在する  
**WHEN** `throwSessionCreateError("network error", "design", state)` を呼ぶ  
**THEN** `throwWrappedError` に `{ code: "SESSION_CREATE_FAILED", message: "Failed to create design session: network error", hint: "Check your API key and try again." }` が渡され、never 型で終了する

---

### TC-01-02: throwSessionCreateError が context 付きで message を組み立てる

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 / design D3（"fallback after resume failure" context）

**GIVEN** `throwSessionCreateError` が呼ばれる  
**WHEN** `context = "fallback after resume failure"` を渡す  
**THEN** message が `"Failed to create design session (fallback after resume failure): network error"` になる（context が括弧付きで付加される）

---

### TC-01-03: throwSendMessageError の hint が throwSessionCreateError と異なる

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 / design D3（resume fallback の二重 catch）

**GIVEN** `throwSendMessageError` と `throwSessionCreateError` が同じ state で呼ばれる  
**WHEN** それぞれが同じ errMsg / stepName を受け取る  
**THEN** `code` は両者とも `SESSION_CREATE_FAILED`、`hint` はそれぞれ `"Check your network connection."` / `"Check your API key and try again."` で異なる

---

### TC-01-04: throwCaughtAsWrapped が err の code/hint を優先する

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 AC

**GIVEN** `err = { message: "msg", code: "CUSTOM_CODE", hint: "custom hint" }` と defaults が存在する  
**WHEN** `throwCaughtAsWrapped(err, { code: "DEFAULT_CODE", hint: "default hint" }, state)` を呼ぶ  
**THEN** `throwWrappedError` に `{ code: "CUSTOM_CODE", message: "msg", hint: "custom hint" }` が渡される（err の値が優先）

---

### TC-01-05: throwCaughtAsWrapped が code/hint 未定義のとき defaults を使う

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 AC

**GIVEN** `err = new Error("plain error")` で `code`/`hint` プロパティが存在しない  
**WHEN** `throwCaughtAsWrapped(err, { code: "CONFIG_INCOMPLETE", hint: "Run specrunner managed setup" }, state)` を呼ぶ  
**THEN** `throwWrappedError` に `{ code: "CONFIG_INCOMPLETE", message: "plain error", hint: "Run specrunner managed setup" }` が渡される

---

### TC-01-06: buildTimeoutResult が throw せずに AgentRunResult を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 / design D3（buildTimeoutResult は return）

**GIVEN** `pollError = { code: "POLL_TIMEOUT", message: "timed out", hint: "increase timeout" }` と `sessionId = "sid-abc"` がある  
**WHEN** `buildTimeoutResult(pollError, "sid-abc")` を呼ぶ  
**THEN** `{ completionReason: "timeout", resultContent: null, sessionId: "sid-abc", error: Error("timed out") }` が返り、`error.code === "POLL_TIMEOUT"` / `error.hint === "increase timeout"` / 例外は throw されない

---

### TC-01-07: throwPollError が pollError を使って throw する

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 AC / design D3

**GIVEN** `pollError = { code: "POLL_FAILED", message: "failed", hint: "retry" }` がある  
**WHEN** `throwPollError(pollError, state)` を呼ぶ  
**THEN** `throwWrappedError` に `pollError` がそのまま渡され、never 型で終了する

---

### TC-01-08: throwPollError が pollError=undefined のとき sessionTerminatedError() を使う

- **Category**: behavior
- **Priority**: must
- **Source**: T-01 AC（フォールバック仕様）

**GIVEN** `pollError` が `undefined`  
**WHEN** `throwPollError(undefined, state)` を呼ぶ  
**THEN** `throwWrappedError` に `sessionTerminatedError()` の戻り値が渡される

---

### TC-01-09: executor-helpers.ts が変更されていない

- **Category**: structural
- **Priority**: must
- **Source**: T-01 AC（"executor-helpers.ts は変更していない"）

**GIVEN** リファクタ前の `executor-helpers.ts` の内容がある  
**WHEN** リファクタ後のファイルを参照する  
**THEN** `executor-helpers.ts` に差分がない（`throwWrappedError` / `attachStateAndRethrow` の実装は変更なし）

---

### TC-01-10: error-helpers.ts が throwWrappedError を再実装していない

- **Category**: structural
- **Priority**: must
- **Source**: T-01 AC（"throw ロジックを再実装していない"）

**GIVEN** `error-helpers.ts` が存在する  
**WHEN** ファイルの内容を確認する  
**THEN** `error-helpers.ts` 内に独自の error throw 実装（`throw new Error(...)` 等）がなく、すべて `throwWrappedError` / `attachStateAndRethrow` への委譲で完結している

---

## T-02: 共通 private メソッド

### TC-02-01: resolveEffectiveTimeout が timeoutMs > 0 のときそのまま返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-02 AC / regression（timeout fallback の二段ロジック）

**GIVEN** `getStepExecutionConfig` が `{ timeoutMs: 30000 }` を返す config / stepName / model がある  
**WHEN** `resolveEffectiveTimeout(config, stepName, model)` を呼ぶ  
**THEN** `30000` が返る

---

### TC-02-02: resolveEffectiveTimeout が timeoutMs=0 のとき DEFAULT_POLL_TIMEOUT_MS を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-02 AC / regression（timeout fallback の二段ロジック）

**GIVEN** `getStepExecutionConfig` が `{ timeoutMs: 0 }` を返す  
**WHEN** `resolveEffectiveTimeout(config, stepName, model)` を呼ぶ  
**THEN** `DEFAULT_POLL_TIMEOUT_MS` が返る（`0` ではない）

---

### TC-02-03: resolveEffectiveTimeout が timeoutMs 未定義のとき DEFAULT_POLL_TIMEOUT_MS を返す

- **Category**: behavior
- **Priority**: should
- **Source**: T-02 / regression（timeoutMs > 0 チェック）

**GIVEN** `getStepExecutionConfig` が `{}` を返す（timeoutMs プロパティなし）  
**WHEN** `resolveEffectiveTimeout(config, stepName, model)` を呼ぶ  
**THEN** `DEFAULT_POLL_TIMEOUT_MS` が返る

---

### TC-02-04: executeFollowUpTurn が成功したとき warn を出さない

- **Category**: behavior
- **Priority**: should
- **Source**: T-02 AC

**GIVEN** `sessionClient.sendUserMessage` と `pollUntilComplete({ status: "idle" })` が成功する  
**WHEN** `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` を呼ぶ  
**THEN** stderr に warn が出力されず、正常に完了する（void）

---

### TC-02-05: executeFollowUpTurn が pollUntilComplete で status !== "idle" のとき warn を出す

- **Category**: behavior
- **Priority**: should
- **Source**: T-02 AC

**GIVEN** `pollUntilComplete` が `{ status: "terminated" }` を返す  
**WHEN** `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` を呼ぶ  
**THEN** stderr に `"follow-up turn for '...' did not complete (status: terminated)"` を含む warn が出力される（例外は throw されない）

---

### TC-02-06: executeFollowUpTurn がエラーになっても throw しない

- **Category**: behavior
- **Priority**: must
- **Source**: T-02 AC（follow-up は非 fatal）

**GIVEN** `sessionClient.sendUserMessage` が例外を投げる  
**WHEN** `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` を呼ぶ  
**THEN** 例外が上位に伝播しない、stderr に `"follow-up turn failed for '...'"` を含む warn が出力される

---

### TC-02-07: readSessionUsage が sessionUsage ありのとき { [model]: sessionUsage } を返す

- **Category**: behavior
- **Priority**: should
- **Source**: T-02 AC

**GIVEN** `sessionClient.getSessionUsage` が `{ inputTokens: 100, outputTokens: 50 }` を返す  
**WHEN** `readSessionUsage(sessionId, "claude-opus-4-5")` を呼ぶ  
**THEN** `{ "claude-opus-4-5": { inputTokens: 100, outputTokens: 50 } }` が返る

---

### TC-02-08: readSessionUsage が sessionUsage なしのとき undefined を返す

- **Category**: behavior
- **Priority**: should
- **Source**: T-02 AC

**GIVEN** `sessionClient.getSessionUsage` が `undefined` / `null` を返す  
**WHEN** `readSessionUsage(sessionId, model)` を呼ぶ  
**THEN** `undefined` が返る

---

### TC-02-09: design の follow-up は sseEndTurn && shouldRunFollowUp の両条件が必要

- **Category**: regression
- **Priority**: must
- **Source**: T-02 AC / request.md 回帰注意（sseEndTurn による follow-up 実行条件）

**GIVEN** `shouldRunFollowUp(ctx, "success")` が true を返す  
**WHEN** `runDesignStyle` が polling fallback パス（sseEndTurn=false）を通る  
**THEN** `executeFollowUpTurn` が呼ばれない（`sseEndTurn` が false のため条件不成立）

---

### TC-02-10: polling の follow-up は shouldRunFollowUp のみで条件判定

- **Category**: regression
- **Priority**: must
- **Source**: T-02 AC / request.md 回帰注意

**GIVEN** `shouldRunFollowUp(ctx, "success")` が true を返す  
**WHEN** `runPollingStyle` が正常完了パスを通る  
**THEN** `executeFollowUpTurn` が呼ばれる（sseEndTurn 条件は混入しない）

---

## T-03: Design-style stages

### TC-03-01: runDesignStyle がメソッド名・シグネチャを保持している

- **Category**: contract
- **Priority**: must
- **Source**: T-03 AC / spec 制約（runDesignStyle のメソッド名変更禁止）

**GIVEN** リファクタ後の `ManagedAgentRunner` クラスがある  
**WHEN** クラスの public インターフェースを確認する  
**THEN** `runDesignStyle(ctx: AgentRunContext): Promise<AgentRunResult>` のシグネチャが変化していない

---

### TC-03-02: createDesignSession が agentId を解決して sessionId を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-03 AC

**GIVEN** `sessionClient.createSession` が `{ sessionId: "design-sid" }` を返す  
**WHEN** `createDesignSession(ctx)` を呼ぶ  
**THEN** `"design-sid"` が返る

---

### TC-03-03: createDesignSession がセッション作成失敗で SESSION_CREATE_FAILED を throw する

- **Category**: behavior
- **Priority**: must
- **Source**: T-03 AC / design 3-A（design は stepName を含まないメッセージ）

**GIVEN** `sessionClient.createSession` が例外を投げる  
**WHEN** `createDesignSession(ctx)` を呼ぶ  
**THEN** `throwSessionCreateError` が呼ばれ、`SESSION_CREATE_FAILED` エラーが伝播する

---

### TC-03-04: streamWithPollingFallback が SSE end_turn で sseEndTurn=true を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-03 AC

**GIVEN** `sessionClient.streamEvents` が end_turn イベントを送出し、polling fallback が不要  
**WHEN** `streamWithPollingFallback(sessionId, ctx)` を呼ぶ  
**THEN** `{ sseEndTurn: true }` が返る（`AgentRunResult` ではない）

---

### TC-03-05: streamWithPollingFallback が polling fallback を実行し sseEndTurn=false を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-03 AC

**GIVEN** `needsPollingFallback` が true になる SSE イベント列が来る  
**WHEN** `streamWithPollingFallback(sessionId, ctx)` を呼ぶ  
**THEN** polling fallback が実行され、`{ sseEndTurn: false }` が返る

---

### TC-03-06: streamWithPollingFallback が polling fallback timeout で AgentRunResult を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-03 AC / design 3-B（timeout 時は union 型で早期 return）

**GIVEN** polling fallback の `pollUntilComplete` が `{ status: "timeout", error: { code: "POLL_TIMEOUT", ... } }` を返す  
**WHEN** `streamWithPollingFallback(sessionId, ctx)` を呼ぶ  
**THEN** `{ completionReason: "timeout", ... }` の `AgentRunResult` が返る（`sseEndTurn` オブジェクトではない）

---

### TC-03-07: runDesignStyle が streamResult に completionReason があるとき早期 return する

- **Category**: behavior
- **Priority**: must
- **Source**: T-03 design D（orchestrator の `if ('completionReason' in streamResult) return streamResult;`）

**GIVEN** `streamWithPollingFallback` が `{ completionReason: "timeout", ... }` を返す  
**WHEN** `runDesignStyle(ctx)` を呼ぶ  
**THEN** follow-up / verify / usage read をスキップして timeout の `AgentRunResult` をそのまま返す

---

### TC-03-08: verifyDesignArtifacts が verifyBranch 失敗でも warn のみで続行する

- **Category**: regression
- **Priority**: must
- **Source**: T-03 AC / request.md 回帰注意（verifyBranch は warn 非 fatal）

**GIVEN** `verifyBranchViaPort` が `GITHUB_TOKEN_EXPIRED` 以外のエラーを投げる  
**WHEN** `verifyDesignArtifacts(ctx)` を呼ぶ  
**THEN** stderr に warn が出力され、`verifyDesignArtifacts` は正常に完了する（rethrow しない）

---

### TC-03-09: verifyDesignArtifacts が verifyBranch の GITHUB_TOKEN_EXPIRED を rethrow する

- **Category**: regression
- **Priority**: must
- **Source**: T-03 AC / request.md 回帰注意（GITHUB_TOKEN_EXPIRED のみ rethrow）

**GIVEN** `verifyBranchViaPort` が `{ code: "GITHUB_TOKEN_EXPIRED" }` エラーを投げる  
**WHEN** `verifyDesignArtifacts(ctx)` を呼ぶ  
**THEN** `GITHUB_TOKEN_EXPIRED` エラーが上位に rethrow される

---

### TC-03-10: verifyDesignArtifacts が verifyChangeFolder の CHANGE_FOLDER_NOT_FOUND を rethrow する

- **Category**: regression
- **Priority**: must
- **Source**: T-03 AC / request.md 回帰注意（CHANGE_FOLDER_NOT_FOUND rethrow）

**GIVEN** `verifyChangeFolderViaPort` が `{ code: "CHANGE_FOLDER_NOT_FOUND" }` エラーを投げる  
**WHEN** `verifyDesignArtifacts(ctx)` を呼ぶ  
**THEN** `CHANGE_FOLDER_NOT_FOUND` エラーが上位に rethrow される

---

### TC-03-11: verifyDesignArtifacts が verifyChangeFolder のその他エラーを warn で吸収する

- **Category**: regression
- **Priority**: should
- **Source**: T-03 AC

**GIVEN** `verifyChangeFolderViaPort` が `CHANGE_FOLDER_NOT_FOUND` / `GITHUB_TOKEN_EXPIRED` 以外のエラーを投げる  
**WHEN** `verifyDesignArtifacts(ctx)` を呼ぶ  
**THEN** rethrow されず warn で続行する

---

### TC-03-12: runDesignStyle が stage 抽出後に薄い orchestrator になっている

- **Category**: structural
- **Priority**: must
- **Source**: T-03 AC（"名前・シグネチャを維持したまま薄い orchestrator"）

**GIVEN** リファクタ後の `agent-runner.ts` がある  
**WHEN** `runDesignStyle` メソッドの実装を確認する  
**THEN** `createDesignSession` / `streamWithPollingFallback` / `verifyDesignArtifacts` の呼び出しを含み、直接の session 操作ロジックをインラインに持たない

---

## T-04: Polling-style stages

### TC-04-01: runPollingStyle がメソッド名・シグネチャを保持している

- **Category**: contract
- **Priority**: must
- **Source**: T-04 AC / spec 制約

**GIVEN** リファクタ後の `ManagedAgentRunner` クラスがある  
**WHEN** クラスの public インターフェースを確認する  
**THEN** `runPollingStyle(ctx: AgentRunContext): Promise<AgentRunResult>` のシグネチャが変化していない

---

### TC-04-02: preparePollingMessage が必要な値を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC / design 4-A

**GIVEN** agentId / stepCtx / message の解決が全て成功する  
**WHEN** `preparePollingMessage(ctx)` を呼ぶ  
**THEN** `{ agentId, initialMessage, preSessionHeadSha, stepCtx }` のすべてのフィールドが含まれた値が返る

---

### TC-04-03: preparePollingMessage が agentId 解決失敗で CONFIG_INCOMPLETE を throw する

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC / design 4-A

**GIVEN** agentId 解決処理が例外を投げる  
**WHEN** `preparePollingMessage(ctx)` を呼ぶ  
**THEN** `throwCaughtAsWrapped` が `defaults.code = "CONFIG_INCOMPLETE"` で呼ばれ、エラーが伝播する

---

### TC-04-04: preparePollingMessage が buildMessage 失敗で BUILD_MESSAGE_FAILED を throw する

- **Category**: behavior
- **Priority**: should
- **Source**: T-04 / design 4-A

**GIVEN** `buildMessage` が例外を投げる  
**WHEN** `preparePollingMessage(ctx)` を呼ぶ  
**THEN** `throwCaughtAsWrapped` が `defaults.code = "BUILD_MESSAGE_FAILED"` で呼ばれる

---

### TC-04-05: createOrResumePollingSession が通常パスで sessionId を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC

**GIVEN** `sessionClient.createSession` + `sendUserMessage` が共に成功する（resume sessionId なし）  
**WHEN** `createOrResumePollingSession(ctx, agentId, message)` を呼ぶ  
**THEN** 新規 `sessionId` が返る

---

### TC-04-06: createOrResumePollingSession が resume 成功で既存 sessionId を使う

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC

**GIVEN** resume sessionId が存在し、`sendUserMessage(resumeSessionId, ...)` が成功する  
**WHEN** `createOrResumePollingSession(ctx, agentId, message)` を呼ぶ  
**THEN** `resumeSessionId` が返り、新規 session は作成されない

---

### TC-04-07: createOrResumePollingSession が resume sendUserMessage 失敗で fallback create に移行する

- **Category**: regression
- **Priority**: must
- **Source**: T-04 AC / request.md 回帰注意（resume fallback の二重 catch）

**GIVEN** resume sessionId が存在するが `sendUserMessage(resumeSessionId, ...)` が失敗する  
**WHEN** `createOrResumePollingSession(ctx, agentId, message)` を呼ぶ  
**THEN** warn が出力され、fallback `createSession` が呼ばれる（fallback が成功すれば新 sessionId が返る）

---

### TC-04-08: createOrResumePollingSession の fallback createSession 失敗で特定メッセージを throw する

- **Category**: regression
- **Priority**: must
- **Source**: T-04 AC / design 4-B（"fallback after resume failure" context）

**GIVEN** resume 失敗後の fallback `createSession` が例外を投げる  
**WHEN** `createOrResumePollingSession(ctx, agentId, message)` を呼ぶ  
**THEN** `throwSessionCreateError` が `context = "fallback after resume failure"` で呼ばれ、message にこの文字列が含まれる

---

### TC-04-09: createOrResumePollingSession の fallback sendUserMessage 失敗で throwSendMessageError が呼ばれる

- **Category**: regression
- **Priority**: must
- **Source**: T-04 AC / design 4-B（"fallback" context）

**GIVEN** fallback `createSession` は成功するが fallback `sendUserMessage` が失敗する  
**WHEN** `createOrResumePollingSession(ctx, agentId, message)` を呼ぶ  
**THEN** `throwSendMessageError` が `context = "fallback"` で呼ばれる（`throwSessionCreateError` ではなく `throwSendMessageError`）

---

### TC-04-10: guardCommit が requiresCommit=false のときスキップする

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC / design 4-C

**GIVEN** `step.requiresCommit` が false  
**WHEN** `guardCommit(step, state, preSessionHeadSha)` を呼ぶ  
**THEN** HEAD SHA 比較が行われず、エラーも throw されない

---

### TC-04-11: guardCommit が requiresCommit=true かつ HEAD SHA 変化なしのとき throw する

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC / design 4-C（noCommitDetectedError）

**GIVEN** `step.requiresCommit` が true で、実行前後の HEAD SHA が同一  
**WHEN** `guardCommit(step, state, preSessionHeadSha)` を呼ぶ  
**THEN** `noCommitDetectedError` を使ったエラーが throw される

---

### TC-04-12: fetchResultFile が resultFilePath=null のとき null を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC / design 4-D

**GIVEN** `step.resultFilePath` が null  
**WHEN** `fetchResultFile(step, state, stepCtx)` を呼ぶ  
**THEN** `null` が返る（`githubClient.getRawFile` は呼ばれない）

---

### TC-04-13: fetchResultFile が resultFilePath ありでファイル取得成功のとき内容を返す

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC

**GIVEN** `step.resultFilePath` が非 null で `githubClient.getRawFile` が内容を返す  
**WHEN** `fetchResultFile(step, state, stepCtx)` を呼ぶ  
**THEN** ファイル内容の文字列が返る

---

### TC-04-14: fetchResultFile が not-found のとき throw する

- **Category**: behavior
- **Priority**: must
- **Source**: T-04 AC / design 4-D

**GIVEN** `githubClient.getRawFile` が not-found を返す  
**WHEN** `fetchResultFile(step, state, stepCtx)` を呼ぶ  
**THEN** `resultFileNotFound` 相当のエラーが throw される

---

### TC-04-15: runPollingStyle が POLL_TIMEOUT で buildTimeoutResult を使って早期 return する

- **Category**: regression
- **Priority**: must
- **Source**: T-04 AC / design 4-E

**GIVEN** `sessionClient.pollUntilComplete` が `{ status: "timeout", error: { code: "POLL_TIMEOUT", ... } }` を返す  
**WHEN** `runPollingStyle(ctx)` を呼ぶ  
**THEN** `buildTimeoutResult` が呼ばれ、`{ completionReason: "timeout", ... }` が返る（follow-up / guardCommit / fetchResultFile はスキップ）

---

### TC-04-16: runPollingStyle が void completedAt を保持している

- **Category**: regression
- **Priority**: must
- **Source**: T-04 AC / request.md 回帰注意（`void completedAt` error path 参照）

**GIVEN** リファクタ後の `runPollingStyle` のコード  
**WHEN** 実装を確認する  
**THEN** `completedAt` 変数が poll 直後に宣言され、`void completedAt` 参照が error path に存在する（参照関係が切れていない）

---

### TC-04-17: runPollingStyle が stage 抽出後に薄い orchestrator になっている

- **Category**: structural
- **Priority**: must
- **Source**: T-04 AC（"名前・シグネチャを維持したまま薄い orchestrator"）

**GIVEN** リファクタ後の `agent-runner.ts` がある  
**WHEN** `runPollingStyle` メソッドの実装を確認する  
**THEN** `preparePollingMessage` / `createOrResumePollingSession` / `guardCommit` / `fetchResultFile` の呼び出しを含み、直接の session 操作ロジックをインラインに持たない

---

## T-05: Final verification

### TC-05-01: bun run typecheck が green

- **Category**: contract
- **Priority**: must
- **Source**: T-05 AC

**GIVEN** リファクタが完了した状態で  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

### TC-05-02: bun run test が green

- **Category**: behavior
- **Priority**: must
- **Source**: T-05 AC / request.md 受け入れ基準

**GIVEN** リファクタが完了した状態で  
**WHEN** `bun run test` を実行する  
**THEN** すべての既存テストが pass する（テスト追加・削除なし）

---

### TC-05-03: agent-runner.ts の行数が 633 行から有意に縮小している

- **Category**: structural
- **Priority**: should
- **Source**: T-05 AC（350 行級は努力目標）

**GIVEN** リファクタ前の `agent-runner.ts` が 633 行  
**WHEN** リファクタ後のファイル行数を確認する  
**THEN** 行数が 633 行から有意に減少している（350 行級が目標、振る舞い保持のための条件分岐を圧縮するための行数削減は不可）

---

### TC-05-04: error-helpers.ts が adapter 内に存在する

- **Category**: structural
- **Priority**: must
- **Source**: T-05 AC / design D4

**GIVEN** リファクタが完了した状態で  
**WHEN** `src/adapter/managed-agent/` ディレクトリを確認する  
**THEN** `error-helpers.ts` が存在する

---

### TC-05-05: runDesignStyle / runPollingStyle のシグネチャが変更されていない

- **Category**: contract
- **Priority**: must
- **Source**: T-05 AC / spec 制約（spec が名指し）

**GIVEN** リファクタ後の `ManagedAgentRunner` クラスがある  
**WHEN** `runDesignStyle` / `runPollingStyle` のシグネチャを確認する  
**THEN** 両メソッドとも `(ctx: AgentRunContext): Promise<AgentRunResult>` のシグネチャが維持されている

---

### TC-05-06: managed-agent-runtime の behavior scenario が green

- **Category**: behavior
- **Priority**: must
- **Source**: request.md 受け入れ基準（behavior scenario のみ対象）

**GIVEN** `specrunner/specs/managed-agent-runtime/spec.md` の behavior scenario が存在する  
**WHEN** 対応するテストを実行する  
**THEN** `runDesignStyle` / `runPollingStyle` の follow-up 等の振る舞い scenario が green（pre-existing な constructor 乖離等は対象外）

---

### TC-05-07: createManagedAgentRunner / ManagedAgentRunnerDeps が変更されていない

- **Category**: contract
- **Priority**: must
- **Source**: request.md スコープ外（触る必要なし）

**GIVEN** リファクタ後の `agent-runner.ts` がある  
**WHEN** `createManagedAgentRunner` / `ManagedAgentRunnerDeps` / `buildManagedGitPushInstruction` の定義を確認する  
**THEN** これらのシグネチャ・実装が変更されていない
