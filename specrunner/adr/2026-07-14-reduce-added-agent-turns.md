# ADR: 追加 AI ターンの構造的削減 — 完了契約初回注入 / 決定論 skip / ターン種別 metrics

- **Date**: 2026-07-14
- **Status**: Accepted
- **Slug**: reduce-added-agent-turns

## Context

agent step は main work turn に加えて品質に寄与しない追加 AI ターンを構造的に発生させていた。原因は 3 つの構造的ギャップにある:

1. **完了契約が初回 turn に届いていない（local Claude Code path）**: `ClaudeCodeRunner.run()` は SDK `query` に step system prompt（`COMPLETION_DIRECTIVE`）を渡していない。first-turn prompt は `buildMessage + resume + buildAdditionalInstructions` の連結であり、`report_result` を呼ぶ指示は buildMessage 末尾文と report_result tool description 経由でのみ届く。provider が first turn で tool を呼ばないと、`DEFAULT_TOOL_RETRY`（maxAttempts=2）による再試行 turn が追加発生する。

2. **結果が決定論的に確定している step でも agent turn を消費する**: adr-gen は `request.adr === false` でも agent を起動して no-op で終わる（`src/core/step/adr-gen.ts:73-78`）。regression-gate は findings ledger が空でも「approve immediately」を agent に依頼する（`src/core/step/regression-gate.ts:53-56`）。ledger は `collectFindingsLedger(reviewerChain, state)` により turn 前に決定論的に算出できる。

3. **追加ターンが単一カウンタに混在計上される**: `StepOutcome.followUpAttempts` は report_result 再試行と output-repair を混在させ、post-work turn（`agent-runner.ts:726-777`）は未計上。削減効果の検証ができない。

既存の宣言的 activation（`ReviewerActivation`）は `requestTypes`（文字列一致）と `paths`（glob）のみで、state / deps を引数に取らない。`request.adr === false` や「ledger が空」は state 依存述語であり、この語彙では表現できない。

既存の skip 経路は整備済み: executor の activation 評価点（`src/core/step/executor.ts:268-284`）で `{ kind: "skipped", skipReason }` を返し、`CommitOrchestrator.commitSkipped` が skipped verdict + `{step}-skipped` history を積む。

関連先行 ADR:
- [2026-05-28-tool-driven-step-completion](./2026-05-28-tool-driven-step-completion.md) — `report_result` MCP tool による agent step 完了判定の基盤。本 ADR の completion directive 注入はこの仕組みを前提とする

## 決定

### D1: completion directive の注入は claude-code adapter に閉じる

local Claude Code path 専用の pure helper `src/adapter/claude-code/completion-directive.ts` に `buildReportToolCompletionDirective(mcpToolName: string): string` を新設する。`ClaudeCodeRunner.run()` は `ctx.policy.reportTool` が設定されているときだけ、MCP tool 名 `mcp__${REPORT_MCP_SERVER_NAME}__${reportTool.name}`（`REPORT_MCP_SERVER_NAME = "specrunner_report"` と `reportTool.name` から合成）を渡して directive を生成し、first-turn の `fullPrompt` 末尾に連結する。reportTool 未設定時（MCP tool が存在しない step）は注入しない。

既存の report_result 再試行 fallback（`agent-runner.ts:701-722`）は変更しない。

**Rationale**: `buildAdditionalInstructions`（`src/adapter/shared/prompt-builder.ts`）は codex adapter も import する共有関数であり、provider 固有の MCP tool 名を入れると Claude 以外の provider へ leak する。claude-code adapter 配下に閉じることで core prompt の provider-neutral 方針を保ち、注入対象を local Claude Code path のみに限定できる。first turn で指示を届けることで再試行 turn の発生確率を下げつつ、届かなかった場合の安全網は fallback として残る。

### D2: state / deps を取る `skipWhen` 述語を executor の評価点に並べる

`AgentStep` に optional method を追加する:

```typescript
// src/core/port/step-types.ts
skipWhen?(state: JobState, deps: StepDeps): string | null;
```

結果が決定論的に確定していて agent 実行が不要な場合に skip 理由（string）を返す。pure function（I/O 禁止）。

executor の `runAgentStep` で、既存の宣言的 activation gate（`executor.ts:268-284`）の直後に独立した gate として評価する:

```typescript
if (step.skipWhen) {
  const skipReason = step.skipWhen(state, deps);
  if (skipReason !== null) return { kind: "skipped", skipReason };
}
```

両 gate は独立で、いずれかが成立すれば既存の `commitSkipped` 経路（skipped verdict + `{step}-skipped` history）に載る。skip は buildStepContext / prepareStepArtifacts / guard snapshot より前に短絡するため、artifact 準備や git 操作の副作用は発生しない。

