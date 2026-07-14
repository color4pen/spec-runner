# Design: 追加 AI ターンの構造的削減

## Context

agent step は本処理（main work turn）に加えて品質へ寄与しない追加 AI ターンを構造的に発生させている。本 change は品質を落とさずに削減できる 3 点を扱う。

現状の構造:

- **完了契約の届き方（local Claude Code path）**: `ClaudeCodeRunner.run()`（`src/adapter/claude-code/agent-runner.ts`）は SDK `query` に step system prompt（`COMPLETION_DIRECTIVE` を含む）を渡していない。first-turn prompt は `buildMessage` + resume + `buildAdditionalInstructions` の連結（`agent-runner.ts:327-335`）で、report_result を呼ぶ指示は buildMessage 末尾文と report_result tool description 経由でのみ届く。provider（Claude）が first turn で tool を呼ばないと、report_result 再試行 turn（`agent-runner.ts:701-722`, policy `DEFAULT_TOOL_RETRY` maxAttempts=2）が追加で発生する。
- **決定論的に確定している step が agent を消費する**:
  - adr-gen は `request.adr === false` でも登録され、no-op message を投げて即終了する（`src/core/step/adr-gen.ts:73-78`）が agent turn を 1 消費する。
  - regression-gate は findings ledger が空でも「approve immediately」を agent に依頼する（`src/core/step/regression-gate.ts:53-56`）。ledger は `collectFindingsLedger(state, reviewerChain)` により turn 前に決定論的に算出できる。
- **既存の宣言的 activation の限界**: `AgentStep.activation`（`ReviewerActivation`, `src/core/port/step-types.ts:244`）は `requestTypes`（文字列一致）と `paths`（glob）のみで、state / deps を引数に取らない（評価: `src/core/reviewers/activation.ts:57-98`）。`request.adr === false` や「ledger が空」は state 依存述語であり、この語彙に載らない。
- **追加ターン計測の未分離**: 追加ターンは `StepOutcome.followUpAttempts`（`src/state/schema/types.ts:137`）に単一カウンタとして記録され、report_result 再試行と output-repair を混在させ、post-work turn（`agent-runner.ts:726-777`）は計上されない。

既存の skip 経路は整備済み: executor の activation 評価点（`src/core/step/executor.ts:268-284`）で不成立時に `{ kind: "skipped", skipReason }` を返し、`CommitOrchestrator.commitSkipped`（`src/core/step/commit-orchestrator.ts:338-364`）が skipped verdict + `{step}-skipped` history を積む。

**制約**:

- core prompt の provider-neutral 方針を維持する。provider 固有の MCP tool 名注入は adapter 層に閉じる。
- report_result 再試行 fallback は削除しない（provider が first turn で tool を呼ばない例外時の安全網）。
- skip は既存 `commitSkipped` 経路に載せ、新しい状態型 / 履歴型 / halt を導入しない。
- 既存の宣言的 activation（paths / requestTypes）を壊さない。
- skip 対象 step 以外の verdict 導出・pipeline 遷移の観測挙動を変えない。

## Goals / Non-Goals

**Goals**:

- local Claude Code path の first-turn prompt に、report_result（MCP tool 名 `mcp__specrunner_report__report_result`）を turn 終了前に呼ぶ completion directive を注入する。
- state / deps を参照する skip 判定述語を導入し、`request.adr === false` の adr-gen と findings ledger が空の regression-gate を agent 実行前に skip する。
- `StepOutcome` の追加ターン計測を種別分離（report_result 再試行 / post-work / output-repair）し、post-work turn を計上する。

**Non-Goals**:

- post-work の無条件実行を detector 化する（別 change）。
- code-review post-work の typed-findings 指示除去（別 change）。
- design の探索量削減 / model routing（別 change）。
- managed adapter の completion 経路変更（本 change は local Claude Code path が対象）。
- report_result 再試行 fallback の削除。

## Decisions

### D1: completion directive の注入は claude-code adapter に閉じる

local Claude Code path 専用の pure helper を claude-code adapter 配下に新設し（`src/adapter/claude-code/completion-directive.ts`）、`buildReportToolCompletionDirective(mcpToolName: string): string` を export する。`ClaudeCodeRunner.run()` は `ctx.policy?.reportTool` が set のときだけ、MCP tool 名 `mcp__${REPORT_MCP_SERVER_NAME}__${reportTool.name}`（既存の `REPORT_MCP_SERVER_NAME = "specrunner_report"` と `reportTool.name` から合成、`agent-runner.ts:372` / `:428` と単一ソース）を渡して directive を生成し、first-turn の `fullPrompt` 末尾に連結する。reportTool 未設定時（MCP tool が存在しない step）は注入しない。

