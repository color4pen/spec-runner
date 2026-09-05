# Design: Claude / Codex provider lifecycle parity contract

## Context

R1〜R3b で review routing の循環、`RuntimeStrategy` 依存、CommandSpec registry への実処理集中、
CLI handler 内の process termination を段階的に解消した。次の構造上の集中点は local provider
adapter の session lifecycle である。

現行 main の実測（request-review 済みの attestation 値）:

| 対象 | 実測 |
|------|------|
| `src/adapter/claude-code/agent-runner.ts` | 1,678 行 |
| `ClaudeCodeRunner.run()` | line 495〜1,678（約 1,184 行） |
| `src/adapter/codex/agent-runner.ts` | 888 行 |
| `CodexAgentRunner.run()` | line 343〜888（約 546 行） |
| 共通 port | `src/core/port/agent-runner.ts` の `AgentRunner.run(context): Promise<AgentRunResult>` |

### 既存テスト資産（本設計の出発点）

- **provider 別 regression**: `src/adapter/claude-code/__tests__/`（15 ファイル）、
  `src/adapter/codex/__tests__/`（8 ファイル）、`tests/unit/adapter/claude-code/`（15 ファイル）、
  `tests/unit/adapter/codex/`（3 ファイル）、`tests/adapter/codex/`（7 ファイル）。
- **既存 cross-provider contract**: `tests/unit/contract/agent-runner-contracts.test.ts`（527 行）。
  `RunnerFixture` インターフェース（`makeCapturingPrompt` / `makeMinimalRunner` /
  `makeWithReportToolSuccess` / `makeWithTransientError` / `makeCountingInvocations`）と
  `REGISTERED_LOCAL_RUNNERS` レジストリを持ち、C1〜C5 の 5 契約を両 provider に適用している。
  ただし **stable case ID を持たず**、fixture が「シナリオごとに専用 factory メソッドを増やす」形のため
  ケース数に対して線形にインターフェースが膨らみ、shared / provider-specific / unsupported の
  分類も、削除検出 ratchet も存在しない。
- **静的 ratchet の前例**: `tests/unit/contract/invariants.test.ts`、
  `tests/unit/architecture/value-import-scc.test.ts`（TypeScript parser + Tarjan）、
  `tests/unit/architecture/module-boundary.test.ts`（grep ベース境界検査）。

### DI seam（実 SDK を呼ばずに lifecycle を駆動できる根拠）

| provider | seam | 挙動 |
|----------|------|------|
| Claude | `ClaudeCodeRunnerDeps._queryFn`（`QueryFn`）| turn ごとに 1 回呼ばれる async generator。`params.options.abortController` 経由で abort signal を観測できる |
| Claude | `_createMcpServerFn` | `report_result` の tool handler を捕捉して任意タイミングで呼べる |
| Claude | `_sleepFn` | transient backoff を 0 化して deterministic 化 |
| Codex | `CodexAgentRunnerDeps._codexFactory` | `startThread` / `resumeThread` が返す `CodexThread.runStreamed` が turn ごとに 1 回呼ばれる |
| Codex | `_sleepFn` | 同上 |

timeout / abort は両 provider とも `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` +
「abort まで hang する mock」で既存テストが deterministic に駆動できている
（`agent-runner-timeout-last-tool.test.ts` の `hangingQueryFn` パターン）。

### 現行実装から採取した provider 差（characterization 対象、本 change で固定する）

コード読解で確認した、**説明可能な**差分:

1. `AgentRunResult` の capability field: `addedTurns` / `contextMetrics` / `invocationMetrics` /
   `touchedFiles` / `sessionRollovers` は ClaudeCodeRunner のみが populate、
   `completionReportDiagnostics` は CodexAgentRunner のみが populate（port の doc comment が正典）。
2. report 取得経路: Claude は MCP tool handler 経由（schema 検証済み入力）、Codex は
   `finalResponse` の JSON 抽出（`tryExtractToolResult`）。後者だけが抽出失敗 diagnostics を持つ。
3. report settle: Claude のみ `REPORT_SETTLE_GRACE_MS` と「report 受領済みで abort → success settle」
   経路を持つ（`agent-runner.ts` の catch 冒頭）。Codex は turn 完了後に parse するため該当状態がない。