**Rationale**: `ReviewerActivation`（paths / requestTypes）は「変更ファイル集合と request type に対する宣言的マッチ」という別軸で、state を引数に取らない。`request.adr` は boolean フラグで request.type ではなく、「ledger が空」は state 依存であり、宣言的 activation の語彙に載らない。両者を混ぜると activation の意味が曖昧になる。`skipWhen` を評価点に**並べる**ことで skip という共通の帰結（commitSkipped）に収束させつつ、判定の軸を分離できる。

### D3: adr-gen / regression-gate に `skipWhen` を実装し、adr-gen の skipped 遷移を追加する

- **adr-gen**（`src/core/step/adr-gen.ts`）: `skipWhen(_state, deps) => deps.request.adr === false ? "<reason>" : null`。`buildAdrGenInitialMessage` の adr:false 分岐は防御的に残す（skip が短絡するため通常経路では未到達だが buildMessage 単体の契約は不変）。
- **regression-gate**（`src/core/step/regression-gate.ts`）: `skipWhen(state) => collectFindingsLedger(deriveImplReviewerChain(state), state).length === 0 ? "<reason>" : null`。
- **遷移追加**: adr-gen は `STANDARD_TRANSITIONS` に `on: "skipped"` 行が無いため `{ step: ADR_GEN, on: "skipped", to: PR_CREATE }` を追加する。無ければ skipped verdict が transition 未マッチで escalation に落ちる。regression-gate `skipped → conformance` は既存（`reviewer-chain.ts:460-464`）のため変更不要。

**Rationale**: regression-gate の空 ledger skip は現状の「approve immediately（空 findings）」と意味的に等価であり、verdict ラベルが approved → skipped に変わるだけで routing（→ conformance）は不変。adr-gen は skipped 遷移が無いため 1 行追加で forward progress（→ pr-create）を保つ。

### D4: 追加ターン計測を種別分離し、`followUpAttempts` は互換維持する

`AgentRunResult` と `StepOutcome` に optional field を追加する:

```typescript
addedTurns?: {
  reportRetry: number;   // report_result 再試行 turn 数
  postWork: number;      // postWorkPrompts turn 数（新規計上）
  outputRepair: number;  // output verification repair turn 数
};
```

不変条件: `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`。`postWork` は後方互換のため `followUpAttempts` に含めない。managed / codex adapter は `addedTurns` を undefined のまま残す。

**Rationale**: `followUpAttempts` は既存 state ファイル・既存テスト・usage 集計が参照する。意味論を変えると読み手全体に波及する。optional な `addedTurns` を additive に足し、既存フィールドは不変に保つことで、既存テストを無改変で green にしつつ post-work を含む分離計測を得られる。

## Alternatives Considered

### Alternative 1: core prompt（`COMPLETION_DIRECTIVE`）に MCP tool 名を追記する

- **Pros**: 一箇所で全 path に届く
- **Cons**: managed / codex adapter を含むすべての provider に provider 固有名（`mcp__specrunner_report__report_result`）が leak する。provider-neutral 方針に反する
- **Why not**: D1 の adapter 閉じ込め

### Alternative 2: `buildAdditionalInstructions`（shared）に completion directive を注入する

- **Pros**: local / managed の両 Claude Code path に届く
- **Cons**: codex adapter も `buildAdditionalInstructions` を import するため provider 固有名が leak する
- **Why not**: D1 の adapter 閉じ込め

### Alternative 3: step system prompt（`step.agent.system`）を SDK `query` に渡す経路を新設する

- **Pros**: step 側で managed / local を意識せず system prompt を渡せる
- **Cons**: adapter 3 つ + executor の変更範囲が本 change のスコープを超える。system prompt の carrier が現状の buildMessage / COMPLETION_DIRECTIVE と並立して複雑化する
- **Why not**: スコープ超過・複雑化。first-turn prompt への directive 連結で十分

### Alternative 4: adr:false を宣言的 activation の `requestTypes` で表現する

- **Pros**: 既存 activation 評価点に収まる
- **Cons**: `adr` は request.type ではなく boolean フラグ。`requestTypes` の語彙（文字列一致）に載らない
- **Why not**: 型ミスマッチ。状態依存述語（D2）が必要

### Alternative 5: skip 判定を各 step の `buildMessage` 内で行い no-op で終わらせる（現状 adr-gen の方式）

- **Pros**: 変更箇所が step 内のみ
- **Cons**: agent turn を消費するため削減目的に反する
- **Why not**: agent turn を消費しない前提の skip（D2/D3）が目的

### Alternative 6: `followUpAttempts` を 3 種合算に再定義する

- **Pros**: 単一フィールドで完結
- **Cons**: 既存の読み手（usage 集計・テスト）の期待が変わり回帰面が広がる
- **Why not**: D4 の互換維持

### Alternative 7: `followUpAttempts` を deprecate し `addedTurns` から導出する

