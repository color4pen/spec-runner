# Design: port-types-kernel-demote

## Context

`src/state/schema.ts`（shared-kernel 層）が `core/port/model-usage.ts` の `ModelUsage` と `core/port/report-result.ts` の `BaseReportResult` を import / re-export している。`src/state/helpers.ts` も `BaseReportResult` を import している。これらは state（kernel）→ ports の上向き依存であり B-3 違反。

`arch-allowlist.ts` に B3-state-port（×2）・B3-state-helpers（×1）として凍結中。

先行事例として R1（ParsedRequest → parser/types.ts）と R3（step-names → kernel/step-names.ts）で同型の kernel 降格を実施済み。`src/kernel/` ディレクトリは R3 で作成済み。

対象の型:
- `ModelUsage`（`core/port/model-usage.ts`）— 純粋データ interface（4 フィールド）。port 側の唯一の export
- `BaseReportResult`（`core/port/report-result.ts`）— 純粋データ interface（2 フィールド）。同ファイルには `ReportToolSpec`, `FollowUpPolicy`, `DEFAULT_TOOL_RETRY`, parse 関数群, 派生型（`ProducerReportResult` 等）も含まれるが、これらは port 層固有のロジックで kernel には不要

importers 一覧（grep 結果）:
- **B-3 違反（本 change で修正）**: `state/schema.ts`（ModelUsage + BaseReportResult）, `state/helpers.ts`（BaseReportResult）
- **core/ 内部（re-export barrel 経由、変更不要）**: `core/port/agent-runner.ts`, `core/port/report-result.ts`, `core/step/executor.ts`, `core/step/report-tool.ts`, `core/step/types.ts`, `core/event/types.ts`, `core/request/reviewer.ts`, `core/usage/types.ts`, `core/command/usage-show.ts`, `core/command/usage-summary.ts`, `core/port/one-shot-query-client.ts`
- **adapter/（上位→domain、B-3 非該当）**: `adapter/claude-code/agent-runner.ts`, `adapter/managed-agent/agent-runner.ts`, `adapter/codex/agent-runner.ts`, `adapter/claude-code/query-one-shot.ts`, `adapter/claude-code/session-log-writer.ts`

## Goals / Non-Goals

**Goals**:
- `ModelUsage` と `BaseReportResult` の型定義を `src/kernel/` へ移動し、state の B-3 back-edge を解消する
- `arch-allowlist.ts` の B3-state-port（×2）・B3-state-helpers（×1）エントリを削除する
- 既存の型構造と全 consumer の互換性を維持する

**Non-Goals**:
- `core/port/report-result.ts` の port 層固有エクスポート（`ReportToolSpec`, `FollowUpPolicy`, `DEFAULT_TOOL_RETRY`, parse 関数群, 派生型）の移動
- B3-logger（`logger`→`core/event`）の解消
- 他 invariant（B-6 / B-8）
- 振る舞い変更

## Decisions

### D1: `ModelUsage` を `src/kernel/model-usage.ts` に配置

`core/port/model-usage.ts` の内容（interface 定義 + JSDoc）をそのまま `src/kernel/model-usage.ts` に移動。元ファイルは re-export barrel に変換。

**Rationale**: `core/port/model-usage.ts` は `ModelUsage` interface のみを export する単一型モジュール。kernel に移動しても port 側は `export type { ModelUsage } from "../../kernel/model-usage.js"` で済む。R3（step-names）と同じパターン。

**Alternatives considered**:
- `state/schema.ts` 内で直接定義 — state が canonical owner になるが、port/agent-runner.ts も state から import することになり state→port の逆方向（port→state）が発生する。kernel が中立の共有層として適切。

### D2: `BaseReportResult` を `src/kernel/report-result.ts` に配置

`core/port/report-result.ts` から `BaseReportResult` interface のみを `src/kernel/report-result.ts` に抽出。元ファイルは `BaseReportResult` を kernel から import して、他のエクスポート（`ReportToolSpec`, `FollowUpPolicy`, parse 関数群, 派生型）はそのまま port に残す。

**Rationale**: `BaseReportResult` は純粋データ型（`ok: boolean; reason?: string`）であり kernel に適合する。一方 `ReportToolSpec` は zod/v4 の `ZodRawShape` に依存し、`FollowUpPolicy` と parse 関数群はランタイムロジックを含むため port 層に留めるべき。`ProducerReportResult` / `JudgeReportResult` 等は `BaseReportResult` を extends するが、これらも port 固有の typed outcome であり kernel に置く必要はない（`extends` は port → kernel の下向き依存で合法）。

**Alternatives considered**:
- `BaseReportResult` + 派生型すべてを kernel に移動 — 派生型は step-class-specific であり port の責務。kernel に置くと kernel が step/report の知識を持つことになり不自然
- `report-result.ts` 全体を kernel に移動 — zod 依存・parse ロジック・`DEFAULT_TOOL_RETRY` 定数は port のランタイム責務

### D3: `core/port/model-usage.ts` を re-export barrel に変換

```ts
export type { ModelUsage } from "../../kernel/model-usage.js";
```

core/ 内部および adapter/ の全 consumer は `core/port/model-usage.js` 経由で引き続き import 可能。import path 変更なし。

**Rationale**: R3 と同じ差分最小化パターン。core → kernel は下向き依存で B-3 に抵触しない。

### D4: `core/port/report-result.ts` の `BaseReportResult` を kernel import に切替

`core/port/report-result.ts` 内の `BaseReportResult` 定義を削除し、kernel から import + re-export に置換。派生型（`ProducerReportResult` 等）は `extends BaseReportResult` のまま動作する（import 元が変わるだけ）。

```ts
import type { BaseReportResult } from "../../kernel/report-result.js";
export type { BaseReportResult } from "../../kernel/report-result.js";
```

### D5: state/schema.ts と state/helpers.ts の import path を kernel に変更

- `state/schema.ts`: `core/port/model-usage.js` → `../kernel/model-usage.js`、`core/port/report-result.js` → `../kernel/report-result.js`
- `state/helpers.ts`: `core/port/report-result.js` → `../kernel/report-result.js`

これで state → core/port の上向き依存が消滅する。

### D6: arch-allowlist.ts の B3-state-port / B3-state-helpers エントリを削除

tracking `"B3-state-port"` の 2 件と `"B3-state-helpers"` の 1 件を削除。B-3 category の `B3-logger`（1 件）は残す。

suppression-demo テスト（`core-invariants.test.ts` L523）は既に `B3-logger`（`src/logger/pipeline-logger.ts` → `core/event/event-bus.js`）を参照しているため、repoint 不要。

## Risks / Trade-offs

- [Risk] `core/port/report-result.ts` の派生型が `BaseReportResult` を extends — kernel からの import に切り替わるが型構造は同一 → **Mitigation**: TypeScript の structural typing により import path の変更は型互換に影響しない。`bun run typecheck` で検証。
- [Risk] re-export barrel 追加による tree-shaking への影響 → **Mitigation**: `ModelUsage` / `BaseReportResult` は interface（型のみ）であり、TypeScript の `import type` / `export type` は emit 時に消去される。ランタイムバンドルへの影響ゼロ。

## Open Questions

なし。R1/R3 で確立済みの kernel 降格パターンの適用であり、新しい設計判断は不要。
