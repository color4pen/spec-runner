# Tasks: Claude / Codex provider lifecycle parity contract

> **共通ルール（全 task に適用）**
>
> - `src/**` を **一切変更しない**。新規追加も禁止。追加先は
>   `tests/unit/contract/provider-lifecycle/` 配下のみ。
> - 既存テストファイル（`src/adapter/*/__tests__/`、`tests/unit/adapter/`、`tests/adapter/`、
>   `tests/unit/contract/agent-runner-contracts.test.ts`）を削除・変更しない。
> - 期待値は **現行実装の読解と既存テストの実測から先に決める**。
>   red が出たら実装ではなく「期待値と実測の突合」を行い、実測が正なら期待値を実測へ合わせ、
>   その根拠（該当ソース行 / 既存テスト名）をコード近傍のコメントに残す。
> - 実 SDK / 外部 API へ接続しない。wall-clock 待機を置かない。
> - 説明できない provider 差を見つけたら片方へ寄せず、`UNEXPLAINED:` プレフィックス付き reason で
>   記録して停止・報告する（T-09 参照）。

## T-01: contract suite の骨組みと frozen case ID 一覧を置く

- [ ] `tests/unit/contract/provider-lifecycle/case-ids.ts` を新規作成する
- [ ] `LIFECYCLE_AREAS` を `as const` 配列で定義する:
      `main-work` / `report` / `post-work` / `output-repair` / `transient` / `timeout` /
      `context` / `metrics` / `completion-error`
- [ ] `CONTRACT_PROVIDERS` を `as const` 配列で定義する: `claude-code`, `codex`
- [ ] `REQUIRED_CASE_IDS` を **手書きの `as const` literal 配列**として定義する（31 件）:
      - `main-work.success-minimal`
      - `main-work.result-file-content`
      - `report.first-turn-success`
      - `report.follow-up-recovers`
      - `report.follow-up-budget-exhausted`
      - `report.settle-on-abort-with-captured-report`
      - `report.parse-failure-diagnostics`
      - `post-work.single-prompt-adds-turn`
      - `post-work.excluded-from-follow-up-attempts`
      - `output-repair.violation-then-clean`
      - `output-repair.budget-exhausted`
      - `output-repair.detect-failure-skips-loop`
      - `transient.retry-then-success`
      - `transient.budget-exhausted`
      - `transient.non-transient-not-retried`
      - `transient.disabled-omits-attempts-field`
      - `timeout.inactivity-watchdog`
      - `timeout.wall-clock-step-timeout`
      - `timeout.abort-not-retried`
      - `context.exhaustion-typed-error`
      - `context.rollover-recovers-in-fresh-session`
      - `context.rollover-budget-exhausted`
      - `metrics.model-usage-populated`
      - `metrics.invocation-metrics-presence`
      - `metrics.context-metrics-presence`
      - `metrics.touched-files-presence`
      - `metrics.added-turns-invariant`
      - `metrics.session-rollovers-absent-without-rollover`
      - `completion-error.generic-sdk-failure-code`
      - `completion-error.result-file-not-found`
      - `completion-error.success-field-coherence`
- [ ] `case-ids.ts` は他の contract module を **import しない**（依存の向きを一方向に保つ）
- [ ] ファイル冒頭に「この配列が case ID の正典であり、case table から導出しない」旨の
      doc comment を書く

**Acceptance Criteria**:
- `tests/unit/contract/provider-lifecycle/case-ids.ts` が存在し、`REQUIRED_CASE_IDS` の要素数が 31 である
- `REQUIRED_CASE_IDS` に重複がない（`new Set(...).size === 31`）
- 各 ID の `.` 前の部分が `LIFECYCLE_AREAS` のいずれかに一致する
- `case-ids.ts` に `import` 文が存在しない（型 import を含め 0 件）
- `bun run typecheck` が通る

## T-02: provider-neutral な scenario script 型と共有 context builder を定義する

