# Design: adapters / ports が domain 型を直参照しない — 共有型を shared-kernel へ降格

## Context

`arch-closure-src-wide`（#495）で凍結した DSM §3 違反 21 件のうち、adapter→domain（12 件）と ports→domain（4 件）の計 16 件を burn-down する。

現状: adapter と port が同じ domain 型群（`core/agent/definition` / `core/step/types` / `core/event/types` / `core/tools/types`）を直 import している。加えて adapter 専用の `core/types.ts:StepContext` / `core/step/step-names` / `core/lifecycle/diagnostic` / `core/step/executor-helpers` への import も §3 違反。

先例: `step-names` は R3 で `src/kernel/step-names.ts` に降格済み。`core/step/step-names.ts` は re-export barrel として残存。同パターンを踏襲する。

並行 change `dsm-runtime-strategy-demote` は `core/types.ts` の `RuntimeStrategy` / `PipelineDeps.runtimeStrategy` 領域と `core/runtime/` を扱う。本 change は `StepContext` 定義領域のみに触れ、distinct region で衝突最小。

## Goals / Non-Goals

**Goals**:

- adapter→domain 12 件 + ports→domain 4 件 = 計 16 件の DSM §3 allowlist エントリを 0 件にする
- 共有型を `src/kernel/` に降格し、adapter / port 双方の edge を一括解消する
- `executor-helpers` の adapter 参照を解消する

**Non-Goals**:

- domain→comp-root 違反（`RuntimeStrategy` / `prereqs`）— 並行 change の領分
- `core/runtime/` 配下の変更
- `architecture/model.md` の編集
- 振る舞い変更

## Decisions

### D1: 共有 VO 型を `src/kernel/` に降格（物理移動 + re-export barrel）

対象ファイルを `core/` → `kernel/` に移動し、元の場所に re-export barrel を残す。

**移動対象**:

| 元 | 先 | 含む export |
|---|---|---|
| `core/agent/definition.ts` | `kernel/agent-definition.ts` | `AgentDefinition`, `ToolSpec`, `AgentToolsetSpec`, `CustomToolSpec`, `AgentCapabilities`, `AGENT_TOOLSET_TYPE` |
| `core/event/types.ts` | `kernel/event-types.ts` | `DomainEvent`, `EventPayloadMap`, `Payload` |
| `core/tools/types.ts` | `kernel/tool-types.ts` | `CustomToolDefinition`, `CustomToolContext`, `CustomToolResult`, `CustomToolHandler`, `CustomTool`, `defineCustomTool` |
| `core/step/types.ts` | `kernel/step-types.ts` | `StepDeps`, `CliStepDeps`, `ParsedStepResult`, `NULL_PARSE_RESULT`, `AgentStep`, `CliStep`, `Step` + re-export `AgentDefinition`, `ReviewScores`, `FindingSeverityCounts` |

**Rationale**: re-export barrel により既存の domain 内 import site（`core/step/*.ts` が `../agent/definition.js` を参照する ~20 箇所）を変更不要にできる。adapter / port は barrel 経由でも kernel 直でも legal（shared-kernel への import は全層で許可）。

**Alternatives**:
- (a) barrel なしで全 import site を張り替え → 変更ファイル数が大幅に増え、並行 change との衝突リスク増
- (b) 型を ports に移動 → ports は interface 定義の場所であり、VO / 値定数を置く場所ではない（§2 の責務に反する）

### D2: `StepContext` を `src/kernel/step-context.ts` に降格

`core/types.ts` の `StepContext` interface 定義のみを `kernel/step-context.ts` に切り出す。`core/types.ts` には `StepContext` の re-export を残す。

`StoreFactory` / `PipelineDeps` は `core/types.ts` に残す（domain 層の型であり adapter / port から参照されない）。

**Rationale**: adapter 3 ファイル（claude-code/agent-runner, codex/agent-runner, managed-agent/agent-runner）が `StepContext` のみを必要としている。`PipelineDeps` を動かす必要はなく、`StepContext` だけを切り出せば十分。

**Alternatives**:
- (a) `core/types.ts` ごと移動 → `PipelineDeps` は domain 型（`RuntimeStrategy` 等を含む）なので kernel に置けない。並行 change の `RuntimeStrategy` 領域と衝突する

### D3: `core/lifecycle/diagnostic.ts` を `kernel/diagnostic.ts` に移動

`logPipelineDiag` は pure utility（logger 依存のみ）であり、domain logic を含まない。kernel 層に移動して adapter からの legal import にする。

元の `core/lifecycle/diagnostic.ts` に re-export barrel を残す（domain 内の既存 import site を保持）。

**Rationale**: `diagnostic.ts` は `logger/stdout.js` と `util/env-filter.js` のみを import しており、domain 型への依存がゼロ。shared-kernel → leaf（util）は §3 で legal。

**Alternatives**:
- (a) adapter 内に複製 → DRY 違反、メンテコスト増

### D4: `executor-helpers` の `throwWrappedError` / `attachStateAndRethrow` を `kernel/error-helpers.ts` に切り出し

adapter 2 ファイル（`managed-agent/agent-runner.ts`, `managed-agent/error-helpers.ts`）が参照している `throwWrappedError` / `attachStateAndRethrow` を kernel に移動する。

**切り出し対象**: `throwWrappedError` と `attachStateAndRethrow` のみ（state/schema の `JobState` / `ErrorInfo` 型のみ依存。shared-kernel 内完結）。

**残す関数**: `createSessionWithHistory` / `recordFailedStepResult` / `failStepWithError` は `SessionClient` port / `JobStateStore` 実装に依存しており、domain に残す。これらは `throwWrappedError` を kernel から import する形になる。

`core/step/executor-helpers.ts` に `throwWrappedError` / `attachStateAndRethrow` の re-export を残す（domain 内 `executor.ts` の既存 import を保持）。

**Rationale**: `throwWrappedError` / `attachStateAndRethrow` は `JobState`（state/schema = shared-kernel）のみに依存する pure 関数。kernel に置いても upward import は発生しない。

**Alternatives**:
- (a) adapter 内に複製 → error construction パターンが二箇所に分散し、乖離リスク
- (b) ports に新 interface 追加 → 関数であり interface にする意味がない

### D5: `core/step/step-names.ts` の adapter 参照を kernel 直参照に張り替え

`core/step/step-names.ts` は既に `kernel/step-names.ts` の re-export barrel。adapter の import を `../../kernel/step-names.js` に変更するだけで §3 違反が解消する（新ファイル不要）。

## Risks / Trade-offs

[Risk] kernel への型移動で循環 import が発生する → **Mitigation**: 移動する型は `state/schema`（kernel 内）と `util/`（leaf）のみに依存。kernel → domain の逆方向 import は発生しない。`core/step/types.ts` barrel の import 元が kernel に変わるだけ。

[Risk] re-export barrel の増加でモジュール解決が複雑化する → **Mitigation**: barrel は `export * from` / `export type { X } from` の 1 行ファイル。step-names.ts の先例で確立済みのパターン。将来的に barrel を除去して直参照に切り替える burn-down も可能。

[Risk] `core/step/types.ts` が kernel に移動すると、domain 内の多数の import site に影響する → **Mitigation**: barrel を残すので domain 内は変更なし。adapter / port のみ kernel 直参照に張り替え。

## Open Questions

なし。全判断は architect 評価済み + 先例（step-names R3 降格）に基づく。
