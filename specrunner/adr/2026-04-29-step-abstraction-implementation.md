# ADR-20260429: Step 抽象化 + Pipeline 状態機械の実装決定

**Date**: 2026-04-29
**Status**: accepted

> 本 ADR は **実装決定（implementation choices）** を記録する。設計レベルの決定は [ADR-20260429-step-and-agent-class-architecture](ADR-20260429-step-and-agent-class-architecture.md) を参照。本 ADR は D10 の手順 1〜4（D1, D2, D3, D7, D8, D9）を実装した際に確定した実装側の判断を補完する。

## Context

CLI core pipeline（PR #19 / #22 / #24）で propose / spec-review / spec-fixer の 3 step が成立し、各 step ファイル（計 881 LOC）に 45–55 行ずつのコピペ、`pipeline.ts` の inline if 連鎖による verdict 分岐、Custom Tool spec / handler のグローバル registry 経由分離管理、学習層の plug-in 点不在、という 4 つの構造的負債が顕在化した。

設計上の解は [ADR-20260429-step-and-agent-class-architecture](ADR-20260429-step-and-agent-class-architecture.md) で D1〜D10 として確定済み。本 change（[openspec/changes/2026-04-29-step-abstraction-refactor/](../../openspec/changes/2026-04-29-step-abstraction-refactor/)）はその **D10 手順 1〜4**（D8a/b → D1+D2+D9 → D3 → D7）を「振る舞い不変」の制約下で実装した。実装中に確定した実装パターン・モジュール配置・後方互換戦略・命名規則を本 ADR に固定化する。

## Decision

設計 ADR の D1〜D9 を以下の実装パターンで具現化する。

1. **Step は plain TypeScript interface** として定義し、各 step は object literal もしくは小さい module で実装する（abstract class ではない）。
2. **StepExecutor を class として実装**し、`SessionClient` / `GitHubClient` / `JobStateStore` / `EventBus` を constructor 注入で受け取る。I/O lifecycle（セッション生成 → polling → 結果 fetch → parse → state 永続化 → event emit → error 装着）を集約する。
3. **Pipeline class + 宣言的 Transition table** で `pipeline.ts` の inline if 連鎖を置換する。`maxIterations` を loop guard とし、spec-review ↔ spec-fixer の cycle を 1 行で表現する。
4. **Custom Tool は Step に同居**させ、`Step.toolHandlers?: Map<string, ToolHandler>` で表現する。グローバル registry（`src/core/tools/registry.ts`）は完全廃止する。
5. **EventBus は最小 class（`on` / `emit` のみ）**で実装し、subscriber 0 のまま merge する。StepExecutor が `step:*`、Pipeline が `pipeline:*` を emit する。
6. **JobStateStore class + `Record<StepName, StepRun[]>` schema** に統一し、旧 schema（PR #24 前単数 / PR #24 後 `StepResult[]` / 当 change 後 `StepRun[]`）の load 時 normalization で後方互換を維持する。
7. **モジュール構造を [ADR-20260429-module-architecture-style](ADR-20260429-module-architecture-style.md) D4 に整列**させ、`src/{core/{pipeline,step,agent,event,port},adapter/{anthropic,github},store,cli}` の境界を確立する。core 層からの `@anthropic-ai/sdk` 直接 import を排除し、adapter/anthropic/ 経由のみとする。
8. **振る舞い不変の確認** は (a) 既存 161 テスト全 PASS、(b) 旧 state file 3 世代の固定 fixture round-trip、(c) CLI stdout snapshot、(d) エラーコード preservation の 4 階層で行う。

## Alternatives Considered

### Alternative 1: Step を abstract class として定義

- **Pros**: 共通 boilerplate（lifecycle hook 等）を継承で配布できる。constructor で必須フィールドを強制できる
- **Cons**: 各 step が constructor を持つ必要が出る。test 時の partial mock が作りづらい。`StepExecutor` が executor 側の状態を持つ設計と二重に lifecycle を表現することになる
- **Why not**: ADR D1 / D2 で「StepExecutor が executor、Step は declaration」の分離を選択している。Step は state を持たない pure 構造体に徹するべきで、interface のほうが意図を表現できる