4. context exhaustion: Claude は `isContextExhaustionError` で分類し
   `CONTEXT_WINDOW_EXHAUSTED` を返す。加えて `step.name === "implementer"` かつ
   `contextRollover.maxRollovers > 0` のときのみ fresh-session rollover を行う。
   Codex SDK は context 限界のシグナルを公開しないため、同種のエラーは `CODEX_SDK_ERROR` に落ちる。
5. generic SDK 失敗: Claude は `Claude Code SDK query failed: <cause>` + code
   `CLAUDE_CODE_QUERY_FAILED`、Codex は cause message そのまま + code `CODEX_SDK_ERROR`。
6. `modelUsage`: Claude は SDK の per-model map を turn 横断で加算、Codex は
   `{ [resolvedConfig.model]: mapped(turn.usage) }` の単一キー。
7. report follow-up / postWork の起動条件: Claude は `extractedSessionId` 確立が前提、
   Codex は thread 単位で session 概念が異なるため同じ gate を持たない。

一方、**共通**と確認できたもの: `completionReason` の値域、timeout の `STEP_TIMEOUT` code と
`tracker.timeoutHint()` hint、transient retry の budget（`maxRetries + 1` invocation）と
`step:retry` emit、`followUpAttempts` の意味（report retry + output repair、postWork は含めない）、
output repair の `detect → filter follow-up → buildPrompt → 1 turn` ループと `maxAttempts` 上限、
`RESULT_FILE_NOT_FOUND`、`step:progress` の emit。

この状態で `run()` を phase 分割すると、上記の差を無自覚に均す / 偶然の差を新構造へ固定する
リスクがある。R4a は production を一切動かさず、現行挙動を characterization して
R4b / R4c の比較基準を先に作る。

### 制約

- production code（`src/**`）に変更を入れない。差分行数の目標は 0。
- `AgentRunner` / `AgentRunResult` の public contract を変更しない。
- 既存 provider 別テストを削除・弱化しない。
- test helper の共有は可。provider SDK 型を shared production module へ漏らさない。
- 実 SDK・外部 API へ接続しない。wall-clock 依存を残さない。

## Goals / Non-Goals

**Goals**:

- provider-neutral な semantic scenario から Claude / Codex 両 adapter を駆動し、
  observable contract（`AgentRunResult`、invocation / retry / follow-up 回数、
  安定 event、error semantics）を比較する **stable case ID 付き contract table** を置く。
- 各 case × provider を `shared` / `provider-specific` / `unsupported` に分類し、
  非 shared には必ず理由を明記して期待値として固定する。
- `AgentRunResult` の全 field について provider ごとの capability（present / absent）を
  matrix として固定し、「unavailable な metrics を他の値から推測生成しない」ことを全 case で検査する。
- 必須 case ID の一致・重複・provider coverage・暗黙 skip を機械検出する coverage ratchet を置く。
- R4b / R4c が同じ suite をそのまま回帰基準として利用できる形にする。
- 説明できない provider 差を発見した場合に、片方へ寄せずに停止・報告できる構造にする。

**Non-Goals**:

- Claude / Codex `run()` の phase 分割（R4b / R4c）。
- shared production lifecycle / base class / state machine の導入。
- provider 間の挙動差の解消・統一。
- `AgentRunner` / `AgentRunResult` public contract の再設計。
- retry / timeout / rollover / output repair policy の変更。
- SDK version 更新、ManagedAgentRunner / DispatchingAgentRunner の再設計、R6 のテスト配置整理。
- 既存 `tests/unit/contract/agent-runner-contracts.test.ts`（C1〜C5）の書き換え・削除・移植。
- unrelated な adapter cleanup、dead code 削除、format 変更。

## Decisions

### D1: contract suite を `tests/unit/contract/provider-lifecycle/` に新規配置し、既存 C1〜C5 suite は据え置く

新規ディレクトリ構成（すべて test 資産。`src/` には 1 byte も追加しない）:

| path | 役割 |
|------|------|
| `case-ids.ts` | `REQUIRED_CASE_IDS`（手書き frozen literal）、`LIFECYCLE_AREAS`、`CONTRACT_PROVIDERS` |
| `scenario.ts` | provider-neutral な scenario script 型と turn behavior 型 |
| `case-table.ts` | `LIFECYCLE_CONTRACT_CASES`（scenario + 分類 + 理由 + provider 別期待値） |
| `result-field-matrix.ts` | `AgentRunResult` field × provider の capability 分類と理由 |
| `harness/types.ts` | `ProviderHarness` インターフェースと共有 `AgentRunContext` builder |
| `harness/claude-code.ts` | scenario → Claude SDK event / MCP handler 変換 |
| `harness/codex.ts` | scenario → Codex thread event 変換 |
| `harness/registry.ts` | `PROVIDER_HARNESSES`（frozen registry） |
| `provider-lifecycle-parity.test.ts` | driver（case × provider を実行）＋実行台帳 coverage 検査 |
| `contract-ratchet.test.ts` | 静的 ratchet（ID 一致 / 重複 / 理由 / registry / skip 検出 / SDK 封じ込め） |

**Rationale**: 既存 `agent-runner-contracts.test.ts` は「prompt injection / logPath / 基本 report」など
lifecycle 以外の観点も含む横断 suite であり、fixture の形（シナリオごとの factory メソッド）が
31 ケース規模に耐えない。既存を書き換えると「既存テストを弱化しない」条件に抵触するリスクがあり、
R4b の diff も読みにくくなる。新規ディレクトリに独立配置し、既存はそのまま残す。
`tests/unit/contract/` 直下という既存の慣習は踏襲する（R6 のテスト配置整理は非対象なので移動しない）。

**Alternatives considered**:
- (a) 既存 `agent-runner-contracts.test.ts` を拡張する → fixture インターフェースが
  ケース数に線形で膨らむ。既存 5 契約の意味を変えるリスク。却下。
- (b) provider 別ディレクトリ（`src/adapter/*/__tests__/`）に対称なテストを 2 本置く →
  「同じ semantic scenario から検証する」ことを機械保証できない。却下。
- (c) `tests/unit/contract/provider-lifecycle.test.ts` の単一ファイル →
  1 ファイル 1,500 行超が確実で、harness と期待値の責務境界が曖昧になる。却下。

### D2: scenario を「provider-neutral な turn script」として表現し、provider harness が翻訳する

scenario は「agent が turn ごとに何をするか」の列で表す。turn behavior の種類（意味）:

| behavior | 意味 |
|----------|------|
| `complete-with-report` | turn が正常終了し、report を提出する（payload は provider-neutral な object） |
| `complete-without-report` | turn が正常終了するが report を提出しない |
| `complete-with-unparseable-report` | turn が正常終了するが report が仕様を満たさない |
| `fail-transient` | transient 分類される失敗（両 provider の `isTransientAgentError` が真を返す文言） |
| `fail-non-transient` | transient 分類されない失敗 |
| `fail-context-exhaustion` | context window 枯渇を示す失敗 |
| `stall-until-abort` | tool 開始を通知した後、abort されるまで応答しない |

scenario はさらに「script を使い切った後の既定 behavior」（`repeat-last`）と、
SDK result に載せる provider-neutral な usage / metrics ヒントを持つ。

harness の責務は **翻訳のみ**:

- Claude: turn 単位で `_queryFn` の 1 回の呼び出しに対応させる。`complete-with-report` は
  捕捉した MCP handler を呼んでから `type: "result", subtype: "success"` を yield。
  `fail-*` は throw または `subtype !== "success"` + `errors[]` として届ける。
  `stall-until-abort` は `params.options.abortController.signal` を待つ既存パターンを使う。
- Codex: turn 単位で `CodexThread.runStreamed` の 1 回の呼び出しに対応させる。
  report は `item.completed` の `agent_message.text`（JSON 文字列）として届ける。
  `fail-*` は `turn.failed` / `error` event または `runStreamed` の throw として届ける。
  `stall-until-abort` は `opts.signal` を待つ。

**Rationale**: 両 runner の mock seam はどちらも「N 回目の呼び出し = N 番目の turn」という
同じ粒度になっているため、turn script は自然な共通表現になり、「同じ意味の入力」を
機械的に保証できる。raw SDK event shape の一致は要求せず、翻訳の自由度は harness に閉じる。