- [ ] `tests/unit/contract/provider-lifecycle/scenario.ts` を新規作成する
- [ ] turn behavior 型を定義する（識別子は design D2 に一致させる）:
      `complete-with-report` / `complete-without-report` / `complete-with-unparseable-report` /
      `fail-transient` / `fail-non-transient` / `fail-context-exhaustion` / `stall-until-abort`
- [ ] `complete-with-report` は provider-neutral な report payload（`{ ok: boolean; ... }`）を持つ
- [ ] `complete-*` は provider-neutral な usage / metrics ヒント
      （input/output/cache トークン数、turn 数、duration、cost、touched file パス、
      context window サイズ）を optional で持てるようにする
- [ ] `stall-until-abort` は abort 前に通知する tool 名 / target を optional で持てるようにする
- [ ] `LifecycleScenario` 型を定義する: `turns`（turn behavior の配列）、
      `afterScript`（`"repeat-last"` 固定）、`policy`（reportTool 有無 / postWorkPrompts /
      toolReportRetry / outputVerification の宣言）、`config`（transientRetry / contextRollover /
      steps.timeoutMs の宣言）、`resultFile`（`null` | `{ path, content? }`）、
      `usesFakeTimers`（boolean）
- [ ] `harness/types.ts` を新規作成し、`ProviderHarness` インターフェースを定義する:
      `id`、`build(scenario, opts) => { runner: AgentRunner; getInvocationCount(): number }`
- [ ] `harness/types.ts` に共有 `AgentRunContext` builder を置く。既定値は
      step 名 `implementer`（Claude rollover gate が implementer 限定であるため）、
      `slug` / `branch` / `state` は既存 contract test の最小 fixture に準拠、
      `emit` は driver から渡された収集関数を使う
- [ ] `scenario.ts` / `harness/types.ts` は `src/adapter/claude-code/` / `src/adapter/codex/` /
      provider SDK パッケージを import しない（`src/core/port/`、`src/state/`、`src/config/` の
      型 import は可）

**Acceptance Criteria**:
- `scenario.ts` と `harness/types.ts` が存在し、`bun run typecheck` が通る
- `scenario.ts` と `harness/types.ts` の import に
  `adapter/claude-code` / `adapter/codex` / `@anthropic-ai/claude-agent-sdk` / `@openai/codex-sdk`
  が 1 件も含まれない
- `ProviderHarness.build` の戻り値が `AgentRunner` 型（`src/core/port/agent-runner.ts`）である

## T-03: Claude harness（scenario → Claude SDK event 翻訳）を実装する

- [ ] `tests/unit/contract/provider-lifecycle/harness/claude-code.ts` を新規作成する
- [ ] `ClaudeCodeRunner` を `_queryFn` / `_createMcpServerFn` / `_sleepFn` / `cwd` の
      注入のみで構築する（実 SDK loader を呼ばせない）
- [ ] `_queryFn` の N 回目の呼び出しを scenario の N 番目の turn behavior に対応させる。
      script を超えた呼び出しは `afterScript`（`repeat-last`）に従う
- [ ] `_createMcpServerFn` で `report_result` の tool handler を捕捉し、
      `complete-with-report` の turn 内でその handler を報告 payload で呼んでから
      `{ type: "result", subtype: "success", ... }` を yield する
- [ ] `complete-without-report` は success result のみを yield する
- [ ] `complete-with-unparseable-report` は handler を呼ばずに、report として解釈されない
      本文だけを持つ success result を yield する
- [ ] `fail-transient` は transient 判定される message（`isTransientAgentError` が真になる文言）で
      throw する
- [ ] `fail-non-transient` は transient 判定されない message で throw する
- [ ] `fail-context-exhaustion` は `subtype !== "success"` の result と
      `errors: [<context 枯渇を示す文言>]` を yield する。scenario 側で
      throw 配送を要求できる option も用意する
