# Test Cases: fixer-session-continuity

## Summary

| Category | must | should | could | Total |
|----------|------|--------|-------|-------|
| fixer-helpers unit | 8 | 3 | 1 | 12 |
| StepExecutor injection | 3 | 1 | 0 | 4 |
| ClaudeCodeRunner adapter | 4 | 0 | 0 | 4 |
| CodexAgentRunner adapter | 4 | 0 | 0 | 4 |
| ManagedAgentRunner adapter | 3 | 0 | 0 | 3 |
| Fixer buildMessage | 6 | 2 | 1 | 9 |
| Scope boundary | 2 | 1 | 0 | 3 |
| Acceptance criteria | 3 | 2 | 0 | 5 |
| **Total** | **33** | **9** | **2** | **44** |

---

## Category: fixer-helpers unit

### TC-FH-01

- **Priority**: must
- **Source**: T-03 test case 1

**GIVEN** `FIXER_STEP_NAMES` が定義されている  
**WHEN** `FIXER_STEP_NAMES.has("spec-fixer")`, `.has("build-fixer")`, `.has("code-fixer")` を呼ぶ  
**THEN** すべて `true` を返す

---

### TC-FH-02

- **Priority**: must
- **Source**: T-03 test case 1

**GIVEN** `FIXER_STEP_NAMES` が定義されている  
**WHEN** `FIXER_STEP_NAMES.has("spec-reviewer")` または `FIXER_STEP_NAMES.has("implementer")` を呼ぶ  
**THEN** `false` を返す（fixer 以外のステップが含まれない）

---

### TC-FH-03

- **Priority**: must
- **Source**: T-03 test case 2

**GIVEN** `state.steps` が `undefined` の JobState  
**WHEN** `getPreviousSessionId(state, "spec-fixer")` を呼ぶ  
**THEN** `null` を返す

---

### TC-FH-04

- **Priority**: must
- **Source**: T-03 test case 3

**GIVEN** `state.steps["spec-fixer"]` が空配列 `[]` の JobState  
**WHEN** `getPreviousSessionId(state, "spec-fixer")` を呼ぶ  
**THEN** `null` を返す

---

### TC-FH-05

- **Priority**: must
- **Source**: T-03 test case 4

**GIVEN** `state.steps["spec-fixer"]` に `sessionId: "sess-abc"` を持つ StepRun が 1 件ある JobState  
**WHEN** `getPreviousSessionId(state, "spec-fixer")` を呼ぶ  
**THEN** `"sess-abc"` を返す

---

### TC-FH-06

- **Priority**: must
- **Source**: T-03 test case 5

**GIVEN** `state.steps["spec-fixer"]` に `sessionId: null` の StepRun が 1 件ある JobState  
**WHEN** `getPreviousSessionId(state, "spec-fixer")` を呼ぶ  
**THEN** `null` を返す

---

### TC-FH-07

- **Priority**: must
- **Source**: T-03 test case 6

**GIVEN** `state.steps["code-fixer"]` に `sessionId: "sess-xyz"` を持つ StepRun が 1 件ある JobState  
**WHEN** `isFixerContinuation(state, "code-fixer")` を呼ぶ  
**THEN** `true` を返す

---

### TC-FH-08

- **Priority**: must
- **Source**: T-03 test case 7

**GIVEN** `state.steps["code-fixer"]` が空の JobState  
**WHEN** `isFixerContinuation(state, "code-fixer")` を呼ぶ  
**THEN** `false` を返す

---

### TC-FH-09

- **Priority**: must
- **Source**: T-03 test case 8

**GIVEN** `state.steps["code-fixer"]` に `sessionId: null` の StepRun が 1 件ある JobState  
**WHEN** `isFixerContinuation(state, "code-fixer")` を呼ぶ  
**THEN** `false` を返す

---

### TC-FH-10

- **Priority**: must
- **Source**: T-03 test case 9, 10

**GIVEN** `buildContinuationMessage({ stepName: "spec-fixer", findingsPath: "/path/to/findings.md", slug: "my-slug" })` を呼ぶ  
**WHEN** 返り値を確認する  
**THEN**
- `findingsPath` の値 `/path/to/findings.md` が含まれる
- `<user-request>` タグで囲まれている

---

### TC-FH-11

- **Priority**: must
- **Source**: T-03 test case 11, D5

**GIVEN** `buildContinuationMessage({ stepName: "spec-fixer", findingsPath: "/path/to/findings.md", slug: "my-slug" })` を呼ぶ  
**WHEN** 返り値を確認する  
**THEN** request.md の全文・project.md・worktree パス等の大量のコンテキストが含まれない（短縮 prompt であること）