**Alternatives considered**:
- (a) case ごとに provider 別の builder 関数を `caseId → builder` map で持つ →
  「同じ semantic 入力」の保証が人手のレビュー頼みになる。却下（ただし D3 の
  provider 別 **期待値** は case 側に持たせる、というハイブリッドは採用）。
- (b) 共通の fake SDK を production 側に導入 → production shared module 追加は停止条件。却下。

### D3: case は「1 つの scenario + provider ごとの期待値」を持ち、全 case を全 provider で実行する

各 case は次を持つ:

- `id`（stable、`<area>.<behavior>` の dotted 形式）
- `area`（`main-work` / `report` / `post-work` / `output-repair` / `transient` / `timeout` /
  `context` / `metrics` / `completion-error`）
- `title`（人間可読）
- `scenario`（provider-neutral turn script + policy / config 設定）
- `classification`: `shared` | `provider-specific`
- `expectations`: provider ID → 期待値。各期待値は
  `support: "supported" | "absent"`、`reason`（`support: "absent"` または
  `classification !== "shared"` のとき必須）、および観測項目を持つ。

観測項目（宣言されたものだけを assert する。未宣言は「この case の関心事ではない」）:
`completionReason` / `toolResult`（null か ok 値）/ `followUpAttempts` /
`transientRetryAttempts`（数値 or `"absent"`）/ `addedTurns`（内訳 or `"absent"`）/
`resultContent` / `errorCode` / `errorMessagePattern` / `errorHintPresent` /
`sdkInvocations`（正確な回数）/ `emittedEvents`（含むべき安定 event 名）/
`fieldPresence`（capability field ごとの present / absent）。

**全 case を全 provider で実行する**。ある provider が機能を持たない場合も skip せず、
「absent であること自体」を期待値として実行する（例: Codex の
`context.rollover-recovers-in-fresh-session` は「rollover せず 1 invocation で error、
`sessionRollovers` は undefined」を assert する）。

**Rationale**: skip を許すと「ケースを消しても green」に近い穴が空く。
absent を明示的な期待値にすれば、provider が将来その機能を得たときに必ず red になり、
契約変更が意識的な行為になる。

**Alternatives considered**:
- (a) provider-specific case は該当 provider だけで実行 → 暗黙 skip の温床。却下。
- (b) 分類を case 単位のみにする → field 単位の差（`modelUsage` のキー意味など）を
  表現できない。→ D4 の field matrix と併用する形で解決。

### D4: `AgentRunResult` の field capability を独立 matrix として固定し、全 case に横断適用する

`result-field-matrix.ts` に `AgentRunResult` の全 field について
`{ field, providers: { "claude-code": "supported" | "absent", codex: ... }, reason }` を手書きで置く。

driver はすべての case 実行結果に対して次を検査する（case 側の宣言に関係なく常に適用）:

- matrix が `absent` と宣言した field は、その provider の結果で常に `undefined` であること。
  → 「unavailable な metrics を `modelUsage` 等から推測生成しない」を 31 case × 2 provider で強制。
- matrix が `supported` と宣言した field は、当該 provider の少なくとも 1 case で
  実際に値が観測されること（suite 終了時に台帳で確認）。
  → capability の空約束を防ぐ。

ratchet は TypeScript の syntax parser（`ts.createSourceFile`。既存 `value-import-scc.test.ts` の
前例と同じく parse only）で `src/core/port/agent-runner.ts` の `AgentRunResult` interface から
field 名を抽出し、matrix のキー集合と **完全一致** することを検査する。
port に field が増減したのに matrix が追随していなければ red になる。

**Rationale**: field 名の抽出だけは production 型から導出しないと「field を足しても green」に
なる。一方 **分類と期待値は導出せず手書き**にすることで、「実装 table から導出して
ケースを消しても green」という構造を避ける。導出するのは「網羅すべき対象の集合」だけ、
「期待される振る舞い」は常に手書き、という切り分けにする。

**Alternatives considered**:
- (a) field 一覧も手書き → port の field 追加を検出できない。却下。
- (b) 分類も型から導出（optional かどうかで判定）→ optional は「provider 非対応」以外の
  理由でも optional になり得るため意味が違う。却下。

