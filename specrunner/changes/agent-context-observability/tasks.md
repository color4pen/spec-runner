# Tasks: agent session の active context / compaction observability

実装順序は T-01 → T-08。T-01/T-02 が型の土台、T-03/T-04 が観測、T-05〜T-07 が永続化と表示、T-08 が回帰確認。

## T-01: `AgentContextMetrics` 型を kernel に新設し port から re-export する

- [ ] `src/kernel/context-metrics.ts` を新規作成し、provider-neutral な `AgentContextMetrics` interface を定義する（他 module を一切 import しない pure type module。`src/kernel/model-usage.ts` と同じスタイル）
- [ ] field を定義する: `provider: string`（必須）、`model?: string`、`contextWindowTokens?: number`、`peakActiveContextTokens?: number`、`compactionCount?: number`、`contextTokensBeforeCompaction?: number`、`contextTokensAfterCompaction?: number`、`exhaustionAtTokens?: number`
- [ ] doc comment に次を明記する: (a) 累計 `ModelUsage` とは別物であり累計値から算出してはならないこと、(b) `peakActiveContextTokens` は「provider が 1 request について報告した prompt token 数（input + cacheRead + cacheCreation）の最大値」であること、(c) before/after は「最後に観測した compaction」の値であること、(d) `exhaustionAtTokens` は「exhaustion 検知時点で観測できていた最新の active context」であり溢れた正確な token 数ではないこと、(e) 値は invocation-scope（transient retry / follow-up turn を含む）であること
- [ ] `src/core/port/agent-runner.ts` で `AgentContextMetrics` を import + `export type` re-export する（`ModelUsage` の re-export と同じ形）
- [ ] `AgentRunResult` に `contextMetrics?: AgentContextMetrics` を追加し、「undefined = provider が報告できない / 観測ゼロ（unavailable）」を doc comment に書く
- [ ] `ModelUsage` / `AgentInvocationMetrics` の定義は変更しない

**Acceptance Criteria**:
- `src/kernel/context-metrics.ts` が存在し、`src/` 配下の他 module を import していない
- `AgentContextMetrics` が上記 8 field を持ち、`provider` 以外はすべて optional
- `src/kernel/model-usage.ts` の `ModelUsage` の field は 4 個のまま（差分なし）
- `AgentRunResult.contextMetrics` が port から参照できる
- `bun run typecheck` が green

## T-02: usage.json 永続表現に `contextMetrics` を追加する

- [ ] `src/core/usage/types.ts` の `CommandInvocation` に `contextMetrics?: AgentContextMetrics` を追加する（`src/kernel/context-metrics.ts` から type import）
- [ ] doc comment に「invocationMetrics と異なり nested object として保存する」「absent = 該当 invocation で context metrics が観測できなかった（本機能以前の entry も absent）」を明記する
- [ ] `src/core/usage/store.ts` の `readUsageFile` / `appendInvocation` はロジック変更なしで通ることを確認する（backward compat: 旧 entry は field 欠落のまま読める）
- [ ] `tests/unit/core/usage/context-metrics-types.test.ts` を新規作成し、型 round-trip テストを追加する（`invocation-types.test.ts` と同じスタイルで同じファイルを拡張するのではなく別ファイルとして作成すること。`contextMetrics` を持つ entry と持たない entry が append→read で保持されること）

**Acceptance Criteria**:
- `contextMetrics` を含む `CommandInvocation` が `appendInvocation` → `readUsageFile` で欠落なく round-trip する
- `contextMetrics` を持たない既存 entry を読んでも例外が出ず、field は absent のまま
- 新規テストが green、`tests/unit/core/usage/store-backward-compat.test.ts` が引き続き green

## T-03: Claude adapter の context observer（pure module）を実装する

- [ ] `src/adapter/claude-code/context-observer.ts` を新規作成する（I/O なし。SDK message を「見る」だけの pure module）
- [ ] `createContextObserver(input: { provider: string; model?: string })` を実装し、次の API を持たせる:
  - `observe(message: unknown): void` — 1 SDK message を観測する
  - `observeResult(rawResult: Record<string, unknown>): void` — result message から `modelUsage[model].contextWindow` を読む
  - `markExhaustion(errorText: string): void` — context 溢れと分類できた場合のみ `exhaustionAtTokens` を確定する
  - `snapshot(): AgentContextMetrics | undefined` — 観測値が 1 つも無ければ undefined を返す
