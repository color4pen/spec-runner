# Design: fresh session rollover on context exhaustion

## Context

local runtime の agent step は `ClaudeCodeRunner.run()` の中で **1 回の SDK `query()` = 1 session** として main work を実行する（`src/adapter/claude-code/agent-runner.ts` の `runQuery()`）。session が context window を使い切ると SDK は `Prompt is too long` を含む error result（または throw）を返し、`run()` は `completionReason: "error"` / `code: "CLAUDE_CODE_QUERY_FAILED"` で終わる。

`src/core/step/executor.ts` は `completionReason === "success"` のときにのみ `finalizeStepArtifacts`（commit / push）へ到達し、non-success では `makeNonSuccessHalt` で早期に halt する（executor.ts 377-385）。したがって worktree 上に残った implementer の編集は **一度も commit されない**。GitHub Actions の ephemeral runner ではこの時点で runner ごと成果が消える（実測 C2: implementer 約18.5分稼働 → `Prompt is too long` → executor commit 0件）。

現行コードで確定している事実:

- `src/prompts/fragments.ts` の `COMMIT_DISCIPLINE` は agent の `git add / commit / push` を禁止し、commit は pipeline executor が一括で行う契約
- `src/adapter/claude-code/context-observer.ts` の `isContextExhaustionError()` が context exhaustion 文字列（`prompt is too long` / `context length exceeded` / `context window exceeded`）の fail-closed allowlist 照合の正本として既に存在する（#1070 merged）
- `AgentContextMetrics`（`src/kernel/context-metrics.ts`）は invocation scope の観測値で、`usage.json` の `CommandInvocation.contextMetrics` に永続化される。halt 経路でも `contextOnly: true` エントリとして書かれる（`src/core/step/commit-orchestrator.ts` 559-575）
- `src/adapter/shared/transient-error.ts` の `TRANSIENT_TOKENS` に context exhaustion 文字列は含まれない（fail-closed）。したがって exhaustion は transient retry の対象外で、`retryWithBackoff` を素通りする
- error result 経路（agent-runner.ts 1004）と throw 経路（同 1327）はいずれも `CLAUDE_CODE_QUERY_FAILED` に潰れ、error result 経路のメッセージは `subtype` のみで `errors[]` の本文を捨てている
- `AgentRunner` port は「adapter が agent lifecycle を完結させ、executor は `runner.run(ctx)` の結果だけ扱う」契約（`src/core/port/agent-runner.ts`）

制約:

- pipeline step は増やさない / task 単位 commit も checkpoint commit もしない
- 同一 worktree をそのまま継続利用する
- transient retry の既存挙動は変えない
- 既存テストは無変更で green

## Goals / Non-Goals

**Goals**:

- context exhaustion を（新規 classifier を作らず）`isContextExhaustionError()` を正本として typed に判別し、error result 経路と throw 経路の両方で同じ判定を行う
- context exhaustion 時に、同じ step / 同じ worktree のまま **fresh session** を張って作業を継続する（失敗 session ID は `resume` に渡さない）
- fresh session に「`git diff` / worktree を見る → tasks.md を見る → 既存変更を保持して続きを実装する → 通常の completion report を返す」ことだけを指示する（SpecRunner 側で独自 resume state を作らない）
- rollover 後に成功した場合、step 全体は通常の success として完了し、executor の commit / push は従来どおり最後に1回だけ実行される
- rollover 回数は bounded にし、超過時は typed halt（`CONTEXT_WINDOW_EXHAUSTED`）にする
- 複数 session の context metrics を1つに合成せず、最終 `contextMetrics` は最終 session の観測値とし、rollover 発生は event / observation として残す

**Non-Goals**（request の「スコープ外」を継承）:

- implementer を固定 pipeline step に分割すること
- task 単位の途中 commit / 未完了 worktree の checkpoint commit & push
- sizing gate（task 本数閾値）の変更
- context / compaction の観測機能の再実装（#1070 で実装済み。本変更は観測値を **運ぶ** だけで、観測ロジックは追加しない）
- proactive compact / rollover の token 閾値決定
- provider native compaction policy の上書き
- request 分割規律の変更
- managed / codex adapter への同等機能の展開（それぞれの SDK が exhaustion を観測可能な形で返す保証がないため、本変更は claude-code adapter 内に閉じる）

## Decisions

### D1: rollover loop は `ClaudeCodeRunner.run()` 内の main work 実行単位を包む