### D5: case ID の正典は期待値側の frozen literal 配列に置く

`case-ids.ts` の `REQUIRED_CASE_IDS` は **手書きの literal 配列**（`as const`）。
`case-table.ts` はこれを import しない（逆方向の依存のみ: ratchet が両方を import して突合）。

ratchet が検査すること:

- `LIFECYCLE_CONTRACT_CASES` の ID 集合が `REQUIRED_CASE_IDS` と集合として完全一致する
  （不足も余剰も red）。
- ID の重複がない（配列長 === Set size を両側で確認）。
- `REQUIRED_CASE_IDS` の各 ID が `<area>.<slug>` 形式で、area 部分が `LIFECYCLE_AREAS` に含まれる。

**Rationale**: 「case ID 一覧を実装 table 自身から導出しない」という要件をそのまま構造化する。
case を table から消せば ID 不足で red、ID を消せば余剰で red、両方消す＝意識的な契約変更となり
diff がレビューで見える。

**Alternatives considered**:
- (a) スナップショットファイル（`.snap`）で固定 → `-u` で無自覚に更新され得る。却下。
- (b) case 数のみ ratchet → ID の入れ替えを検出できない。却下。

### D6: 初期 case set は 31 件。lifecycle 領域別内訳を固定する

| area | 件数 | case ID |
|------|------|---------|
| `main-work` | 2 | `main-work.success-minimal`, `main-work.result-file-content` |
| `report` | 5 | `report.first-turn-success`, `report.follow-up-recovers`, `report.follow-up-budget-exhausted`, `report.settle-on-abort-with-captured-report`, `report.parse-failure-diagnostics` |
| `post-work` | 2 | `post-work.single-prompt-adds-turn`, `post-work.excluded-from-follow-up-attempts` |
| `output-repair` | 3 | `output-repair.violation-then-clean`, `output-repair.budget-exhausted`, `output-repair.detect-failure-skips-loop` |
| `transient` | 4 | `transient.retry-then-success`, `transient.budget-exhausted`, `transient.non-transient-not-retried`, `transient.disabled-omits-attempts-field` |
| `timeout` | 3 | `timeout.inactivity-watchdog`, `timeout.wall-clock-step-timeout`, `timeout.abort-not-retried` |
| `context` | 3 | `context.exhaustion-typed-error`, `context.rollover-recovers-in-fresh-session`, `context.rollover-budget-exhausted` |
| `metrics` | 6 | `metrics.model-usage-populated`, `metrics.invocation-metrics-presence`, `metrics.context-metrics-presence`, `metrics.touched-files-presence`, `metrics.added-turns-invariant`, `metrics.session-rollovers-absent-without-rollover` |
| `completion-error` | 3 | `completion-error.generic-sdk-failure-code`, `completion-error.result-file-not-found`, `completion-error.success-field-coherence` |

分類の内訳（設計時点の想定。実測は実装時に台帳から採取する）:
`shared` 20 件 / `provider-specific` 11 件。
`provider-specific` の内訳は `report` 2、`context` 3、`metrics` 5、`completion-error` 1。
実行 case 数は Claude 31 / Codex 31（skip なし）。

**Rationale**: 受け入れ条件が列挙する 8 領域（main work / report settle-retry /
post-work・output repair / transient retry / timeout / context exhaustion / metrics /
completion・error）をすべてカバーし、かつ「R4b の phase 分割で壊れやすい境界」に厚みを置く。
`metrics` を 6 件に割いたのは、capability field の absent 契約が最も静かに壊れやすいため。

**Alternatives considered**:
- (a) 15 件程度の最小 set → `addedTurns` と `followUpAttempts` の関係や rollover 予算など、
  phase 分割で最初に壊れる箇所が落ちる。却下。
- (b) 既存 provider テストを全面移植して 100 件超 → 要件 6（既存テストを詳細 regression として
  維持し、R4a では最小の cross-provider contract を足す）に反する。却下。

### D7: 全 case に横断適用する universal invariant を driver に置く

case 側の宣言に加えて、driver が全実行結果に対して次を assert する:

- `completionReason` は `"success" | "error" | "timeout"` のいずれか。
- `followUpAttempts` は 0 以上の整数。`toolResult` は `null` または object（フィールド必須）。
- `addedTurns` が存在するとき `reportRetry + outputRepair === followUpAttempts`
  （port doc comment に明記された不変条件）。
- `completionReason !== "success"` のとき `error` が定義され、`code` を持つ。
- `completionReason === "success"` のとき `error` は undefined。
- D4 の field matrix で `absent` の field は undefined。

**Rationale**: 「31 case を書いた人が書き忘れた assert」を構造的に埋める。R4b で
`run()` を分割したとき、最初に壊れるのはこの種の横断不変条件である。

**Alternatives considered**: case ごとに全項目を宣言必須にする → 冗長で、
関心のない field まで偶然の実装詳細として固定してしまう。却下。

### D8: 安定と見なす観測対象を限定する（不安定な実装詳細を契約にしない）

**契約にする**: `AgentRunResult` の field 値と undefined / null semantics、
SDK 呼び出し回数、`followUpAttempts` / `transientRetryAttempts` / `addedTurns` の値、
emit された event の **名前**（`step:progress` / `step:retry` / `step:rollover`）と
「その event が発生したか」、error の `code` と `hint` の有無、
error message の provider 別 **prefix パターン**（provider-specific 分類として固定）。

**契約にしない**: wall-clock 時間、`durationMs` などの具体値、
event の到着順序（`emittedEvents` は「含む」検査のみ、順序は assert しない）、
prompt 本文、private helper 名、stdout / stderr の文字列、JSONL ログの行内容、
raw SDK event の shape、artifact bundle の内容（`buildArtifactBundle` の戻り値。
本 contract は artifact 構築を経由する lifecycle だけを観測し、fake timer case では
grace timer の順序保証のため driver が同関数を `""` で stub する。実時間 case は本番実装を通す）。

**Rationale**: 要件 2 の「不安定な実装詳細を共通契約にしない」を判断基準として明文化しておかないと、
実装時に「たまたま通る assert」を足してしまい、R4b で偽陽性の red を量産する。

**Alternatives considered**: 順序も固定する → phase 分割で正当な順序変更が起きたとき
（例: metrics 抽出の位置移動）に意味のない red になる。却下。

### D9: coverage ratchet は「静的検査」と「実行台帳」の 2 本立てにする

**静的 ratchet**（`contract-ratchet.test.ts`。実行順に依存しない）:

1. `REQUIRED_CASE_IDS` と case table の ID 集合一致・重複なし（D5）。
2. `classification === "shared"` の case は全 provider の期待値が `support: "supported"` で、
   両 provider の harness が当該 scenario を構築できること（harness registry の完全性検査）。
3. `classification === "provider-specific"` および `support: "absent"` の期待値は
   `reason` が非空（最低文字数を課す）であること。
4. `CONTRACT_PROVIDERS` が `src/adapter/` 配下の「`agent-runner.ts` を持つ local adapter
   ディレクトリ集合」と一致すること（既存 `agent-runner-contracts.test.ts` の
   registration completeness と同じ手法。provider 追加時に必ず red になる）。
5. contract ディレクトリのソースに `it.skip` / `describe.skip` / `test.skip` / `it.todo` /
   `.only` が出現しないこと（暗黙 skip の静的検出）。
6. provider SDK の封じ込め: 共有モジュール（`case-ids.ts` / `scenario.ts` / `case-table.ts` /
   `result-field-matrix.ts` / `harness/types.ts` / driver）が
   `src/adapter/claude-code/` / `src/adapter/codex/` / provider SDK パッケージを import しないこと
   （provider 依存は `harness/claude-code.ts` と `harness/codex.ts` にのみ許可）。
   併せて `src/**` 配下で provider SDK パッケージを import してよいのは
   `src/adapter/claude-code/` と `src/adapter/codex/` の下だけであること
   （現行実測: `claude-code/agent-runner.ts`、`claude-code/sdk-loader.ts`、`codex/sdk-loader.ts` の 3 ファイル）。

**実行台帳**（driver ファイル内。全 case 実行後に走る最終 `it`）:

