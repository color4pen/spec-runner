# Tasks: fresh session rollover on context exhaustion

## T-01: contextRollover config 節を追加する

- [ ] `src/config/schema/types.ts` に `DEFAULT_CONTEXT_ROLLOVER_MAX = 1` と `ContextRolloverConfig { maxRollovers?: number }` を追加し、`SpecRunnerConfig` に `contextRollover?: ContextRolloverConfig` を追加する（`TransientRetryConfig` の隣に、同じ doc comment スタイルで）
- [ ] `src/config/schema/resolution.ts` に `resolveContextRolloverConfig(config): Required<ContextRolloverConfig>` を追加する（`resolveTransientRetryConfig` と同じ形。未指定時 `maxRollovers: DEFAULT_CONTEXT_ROLLOVER_MAX`）
- [ ] `src/config/schema/validation.ts` の schema に `contextRollover: optional(object({ maxRollovers: optional(number.check(int, gte(0))) }, "must be an object."))` を追加する（`transientRetry` の直後、既存の並び順コメントに合わせる）
- [ ] `src/config/schema/index.ts` 等の barrel export がある場合は新しい型 / resolver を再 export する（既存の `resolveTransientRetryConfig` と同じ扱いにする）
- [ ] test: `resolveContextRolloverConfig` の default（1）、明示値（0 / 3）、`contextRollover` を持たない config が valid、`maxRollovers: -1` / 非整数 / 非 object が `CONFIG_INVALID` で拒否されることを検証する（`src/config/__tests__/transient-retry-config.test.ts` に倣った新規テストファイル）

**Acceptance Criteria**:

- `resolveContextRolloverConfig({version:1,agents:{}})` が `{ maxRollovers: 1 }` を返す
- `contextRollover: { maxRollovers: 0 }` が valid で、解決値が 0 になる
- `contextRollover: { maxRollovers: -1 }` / `{ maxRollovers: 1.5 }` / `contextRollover: "1"` が `CONFIG_INVALID` として拒否される
- `contextRollover` を含まない既存 config が引き続き valid（既存 config テストが無変更で green）

## T-02: context exhaustion の typed 判別と error 詳細の保全（rollover なし）

- [ ] `src/adapter/claude-code/agent-runner.ts` に adapter-local な exported const `CONTEXT_WINDOW_EXHAUSTED_CODE = "CONTEXT_WINDOW_EXHAUSTED"` を追加する（`src/errors.ts` の `ERROR_CODES` には追加しない — 既存の adapter-local code と同じ扱い）
- [ ] adapter-local な helper を追加する: (a) SDK result message から `errors[]` を join した文字列を返す関数、(b) 任意の unknown error から `message` + `cause` チェーンの message を集めて連結する関数。いずれも判定は行わず、`isContextExhaustionError()`（`./context-observer.js` から import）に渡すテキストを組み立てるだけにする（design D2）
- [ ] `isContextExhaustionError()` を呼ぶ薄い述語（error result 用 / throw 用）を用意し、新しい文字列 allowlist は一切定義しない
- [ ] main work の non-success error result 分岐（現行 `Claude Code SDK query failed: ${errorResult.subtype}`）を、exhaustion の場合は code `CONTEXT_WINDOW_EXHAUSTED`、それ以外は従来どおり `CLAUDE_CODE_QUERY_FAILED` にする
- [ ] 同分岐の error message を `subtype` + join した `errors[]` 本文（例: 上限 500 文字で truncate、上限超過時は末尾に省略記号）にする。`errors[]` が空のときは従来どおり subtype のみ
- [ ] 外側 catch（throw 経路）でも同じ述語で判定し、exhaustion のときのみ code を `CONTEXT_WINDOW_EXHAUSTED` にする（message / `cause` の保持は現行どおり）
- [ ] follow-up query 失敗分岐（postWorkPrompts の non-success 返却）でも同じ述語を適用して code を typed 化する（rollover はしない — design D8）
- [ ] test（`tests/unit/adapter/claude-code/` 配下の新規ファイル）: error result の `errors[]` に `Prompt is too long` を含む場合 code が `CONTEXT_WINDOW_EXHAUSTED`、`something unexpected` の場合 `CLAUDE_CODE_QUERY_FAILED`、`cause` に exhaustion 文字列を持つ throw で `CONTEXT_WINDOW_EXHAUSTED`、message に subtype と `errors[]` 本文の両方が含まれること

**Acceptance Criteria**:

- 新しい context exhaustion 文字列の allowlist / 正規表現が本変更で追加されていない（判定は `isContextExhaustionError()` 呼び出しのみ）
- exhaustion な error result → `error.code === "CONTEXT_WINDOW_EXHAUSTED"`、非 exhaustion → `"CLAUDE_CODE_QUERY_FAILED"`
- `new Error("query failed", { cause: new Error("Prompt is too long") })` を throw する queryFn で `error.code === "CONTEXT_WINDOW_EXHAUSTED"`
- error result 由来の `error.message` が subtype と `errors[]` 本文の両方を含む
- `src/adapter/shared/transient-error.ts` が本変更で未修正（`TRANSIENT_TOKENS` 不変）
- 既存の transient retry テスト（`src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`）が無変更で green

## T-03: rollover 継続 prompt module を追加する

- [ ] `src/adapter/claude-code/rollover-prompt.ts` を新規作成する（pure module: I/O なし、SDK import なし。`completion-directive.ts` と同じ adapter-local 方針）
- [ ] `buildRolloverContinuationSection(input: { attempt: number; maxRollovers: number }): string` を export する。文面は日本語で、design D5 の4点（`git status` / `git diff` の確認、`tasks.md` の確認、既存変更を revert せず保持して続行、完了後に通常の completion report）を明示する
- [ ] 文面には「前の session が context を使い切ったため新しい session で継続している」旨と、worktree に前 session の未 commit 変更が存在し得ること、それが正本であることを含める。read-only step でも安全に解釈できるよう「変更が無ければそのまま作業を続ける」旨を添える（design D9）
- [ ] 文面に `git add` / `git commit` / `git push` を促す表現を含めない（`COMMIT_DISCIPLINE` 契約の維持）
- [ ] test: 返り値が `git diff` / `tasks.md` / 「保持」相当の指示 / completion report への言及を含むこと、`git commit` を促す文字列を含まないこと、attempt / maxRollovers が文面に反映されること

**Acceptance Criteria**:

- `rollover-prompt.ts` が `src/` 配下の他 module を import しない（あるいは型 import のみ）
- `buildRolloverContinuationSection({ attempt: 1, maxRollovers: 1 })` の返り値が `git diff`・`tasks.md`・既存変更保持・completion report の4要素をすべて含む
- 返り値に `git commit` / `git push` を指示する文言が含まれない

## T-04: ClaudeCodeRunner.run() に bounded fresh-session rollover ループを実装する

- [ ] `runQuery()` が固定の `fullPrompt` closure ではなく引数で prompt を受け取るようにし、`runMainWorkTurn()` が現在の session 用 prompt（可変）を渡すようにする
- [ ] `resolveContextRolloverConfig(ctx.config)` で `maxRollovers` を解決する
- [ ] main work 実行単位（`maxRetries === 0` の直接呼び出し / `retryWithBackoff(runMainWorkTurn, …)`）を関数に括り出し、その外側に最大 `maxRollovers` 回の rollover ループを置く（design D1）。ループは既存 `try` ブロック内に閉じ、ループ脱出後の後続処理（agent redirect 判定、success 抽出、follow-up、outputVerification、result file 読み取り）は従来どおり 1 回だけ実行する
- [ ] ループ内の分岐:
  - 成功 or 非 exhaustion の error result → ループ脱出（従来経路へ）
  - exhaustion の error result / throw かつ `abortController.signal.aborted === false` かつ rollover 残数あり → rollover 実行して次イテレーション
  - exhaustion だが rollover 残数なし → ループ脱出し、`CONTEXT_WINDOW_EXHAUSTED` の error を返す（message に rollover 回数を使い切った旨、hint に request 分割の示唆を入れる）
  - abort 発火中 → rollover せず従来どおり再 throw（timeout / watchdog 経路を保持）
- [ ] rollover 実行の内容（design D6）: `delete queryOptions["resume"]`、`extractedSessionId = undefined`、`capturedToolResult = null`、resume→fresh fallback の latch（`resumeFallbackDone`）を true にする、現 session prompt を `baseFullPrompt + promptRules + buildRolloverContinuationSection(...) + firstTurnCompletionDirective` に差し替える
- [ ] 捨てた session の error result が `modelUsage` を持つ場合は `extractedModelUsage` に per-model 加算する（既存 follow-up 加算と同じ形）
- [ ] rollover 時に `stderrWrite` の warn 行と `logVerbose("session", …)` を出す（step 名・rollover 回数・上限・理由）
- [ ] `touchedFileMessages` は rollover 後もそのまま蓄積を継続する（リセットしない）
- [ ] test: (1) 1 回目 exhaustion → 2 回目 success で query が 2 回呼ばれ `completionReason === "success"`、(2) 2 回目の options に `resume` が無く `cwd` が同一、(3) 2 回目の prompt に継続セクションと元の task 本文が含まれる、(4) 毎回 exhaustion で query が `maxRollovers + 1` 回で止まり `CONTEXT_WINDOW_EXHAUSTED`、(5) `maxRollovers: 0` で rollover しない、(6) 非 exhaustion error で rollover しない、(7) 1 回目で report tool を呼んだ後に exhaustion したケースで最終 `toolResult` に前 session の報告が残らない