### Alternative 2: Pipeline を関数のまま inline if で育てる

- **Pros**: 実装変更が最小。3 step なら if 連鎖でも読める
- **Cons**: spec-fixer の iteration loop（cycle）を inline if で書くと retry counter / loop guard が散在する。step を 1 つ追加するごとに pipeline.ts の改修が必要
- **Why not**: 4 step（implementer 追加）以降で破綻が見えていた。declarative transition table のほうが状態機械として読みやすく、追加 step = 1 行で済む。設計 ADR D3 / D5 で確定済み

### Alternative 3: Custom Tool のグローバル registry を残す

- **Pros**: 既存 `src/core/tools/registry.ts` の改修不要
- **Cons**: tool spec（`agent-definition.ts`）と handler（`registry.ts`）の対応がグローバル名前空間経由で暗黙。tool 名のタイポで silent failure する
- **Why not**: ADR D9 で「tool は step の従属物」と決定済み。`register_branch` は ProposeStep でのみ意味を持ち、step を超えて handler が共有される錯覚を生む構造を排除する

### Alternative 4: EventBus を作らず学習層を後付け

- **Pros**: 本 change の scope を縮小できる。subscriber 0 の dead code を merge しなくて済む
- **Cons**: 学習層実装時に StepExecutor / Pipeline / Step の 3 層全部に hook を後付けすることになる
- **Why not**: ADR D7 / ADR-20260429-positioning D5 で「observation → instinct → rule の継承」を schedule に乗せている。最小 class（10 行程度）で予約席だけ確保する判断を維持する

### Alternative 5: 旧 state schema migration を後回し（StepRun[] を後続 request で導入）

- **Pros**: 本 change の diff を小さくできる
- **Cons**: schema migration を 2 回踏むことになる。spec-fixer の cycle を表現する以上、`StepRun[]` への移行は spec-fixer 実装と同時にやらないと意味が薄い
- **Why not**: 設計 ADR D8 で「D8a + D8b は同 request で適用」と確定済み。後方互換 normalization で旧 state も load できる

### Alternative 6: モジュール再編を後続 request に分離

- **Pros**: PR の diff が縮む
- **Cons**: Step / StepExecutor / Pipeline / EventBus を新設する以上、配置場所を決めずに作ることはできない。中間状態（旧 layout に新 class を置く）はレビュー困難
- **Why not**: 設計判断の上位枠が ADR-20260429-module-architecture-style D4 で確定しており、新 class の配置を一気に正規化するほうが合理的。git mv で履歴は保持される

## Consequences

### Positive

- **コピペ scaling 問題が構造的に解消**: 各 step ファイルが 45–55 行のコピペから `buildMessage` / `resultFilePath` / `parseResult` のみに縮約。次の step（implementer / code-review）追加時、StepExecutor と Pipeline は無編集で済む
- **Pipeline 状態機械が宣言的に読める**: `transitions` 配列を読めば全遷移が把握できる。spec-fixer ↔ spec-review の cycle が 1 行で表現される
- **Custom Tool の drift が型レベルで防げる**: Step が tool spec（`agent.tools`）と handler（`toolHandlers`）の両方を所有し、ペアでズレない
- **学習層の後付け hook が確立**: EventBus に subscribe するだけで Step / Pipeline / StepExecutor は無変更
- **JobState の iteration が一級表現**: `steps[name]: StepRun[]` で同一 step の複数回実行が schema レベルで許容される。後方互換 normalization で production 状態は失われない
- **モジュール境界が型レベルで保証**: `core/port/` の interface に `adapter/` が depend するだけで、core が SDK に直接依存しない構造が確立。test 時に SDK mock が不要になる
- **設計 ADR との 1:1 trace 可能**: D1 → Step interface, D2 → StepExecutor, D3 → Pipeline + Transition, D7 → EventBus, D8a → JobStateStore class, D8b → StepRun[] schema, D9 → toolHandlers co-location