directive の本文は provider 固有（MCP tool 名を明示）であり、`report_result` を turn 終了前に呼ぶことを指示する。既存の report_result 再試行 fallback（`agent-runner.ts:701-722`）は変更しない。

**Rationale**: 「why adapter, not shared prompt」— `buildAdditionalInstructions`（`src/adapter/shared/prompt-builder.ts`）は codex adapter も import する共有関数であり、ここに provider 固有の MCP tool 名を入れると Claude 以外の provider へ leak する。claude-code adapter 配下に閉じることで core prompt の provider-neutral 方針を保ち、注入対象を local Claude Code path のみに限定できる。first turn で指示を届けることで、再試行 turn の発生確率を下げつつ、届かなかった場合の安全網は fallback として残る。

**Alternatives considered**:

- `COMPLETION_DIRECTIVE`（core prompt fragment）に MCP tool 名を追記する → core prompt の provider-neutral 方針に反し、managed / codex にも影響するため却下。
- `buildAdditionalInstructions`（shared）に注入する → codex adapter へ leak するため却下。
- step system prompt（`step.agent.system`）を SDK `query` に渡す経路を新設する → 変更範囲が広く、本 change のスコープ（first-turn prompt への directive 注入）を超えるため却下。

### D2: state / deps を取る skip 述語 `skipWhen` を executor の評価点に並べる

`AgentStep` に optional method を追加する:

```typescript
// src/core/port/step-types.ts
skipWhen?(state: JobState, deps: StepDeps): string | null;
```

結果が決定論的に確定していて agent を実行する必要がない場合に skip 理由（string）を返し、実行が必要なら null を返す。pure function（I/O 禁止）。

executor の `runAgentStep` で、既存の宣言的 activation gate（`executor.ts:268-284`）の直後に、独立した gate として評価する:

```
if (step.skipWhen) {
  const skipReason = step.skipWhen(state, deps);
  if (skipReason !== null) return { kind: "skipped", skipReason };
}
```

両 gate は独立で、いずれかが成立すれば `{ kind: "skipped" }` を返し、既存の `commitSkipped` 経路（skipped verdict + `{step}-skipped` history）に載る。skip は buildStepContext / prepareStepArtifacts / guard snapshot より前に短絡するため、artifact 準備や git 操作の副作用は発生しない。

**Rationale**: 「why 別述語, not activation 拡張」— `ReviewerActivation`（paths / requestTypes）は「変更ファイル集合と request type に対する宣言的マッチ」という別軸で、state を引数に取らない。`request.adr` は request.type ではなく boolean フラグ、「ledger が空」は state 依存であり、宣言的 activation の語彙に載らない。両者を混ぜると activation の意味が曖昧になる。`skipWhen` を活性化評価点に**並べる**ことで、skip という共通の帰結（commitSkipped）に収束させつつ、判定の軸を分離できる。

**Alternatives considered**:

- `adr:false` を activation の `requestTypes` で表現する → adr は boolean フラグで request.type ではないため表現不能。却下。
- skip 判定を各 step の buildMessage 内で行い no-op で終わらせる（現状 adr-gen）→ agent turn を消費するため、削減目的に反する。却下。
- skip 専用の新しい状態型 / halt を導入する → 既存 commitSkipped で十分。新しい語彙を増やさない。却下。

### D3: adr-gen / regression-gate に `skipWhen` を実装し、adr-gen の skipped 遷移を追加する