**Acceptance Criteria**:

- rollover ループが `ClaudeCodeRunner.run()` 内にあり、`src/core/` 配下に session lifecycle 制御が追加されていない
- exhaustion が続く場合の query 呼び出し回数が `maxRollovers + 1` で bounded（無限ループしない）
- fresh session の query options に `resume` キーが存在しない
- `maxRollovers: 0` および非 exhaustion error では query が 1 回のみ
- abort（step timeout / watchdog）発火時に rollover が起きず、`completionReason === "timeout"` の既存挙動が保たれる
- 既存 adapter テスト（`agent-runner.test.ts` / `agent-runner-transient-retry.test.ts` / `agent-runner-inactivity-timeout.test.ts` / `agent-runner-report-settles.test.ts`）が無変更で green

## T-05: session 単位 context metrics と rollover observation を実装する

- [ ] `src/core/port/agent-runner.ts` に `AgentSessionRollover` を追加する: `{ attempt: number; reason: "context-exhaustion"; sessionId?: string; errorMessage: string; contextMetrics?: AgentContextMetrics }`（`AgentContextMetrics` は既存 import を再利用。`src/kernel/` には import ゼロ規約があるため新しい型を kernel に置かない）
- [ ] `AgentRunResult` に `sessionRollovers?: AgentSessionRollover[]` を追加し、doc comment で「absent = rollover 未発生 / 非対応 runtime」「`contextMetrics` は各 session 個別の観測値であり最終 `contextMetrics` と合成しない」ことを明記する
- [ ] `agent-runner.ts` の `contextObserver` を `const` から `let` に変え、rollover 時に `createContextObserver({ provider: "claude-code", model: resolvedConfig.model })` で新規生成して差し替える（design D7）
- [ ] rollover 実行時に、差し替え前の observer に対して exhaustion テキストで `markExhaustion()` を呼んでから `snapshot()` を取り、`sessionRollovers` に push する（`errorMessage` は truncate 済みテキスト、`sessionId` は捨てる session の ID があれば設定）
- [ ] `run()` の全 return 経路（success / 各 error / timeout）で `sessionRollovers` が非空のときのみ当該フィールドを含める
- [ ] `src/kernel/event-types.ts` の `DomainEvent` に `"step:rollover"` を追加し、`src/core/event/types.ts` の `EventPayloadMap` に `{ step: string; attempt: number; maxRollovers: number; reason: "context-exhaustion" }` を追加する
- [ ] rollover 時に `ctx.emit("step:rollover", …)` する
- [ ] `src/logger/pipeline-logger.ts` に `step:rollover` の購読を追加して JSONL に書き出す（`step:retry` と同じ形）
- [ ] `src/cli/progress.ts` に `step:rollover` の購読を追加し、`step:retry` 表示に倣って 1 行表示する（context 枯渇のため新しい session で継続する旨、attempt / maxRollovers 付き）
- [ ] test: 1 回目の active context が 2 回目より大きい message stream で、最終 `contextMetrics.peakActiveContextTokens` が 2 回目の値と一致し、`sessionRollovers[0].contextMetrics.exhaustionAtTokens` が 1 回目の観測値になること。`step:rollover` event が 1 回、正しい payload で emit されること

**Acceptance Criteria**:

- rollover 発生時、最終 `AgentRunResult.contextMetrics` に 1 回目 session の peak が混入しない
- `sessionRollovers.length` が rollover 回数と一致し、各要素の `attempt` が 1 始まりの連番
- rollover 未発生時は `sessionRollovers` が undefined（既存の result 形状が不変）
- `step:rollover` event が rollover ごとに 1 回 emit され、pipeline logger の JSONL に記録される
- `src/kernel/` 配下に新規 import が追加されていない

## T-06: rollover observation を executor / halt / usage.json へ伝播する