- [ ] `stall-until-abort` は（指定があれば）`tool_use` メッセージを yield した後、
      `params.options.abortController.signal` の abort を待って reject する
      （既存 `agent-runner-timeout-last-tool.test.ts` の `hangingQueryFn` と同じ形）
- [ ] success result には scenario の metrics ヒントから
      `session_id` / `modelUsage` / `num_turns` / `duration_ms` / `duration_api_ms` /
      `total_cost_usd` を載せる。ヒント未指定なら該当キーを載せない
- [ ] `getInvocationCount()` が `_queryFn` の総呼び出し回数（main + follow-up + repair）を返す

**Acceptance Criteria**:
- `harness/claude-code.ts` が存在し、`bun run typecheck` が通る
- harness 単体で `complete-with-report` 1 turn の scenario を流すと
  `completionReason === "success"` かつ `toolResult` が非 null になる
- harness は `loadClaudeAgentSdk` を呼ばない（`_queryFn` と `_createMcpServerFn` を必ず注入する）
- `stall-until-abort` の scenario で fake timer を進めると `completionReason === "timeout"` になる

## T-04: Codex harness（scenario → Codex thread event 翻訳）を実装する

- [ ] `tests/unit/contract/provider-lifecycle/harness/codex.ts` を新規作成する
- [ ] `CodexAgentRunner` を `_codexFactory` / `_sleepFn` の注入のみで構築する
      （実 SDK loader を呼ばせない）
- [ ] `CodexThread.runStreamed` の N 回目の呼び出しを scenario の N 番目の turn behavior に
      対応させる。`startThread` / `resumeThread` は同一 thread stub を返す
- [ ] `complete-with-report` は `item.completed` の `agent_message.text` に
      report payload の JSON 文字列を載せ、続けて `turn.completed`（usage 付き）を yield する
- [ ] `complete-without-report` / `complete-with-unparseable-report` は
      JSON として解釈できない本文を `agent_message.text` に載せる
      （両者の差は scenario 側の意図であり、Codex では同じ「抽出失敗」経路に落ちることを
      コメントで明記する）
- [ ] `fail-transient` / `fail-non-transient` / `fail-context-exhaustion` は
      `turn.failed`（`error.message` に該当文言）として配送する。
      scenario 側で `runStreamed` の throw 配送を要求できる option も用意する
- [ ] `stall-until-abort` は（指定があれば）`item.started` を yield した後、
      `opts.signal` の abort を待って reject する
- [ ] `turn.completed` の usage は scenario の metrics ヒントから
      `input_tokens` / `cached_input_tokens` / `output_tokens` を載せる
- [ ] `getInvocationCount()` が `runStreamed` の総呼び出し回数を返す
- [ ] `harness/registry.ts` を新規作成し、`PROVIDER_HARNESSES` を
      `Object.freeze({ "claude-code": ..., codex: ... })` として公開する

**Acceptance Criteria**:
- `harness/codex.ts` と `harness/registry.ts` が存在し、`bun run typecheck` が通る
- harness 単体で `complete-with-report` 1 turn の scenario を流すと
  `completionReason === "success"` かつ `toolResult` が非 null になる
- harness は `loadCodexSdk` を呼ばない（`_codexFactory` を必ず注入する）
- `PROVIDER_HARNESSES` のキー集合が `CONTRACT_PROVIDERS` と一致する

## T-05: lifecycle contract case table（31 件）を書く

- [ ] `tests/unit/contract/provider-lifecycle/case-table.ts` を新規作成する
- [ ] case 型を定義する: `id` / `area` / `title` / `scenario` / `classification`
      (`shared` | `provider-specific`) / `expectations`（provider ID → 期待値）
- [ ] 期待値型を定義する: `support` (`supported` | `absent`) / `reason?`（非 shared・absent で必須）/
      `completionReason?` / `toolResult?` / `followUpAttempts?` / `transientRetryAttempts?`
      (数値 or `"absent"`) / `addedTurns?`（内訳 or `"absent"`）/ `resultContent?` /
      `errorCode?` / `errorMessagePattern?` / `errorHintPresent?` / `sdkInvocations?` /
      `emittedEvents?`（含むべき event 名）/ `fieldPresence?`（capability field → `present` | `absent`）