---

### TC-FH-12

- **Priority**: should
- **Source**: T-02 buildContinuationMessage spec

**GIVEN** `buildContinuationMessage({ stepName: "build-fixer", findingsPath: "/path/findings.md", slug: "s" })` を呼ぶ  
**WHEN** 返り値を確認する  
**THEN** "verification" という語が含まれる（build-fixer は verification からの findings）

---

### TC-FH-13

- **Priority**: should
- **Source**: T-02 buildContinuationMessage spec

**GIVEN** `buildContinuationMessage({ stepName: "spec-fixer", findingsPath: "/path/findings.md", slug: "s" })` を呼ぶ  
**WHEN** 返り値を確認する  
**THEN** "reviewer" という語が含まれる（spec-fixer / code-fixer は reviewer からの findings）

---

### TC-FH-14

- **Priority**: should
- **Source**: T-03, 複数 run の扱い

**GIVEN** `state.steps["spec-fixer"]` に 2 件の StepRun があり、最後の run の `sessionId` が `"sess-latest"` の JobState  
**WHEN** `getPreviousSessionId(state, "spec-fixer")` を呼ぶ  
**THEN** `"sess-latest"`（最後の run の sessionId）を返す

---

### TC-FH-15

- **Priority**: could
- **Source**: T-02 interface spec

**GIVEN** `FIXER_STEP_NAMES` が `ReadonlySet<string>` 型で定義されている  
**WHEN** TypeScript の型チェックを実行する  
**THEN** `bun run typecheck` が green（型定義が正確）

---

## Category: StepExecutor resumeSessionId injection

### TC-EX-01

- **Priority**: must
- **Source**: T-04, D2

**GIVEN** `state.steps["spec-fixer"]` に `sessionId: "sess-prev"` を持つ StepRun が 1 件あり、step.name が `"spec-fixer"` の場合  
**WHEN** `StepExecutor.runAgentStep()` が `AgentRunContext` を構築する  
**THEN** `ctx.resumeSessionId` が `"sess-prev"` に設定される

---

### TC-EX-02

- **Priority**: must
- **Source**: T-04, D2

**GIVEN** `state.steps["spec-fixer"]` が空（初回実行）の場合  
**WHEN** `StepExecutor.runAgentStep()` が `AgentRunContext` を構築する  
**THEN** `ctx.resumeSessionId` が `undefined` または `null`（新規 session）

---

### TC-EX-03

- **Priority**: must
- **Source**: T-04, D2, req#4

**GIVEN** step.name が `"spec-reviewer"` / `"implementer"` / `"design"` 等の非 fixer ステップで、前回の run に sessionId がある場合  
**WHEN** `StepExecutor.runAgentStep()` が `AgentRunContext` を構築する  
**THEN** `ctx.resumeSessionId` が設定されない（reviewer 等は常に新規 session）

---

### TC-EX-04

- **Priority**: should
- **Source**: T-04, D2

**GIVEN** `state.steps["build-fixer"]` に `sessionId: "sess-build"` を持つ StepRun がある場合  
**WHEN** `StepExecutor.runAgentStep()` が `AgentRunContext` を構築する  
**THEN** `ctx.resumeSessionId` が `"sess-build"` に設定される（build-fixer も注入対象）

---

## Category: ClaudeCodeRunner adapter

### TC-CC-01

- **Priority**: must
- **Source**: T-06 test case 1, D3

**GIVEN** `ctx.resumeSessionId` が `"sess-abc"` に設定されている  
**WHEN** `ClaudeCodeRunner.run(ctx)` を呼ぶ  
**THEN** `queryFn` に渡される options に `resume: "sess-abc"` が含まれる

---

### TC-CC-02

- **Priority**: must
- **Source**: T-06 test case 2, D3

**GIVEN** `ctx.resumeSessionId` が `undefined` の場合  
**WHEN** `ClaudeCodeRunner.run(ctx)` を呼ぶ  
**THEN** `queryFn` に渡される options に `resume` フィールドが含まれない

---

### TC-CC-03

- **Priority**: must
- **Source**: T-06 test case 3, D4

**GIVEN** `ctx.resumeSessionId` が `"sess-abc"` で、`queryFn` が session 継続エラーを throw する  
**WHEN** `ClaudeCodeRunner.run(ctx)` を呼ぶ  
**THEN**
- warn ログが出力される
- `resume` なしで `queryFn` が再度呼ばれる（フォールバック）
- 最終的に成功を返す
- pipeline が停止しない