- **adr-gen**（`src/core/step/adr-gen.ts`）: `skipWhen(_state, deps) => deps.request.adr === false ? "<reason>" : null`。`buildAdrGenInitialMessage` の adr:false 分岐は防御的に残す（skip が短絡するため通常経路では未到達だが、buildMessage 単体の契約は不変）。
- **regression-gate**（`src/core/step/regression-gate.ts`）: `skipWhen(state) => collectFindingsLedger(state, deriveImplReviewerChain(state)).length === 0 ? "<reason>" : null`。ledger 算出は buildMessage（`regression-gate.ts:122-123`）と同一の呼び出しで整合させる。
- **遷移**:
  - regression-gate `skipped → conformance` は既存（`src/core/pipeline/reviewer-chain.ts:460-464`）。追加不要。
  - adr-gen は STANDARD_TRANSITIONS に `on: "skipped"` 行が無いため、`{ step: ADR_GEN, on: "skipped", to: PR_CREATE }` を `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に追加する。無ければ `getStepOutcome` が返す "skipped" が transition 未マッチで escalate に落ちる。FAST_TRANSITIONS は adr-gen を含まないため変更不要。

**Rationale**: regression-gate の空 ledger skip は現状の「approve immediately（空 findings）」と意味的に等価であり、verdict ラベルが approved→skipped に変わるだけで routing（→ conformance）は不変。既に skipped 遷移が存在するため配線変更ゼロ。adr-gen は skipped 遷移が無いため 1 行追加で forward progress（→ pr-create）を保つ。

**Alternatives considered**:

- adr-gen skipped を `getStepOutcome` で "success" に正規化する → outcome 導出に step 固有分岐を持ち込むため却下。宣言的 transition 行の追加が既存パターンに沿う。

### D4: 追加ターン計測を種別分離し、`followUpAttempts` は互換維持する

`AgentRunResult`（`src/core/port/agent-runner.ts`）と `StepOutcome`（`src/state/schema/types.ts`）に optional field を追加する:

```typescript
addedTurns?: {
  reportRetry: number;   // report_result 再試行 turn 数
  postWork: number;      // postWorkPrompts turn 数（新規計上）
  outputRepair: number;  // output verification repair turn 数
};
```

local claude-code adapter が 3 種を個別にカウントし、`AgentRunResult.addedTurns` を populate する。postWork loop（`agent-runner.ts:726-777`）は各 turn で `postWork` をインクリメントする（現状は未計上）。

`followUpAttempts` は既存意味論（report_result 再試行 + output-repair の合算）のまま維持し、削除しない。不変条件: `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`。`postWork` は followUpAttempts に含めない（後方互換のため）。

plumbing: agent-runner → `AgentRunResult.addedTurns` → executor の success `StepExecutionResult`（`executor.ts:468-479`）→ `CommitOrchestrator` `projectSuccess`（`commit-orchestrator.ts:81-102`）→ `pushStepResult`（`src/state/helpers.ts:104-137`）→ `StepOutcome.addedTurns`。sequential / parallel round の両経路が projectSuccess を通るため一元的に流れる。managed / codex adapter は `addedTurns` を undefined のまま残す（後方互換）。

**Rationale**: 「why 互換維持, not 移行」— `followUpAttempts` は既存 state ファイル・既存テスト・usage 集計が参照する。意味論を変えると読み手全体に波及する。optional な `addedTurns` を additive に足し、既存フィールドは不変に保つことで、既存テストを無改変で green にしつつ post-work を含む分離計測を得られる。

**Alternatives considered**:

- `followUpAttempts` を 3 種合算に再定義する → 既存の読み手（usage 集計・テスト）の期待が変わり回帰面が広がるため却下。
- `followUpAttempts` を deprecate し `addedTurns` から導出する → migration コストと後方互換リスクが本 change のスコープに見合わないため却下。

## Risks / Trade-offs

- **[Risk] adr:false での full-run integration test の期待変化**: adr-gen が agent を実行しなくなるため、session 数を数える統合テスト（`tests/pipeline-integration.test.ts` TC-010: 8 sessions を想定）と adr-gen verdict の期待が変わる。→ Mitigation: 当該テストを session 数 7・adr-gen verdict "skipped"・awaiting-archive 到達（pr-create まで進む）へ更新する。受け入れ基準が「adr:false の adr-gen が success→skipped」を明示的に許容している。
- **[Risk] skip の runtime 横断適用**: `skipWhen` は executor（runtime-neutral）に置くため managed / local 双方で発火する。completion directive（D1）は local 限定だが、skip（D2/D3）は両 runtime に及ぶ。→ Mitigation: skip 対象は adr-gen（adr:false）と regression-gate（空 ledger）のみで、いずれも結果が決定論的に確定しており、両 runtime で同じ短絡が正しい。routing（→ pr-create / → conformance）は両 runtime で不変。
- **[Risk] regression-gate 空 ledger skip の下流依存**: `regressionGateActive(state)` は last verdict が needs-fix / approved+fixable のとき true を返す。skipped は false になる。→ Mitigation: 空 ledger の gate は fixer source ではないため false が正しい。observable routing（→ conformance）は不変。
- **[Risk] completion directive の位置ずれ**: `fullPrompt` は reportTool ブロック（`REPORT_MCP_SERVER_NAME` 定義）より前で構築される。→ Mitigation: MCP tool 名は定数 `REPORT_MCP_SERVER_NAME` と `reportTool.name` から合成でき、first-turn query 発行前に directive を連結できる。契約は「reportTool set のとき first-turn prompt に directive が含まれる」で固定し、実装位置は問わない。
- **[Trade-off] `followUpAttempts` と `addedTurns` の二重持ち**: 冗長だが後方互換のため許容する。不変条件を test で固定し drift を防ぐ。

## Open Questions

なし。architect 評価済みの設計判断（skip 述語の並置 / commitSkipped 経路の再利用 / adapter 層への tool 名注入閉じ込め / adr:false 宣言的表現の却下 / report_result 再試行の存置）により全決定事項が確定している。