- [ ] `case-table.ts` は `case-ids.ts` を import **しない**（ID 正典との突合は ratchet が行う）
- [ ] 31 件の case を T-01 の ID 一覧どおりに定義する。分類の内訳は次を満たす:
      - `shared` 20 件: `main-work` 2、`report` 3（first-turn-success /
        follow-up-recovers / follow-up-budget-exhausted）、`post-work` 2、`output-repair` 3、
        `transient` 4、`timeout` 3、`metrics` 1（session-rollovers-absent-without-rollover）、
        `completion-error` 2（result-file-not-found / success-field-coherence）
      - `provider-specific` 11 件: `report` 2（settle-on-abort-with-captured-report /
        parse-failure-diagnostics）、`context` 3、`metrics` 5（model-usage-populated /
        invocation-metrics-presence / context-metrics-presence / touched-files-presence /
        added-turns-invariant）、`completion-error` 1（generic-sdk-failure-code）
- [ ] 各 provider-specific case の各 provider 期待値に **理由**を書く。最低限、次の内容を含める:
      - `report.settle-on-abort-with-captured-report`: Claude は report 受領後 abort 時に
        `REPORT_SETTLE_GRACE_MS` 経路で success settle する / Codex は turn 完了後に
        `finalResponse` を parse するため「report 受領済みで stream 継続中」という状態が存在しない
      - `report.parse-failure-diagnostics`: Codex は本文からの JSON 抽出に失敗し得るため
        `completionReportDiagnostics` を持つ / Claude は schema 検証済みの MCP tool 入力で
        受け取るため抽出失敗という概念がない
      - `context.*`: Claude は context 枯渇を分類して `CONTEXT_WINDOW_EXHAUSTED` を返し、
        implementer step かつ rollover 予算がある場合のみ fresh session へ移る /
        Codex SDK は context 限界のシグナルを公開しないため `CODEX_SDK_ERROR` に落ち、
        rollover 経路を持たない
      - `metrics.model-usage-populated`: Claude は SDK の per-model map を turn 横断で加算 /
        Codex は解決済み config model をキーにした単一エントリ
      - `metrics.{invocation,context,touched-files,added-turns}-*`: Codex 側は provider が
        情報を提供しないため `undefined` であること自体が契約
      - `completion-error.generic-sdk-failure-code`: Claude は
        `CLAUDE_CODE_QUERY_FAILED` + `Claude Code SDK query failed: ` prefix /
        Codex は `CODEX_SDK_ERROR` + cause message そのまま
- [ ] `timeout.*` と `context.rollover-*` の case には `usesFakeTimers` / config 設定を明示する
      （rollover は step 名 `implementer` かつ `contextRollover.maxRollovers >= 1` が前提である旨を
      コメントに残す）
- [ ] 期待値に「順序」「wall-clock 値」「prompt 本文」「ログ文字列」「private helper 名」を
      一切含めない（design D8）

**Acceptance Criteria**:
- `case-table.ts` が存在し、`LIFECYCLE_CONTRACT_CASES` の要素数が 31 である
- 各 case の `expectations` が `claude-code` と `codex` の両方のキーを持つ
- `classification === "provider-specific"` の全 case と `support === "absent"` の全期待値で
  `reason` が 40 文字以上である
- `case-table.ts` の import に `case-ids.ts` が含まれない
- `bun run typecheck` が通る

## T-06: AgentRunResult capability matrix を書く

- [ ] `tests/unit/contract/provider-lifecycle/result-field-matrix.ts` を新規作成する
- [ ] `AgentRunResult` の **全 field**（`completionReason` / `resultContent` / `toolResult` /
      `followUpAttempts` / `transientRetryAttempts` / `sessionId` / `agentBranch` / `error` /
      `modelUsage` / `completionReportDiagnostics` / `addedTurns` / `contextMetrics` /
      `invocationMetrics` / `touchedFiles` / `sessionRollovers`）について
      `{ providers: { "claude-code": "supported" | "absent", codex: ... }, reason }` を手書きする