---

### TC-CC-04

- **Priority**: must
- **Source**: T-06 test case 4, D4

**GIVEN** `ctx.resumeSessionId` が `"sess-abc"` で、`queryFn` が timeout エラーを throw する  
**WHEN** `ClaudeCodeRunner.run(ctx)` を呼ぶ  
**THEN** フォールバックせずに timeout をそのまま返す（abort は session 継続の問題ではない）

---

## Category: CodexAgentRunner adapter

### TC-CX-01

- **Priority**: must
- **Source**: T-08 test case 1, D3

**GIVEN** `ctx.resumeSessionId` が `"thread-123"` に設定されている  
**WHEN** `CodexAgentRunner.run(ctx)` を呼ぶ  
**THEN**
- `codex.resumeThread("thread-123")` が呼ばれる
- `codex.startThread()` は呼ばれない

---

### TC-CX-02

- **Priority**: must
- **Source**: T-08 test case 2, D3

**GIVEN** `ctx.resumeSessionId` が `undefined` の場合  
**WHEN** `CodexAgentRunner.run(ctx)` を呼ぶ  
**THEN**
- `codex.startThread()` が呼ばれる
- `codex.resumeThread()` は呼ばれない

---

### TC-CX-03

- **Priority**: must
- **Source**: T-08 test case 3, D4

**GIVEN** `ctx.resumeSessionId` が設定されていて `codex.resumeThread()` がエラーを throw する  
**WHEN** `CodexAgentRunner.run(ctx)` を呼ぶ  
**THEN**
- warn ログが出力される
- `codex.startThread()` でフォールバックして実行する
- 成功を返す

---

### TC-CX-04

- **Priority**: must
- **Source**: T-08 test case 4, D6

**GIVEN** `ctx.resumeSessionId` が設定されていて `codex.resumeThread()` が成功する  
**WHEN** `CodexAgentRunner.run(ctx)` の戻り値を確認する  
**THEN** `result.sessionId` が `thread.id` と一致する（StepRun への sessionId 永続化が保証される）

---

## Category: ManagedAgentRunner adapter

### TC-MA-01

- **Priority**: must
- **Source**: T-10 test case 1, D3

**GIVEN** `ctx.resumeSessionId` が `"session-existing"` に設定されている  
**WHEN** `ManagedAgentRunner.run(ctx)` を呼ぶ  
**THEN**
- `createSession()` が呼ばれない
- `sendUserMessage("session-existing", message)` が呼ばれる

---

### TC-MA-02

- **Priority**: must
- **Source**: T-10 test case 2, D3

**GIVEN** `ctx.resumeSessionId` が `undefined` の場合  
**WHEN** `ManagedAgentRunner.run(ctx)` を呼ぶ  
**THEN** `createSession()` が呼ばれる（従来動作）

---

### TC-MA-03

- **Priority**: must
- **Source**: T-10 test case 3, D4

**GIVEN** `ctx.resumeSessionId` が設定されていて `sendUserMessage()` が session not found エラーを throw する  
**WHEN** `ManagedAgentRunner.run(ctx)` を呼ぶ  
**THEN**
- warn ログが出力される
- `createSession()` → `sendUserMessage()` の通常パスにフォールバックする
- 成功を返す

---

## Category: Fixer buildMessage

### TC-BM-01

- **Priority**: must
- **Source**: T-11, D5

**GIVEN** `state.steps["spec-fixer"]` が空（初回）の JobState  
**WHEN** `spec-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** 現行の full prompt を返す（buildContinuationMessage は呼ばれない）

---

### TC-BM-02

- **Priority**: must
- **Source**: T-11, D5

**GIVEN** `state.steps["spec-fixer"]` に `sessionId: "sess-1"` を持つ StepRun が 1 件ある JobState  
**WHEN** `spec-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** 短縮 prompt（`buildContinuationMessage` の結果）を返す

---

### TC-BM-03

- **Priority**: must
- **Source**: T-12, D5

**GIVEN** `state.steps["code-fixer"]` に `sessionId: "sess-2"` を持つ StepRun が 1 件あり、code-review result が存在する JobState  
**WHEN** `code-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** 短縮 prompt を返す

---

### TC-BM-04

- **Priority**: must
- **Source**: T-12, D5

**GIVEN** `state.steps["code-fixer"]` に StepRun があるが、code-review result が存在しない JobState  
**WHEN** `code-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** `CODE_FIXER_NO_REVIEW_RESULT` エラーを throw する（前提条件チェックは継続時も実行される）