### Negative

- **PR diff が大きい (~600–800 LOC 変更)**: モジュール再編 + 3 step 解体 + class 化を 1 PR で行ったため、レビュー負荷が高い。commit 順序（D8 → D1+D2+D9 → D3 → D7 → layout）で各 commit 単位の review 可能性は維持
- **EventBus subscriber 0 のまま merge**: dead code に見える。学習層実装まで「予約席」の状態が続く（ADR D7 で承知済み）
- **Step が `agent: AgentDefinition` を直接保持**: 後続 request で `agentName: string` + `AgentRegistry` 経由解決に置き換える前提のため、現状は最終形ではない
- **複数 `@deprecated` shim が残存**: `src/state/store.ts` の `persistJobState` / `updateJobState`、`src/core/session.ts`、`src/sdk/sessions.ts` が `@deprecated` 化されたまま削除されていない（後方互換維持と test 移行コストのため）

### Risks

- **旧 state file の normalization で edge case 取りこぼし** → 旧 schema 3 世代の固定 fixture を `tests/fixtures/legacy-job-state-*.json` で round-trip テスト。読み込み専用 normalization で、save は常に最新 schema
- **import path 一括更新で依存方向ミス** → `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/` で SDK 直 import の不在を CI で gate する想定（現時点では gate スクリプト未実装、後続課題）
- **production downgrade 不可** → 新 CLI が書いた `StepRun[]` 形式を旧 CLI は読めない。release notes で明示

### Known Design Debt

code-review iter 3（[review-feedback-003.md](../requests/active/2026-04-29-step-abstraction-refactor/review-feedback-003.md)）で MEDIUM / LOW として承認済みだが、本 change の scope を超えるため後続 request で対処する構造的課題:

- **MEDIUM #1: SSE / polling lifecycle の暗黙 dispatch** — `StepExecutor` が `step.toolHandlers && step.toolHandlers.size > 0` で SSE 系（propose）と polling 系（spec-review / spec-fixer）を分岐している。lifecycle の選択が tool 有無から推論されている。`Step` interface に `lifecycle: "sse" | "poll"` discriminator を追加するか、`SseStep` / `PollingStep` の subtype に分離する
- **MEDIUM #2: GitHubClient port の `verifyPath` リーク** — `executor.ts` が `githubClient.verifyPath?` を optional structural typing で probe している。`GitHubClient` port が `verifyBranch` / `getRawFile` のみを宣言しており、`verifyPath` が adapter shape のリーク。port に追加して全 adapter で実装、`?` を外す
- **MEDIUM #3: executor.ts の session lifecycle 重複** — `runProposeStyleStep` (~290 LOC) と `runPollingStyleStep` (~280 LOC) が `createSession` / `sendUserMessage` / error path を構造的に重複実装。private helper `createAndSendSession` への抽出で 100–150 LOC 削減見込み
- **MEDIUM #4: 削除可能な @deprecated 経路** — `src/core/session.ts`（`startProposeSession` は test 経由のみ）、`src/sdk/sessions.ts`（`tests/completion.test.ts` の event-shape predicate 経由のみ）が削除可能。test の import を `adapter/anthropic/sdk/sessions.ts` 直接参照に移行後、両ファイル削除
- **MEDIUM #5: agent module の directory pattern 不整合** — `src/core/agent/index.ts` が 2 行 placeholder で、`src/core/agent-definition.ts` が実体。ADR-module-architecture-style D7 が directory-form を要求。`agent-definition.ts` を `src/core/agent/agent-definition.ts` に move し、placeholder を re-export 化
- **LOW #6: Step.agent が sentinel な装飾フィールド** — 各 Step が `agent: { agentId: "" }` を sentinel として宣言し、実 agentId は `STEP_AGENT_ROLE` map 経由で resolve される。`agent` フィールドが production で読まれない。`resolveAgentId(config)` method 化または field 削除
- **LOW #7: state/store.ts の @deprecated shim 残存** — `persistJobState` / `updateJobState` が thin shim のまま。test cleanup 後に inline 化 + 削除
- **LOW #8: spec-fixer のメッセージ XML interpolation** — `slug` / `branch` / `findingsPath` を `<user-request>` に直接 interpolate（escape なし）。現時点では config 由来で攻撃面狭いが、将来の config-injection を防ぐため defense-in-depth として escape を追加
- **LOW #9: @deprecated marker に removal date / phase plan なし** — 蓄積を防ぐため tracking line ("remove after request 2026-05-XX-...") もしくは follow-up request の link を付与

