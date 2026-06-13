# Review: cross-boundary-invariants — decision-options-ledger — iter 1

- **verdict**: needs-fix

## Scope

diff が変更していないコードの暗黙の前提が、新しい挙動によって黙って破られていないかを確認する。
`parseFindings(…, true)` による strict 強制 と、変更外の既存インフラ（ツール description / prompt JSON 例 / conform step）との相互作用を中心に精査した。

---

## Findings

### F1 — `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `REQUEST_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` の description に `options` が記載されていない

- **severity**: high
- **resolution**: fixable
- **file**: src/core/step/report-tool.ts
- **line**: 126 / 148 / 190 / 214

**現象**

全 4 つの judge-class tool description において finding の shape 記述が以下のままになっている:

```
{ severity: ..., resolution: 'fixable'|'decision-needed', file: string, line?: number, title: string, rationale: string }
```

`options` が一切言及されていない。

**不変条件の破れ方**

`parseFindings(raw, strict=true)` は `resolution: "decision-needed"` の finding に対して `options` が 2 件以上なければ `{ ok: false }` を返す。tool description はエージェントが tool call 時に参照する最も直接的なスキーマ記述であり、system prompt の `DECISION_NEEDED_DEFINITION` より先に読まれる可能性が高い。

description に従って `options` なしで `decision-needed` を報告したエージェントは：

1. `parseJudgeReportInput` が `{ ok: false, missingFields: ["findings"] }` を返す — `"findings"` は存在するが配列内容が不正なため、エラーメッセージが "Missing fields: findings" となり原因が不明瞭
2. retry prompt "Missing fields: findings" を受けてもエージェントは findings 全体を削除する可能性がある（`findings` が missing だと誤解する）
3. 2 回の retry 後も失敗 → null toolResult → verdict "escalation"（judge/conformance 経路）

テストが green のまま潜伏する理由：新しいテストは `parseFindings(strict=true)` の単体動作を正しく検証しているが、実行時に agent が受け取る tool description との乖離はテスト対象外。

**Zod schema は `options: optional(...)` を含むので JSON schema としては `options` フィールドは存在する**が、description の文字列が「ここに `options` を書く」と指示していない点が不変条件の実破れ。

---

### F2 — conformance system prompt に `DECISION_NEEDED_DEFINITION` が含まれていない

- **severity**: medium
- **resolution**: fixable
- **file**: src/prompts/conformance-system.ts
- **line**: 85-88

**現象**

`CONFORMANCE_REPORT_TOOL` は `parseConformanceReportInput` → `parseJudgeReportInput` → `parseFindings(…, true)` の厳格経路を通る。しかし `CONFORMANCE_SYSTEM_PROMPT` は `DECISION_NEEDED_DEFINITION` を import せず、finding shape の completion section も持たない（`COMPLETION_DIRECTIVE` のみ）。

**不変条件の破れ方**

conformance step が `decision-needed` finding（例：仕様と実装の矛盾に options を付けて報告するケース）を使おうとしたとき、`options` 要件を知る手段が prompt 内に存在しない。結果として tool call が連続 reject → null toolResult → "escalation" になるが、conformance step の "escalation" は通常 `ok=false`（voluntary failure）で表現されるはずであり、意図しない経路での escalation が発生する。

fragment-coverage テストは `REGRESSION_GATE_SYSTEM_PROMPT contains OBSERVATION_DEFINITION` を検証しているが、conformance の `DECISION_NEEDED_DEFINITION` 不在は検証していない。

---

### F3 — prompt JSON 例が `decision-needed` finding の `options` フィールドを示していない

- **severity**: low
- **resolution**: fixable
- **file**: src/prompts/spec-review-system.ts, code-review-system.ts, custom-reviewer-system.ts, regression-gate-system.ts, request-review-system.ts
- **line**: 各 completion section の finding JSON 例

**現象**

全 5 つの judge/reviewer prompt が completion section にこの例を持つ:

```json
{
  "severity": "critical" | "high" | "medium" | "low",
  "resolution": "fixable" | "decision-needed",
  "file": "...",
  "line": 42,
  "title": "...",
  "rationale": "..."
}
```

`options` フィールドが示されていない。`DECISION_NEEDED_DEFINITION` テキストは同じ prompt に含まれており文書としては正しいが、エージェントがテンプレートとして参照しやすい JSON 例が旧形式のまま。

**不変条件の破れ方**

F1 より影響は小さいが（system prompt は tool description より詳細）、エージェントが JSON 例をコピーして `decision-needed` finding を構築した場合に同じ reject ループが発生する。`DECISION_NEEDED_DEFINITION` と JSON 例が矛盾していることで、エージェントがどちらを信じるか不確定になる。

---

## 修正方針

**F1** の修正が最優先。tool description（`JUDGE_REPORT_TOOL`, `CODE_REVIEW_REPORT_TOOL`, `REQUEST_REVIEW_REPORT_TOOL`, `CONFORMANCE_REPORT_TOOL`）に `options` の条件付き必須化を追記する:

```
When resolution is 'decision-needed', you MUST include 'options': an array of at least two objects, each with non-empty 'label: string' and 'consequence: string'. If you cannot write two viable options, use 'fixable' instead.
```

**F2** の修正：`CONFORMANCE_SYSTEM_PROMPT` に `DECISION_NEEDED_DEFINITION` を追加、またはそれに相当する options 要件の記述を追加する。

**F3** の修正：各 prompt の JSON 例を `decision-needed` finding の場合に `options` を含む形に更新する（または `fixable` 例と `decision-needed` 例を分けて示す）。

---

## 確認済み（問題なし）

- `transitionJob` → `pushStepResult` → `store.update` のいずれも `{ ...state }` スプレッドを使うため `decisions` フィールドは全ステップを通じて保持される ✓
- `effects.persistState` (decisions 書き込み) → `effects.resumeJob` の順序は sequential 実行であり、resume 時には必ず decisions が永続化済みである ✓
- `resolveDecisions` が使う `job.resumePoint?.step` と `executor.ts` が使う `step.name` は再実行時に同じ step 名を指す ✓
- `getOpenDecisionFindings` の finding 順序は `toolResult.findings` の配列順に基づき、notification 生成時と resume 解決時で同一 state を参照するため numbering が安定する ✓
- `validateJobState` が `decisions` を検証しない点は意図的な後方互換設計（D4）であり invariant 違反ではない ✓
- regression-gate の findings ledger は `collectFixableFindings` のみを収集するため `decision-needed` findings は ledger に含まれず、decision 機構と干渉しない ✓
- `checkConsecutiveEscalations` と decisions の相互作用：decisions によって decided findings は次回 step 実行で verdict に影響しなくなるため、escalation カウントの増加は新規 decision-needed finding がある場合のみであり、設計想定内 ✓