- [ ] 分類の正典は `src/core/port/agent-runner.ts` の doc comment とする。
      少なくとも次を反映する:
      - `completionReportDiagnostics`: claude-code = `absent`、codex = `supported`
      - `addedTurns` / `contextMetrics` / `invocationMetrics` / `touchedFiles` /
        `sessionRollovers`: claude-code = `supported`、codex = `absent`
      - 上記以外は両 provider `supported`
- [ ] `absent` の全エントリに理由を書く（provider が情報を提供しない旨を、port doc comment の
      記述に沿って明示する）
- [ ] `result-field-matrix.ts` は provider adapter / provider SDK を import しない

**Acceptance Criteria**:
- `result-field-matrix.ts` が存在し、field エントリが 15 件である
- 全 `absent` エントリの `reason` が 40 文字以上である
- `bun run typecheck` が通る

## T-07: parity driver test を実装する（case × provider を全実行）

- [ ] `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` を新規作成する
- [ ] `LIFECYCLE_CONTRACT_CASES` × `PROVIDER_HARNESSES` の全組み合わせを `it` として実行する
      （`describe` は case ごと、`it` は provider ごと。skip / only を使わない）
- [ ] 各 `it` の **先頭**で実行台帳（module スコープの `Set<string>`）へ
      `` `${caseId}::${providerId}` `` を登録する
- [ ] case ごとに tempDir を 1 つ作り、`resultFile` 指定があればその内容を書く。終了時に削除する
- [ ] `emit` を収集関数にして、emit された event 名を記録する
- [ ] 宣言された期待値のみを assert する（未宣言 field は assert しない）。
      各期待値フィールドのアサーション変換ルールは以下のとおり:
      - `transientRetryAttempts` / `addedTurns` が数値 → `expect(result.X).toBe(数値)`
      - `transientRetryAttempts` / `addedTurns` が `"absent"` →
        `expect(result.X).toBeUndefined()`（文字列 `"absent"` と比較してはならない）
      - `fieldPresence` の各エントリ `{ [field]: "present" | "absent" }` は
        case 固有の spot-check であり、capability matrix による全 case 横断の `absent` 検証
        （universal invariant 内の "capability matrix で `absent` の field が `undefined`"）と
        役割が異なる:
          - `fieldPresence[field] === "present"` → `expect(result[field]).toBeDefined()`
          - `fieldPresence[field] === "absent"` → `expect(result[field]).toBeUndefined()`
        （D4 capability matrix の全 case 横断 assert と重複しても構わないが、
        case 固有 `fieldPresence` が `absent` を宣言した場合は必ず `toBeUndefined()` を呼ぶ）
- [ ] 全実行結果に universal invariant を適用する（design D7）:
      - `completionReason` が `success` / `error` / `timeout` のいずれか
      - `followUpAttempts` が 0 以上の整数
      - `addedTurns` が存在するとき `reportRetry + outputRepair === followUpAttempts`
      - `completionReason !== "success"` のとき `error` が定義され `code` を持つ
      - `completionReason === "success"` のとき `error` が undefined
      - capability matrix で `absent` の field が `undefined`
- [ ] capability matrix で `supported` の field について「実値が観測された」ことを
      module スコープの台帳に記録する
- [ ] `usesFakeTimers` の case のみ、その `it` 内で `vi.useFakeTimers()` を有効化し、
      終了時に `vi.useRealTimers()` へ戻す。fake timer 中の待機は
      `vi.advanceTimersByTimeAsync` のみで進める
