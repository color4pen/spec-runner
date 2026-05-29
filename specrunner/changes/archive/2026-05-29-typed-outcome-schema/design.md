# Design: typed-outcome-schema

## Context

`report_result` は全 10 agent step で共通の `BaseReportResult { ok, reason? }` を使っている。`contract/step-outcome.md` は step-class 別の typed outcome を定義済みだが、実装は `BaseReportResult` のまま。

本 request は expand-contract パターンの **expand** フェーズ。新フィールドを additive に足し、誰も読まない状態で並存させる。振る舞い不変。

### 現状の構造

- `src/core/port/report-result.ts`: `BaseReportResult` 型、`parseBaseReportInput` 関数、`ReportToolSpec<T>` ジェネリック
- `src/core/step/report-tool.ts`: `REPORT_TOOL`（全 step 共通）、`REPORT_TOOL_CUSTOM_TOOL_SPEC`（AgentDefinition.tools 用）
- 各 step 定義: `reportTool: REPORT_TOOL` を参照、agent.tools に `REPORT_TOOL_CUSTOM_TOOL_SPEC` を含む
- claude-code adapter: `ctx.policy.reportTool.parseInput(args)` で parse → `capturedToolResult: BaseReportResult` に格納
- `AgentRunResult.toolResult: BaseReportResult | null` → executor がそのまま pass-through

## Goals / Non-Goals

**Goals**:

- step-class 別の typed outcome 型（producer / judge / code-review-judge）を定義する
- 各 step の ReportToolSpec を step-class 別に分化させ、zodSchema に新フィールドを含める
- claude-code adapter が新フィールドを populate する（parseInput が返す値に含まれる）
- presence テストで新フィールドの populate を検証する

**Non-Goals**:

- 新フィールドを読む cutover（executor / transition の切替）= R3
- `ok` / `reason` の廃止 = R4
- managed / codex adapter の対応 = follow-on
- `contract/` 配下の編集

## Decisions

### D1: step-class 別 outcome 型を BaseReportResult の拡張として定義

`report-result.ts` に 3 つの interface を追加する:

```typescript
interface ProducerReportResult extends BaseReportResult {
  status?: "success" | "error";
}
interface JudgeReportResult extends BaseReportResult {
  approved?: boolean;
}
interface CodeReviewReportResult extends JudgeReportResult {
  fixableCount?: number;
}
```

**新フィールドは全て optional** にする。理由: expand フェーズでは agent が新フィールドを返さなくても retry/halt してはならない（振る舞い不変の制約）。R3 cutover で required に昇格する。

**Rationale**: `contract/step-outcome.md` の step-class 分類（producer / judge / grounded）に直接対応。grounded（verification / delta-spec-validation / pr-create）は `report_result` を通らないため型不要。

**Alternatives considered**: union 型で全フィールドをフラットに持つ案 → step-class の意味が型レベルで消えるため却下。

### D2: step-class 別の parse 関数

`report-result.ts` に 3 つの parse 関数を追加:

- `parseProducerReportInput`: base を parse した後、`status` が string なら値をセット（未指定なら undefined のまま）
- `parseJudgeReportInput`: base を parse した後、`approved` が boolean なら値をセット
- `parseCodeReviewReportInput`: judge を parse した後、`fixableCount` が number なら値をセット

**base の parse に失敗したら（ok 未指定等）missingFields を返す**（既存挙動維持）。新フィールド未指定は missingFields に含めない（optional なので）。

**Rationale**: 新 parse が厳しくなると follow-up retry が発火して振る舞いが変わる。optional parse で expand 安全性を担保。

### D3: per-step-class ReportToolSpec と toCustomToolSpec ヘルパー

`report-tool.ts` に 3 つの ReportToolSpec を追加:

- `PRODUCER_REPORT_TOOL: ReportToolSpec<ProducerReportResult>`
- `JUDGE_REPORT_TOOL: ReportToolSpec<JudgeReportResult>`
- `CODE_REVIEW_REPORT_TOOL: ReportToolSpec<CodeReviewReportResult>`

各 spec の `zodSchema` に新フィールドを `optional()` で追加。`description` に新フィールドの説明を追記（agent が populate するガイダンス）。

`toCustomToolSpec(spec: ReportToolSpec): CustomToolSpec` ヘルパーを追加し、各 step の AgentDefinition.tools で使う。既存の `REPORT_TOOL` / `REPORT_TOOL_CUSTOM_TOOL_SPEC` は残す（他箇所からの参照がある場合の互換性）。

**Rationale**: zodSchema を single source of truth に保つ。CustomToolSpec を手書きせず ReportToolSpec から導出。

**Alternatives considered**: 全 step が引き続き REPORT_TOOL を使い、parseInput だけ差し替える案 → zodSchema が agent に新フィールドを伝えないため agent が populate しない。却下。

### D4: 各 step 定義を class-specific ReportToolSpec に切替

| step-class | steps | reportTool | agent.tools |
|---|---|---|---|
| producer | design, implementer, spec-fixer, delta-spec-fixer, code-fixer, build-fixer, test-case-gen, adr-gen | `PRODUCER_REPORT_TOOL` | `toCustomToolSpec(PRODUCER_REPORT_TOOL)` |
| judge | spec-review | `JUDGE_REPORT_TOOL` | `toCustomToolSpec(JUDGE_REPORT_TOOL)` |
| code-review-judge | code-review | `CODE_REVIEW_REPORT_TOOL` | `toCustomToolSpec(CODE_REVIEW_REPORT_TOOL)` |

import を `REPORT_TOOL, REPORT_TOOL_CUSTOM_TOOL_SPEC` → class-specific + `toCustomToolSpec` に変更。

### D5: adapter / executor / pipeline は変更しない

- `capturedToolResult: BaseReportResult | null` のまま。新フィールドは JS ランタイムで object property として存在するが TS 型では expose しない。
- `AgentRunResult.toolResult: BaseReportResult | null` のまま。
- executor の verdict 確定経路、transition table は一切触らない。
- managed / codex adapter は REPORT_TOOL のまま（未 populate でも誰も読まない）。

**Rationale**: expand フェーズの核心 = 型を足すだけで振る舞いを変えない。

### D6: presence テスト

2 レベルのテストを追加:

1. **parse 関数の unit test** (`report-result.test.ts`):
   - 各 parse 関数に新フィールド付き input を渡し、返り値に新フィールドが含まれることを assert
   - 新フィールドなし input でも base が正常に parse されること（optional の検証）
   - base 必須フィールド（ok）が欠けた場合は missingFields になること

2. **adapter 経由の integration test** (`agent-runner.test.ts` に追加):
   - mock tool call で新フィールドを含む input を返し、`runResult.toolResult` に新フィールドが runtime で存在することを `Record<string, unknown>` cast で assert

## Risks / Trade-offs

- [Risk] agent が新フィールドを返さない場合がある → **Mitigation**: フィールドは optional なので retry は発生しない。presence test は mock で確定的に検証。実 agent の compliance は R3 で required 昇格時に担保。
- [Risk] 既存テストが `REPORT_TOOL` を直接参照している → **Mitigation**: `REPORT_TOOL` は削除しない。step-interface テストが step.reportTool を検証している場合、import 変更で型が変わっても `ReportToolSpec<X extends BaseReportResult>` は `ReportToolSpec<BaseReportResult>` に covariant 互換。
- [Trade-off] optional フィールドは型安全性が弱い → expand フェーズの一時的な妥協。R3 cutover で required に昇格して解消。

## Open Questions

なし。設計判断は `contract/step-outcome.md` に既出。