- [ ] `observe` の assistant message 処理: `type === "assistant"` かつ `parent_tool_use_id` が null/undefined かつ `isReplay !== true` のときのみ、`message.usage` の `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens` を active context 値として扱い、peak（最大値）と last（直近値）を更新する。number でない field は 0 として扱い、3 つとも欠落なら観測しない
- [ ] `observe` の compaction 処理: `type === "system"` かつ `subtype === "compact_boundary"` のとき `compactionCount` を +1 し、`compact_metadata.pre_tokens` / `post_tokens` が number ならそれぞれ `contextTokensBeforeCompaction` / `contextTokensAfterCompaction` を上書きする（後勝ち = 直近の compaction が残る）。`post_tokens` が無い場合は before のみ更新し after は前回値を残さず undefined にする
- [ ] `observeResult`: `modelUsage` が object のとき、resolved model key の `contextWindow` を優先し、無ければ観測できた `contextWindow` の最大値を `contextWindowTokens` に入れる（number 以外は無視）
- [ ] context 溢れ分類器 `isContextExhaustionError(text: string): boolean` を同 module に置く（case-insensitive の token 照合。最低限 `prompt is too long` / `context length exceeded` / `context window exceeded` を含む allowlist 方式。未知の error は false = fail-closed）。`src/adapter/shared/transient-error.ts` は変更しない
- [ ] `markExhaustion`: 分類 true かつ last active context 観測値がある場合のみ `exhaustionAtTokens` を設定する。観測が無ければ何もしない（0 を入れない）
- [ ] `snapshot`: 6 個の観測 field がすべて undefined なら undefined を返す。1 つでも値があれば `provider` / `model` を付けて record を返す
- [ ] `tests/unit/adapter/claude-code/context-observer.test.ts` を追加する（peak 最大値 / sub-agent 除外 / replay 除外 / compaction 回数と直近 before-after / post_tokens 欠落 / contextWindow 抽出 / 溢れ分類 true・false / 観測ゼロで undefined / 溢れ分類 true だが観測ゼロなら exhaustionAtTokens undefined）

**Acceptance Criteria**:
- `context-observer.ts` が `node:fs` / `child_process` / SDK runtime value を import していない（型のみの参照は可）
- 上記すべての観測ケースが単体テストで検証され green
- 累計 usage（`ModelUsage`）から context 値を導出するコードが存在しない
- 観測ゼロで `snapshot()` が undefined を返す

## T-04: `ClaudeCodeRunner` に observer を配線し全 return 経路で `contextMetrics` を返す

- [ ] `run()` 冒頭（`resolvedConfig` 決定後）で `createContextObserver({ provider: "claude-code", model: resolvedConfig.model })` を生成する
- [ ] main work ループ（`runQuery` の `for await`）で message 1 件につき `contextObserver.observe(message)` を 1 回だけ呼ぶ。既存 `observeMessage`（tool progress / tracker）には**混ぜない**
- [ ] `runFollowUpQueryWithRetry` の message ループでも `contextObserver.observe(message)` を 1 回だけ呼ぶ（report-retry / postWork 双方の turn を網羅。`onMessage` とは独立）
- [ ] output-repair ループの message 走査でも `contextObserver.observe(message)` を 1 回だけ呼ぶ
- [ ] result message（success / error subtype の双方）で `contextObserver.observeResult(raw)` を呼ぶ
- [ ] 非 success の result（`lastResult.subtype !== "success"`）を返す経路で、`errors` を join した文字列を `markExhaustion` に渡してから `contextMetrics: contextObserver.snapshot()` を返す
- [ ] catch 節の error 返却経路でも `markExhaustion(cause.message)` を呼んでから `contextMetrics` を返す
- [ ] 次の全 return 経路に `contextMetrics: contextObserver.snapshot()` を付ける: agent redirect 超過 error / 非 success result error / postWork follow-up error / result file not found error / 通常 success / grace-abort success / timeout / catch error
- [ ] `tests/unit/adapter/claude-code/agent-runner-context-metrics.test.ts` を追加する（既存 `agent-runner-invocation-metrics.test.ts` の scaffolding を流用）:
  - success 経路で peak / contextWindow / compaction が `AgentRunResult.contextMetrics` に載る
  - `Prompt is too long` を含む error result で `exhaustionAtTokens` が最後の観測値になり、`completionReason: "error"` の result に `contextMetrics` が載る
  - context 溢れ以外の error では `exhaustionAtTokens` が undefined
  - 観測可能な message が無い invocation では `contextMetrics` が undefined
  - postWork turn を含む run で compaction が二重計上されない