- [ ] `src/core/step/executor.ts` の agent step 成功経路で `runResult.sessionRollovers` を `StepExecutionResult`（kind: "success"）へ素通しする（`contextMetrics` と同じく「非 undefined のときのみ spread」パターン）
- [ ] `src/core/step/commit-orchestrator.ts` の `StepExecutionResult` success variant に `sessionRollovers?: AgentSessionRollover[]` を追加する
- [ ] `src/core/step/step-halt.ts` の `StepHalt`（failed / awaiting-resume 双方）に `sessionRollovers?: AgentSessionRollover[]` を追加し、`makeNonSuccessHalt` / `makeTimeoutHalt` が `runResult.sessionRollovers` を（存在時のみ）転記するようにする（引数の `Pick<AgentRunResult, …>` に field を追加）
- [ ] `commit-orchestrator.ts` の `applySuccessPostPersistEffects` で、`sessionRollovers` の各要素について `contextMetrics` を持つものだけ `appendInvocation` に `contextOnly: true` / `modelUsage: null` / `stepName` 付きで best-effort 追記する（既存の usage 追記と同じ try/catch 方針。既存の 1 件追記の前に rollover 分を追記する）
- [ ] `commitHalt` の context metrics 永続化ブロックでも同様に `halt.sessionRollovers` 分を best-effort 追記する
- [ ] test: rollover observation 1 件を含む success 結果で usage.json に `contextOnly: true` エントリが 1 件追加されること、halt 経路でも同様に追記されること、`sessionRollovers` が無い場合に usage.json の出力が従来と完全に一致すること（`tests/unit/core/step/commit-orchestrator-context-metrics.test.ts` に倣う）

**Acceptance Criteria**:

- rollover 1 回 + 最終 success の step で usage.json に「rollover 分の `contextOnly` エントリ」+「通常の success エントリ」が記録される
- rollover 分エントリは `modelUsage: null` かつ `contextOnly: true`（コスト集計・attestation が skip する形）
- `sessionRollovers` 不在時の usage.json 出力が従来と byte 等価
- usage 追記失敗が step の成功 / halt の FSM 遷移を妨げない（best-effort が維持される）

## T-07: rollover 後の success が単一 commit で完了することを検証する

- [ ] `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` の既存パターンに倣い、queryFn が 1 回目 exhaustion / 2 回目 success を返す構成で `StepExecutor` 経由の agent step 実行テストを追加する
- [ ] `finalizeStepArtifacts`（または runtimeStrategy の該当 seam）の呼び出し回数が 1 回であること、step 結果が success として記録されることを assert する
- [ ] rollover budget 超過ケースで halt が生成され、その `error.code` が `CONTEXT_WINDOW_EXHAUSTED` として state に記録されることを assert する（`finalizeStepArtifacts` は呼ばれない）

**Acceptance Criteria**:

- rollover 後 success の step で commit / push 相当の seam が 1 回だけ呼ばれる
- rollover budget 超過時の halt の `error.code` が `CONTEXT_WINDOW_EXHAUSTED`
- 既存の executor 系テストが無変更で green

## T-08: ドキュメントを更新する

- [ ] `docs/configuration.md` の "Transient error retries" 節の近くに "Context rollover"（fresh session rollover）節を追加し、`contextRollover.maxRollovers` の default（1）・0 で無効・local runtime の claude-code adapter のみ適用であることを表形式で記載する
- [ ] 同節に「rollover 発生は `usage.json` の `contextOnly` エントリと `step:rollover` event として記録される」旨を 1〜2 行で補足する
- [ ] `docs/operations.md` に context 枯渇時の挙動（fresh session で継続 → 超過時は `CONTEXT_WINDOW_EXHAUSTED` halt → request 分割を検討）へのごく短い言及を追加する（既存の見出し構成に合わせ、新しい章立てを増やさない）

**Acceptance Criteria**:

- `docs/configuration.md` に `contextRollover.maxRollovers` の説明と default 値 1 が記載されている
- `docs/operations.md` に `CONTEXT_WINDOW_EXHAUSTED` halt 時の対処が 1 箇所記載されている
- 既存の docs 系テスト（`tests/unit/docs/`）が無変更で green

## T-09: 検証と回帰確認

- [ ] `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` を実行して green にする
- [ ] 既存テストを一切変更していないことを確認する（変更が必要になった場合は、その変更が spec 上の意図的な振る舞い変更かを design と突き合わせて判断し、そうでなければ実装側を直す）
- [ ] `tasks.md` の各チェックボックスを完了状態に更新する

**Acceptance Criteria**:

- build / typecheck / test / lint がすべて成功する
- 本変更で追加したテスト以外の既存テストファイルに差分が無い
- rollover を発火させないパス（通常 success / transient retry / timeout / abort）の挙動が従来と同一
