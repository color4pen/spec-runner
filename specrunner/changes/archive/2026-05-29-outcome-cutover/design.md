# Design: outcome-cutover

## Context

R1（golden case 床 / #470）と R2（typed outcome の expand / #471）が main 済み。pipeline の各 agent step は `report_result` tool で typed outcome（producer: `status`, judge: `approved` + code-review: `fixableCount`）を返すようになったが、executor / transition table は依然として **prose parse** (`parseReviewVerdict`, `parseFixableFindings(fileContent)`) を読んで verdict を確定している。

本 request は expand→cutover→contract の **cutover** フェーズ。「読む側」を typed outcome に切替え、prose パーサへの依存を routing から排除する。prose パーサ自体の削除は R4（contract フェーズ）。

### 影響を受ける箇所

| 箇所 | 現状 | cutover 後 |
|------|------|-----------|
| `executor.ts` L434 `step.parseResult(resultContent)` | prose parse で verdict 確定 | `toolResult` の typed field で verdict 確定 |
| `executor.ts` L280 `toolResult === null` → halt | `stepHaltedNoToolCallError` で awaiting-resume | **proceed**（halt しない）。verdict は step-class で分岐 |
| `executor.ts` L441 `verdict ?? "escalation"` | null verdict → "escalation" | judge: "needs-fix" / producer: completionVerdict(success) |
| `types.ts` L103, L128 escalation 遷移 | spec-review / code-review に escalation → escalate | **削除**（judge は approved / needs-fix のみ） |
| `types.ts` L116-124 fixable routing predicate | `parseFixableFindings(lastReview.outcome.fileContent)` | `toolResult.fixableCount` |

### Authority

`contract/step-outcome.md` が authority。本 request は契約の **消費**（実装）であり、契約自体の編集は scope 外。

## Goals / Non-Goals

**Goals**:

- judge の verdict を `toolResult.approved` から導出する（prose 非依存）
- producer の verdict を `toolResult.status` から導出する
- code-review の fixable routing を `toolResult.fixableCount` から導出する
- spec-review / code-review の escalation 遷移を削除する（halt は loop 枯渇のみ）
- `toolResult === null`（no-tool-call）時に halt せず proceed する
- null-toolResult の judge は `needs-fix` で proceed（golden case と整合）
- 既存テスト（R1 golden 含む）が green

**Non-Goals**:

- prose パーサ（`review-verdict.ts` 等）の削除 = R4
- `ok` / `reason` フィールドの廃止 = R4
- stop-on-tool（session を tool 捕捉で停止）= 別 follow-on
- managed / codex adapter の typed 対応 = runtime follow-on
- `contract/` 配下の編集

## Decisions

### D1: verdict 確定ロジックを `finalizeStep` 内で toolResult 優先に切替

`finalizeStep` の verdict 確定を 3 段階に変更する:

1. **toolResult が存在** → typed field から verdict を導出（下記 D2）
2. **toolResult が null** → step-class 別 fallback（下記 D3）
3. **fallback 不能** → prose parse（`step.parseResult`）を従来通り呼ぶ（grounded step は toolResult を持たないため）

prose parse は grounded step（verification / delta-spec-validation / pr-create）で引き続き使われる。agent step でも prose path は **残る**（R4 で削除）が、toolResult が存在する限り到達しない。

**Rationale**: grounded step は `report_result` を通らないため toolResult が存在せず、prose parse が唯一の verdict source。cutover で壊さないために prose path を残す。

**Alternatives considered**: 全 step を toolResult 経由に統一する案 → grounded step の大規模変更が必要で blast radius が大きい。却下。

### D2: step-class 別 typed verdict 導出

| step-class | toolResult の型 | verdict 導出 |
|---|---|---|
| judge (spec-review) | `JudgeReportResult` | `approved === true` → `"approved"` / `approved === false` → `"needs-fix"` / `approved` 未設定 → `"needs-fix"` (保守側) |
| code-review-judge | `CodeReviewReportResult` | 同上（fixableCount は verdict ではなく routing で使用） |
| producer (design, implementer, etc.) | `ProducerReportResult` | `status === "success"` → `completionVerdict`（fallback `"success"`）/ `status === "error"` → `"error"` / `status` 未設定 → `completionVerdict` fallback |

`approved` 未設定時に `"needs-fix"` を選ぶ理由: `"approved"` は false positive（甘い通過）、`"escalation"` は遷移削除で halt に倒れる。`"needs-fix"` なら fixer に回り、loop 枯渇で grounded に halt。golden case「空/壊れ→非 approved」とも整合。