- [ ] `_sleepFn` には常に即時解決関数を注入する
- [ ] stdout / stderr を spy して抑止する（既存 contract test と同じ扱い）
- [ ] ファイル末尾に台帳検査の `describe` を置く:
      - 実行された `(caseId, provider)` ペア集合が
        `REQUIRED_CASE_IDS × CONTRACT_PROVIDERS`（62 ペア）と一致する
      - capability matrix で `supported` の field が、その provider の
        少なくとも 1 case で実値として観測された
- [ ] 台帳検査が「同一ファイル内の宣言順直列実行」に依存することを doc comment に明記する

**Acceptance Criteria**:
- `bunx vitest run tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts` が green
- 実行される test 件数が 62 + 台帳検査分（最低 64 件以上）であり、skip 0 件である
  （台帳検査 `describe` は "実行ペア完全一致" と "supported field 観測記録" の最低 2 `it` を持つ）
- 同コマンドを 3 回連続実行して結果が変わらない（timeout case が flaky でない）
- driver が `loadClaudeAgentSdk` / `loadCodexSdk` / 実 SDK パッケージを import していない

## T-08: coverage ratchet test を実装する

- [ ] `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` を新規作成する
- [ ] **ID ratchet**: `LIFECYCLE_CONTRACT_CASES` の ID 集合が `REQUIRED_CASE_IDS` と完全一致する
      （不足・余剰を個別にメッセージ化する）。両側で重複がない
- [ ] **area ratchet**: 各 ID の area 部分が `LIFECYCLE_AREAS` に含まれ、
      全 area に 1 件以上の case が存在する
- [ ] **shared coverage ratchet**: `classification === "shared"` の case は
      全 `CONTRACT_PROVIDERS` の期待値を持ち、いずれも `support === "supported"` である
- [ ] **reason ratchet**: `classification === "provider-specific"` の全期待値と
      `support === "absent"` の全期待値、および capability matrix の `absent` エントリで
      `reason` が 40 文字以上である
- [ ] **UNEXPLAINED ratchet**: case table と capability matrix の全 `reason` のうち
      `UNEXPLAINED:` で始まるものの件数が 0 である（0 でなければ件数と case ID を出して fail）
- [ ] **provider registry ratchet**: `src/adapter/` 配下で `agent-runner.ts` を持つ
      ディレクトリ集合（`managed-agent` / `github` / `shared` / `dispatching` を除外）が
      `CONTRACT_PROVIDERS` および `PROVIDER_HARNESSES` のキー集合と一致する
- [ ] **skip ratchet**: `tests/unit/contract/provider-lifecycle/` 配下の全 `.ts` に
      `it.skip` / `describe.skip` / `test.skip` / `it.todo` / `it.only` / `describe.only` /
      `test.only` が出現しない
- [ ] **field matrix ratchet**: TypeScript syntax parser（`ts.createSourceFile`。parse only、
      型検査なし。既存 `tests/unit/architecture/value-import-scc.test.ts` と同じ手法）で
      `src/core/port/agent-runner.ts` の `AgentRunResult` interface の member 名を抽出し、
      capability matrix の field 集合と完全一致することを検査する
- [ ] **SDK containment ratchet**:
      - `src/**` で `@anthropic-ai/claude-agent-sdk` / `@openai/codex-sdk` を import する
        ファイルがすべて `src/adapter/claude-code/` または `src/adapter/codex/` 配下である
      - contract suite の provider-neutral モジュール（`case-ids.ts` / `scenario.ts` /
        `case-table.ts` / `result-field-matrix.ts` / `harness/types.ts` / driver / 本 ratchet）が
        `src/adapter/claude-code/` / `src/adapter/codex/` / provider SDK を import しない
        （`harness/claude-code.ts` と `harness/codex.ts` のみ許可）

**Acceptance Criteria**:
- `bunx vitest run tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts` が green
- `REQUIRED_CASE_IDS` から 1 件削除すると ID ratchet が fail する（手動確認して元に戻す）
- `case-table.ts` から case を 1 件削除すると ID ratchet が fail する（手動確認して元に戻す）
- `AgentRunResult` に field を 1 件追加すると field matrix ratchet が fail する
  （手動確認して **必ず元に戻す**。`src/` の変更を残さない）