7. 実行された `(caseId, provider)` ペアの集合が `REQUIRED_CASE_IDS × CONTRACT_PROVIDERS` と一致する
   （台帳への登録は各 case body の先頭で行い、assert 失敗でも登録は残る）。
8. matrix で `supported` の field が、その provider の少なくとも 1 case で実値として観測された。

**Rationale**: 静的検査だけでは「table に書いたが driver が回していない」を検出できず、
実行台帳だけでは「そもそも case を消した」を検出できない。両方必要。
台帳は vitest がファイル内の `it` を宣言順に直列実行する性質に依存するため、
台帳検査は driver と **同一ファイル**に置く（ファイル分離すると module 状態が共有されない）。

**Alternatives considered**:
- (a) カスタム vitest reporter で収集 → verification pipeline の設定変更が必要になり、
  非対象の範囲へ波及する。却下。
- (b) 台帳を一時ファイル経由で別ファイルへ渡す → 並列実行（`maxWorkers: 4`, `pool: "forks"`）で
  壊れる。却下。

### D10: timeout / abort case は fake timer で駆動し、実時間に依存しない

`vi.useFakeTimers()` を使い、`stall-until-abort` behavior の mock が abort signal を待つ形にする
（既存 `hangingQueryFn` パターン）。inactivity watchdog は
`DEFAULT_INACTIVITY_TIMEOUT_MS` を、wall-clock timeout は
`config.steps.<step>.timeoutMs` を明示設定して駆動する。
`_sleepFn` は常に即時解決の関数を注入し、transient backoff の実待ちを消す。

fake timer の適用範囲は timeout / abort 系 case に限定し、それ以外の case は real timer で走らせる
（fake timer の全面適用は fs I/O を含む case で不安定化しやすいため）。case 側に
`usesFakeTimers: true` フラグを持たせ、driver が `beforeEach` / `afterEach` ではなく
case body 内で切り替える。

**Rationale**: 「flaky な実時間依存を避けるために production 構造変更が必要」は停止条件だが、
既存テストが同じパターンで deterministic に成立していることを確認済みなので、
production 変更なしで達成できる。

**Alternatives considered**: 極小の実 timeout 値（例 10ms）で駆動 → CI の負荷次第で flaky。却下。

### D11: 説明できない provider 差を見つけたら、片方へ寄せずに停止・報告する

実装中に「現行挙動が両 provider で異なるが、SDK 能力でも既存仕様でも説明できない」差分を
見つけた場合の手順:

1. その差を **片方の期待値へ寄せない**。両 provider の現行実測値をそのまま期待値として書く。
2. 当該 case / field の `reason` に `UNEXPLAINED:` プレフィックスを付けて事実のみ記述する。
3. `contract-ratchet.test.ts` に「`UNEXPLAINED:` を含む reason の件数」を assert する検査を置き、
   件数が 0 でない限り red になるようにする（＝マージ前に必ず人間の判断を要求する）。
4. 作業を止めて、件数と内訳を報告する。

**Rationale**: 「どちらの provider 挙動を正とするか」は product / policy 判断であり停止条件。
一方で発見自体は価値があるため、握り潰さずに可視化して停止させる。
設計時点のコード読解では未説明差分は検出していない（見つかった差はすべて上の Context に
理由付きで列挙した）ため、期待値としては `UNEXPLAINED` 0 件を想定する。

**Alternatives considered**: 差を TODO コメントで残して green のまま進める →
R4b が偶然の差を新構造へ固定してしまう。却下。

### D12: production behavior 不変を機械的に担保する

- `src/**` を一切変更しない（tasks に明示。verification 前に `git diff --stat -- src/` が
  空であることを実装者が確認する）。
- 既存 provider 別テストファイルは追加・変更・削除しない。
- 新規追加は `specrunner/changes/<slug>/` 配下と
  `tests/unit/contract/provider-lifecycle/` 配下のみ。
- `AgentRunResult` の port doc comment に書かれた provider capability 記述が
  matrix の正典であり、matrix はそれを写す（port 側を書き換えない）。

**Rationale**: 「production `agent-runner.ts` の変更行数（原則 0）」を PR 実測値として
報告するため、境界を作業ルールとして固定する。