main work turn + transient retry（`retryWithBackoff(runMainWorkTurn)`）を1つの「session 試行」とみなし、その外側に bounded な rollover ループを置く。ループは `run()` の既存 `try` ブロック内で閉じ、`agentRedirectCounter` 判定以降の後続処理は従来どおり最終 session の結果に対して1回だけ走る。

- Rationale: `AgentRunner` port の契約は「adapter が agent lifecycle を完結させる」こと。session の生成・破棄・継続は provider 固有の概念であり、`StepExecutor` に持ち上げると core / pipeline に session lifecycle が漏れる。transient retry の内側ではなく外側に置くのは、`isTransientAgentError()` が fail-closed で exhaustion を transient と判定しないため、exhaustion は `retryWithBackoff` を素通りしてループに到達するから（= transient retry の挙動を一切変えずに合成できる）。
- Alternatives considered:
  - **StepExecutor に rollover ループを置く**（`runner.run()` を複数回呼ぶ）: step の startedAt / usage / history の意味が壊れ、commit タイミングの再設計が必要になるため却下。
  - **pipeline step を追加（implementer を分割）**: request のスコープ外。
  - **transient retry の allowlist に exhaustion 文字列を足す**: 同一 session を resume して再実行するだけで context は解放されず、かつ transient retry の既存挙動（backoff / `step:retry` / `transientRetryAttempts`）を汚染するため却下。

### D2: context exhaustion 判定は `isContextExhaustionError()` を唯一の正本として再利用する

adapter 内には「error / error result から判定用テキストを集める」薄い collector だけを置き、判定そのものは `isContextExhaustionError()` に委譲する。collector は (a) SDK error result の `errors[]` を join した文字列、(b) throw された Error の `message` と `cause` チェーンの message、の2形態を扱う。

- Rationale: 受け入れ条件が「新規 classifier を作らない」ことを明示している。文字列 allowlist を2箇所に持つと fail-closed の境界が二重管理になる。`cause` チェーンを辿るのは、SDK 由来の例外が `Claude Code SDK query failed: ...` の形にラップされて到達する経路があるため。
- Alternatives considered:
  - **`transient-error.ts` に exhaustion トークンを追加**: transient retry の意味論を壊す（D1 参照）。
  - **`transient-error.ts` の message 収集ロジックを export して共有**: shared 層に置くと provider 非依存に見えるが、exhaustion 判定は provider 固有文字列であり request が「provider 固有の文字列判定は adapter 内に閉じる」と指示しているため、collector も adapter 内に置く。

### D3: typed code `CONTEXT_WINDOW_EXHAUSTED` を導入し、error 詳細を潰さない

main work の error result 経路と throw 経路の両方で、exhaustion と判定されたときのみ `AgentRunResult.error.code` を `CONTEXT_WINDOW_EXHAUSTED` にする。あわせて error result 経路のメッセージを「subtype のみ」から「subtype + `errors[]` の本文（上限長で truncate）」に拡張する。

- Rationale: rollover 条件・halt 判別・log / usage 解析のすべてがこの code を見る。現状の `Claude Code SDK query failed: ${subtype}` は `error_during_execution` のような generic subtype だけを残し原因文字列を捨てるため、post-mortem が実質不可能（C2 の RCA が難航した直接原因）。code は `makeNonSuccessHalt` を経て state.json の `ErrorInfo` に載るので、typed halt はこの1点で成立する。
- Alternatives considered:
  - **generic code のまま message を downstream で正規表現照合**: 型のない結合が増え、core 側に provider 文字列が漏れるため却下。
  - **`src/errors.ts` の `ERROR_CODES` に登録**: 既存の adapter-local code（`CLAUDE_CODE_QUERY_FAILED` / `AGENT_REDIRECT_LIMIT_EXCEEDED`）はいずれもインライン文字列で、`ERROR_CODES` は CLI / domain 系 code の集合。慣例に合わせ adapter local の exported const にする。

### D4: rollover 回数は config `contextRollover.maxRollovers`（default 1、0 で無効）で bound する

`transientRetry` と同じ構造（types + resolver + zod validation + docs）で config 節を1つ足し、`resolveContextRolloverConfig(config)` で解決する。

- Rationale: 「bounded にする」が受け入れ条件。default 1（= 最大2 session）にするのは、rollover 1回で丸ごと1 session ぶんの探索コストと実時間（C2 で約18.5分）が追加されるため。既定の step timeout は `null`（無制限）なので、実時間の上限は rollover 回数でしか縛れない。2回目も枯渇する workload は「1 request が大きすぎる」という別の問題であり、typed halt で可視化するほうが正しい。運用側で上げられるよう config 化する。
- Alternatives considered:
  - **ハードコード定数**: 実測が貯まる前に運用側で調整できない。
  - **token 閾値による proactive rollover**: request のスコープ外（#1070 の実測を待つ）。