- `it.skip` を 1 箇所入れると skip ratchet が fail する（手動確認して元に戻す）

## T-09: 未説明差分の確認と停止判定

- [ ] T-05 / T-06 / T-07 で採取した全 provider 差について、SDK 能力または既存仕様で
      説明できるかを 1 件ずつ確認する
- [ ] 説明できる差は reason にその根拠（該当ソースの位置または port doc comment の記述）を書く
- [ ] 説明できない差が 1 件でもあれば、reason を `UNEXPLAINED:` で始め、
      両 provider の実測値をそのまま期待値として残す（片方へ寄せない）
- [ ] `UNEXPLAINED:` が 1 件以上のとき、T-08 の UNEXPLAINED ratchet により suite は red になる。
      この場合は **スコープを広げず作業を停止し**、件数・case ID・観測値を報告する
- [ ] 併せて次の停止条件に該当していないことを確認する:
      production behavior 変更の必要、どちらの provider を正とするかの product 判断、
      retry budget / prompt / turn accounting / timeout / rollover 意味の変更、
      `AgentRunner` / `AgentRunResult` public contract 変更、
      production shared lifecycle 抽象の導入、
      provider 固有 SDK 制約を隠す偽の共通化、
      flaky 回避のための production 構造変更、新 architecture layer の必要

**Acceptance Criteria**:
- 全 `reason` に根拠が書かれている
- `UNEXPLAINED:` を含む reason の件数が 0 である。0 でない場合は作業を停止して報告している
- 停止条件のいずれにも該当していない（該当する場合は実装を進めず報告している）

## T-10: production 不変の確認と verification

- [ ] `git diff --stat <base> -- src/` が空であることを確認する
- [ ] 既存 provider 別テストファイルと
      `tests/unit/contract/agent-runner-contracts.test.ts` が
      追加・変更・削除されていないことを `git diff --name-status` で確認する
- [ ] `bun run typecheck` を実行する
- [ ] `bun run lint` を実行する（`./tests` も対象。`--max-warnings 0`）
- [ ] `bun run test` を実行する（全 suite）
- [ ] `bun run build` を実行する

**Acceptance Criteria**:
- `git diff --stat <base> -- src/` の出力が空である
- 既存テストファイルの `git diff --name-status` が空である
- `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` がすべて成功する

## T-11: PR 本文用の実測値を採取して tasks.md に記録する

- [ ] 次の値を実測し、本 task の下に「実測値」節を追記する（推測で埋めない。
      取得できない項目は取得不能理由を書く）:
      - contract case 総数 / shared・provider-specific・unsupported(absent 期待値) の内訳
      - Claude / Codex それぞれの実行 case 数
      - lifecycle 領域別 case 数（9 area）
      - 追加・変更・削除した provider test 数
        （変更・削除は 0 であることを `git diff --name-status` で確認）
      - production `agent-runner.ts` の変更行数
        （`git diff --numstat <base> -- src/adapter/claude-code/agent-runner.ts src/adapter/codex/agent-runner.ts`。原則 0）
      - Claude / Codex `agent-runner.ts` の総行数と `run()` の行範囲
        （`wc -l` と `grep -n "async run(ctx"` で採取。before / after で同一基準）
      - contract 作成で発見した未説明差分の件数（T-09 の `UNEXPLAINED:` 件数）
      - value-import SCC 数（`bunx vitest run tests/unit/architecture/value-import-scc.test.ts` の結果）
- [ ] before / after を同一基準で書く（本 change は production 無変更なので
      before === after になる項目はその旨を明記する）

**Acceptance Criteria**:
- tasks.md に「実測値」節が追記され、上記の全項目に数値または取得不能理由が記載されている
- 数値の採取に使ったコマンドが併記されている
- `production agent-runner.ts の変更行数` が 0 である（0 でない場合は停止条件として報告されている）