**Alternatives considered**: `agent-runner.ts` に seam を足して test しやすくする →
「parity test を成立させるための production behavior 変更」は停止条件。既存 DI seam で
全 case が構成可能であることを Context で確認済みなので不要。

## Risks / Trade-offs

- **[偶然の実装詳細を契約として固定してしまう]** → D8 で「契約にする / しない」の境界を明文化し、
  case の観測項目を宣言型に限定する。未宣言の field は assert しない（過剰固定を避ける）。
  順序・時間・prompt 本文・ログ文字列は一切 assert しない。

- **[provider 差を無自覚に均す期待値を書いてしまう]** → 期待値は provider ごとに分離した
  map として書き、`shared` 分類のときだけ「同じ値であること」を要求する。
  `provider-specific` は値が異なることを前提に、それぞれの実測値と理由を書く。
  さらに D11 の `UNEXPLAINED` ratchet で、理由を書けない差の混入を止める。

- **[31 case × 2 provider の期待値を実装者が「通るまで調整」してしまう]** →
  tasks に「期待値は現行実装の読解と既存テストの実測から先に決め、
  red → 実装ではなく red → **実測との突合**を行う」手順を明記する。
  実行して初めて分かった値は、根拠（該当コード行 / 既存テスト）をコメントに残す。

- **[timeout case の flakiness]** → D10（fake timer + abort 待ち mock + 即時 `_sleepFn`）。
  加えて timeout case は `pool: "forks"` / `maxWorkers: 4` の既存設定下で
  既存テストが安定していることを根拠とする。real timer 依存の待機は 1 箇所も置かない。

- **[台帳検査がファイル内実行順に依存する]** → driver 内の最終 `it` に置き、
  台帳登録は各 case body の先頭で行う。vitest がファイル内の `it` を宣言順に直列実行する前提を
  コメントで明記する。ファイル分割はしない（D9）。

- **[Claude rollover case が step 名 / config に依存する]** → rollover は
  `step.name === "implementer"` かつ `contextRollover.maxRollovers > 0` のときのみ有効。
  共有 ctx builder の既定 step 名を `implementer` に固定し、rollover case は
  config を明示設定する。この gate 自体を case の期待値としてコメントに残す。

- **[Codex に「report settle」相当の状態が存在しないため scenario が空回りする]** →
  `report.settle-on-abort-with-captured-report` の Codex 期待値は
  「同じ scenario を流したとき abort は timeout として現れ、`toolResult` は null」
  という **absent 契約** を実測して固定する。scenario を Codex 用に作り替えない
  （作り替えると「同じ意味の入力」が崩れる）。

- **[case 数の増加でテスト実行時間が伸びる]** → 全 case が mock 駆動かつ backoff 即時、
  timeout case は fake timer なので実時間コストはほぼ I/O（tempDir 作成）のみ。
  tempDir は case ごとに 1 つに抑える。

- **[R4b で contract が邪魔になる（正当な変更で red になる）]** → それが本 change の目的である。
  ただし偽陽性を減らすため D8 の限定を守る。R4b 側で契約を変えるときは
  `REQUIRED_CASE_IDS` と reason の diff がレビューに現れる。

## Open Questions

- 実装時に `UNEXPLAINED:` 差分が 1 件以上見つかった場合、本 change は D11 の手順で停止・報告する。
  報告後にどう扱うか（R4a 内で理由を確定するか、別 issue へ切り出すか）は
  product 判断であり本 change では決めない。
- `metrics.model-usage-populated` の Codex 側キーは `resolvedConfig.model`（config 解決結果）である。
  この「実モデル名ではなく解決済み設定値をキーにする」挙動が意図的な仕様か
  実装上の制約かは、コード上のコメントからは断定できない。R4a では現行実測値を
  `provider-specific` として固定するに留め、正誤判断は行わない。
- `metrics.session-rollovers-absent-without-rollover` を `shared` としているが、
  Claude 側は「rollover 未発生なら absent」、Codex 側は「常に absent」であり、
  この case の scenario（rollover なし）では両者が同値になる。
  「同じ scenario で同じ結果」を shared の定義とする本設計ではこれは shared だが、
  能力としては同一ではない点を case の説明に明記する。