これらは本 ADR の決定を逸脱する課題ではない。Step abstraction の **次の改善 cycle** で扱う想定。

### Out of Scope (deferred to follow-up)

- **D4 + D5 + D6**: AgentDefinition / AgentRegistry / AgentSyncer の per-role 分離と config schema migration（`agents: Record<StepName, ...>` map への移行）。`init.ts` 改修と config migration を含むため別 request
- **学習層 subscriber 実装**: EventBus は予約席のみ確保。`step:*` / `pipeline:*` を購読する observation → instinct → rule pipeline の実装は v1 milestone まで deferred
- **e2e テストハーネス**: `tests/e2e-pipeline.test.ts`（tmp git repo + 実 file I/O + API mock）の整備。本 change では既存 161 unit / integration テスト + state file fixture round-trip で振る舞い不変を担保
- **Argo / Tekton 由来の拡張機能**: D1 typed I/O、D3 retry strategies、D7 exit handlers の取り込みは [ADR-20260429-cicd-architecture-inspirations](ADR-20260429-cicd-architecture-inspirations.md) の採用ロードマップに従う

## References

### Source ADRs

- [ADR-20260429-step-and-agent-class-architecture](ADR-20260429-step-and-agent-class-architecture.md) — クラス境界 D1〜D10。本 ADR が実装した D1, D2, D3, D7, D8, D9 の設計根拠
- [ADR-20260429-module-architecture-style](ADR-20260429-module-architecture-style.md) — Modular Monolith + Functional Core, Imperative Shell + Hexagonal-lite。`core/ adapter/ store/ port/` の境界（本 ADR D7 の根拠）
- [ADR-20260429-cicd-architecture-inspirations](ADR-20260429-cicd-architecture-inspirations.md) — Argo Workflows / Tekton 等からの転用パターン。本 change では transition table の declarative 表現（D5）と EventBus 予約席（D6）のみ取り込み

### Change folder

- [openspec/changes/2026-04-29-step-abstraction-refactor/](../../openspec/changes/2026-04-29-step-abstraction-refactor/) — proposal / design / tasks / specs / test-cases / module-analysis / implementation-notes

### Related ADRs

- [ADR-20260427-cli-first-architecture](ADR-20260427-cli-first-architecture.md) — CLI プロセスがオーケストレーター、file-based verdict（前提）
- [ADR-20260427-cli-core-pipeline](ADR-20260427-cli-core-pipeline.md) — `specrunner run` の構造（前提）
- [ADR-20260429-spec-review-pipeline](ADR-20260429-spec-review-pipeline.md) — duplication が顕在化した直前の構造
- [ADR-20260429-spec-fixer-iteration-loop](ADR-20260429-spec-fixer-iteration-loop.md) — `runLoopUntil` primitive と `StepResult[]` 中間 schema（本 change で `StepRun[]` に統一）
- [ADR-20260429-positioning-vs-gsd-and-openspec](ADR-20260429-positioning-vs-gsd-and-openspec.md) — fresh-per-task dispatcher (D4) と学習層継承 (D5) の位置づけ