---

### TC-BM-05

- **Priority**: must
- **Source**: T-13, D5

**GIVEN** `state.steps["build-fixer"]` に `sessionId: "sess-3"` を持つ StepRun が 1 件あり、verification result が存在する JobState  
**WHEN** `build-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** 短縮 prompt を返す

---

### TC-BM-06

- **Priority**: must
- **Source**: T-13, D5

**GIVEN** `state.steps["build-fixer"]` に StepRun があるが、verification result が存在しない JobState  
**WHEN** `build-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** `BUILD_FIXER_NO_VERIFICATION_RESULT` エラーを throw する（前提条件チェックは継続時も実行される）

---

### TC-BM-07

- **Priority**: should
- **Source**: D5, req#10

**GIVEN** 2 回目の spec-fixer で短縮 prompt が生成される  
**WHEN** prompt の内容を確認する  
**THEN** 新しい reviewer findings のパスが含まれ、project.md・request.md・full worktree context 等の重複情報が含まれない

---

### TC-BM-08

- **Priority**: should
- **Source**: D5, Step interface

**GIVEN** 3 fixer ステップの buildMessage シグネチャ  
**WHEN** `bun run typecheck` を実行する  
**THEN** `buildMessage(state: JobState, deps: StepDeps): string` のシグネチャが変更されていない（Step interface 互換）

---

### TC-BM-09

- **Priority**: could
- **Source**: D5, T-11/T-12/T-13

**GIVEN** `state.steps["spec-fixer"]` が存在しない（`undefined`）の JobState  
**WHEN** `spec-fixer.buildMessage(state, deps)` を呼ぶ  
**THEN** エラーなく full prompt を返す（undefined 安全）

---

## Category: Scope boundary

### TC-SB-01

- **Priority**: must
- **Source**: req#4, スコープ外定義

**GIVEN** spec-reviewer / code-reviewer ステップが実行される  
**WHEN** `StepExecutor.runAgentStep()` が `AgentRunContext` を構築する  
**THEN** `ctx.resumeSessionId` が設定されない（reviewer は常に新規 session）

---

### TC-SB-02

- **Priority**: must
- **Source**: req スコープ外, architect 判断

**GIVEN** `resume` コマンドによって中断されたジョブが再開される  
**WHEN** resume コマンドが fixer ステップを再実行する  
**THEN** 新規 session を作成する（前回の sessionId を使わない）

---

### TC-SB-03

- **Priority**: should
- **Source**: req スコープ外

**GIVEN** config.json / settings に session 継続を制御するフィールドが存在しない  
**WHEN** `bun run typecheck` を実行する  
**THEN** 新しい config フィールドが追加されていない（固定動作、YAGNI）

---

## Category: Acceptance criteria

### TC-AC-01

- **Priority**: must
- **Source**: 受け入れ基準#1, #2

**GIVEN** spec-fixer / code-fixer / build-fixer の 2 回目以降の iteration が実行される  
**WHEN** パイプラインが fixer ステップを再実行する  
**THEN** `AgentRunContext.resumeSessionId` に前回の sessionId が設定され、adapter が既存 session を継続する

---

### TC-AC-02

- **Priority**: must
- **Source**: 受け入れ基準#3, D4

**GIVEN** session 継続に失敗（session 期限切れ・adapter エラー等）した場合  
**WHEN** adapter がエラーを受け取る  
**THEN**
- warn ログが記録される
- 新規 session にフォールバックして実行される
- pipeline が停止しない

---

### TC-AC-03

- **Priority**: must
- **Source**: 受け入れ基準#6

**GIVEN** 実装が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** すべて green（型エラーなし、全テスト pass）

---

### TC-AC-04

- **Priority**: should
- **Source**: 受け入れ基準#5, D8

**GIVEN** spec-fixer が 2 iteration 実行された（session 継続あり）  
**WHEN** `state.steps["spec-fixer"]` を参照する  
**THEN** 2 件の StepRun が記録されており、`modelUsage` を合算すると fixer 全体のコストが取れる

---

### TC-AC-05

- **Priority**: should
- **Source**: D1, T-01

**GIVEN** `AgentRunContext` interface に `resumeSessionId?: string` が追加されている  
**WHEN** `resumeSessionId` を指定しない既存の AgentRunner 呼び出しコードを typecheck する  
**THEN** breaking change なし（optional フィールドのため既存コードが全 pass）