### D5: rollover prompt は「同じ base prompt + 継続セクション」を completion directive の直前に挿入する

fresh session へ送る prompt は `baseFullPrompt`（step の task message + artifact bundle + touched files + resume context + additionalInstructions）+ `promptRules` + **rollover 継続セクション** + completion directive の順で組み立てる。継続セクションは adapter local の pure module が組み立て、次の4点のみを指示する:

1. まず `git status` / `git diff` で worktree の現状（前 session が書き出した変更）を確認する
2. change folder の `tasks.md`（および該当する成果物）を読み、未完了項目を把握する
3. 既存の変更を revert / 再作成せず、保持したまま続きを実装する
4. 全タスク完了後に通常の completion report（report_result）を返す

- Rationale: fresh session は前 session の会話を一切持たないため、task 本体（buildMessage + artifacts）は必ず必要で、継続セクションだけを送る設計は成立しない。継続セクションを completion directive より前に置くのは、「completion directive が prompt 末尾に来る」という既存の不変条件を壊さないため。進捗の正本を git / worktree と `tasks.md` に置き、SpecRunner 側で未完了 task を解析した独自 resume state を作らないのは request の明示指示。
- Alternatives considered:
  - **SpecRunner が未完了 task を解析して差分 prompt を生成**: request が明示的に禁止。パーサ精度に依存する脆い経路でもある。
  - **`resumePrompt` 経路に載せる**: `resumePrompt` は operator 由来の one-shot 入力であり意味が異なる。

### D6: rollover 時は「捨てる session に属する状態」だけを破棄し、worktree 由来の事実は引き継ぐ

破棄するもの: `queryOptions.resume`（失敗 session ID を渡さない）、捕捉済み session ID、捕捉済み report tool result、現 session の `ContextObserver`。あわせて既存の resume→fresh fallback が二重発火しないようその latch を立てる。引き継ぐもの: touched files 収集用の assistant message 蓄積（worktree に対する事実の和集合）、`modelUsage`（実際に発生したコスト。捨てた session の error result が `modelUsage` を持つ場合は加算する）、共有 `abortController` / step timeout timer / inactivity watchdog。

- Rationale: 「失敗 session ID を resume に渡さない」は受け入れ条件そのもの。report tool result を残すと、捨てた session の完了報告が fresh session 側の abort settle 経路で success として採用され得るため、session と寿命を揃える必要がある。逆に touched files とコストは worktree / 課金の事実であり session をまたいでも有効。timer を共有し続けることで、step timeout を設定している環境では rollover を含めた総実時間が従来どおり bound される。
- Alternatives considered:
  - **rollover ごとに timeout / watchdog をリセット**: 総実時間が rollover 回数倍に伸び、既存の timeout 契約を弱めるため却下。
  - **report tool result を保持**: 上記の誤 settle リスクがあるため却下。

### D7: context metrics は session 単位で分離し、rollover 観測は別チャネルで残す

`ContextObserver` を `run()` に1つではなく **session ごと** に持つ（rollover 時に新しい observer へ差し替える）。最終 `AgentRunResult.contextMetrics` は最終 session の observer snapshot。捨てた session の snapshot は `markExhaustion()` 適用後に `AgentRunResult.sessionRollovers[]`（新規 optional field）へ積み、あわせて `step:rollover` domain event を emit する。`StepExecutor` はこの配列を success 結果 / `StepHalt` に素通しし、`CommitOrchestrator` が各要素を `usage.json` の `contextOnly: true` エントリとして append する。

- Rationale: 「複数 session の context metrics を1つに合成しない」が受け入れ条件。peak / `exhaustionAtTokens` は invocation 単位の意味論（`kernel/context-metrics.ts` の doc）を持つため、session をまたいで max を取ると意味が壊れる。捨てた session の `exhaustionAtTokens` は #1070 が貯めようとしている実測そのもので、rollover が成功すると usage.json から消えてしまうため、`contextOnly` エントリという **既存の永続化形式** に載せて残す（新しい観測機構は作らない）。event は実行中の可視化と log 保全、usage entry は post-mortem 用の durable な記録という役割分担。
- Alternatives considered:
  - **event のみ（永続化しない）**: 受け入れ条件は満たすが、ephemeral runner では log ごと失われ、rollover 成功時に exhaustion 実測が残らない。本 issue の動機（実測の蓄積）と衝突するため却下。
  - **1つの observer に合成**: 受け入れ条件違反。
  - **state.json の StepRun に配列を追加**: usage.json 側に既に context 観測用の入れ物（`contextOnly`）があり、置き場所を二重化しない。