- **Pros**: フィールドの一本化
- **Cons**: migration コストと後方互換リスクが本 change のスコープに見合わない
- **Why not**: D4 の互換維持

## リスクと受容判断

**[Risk] adr:false での full-run integration test の期待変化**

adr-gen が agent を実行しなくなるため、session 数を数える統合テスト（TC-010: 8 sessions 想定）と adr-gen verdict の期待が変わる。→ 当該テストを session 数 7・adr-gen verdict "skipped"・awaiting-archive 到達へ更新。受け入れ基準が「adr:false の adr-gen が success→skipped」を明示的に許容している。

**[Risk] `skipWhen` の runtime 横断適用**

`skipWhen` は executor（runtime-neutral）に置くため managed / local 双方で発火する。completion directive（D1）は local 限定だが、skip（D2/D3）は両 runtime に及ぶ。→ skip 対象はいずれも結果が決定論的に確定しており、両 runtime で同じ短絡が正しい。routing（→ pr-create / → conformance）は両 runtime で不変。

**[Risk] regression-gate 空 ledger skip の下流依存**

`regressionGateActive(state)` は last verdict が needs-fix / approved+fixable のとき true を返す。skipped は false になる。→ 空 ledger の gate は fixer source ではないため false が正しい。observable routing（→ conformance）は不変。

**[Risk] completion directive の位置ずれ**

`fullPrompt` は reportTool ブロック定義より前で構築される可能性がある。→ MCP tool 名は定数 `REPORT_MCP_SERVER_NAME` と `reportTool.name` から first-turn query 発行前に合成できる。契約は「reportTool set のとき first-turn prompt に directive が含まれる」で固定する。

**[Trade-off] `followUpAttempts` と `addedTurns` の二重持ち**

冗長だが後方互換のため許容する。不変条件（`reportRetry + outputRepair === followUpAttempts`）をテストで固定し drift を防ぐ。

## Consequences

### Positive

- local Claude Code path の first-turn で `report_result` 呼び出し指示が明示的に届くようになり、再試行 turn の発生確率が下がる
- `request.adr === false` の adr-gen と空 ledger の regression-gate が agent turn を消費せず skipped で完了する
- post-work turn を含む追加ターンの種別が分離計測され、削減効果の検証が可能になる
- `skipWhen` という state 依存の skip 述語が新しい拡張ポイントとして整備され、将来の step でも同パターンが使える
- 既存の宣言的 activation（paths / requestTypes）は独立して維持され、混入しない

### Negative

- `followUpAttempts` と `addedTurns` の二重持ちによる冗長
- adr-gen の integration test（session 数 / verdict 期待）が変わるため既存テストの部分更新が必要

### Known Debt

- post-work の無条件実行を detector 化する変更（別 change で対応予定）
- code-review post-work の typed-findings 指示除去（別 change）
- managed adapter の completion directive 注入（本 change は local Claude Code path のみ）

## Files Changed

| File | Change |
|------|--------|
| `src/adapter/claude-code/completion-directive.ts` | 新設（`buildReportToolCompletionDirective`） |
| `src/adapter/claude-code/agent-runner.ts` | first-turn `fullPrompt` に completion directive を連結。`addedTurns` の 3 種カウント追加 |
| `src/core/port/step-types.ts` | `AgentStep.skipWhen` optional method を追加 |
| `src/core/port/agent-runner.ts` | `AgentRunResult.addedTurns` optional field を追加 |
| `src/core/step/adr-gen.ts` | `skipWhen` 実装（adr === false → skip） |
| `src/core/step/regression-gate.ts` | `skipWhen` 実装（空 ledger → skip） |
| `src/core/step/executor.ts` | `skipWhen` 評価 gate を activation gate の直後に追加 |
| `src/core/pipeline/types.ts` | `STANDARD_TRANSITIONS` に adr-gen `on: "skipped" → PR_CREATE` を追加 |
| `src/state/helpers.ts` | `pushStepResult` で `addedTurns` を `StepOutcome` に流す |
| `src/state/schema/types.ts` | `StepOutcome.addedTurns` optional field を追加 |

## 関連 ADR

- [2026-05-28-tool-driven-step-completion](./2026-05-28-tool-driven-step-completion.md) — `report_result` MCP tool 完了判定の基盤。本 ADR の D1（completion directive 注入）はこの仕組みを前提とし、再試行 fallback も同 ADR で定義された `DEFAULT_TOOL_RETRY` を使用する
- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — intra-step follow-up の 2 段実行パターン。本 ADR の D4（addedTurns 種別分離）はこのパターンの計測精度を高める
- [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunContext` / `AgentRunResult` ポートの初期定義。本 ADR で `AgentRunResult.addedTurns` を拡張する
- [2026-04-29-module-architecture-style](./2026-04-29-module-architecture-style.md) — hexagonal-lite + module-boundary 原則。本 ADR の D1（adapter 閉じ込め）はこの原則の具体例