**Rationale**: `contract/step-outcome.md` の step-class 分類に直接対応。architect 評価済み。

### D3: toolResult === null 時の proceed 化

現状の `executor.ts` L280 は `toolResult === null` → `stepHaltedNoToolCallError` → awaiting-resume。これを **proceed** に変更:

- **judge**: verdict = `"needs-fix"`（fixer に回る → loop 枯渇で halt = grounded）
- **producer**: verdict = `completionVerdict`（通常 `"success"`。下流 verification が grounded に裏取り）

adapter の `reason` 区別（`invalid-input` vs `no-tool-call`）は維持:
- `invalid-input`（malformed JSON）: 追撃 2 回 → 3 回目で halt（既存 `DEFAULT_TOOL_RETRY`）— adapter 内で処理済み、executor に到達する toolResult は最終結果
- `no-tool-call`（idle）: adapter は `toolResult: null` で返す → executor が proceed

**Rationale**: `contract/step-outcome.md`「最後まで有効な JSON が取れない → halt せず次の step へ進む。下流の grounded な床が本当の問題を捕まえる」に準拠。

**Alternatives considered**: no-tool-call でも halt する案 → contract に反し、managed/codex で typed 未対応の間に全 step が halt して degrade する。却下。

### D4: escalation 遷移の削除（judge のみ）

`STANDARD_TRANSITIONS` から以下 2 行を削除:
- `{ step: "spec-review", on: "escalation", to: "escalate" }` (L103)
- `{ step: "code-review", on: "escalation", to: "escalate" }` (L128)

grounded step の escalation 遷移は維持:
- `delta-spec-validation --escalation→ escalate` (L95)
- `verification --escalation→ escalate` (L111)

**Rationale**: `contract/step-outcome.md`「agent は自分から『止めて』と言わない。halt は loop 枯渇からのみ」。grounded step は計算由来のため問題なし。

### D5: fixable routing を toolResult.fixableCount に切替

`types.ts` L116-124 の `when` predicate を変更:

```
// before
parseFixableFindings(lastReview.outcome.fileContent) > 0

// after
((lastReview.outcome.toolResult as CodeReviewReportResult)?.fixableCount ?? 0) > 0
```

`toolResult` が null または `fixableCount` が未設定の場合は 0 扱い（fixable なし = 通常の approved path）。

**Rationale**: prose parse (`parseFixableFindings`) を routing から排除。`parseFixableFindings` 自体は R4 で削除。

### D6: step-class 判別方法

executor が step-class を判別するために、既存の `step.reportTool` の identity を利用する:

- `step.reportTool === JUDGE_REPORT_TOOL` or `step.reportTool === CODE_REVIEW_REPORT_TOOL` → judge
- それ以外（`PRODUCER_REPORT_TOOL` or undefined）→ producer

これは既に R2 で各 step に設定済みの `reportTool` フィールドを読むだけで、新規フィールド追加は不要。

**Alternatives considered**: step に `stepClass: "judge" | "producer" | "grounded"` フィールドを追加する案 → R2 で reportTool がすでに step-class を暗黙的に encode しており、二重化。cutover 後 R4 で整理する際に検討。

### D7: verdict:parsed イベントの維持

`finalizeStep` の `verdict:parsed` イベント emit は従来通り維持。toolResult 由来の verdict も同じイベントで emit される。消費者（pipeline-logger 等）への影響なし。

## Risks / Trade-offs

- [Risk] `toolResult.approved` が undefined のまま agent が返す → **Mitigation**: `"needs-fix"` に倒す（保守側）。fixer → loop 枯渇で grounded に halt。golden case テストが regression を検出。
- [Risk] `toolResult.fixableCount` が undefined → **Mitigation**: `?? 0` で fixable なし扱い。approved は通常 path で delta-spec-validation へ。false negative（fixable 指摘を見逃す）だが blocking ではない。
- [Risk] escalation 遷移削除で、verdict が "escalation" のまま残る agent step → **Mitigation**: judge の verdict 確定で "escalation" を返すコードパスは存在しない（D2 で approved/needs-fix のみ）。grounded step は escalation 遷移を維持。prose parse fallback が "escalation" を返しても judge では到達しない。
- [Trade-off] prose parse path が残る → cutover の blast radius を下げるため。R4 で削除。

## Open Questions

なし。設計判断は `contract/step-outcome.md` と architect 評価で確定済み。