### D8: rollover は main work turn のみに適用し、typed 判定は全 query 経路に適用する

follow-up 系 turn（report_result retry / postWorkPrompts / outputVerification repair）は exhaustion を検出しても rollover しない。これらの経路では従来どおり error / best-effort 継続とし、error を返す場合の code だけ typed 化する。

- Rationale: follow-up turn は「同一 session に resume して報告を得る」ことが本質で、fresh session では代替できない（新 session は前 session の作業内容を報告できない）。また main work success 後の follow-up 失敗を rollover すると、成功済みの作業をやり直すことになり有害。判定自体は全経路で同じ関数を使うことで「SDK throw 経路でも同じ判別」という受け入れ条件を満たす。
- Alternatives considered:
  - **follow-up も rollover する**: 上記の理由で意味が成立しない。

### D9: rollover は step 種別で制限せず、claude-code adapter の全 agent step に適用する

- Rationale: exhaustion は provider レベルの実行資源の問題であり、step 定義（core）に provider 固有の耐障害ポリシーを持ち込むと責務が濁る。継続セクションの文面も「前 session が worktree に書いた変更があればそれを保持し、無ければそのまま作業を続ける」という read-only step でも安全に解釈できる書き方にする（review step はもともと worktree の diff を読む）。実運用上 context を使い切るのは implementer が支配的なので、適用範囲を広げても発火頻度は変わらない。
- Alternatives considered:
  - **implementer 限定**: adapter が step 名（`STEP_NAMES`）に依存することになり、将来 code-review 等が枯渇したときに救えない。

## Risks / Trade-offs

- [fresh session が探索をやり直すため、コストと実時間が最大2倍になる] → Mitigation: default `maxRollovers: 1` で上限を1回に固定。捨てた session の `modelUsage` は加算して記録し、コスト増が usage.json / cost 集計で可視化されるようにする（D6）。
- [fresh agent が既存の未 commit 変更を revert / 二重実装する] → Mitigation: 継続セクションで「まず `git status` / `git diff` を確認」「既存変更を保持」を明示（D5）。破壊が起きた場合も verification step が build / test で検出し、既存の implementer 再入ループに戻る。
- [provider の文言変更で `isContextExhaustionError()` が false を返す（fail-closed の false negative）] → Mitigation: rollover しない = 従来どおりの halt に degrade するだけ。allowlist の更新点が1箇所（context-observer.ts）に閉じているため追随コストが低い。
- [rollover が「request が大きすぎる」問題を隠蔽する] → Mitigation: rollover 発生は `step:rollover` event と usage.json の `contextOnly` エントリとして必ず残る。budget 超過時は `CONTEXT_WINDOW_EXHAUSTED` の typed halt になり、hint で request 分割を促す。
- [rollover budget を超えた halt では、未 commit の worktree 成果が依然として失われる] → Trade-off: checkpoint commit は明示的にスコープ外。本変更は「1回の rollover で救える範囲を救う」ことに限定し、成果保全の恒久策は別 issue に委ねる。
- [複数 session ぶんの usage.json エントリが増える] → Mitigation: 追加分は `contextOnly: true` で、attestation / コスト集計は既に `contextOnly` エントリを skip する（`src/core/attestation/build-attestation.ts` 147）。集計結果は不変。
- [step timeout 未設定（default null）の環境では rollover により総実時間が伸びる] → Mitigation: 回数上限のみで bound（D4）。timeout 設定時は timer を共有するため従来の上限が維持される（D6）。

## Open Questions

- `contextRollover.maxRollovers` の default は 1 が妥当か 2 が妥当か。#1070 で貯まる `exhaustionAtTokens` / rollover 発生率の実測を見て再評価する（本変更では 1 で入れる）。
- exhaustion が follow-up turn（postWork / outputVerification repair）で頻発する場合、そこにも別の緩和（follow-up prompt の縮小など）が必要か。本変更では観測のみ（typed code）に留める。
- 将来 codex / managed adapter でも同じ rollover を提供する場合、`AgentRunResult.sessionRollovers` の意味論をそのまま共有できるか（provider が session 概念を持たない場合の扱い）。