- [ ] `modelUsage` / `invocationMetrics` / `addedTurns` / `touchedFiles` の既存抽出ロジックは変更しない

**Acceptance Criteria**:
- 1 SDK message に対する `observe` 呼び出しが各ループでちょうど 1 回（二重計上テストが green）
- success / error / timeout の全経路で `contextMetrics` が返る（観測が無い場合は undefined）
- 既存の `tests/unit/adapter/claude-code/agent-runner*.test.ts` がすべて green（回帰なし）
- `src/adapter/claude-code/agent-runner.ts` から SDK 型以外の新規依存が増えていない

## T-05: 失敗経路のために `StepHalt` / executor に context metrics を通す

- [ ] `src/core/step/step-halt.ts` の `StepHalt` union（`failed` / `awaiting-resume` の両 variant）に `contextMetrics?: AgentContextMetrics` を追加する
- [ ] `makeNonSuccessHalt` / `makeTimeoutHalt` の第 1 引数型を `Pick<AgentRunResult, "error" | "contextMetrics">` に広げ、渡された `contextMetrics` を halt に載せる（undefined のときは field を付けない）
- [ ] `src/core/step/executor.ts` の timeout / 非 success halt 生成箇所で `runResult` をそのまま渡す（既存 recordOpts の内容は変更しない）
- [ ] `StepExecutionResult`（`src/core/step/commit-orchestrator.ts`）の `kind: "success"` variant に `contextMetrics?: AgentContextMetrics` を追加し、executor の success return で `runResult.contextMetrics` を載せる
- [ ] `src/core/step/step-completion.ts` の `deriveStepCompletion` 入力は変更しない（verdict 導出に context metrics は関与しない）

**Acceptance Criteria**:
- executor が context metrics を success / timeout / 非 success の 3 経路すべてで下流へ渡す
- `StepHalt` の既存 factory の呼び出し互換が保たれる（`contextMetrics` 未指定でコンパイルできる）
- executor が `store.*` を直接呼ばない（B-13）状態が維持される
- `bun run typecheck` が green

## T-06: `CommitOrchestrator` が context metrics を usage.json へ永続化する

- [ ] `applySuccessPostPersistEffects` の `appendInvocation` 呼び出しに `...(result.contextMetrics ? { contextMetrics: result.contextMetrics } : {})` を追加する（既存の `modelUsage` / `invocationMetrics` の扱いは変更しない）
- [ ] `commitHalt(step, state, halt)` に optional な 4 番目の引数 `deps?: PipelineDeps` を追加し、`apply()` の halt 分岐から `deps` を渡す（既存の 3 引数呼び出しは互換のまま）
- [ ] `commitHalt` の先頭（`recordFailedStepResult` の前後どちらでもよいが FSM 遷移・rethrow の順序は変えない位置）で、`halt.contextMetrics` と `deps?.cwd` / `deps?.slug` がすべて揃うときのみ `appendInvocation` を 1 回呼ぶ。entry は `command: "job"`、`timestamp: halt.recordOpts?.completedAt ?? new Date().toISOString()`、`modelUsage: null`、`jobId`、`stepName`、`contextMetrics` のみで構成し、invocation metrics（`numTurns` 等）は載せない
- [ ] append は best-effort（try/catch で握りつぶす）とし、失敗しても halt の persist / transition / rethrow に影響させない
- [ ] `tests/unit/core/step/commit-orchestrator-context-metrics.test.ts` を追加する:
  - success 結果の `contextMetrics` が usage.json entry に入る
  - `contextMetrics` を持つ halt で `modelUsage: null` の entry が 1 件だけ追加され、invocation metrics field が含まれない
  - `contextMetrics` を持たない halt では entry が追加されない
  - usage append が失敗しても halt の throw 挙動が変わらない
- [ ] 既存 `tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts`（TC-019 を含む）を変更せずに green を維持する

**Acceptance Criteria**:
- 成功 step の context metrics が usage.json に永続化される
- exhaustion halt の context metrics が usage.json に 1 entry として残り、`modelUsage` は null
- context metrics の無い halt で usage.json に新規 entry が増えない
- `usage summary` / `job stats` の cost・turns 集計値が追加 entry の有無で変わらないことをテストで確認する
- 既存 commit-orchestrator テストがすべて green

## T-07: `usage show` に context 行を追加する

- [ ] `src/core/command/usage-show.ts` の invocation ループで、既存 `metrics:` 行の直後に `context:` 行を出力する
- [ ] 出力形式: `  context: provider=<p>[  model=<m>][  window=<n>][  peak=<n>][  compactions=<n>][  preCompact=<n>][  postCompact=<n>][  exhaustedAt=<n>]`（既存 `metrics:` 行と同じく token を 2 space 区切りで join し、値が undefined の field は出さない）
- [ ] `contextMetrics` が absent の entry では `context:` 行を出力しない
- [ ] `modelUsage` が null の entry（halt 由来）でも `context:` 行が表示されること（既存の `(no usage data)` 行はそのまま）
- [ ] 集計部（`Totals by model:`）は変更しない
- [ ] `tests/unit/core/command/usage-show-context-metrics.test.ts` を追加する（`usage-show-metrics.test.ts` と同じ scaffolding）:
  - 全 field 揃った entry で全 token が出る
  - 一部 field のみの entry で欠落 field が出ない
  - `contextMetrics` 無し entry で `context:` 行が出ない
  - `modelUsage: null` + `contextMetrics` あり entry で context 行が出て例外にならない

**Acceptance Criteria**:
- context metrics を持つ entry で step 名（既存見出し行）・provider・model・観測値が 1 コマンドで確認できる
- context metrics を持たない entry の出力が本変更前と同一
- 新規テストが green、既存 `usage-show-metrics.test.ts` が green

## T-08: 非対応 provider の unavailable 契約を固定し、全体回帰を確認する

- [ ] `src/adapter/codex/agent-runner.ts` の返却経路に doc comment を追加し、「Codex SDK の `Usage` は context window / compaction を報告しないため `contextMetrics` は設定しない（累計 usage から導出しない）」ことを明記する（ロジック変更なし）
- [ ] `src/adapter/managed-agent/agent-runner.ts`（および `src/adapter/managed-agent/usage.ts` の `mapSessionUsage`）に同趣旨の doc comment を追加する（`SessionUsage` に context field が無い事実を根拠として明記。ロジック変更なし）
- [ ] `tests/unit/adapter/codex/` と `tests/unit/adapter/managed-agent/` に、run 結果の `contextMetrics` が undefined であることを固定するテストを追加する（既存 test の scaffolding を再利用）
- [ ] `bun run typecheck` / `bun run test` / `bun run lint` を実行して green を確認する
- [ ] `tests/unit/architecture/core-invariants.test.ts`（B-1〜B-18）と `tests/unit/dead-code-core.test.ts` が green であることを確認する（新規 export はすべて実使用され、port barrel を再導入していないこと）
- [ ] `tasks.md` の全 checkbox を更新する

**Acceptance Criteria**:
- Codex / Managed runtime で `contextMetrics` が undefined であることがテストで固定されている
- 累計 token usage から context 値を導出する実装が存在しない（レビュー可能な形で doc comment 済み）
- `bun run typecheck` / `bun run test` / `bun run lint` がすべて green
- architecture invariants テストと dead-code テストが green
