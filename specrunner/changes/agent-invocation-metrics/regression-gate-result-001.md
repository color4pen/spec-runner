# Regression Gate — agent-invocation-metrics (iteration 1)

## Evidence Summary

Checked all 11 findings from the ledger against the current branch (feat/agent-invocation-metrics-f94950fe).

| # | Severity | File | Finding | Status |
|---|----------|------|---------|--------|
| 1 | LOW | design.md | totalCostUsd は main work turn 分のみ → Risks/Trade-offs 未記録 | ✅ Fixed |
| 2 | LOW | design.md | TC-JSTATS-024 の D8 permanent trade-off 未記録 | ✅ Fixed |
| 3 | MEDIUM | job-stats.ts:319 | renderJobStatsTable が costBasis を表示しない | ✅ Fixed |
| 4 | LOW | job-stats.ts:100 | deriveRunStat の JSDoc が新ロジックを反映していない | ✅ Fixed |
| 5 | LOW | job-stats.ts:182 | as unknown as キャストが冗長（job-stats.ts） | ✅ Fixed |
| 6 | MEDIUM | job-stats.test.ts:489 | TC-JSTATS-024 が 8-field 実出力を検証しない | ✅ Fixed |
| 7 | LOW | agent-runner.ts:913 | postWorkPrompts error return に invocationMetrics が欠落 | ✅ Fixed |
| 8 | LOW | job-stats.ts:182 / usage-show.ts:67 | as unknown as キャスト冗長（両ファイル） | ✅ Fixed |
| 9 | LOW | job-stats.test.ts:489 | TC-JSTATS-024 が 2 つの schema authority を作る | ✅ Fixed |
| 10 | LOW | job-stats.test.ts:489 | TC-JSTATS-024 label が stale 6-field schema を指す | ✅ Fixed |
| 11 | LOW | job-stats.test.ts:425 | TC-JSTATS-020 が SDK $ / Turns ヘッダを未検証 | ✅ Fixed |

## Finding-by-Finding Evidence

### Finding 1 — totalCostUsd は main work turn 分のみ（design.md Risks 未記録）

**Verified**: `design.md` Risks/Trade-offs 節（line 141）に以下の Known Limitation が明記されている。

> [Known Limitation] `totalCostUsd` は main work turn 分のコストのみを反映し、follow-up ターン分のコストを含まない → `agent-runner.ts` の reportRetry / postWorkPrompts / outputVerification の各 follow-up ターンは query invocation ごとに modelUsage を積算するが（`:918-929`, `:965-977`）、`extractedMetrics`（D2）は success result message から 1 回だけ抽出し follow-up ループでは更新しない。...

**結論**: 固定済み。リグレッションなし。

---

### Finding 2 — TC-JSTATS-024 の D8 permanent trade-off 未記録

**Verified**: `design.md` D8 Risks 節（line 140）に以下の [Permanent Trade-off] が追加されている。

> [Permanent Trade-off]: TC-JSTATS-024 は手書きリテラルを使い続けるため、`turns`/`measuredCostUsd` を含む行スキーマのロックとしては永続的に機能しなくなる。これは意図的な設計上のトレードオフであり、AC #10（既存テスト無変更）を優先した帰結。当該フィールドの実出力への含有は TC-JSTATS-024 ではなく AC #8/#9 の新テストが永続的に担保する役割を担う。

**結論**: 固定済み。リグレッションなし。

---

### Finding 3 — renderJobStatsTable が measuredCostUsd を表示しない

**Verified**: `src/core/command/job-stats.ts` line 331–341 にて:

```typescript
const headers = ["Slug", "Date", "Duration", "Convergence", "Cost", "SDK $", "Turns", "Outcome"];
const dataRows = runs.map((r) => [
  ...
  r.costUsd != null ? formatUsd(r.costUsd) : "-",
  r.measuredCostUsd != null ? formatUsd(r.measuredCostUsd) : "-",
  r.turns != null ? String(r.turns) : "-",
  r.outcome,
]);
```

テーブルヘッダに "SDK $"（measuredCostUsd）と "Turns" が追加されており、各データ行に値が出力される。

**結論**: 固定済み。リグレッションなし。

---

### Finding 4 — deriveRunStat の JSDoc が新ロジックを反映していない

**Verified**: `src/core/command/job-stats.ts` lines 98–103 にて JSDoc が更新されている。

```
 * - costUsd: sum of computeCostUsd(model, modelUsage) across all invocations; null if no priced pairs
 * - measuredCostUsd: sum of totalCostUsd across invocations that provide it (SDK-measured,
 *     main-work-query turn only); null if no invocations have a totalCostUsd value
 * - turns: sum of numTurns across invocations that provide it (main-work-query turn only);
 *     null if no invocations have a numTurns value
```

旧来の "sum of computeCostUsd for all non-null modelUsage entries" から更新され、`measuredCostUsd` / `turns` の bullet も追加されている。

**結論**: 固定済み。リグレッションなし。

---

### Finding 5 & 8 — as unknown as キャストが冗長（job-stats.ts + usage-show.ts）

**Verified** (grep で `as unknown as` が両ファイルに存在しないことを確認):

- `src/core/command/job-stats.ts`: ヒットなし。`typeof inv.totalCostUsd === "number"` / `typeof inv.numTurns === "number"` で直接アクセスしている（lines 197–204）。
- `src/core/command/usage-show.ts`: ヒットなし。lines 67–74 で `typeof inv.numTurns === "number"` 等の直接アクセスを使用。

**結論**: 固定済み。リグレッションなし。

---

### Finding 6 — TC-JSTATS-024 が 8-field deriveRunStat schema を検証しない

**Verified**: `tests/unit/core/command/job-stats.test.ts` lines 522–578 に `TC-JSTATS-024b` が追加されている。

```typescript
// TC-JSTATS-024b: deriveRunStat always sets measuredCostUsd and turns (8-field output schema)
// TC-JSTATS-024 tests the 6-field hand-crafted row; this test verifies the real deriveRunStat schema.
it("TC-JSTATS-024b: deriveRunStat output always includes measuredCostUsd and turns (8-field schema)", async () => {
  ...
  expect(rowKeys).toEqual([
    "convergence", "costUsd", "date", "durationSec", "measuredCostUsd", "outcome", "slug", "turns",
  ]);
});
```

`deriveRunStat` の実出力が 8 フィールドを含むことを直接検証している。

**結論**: 固定済み。リグレッションなし。

---

### Finding 7 — postWorkPrompts error return に invocationMetrics が欠落

**Verified**: `src/adapter/claude-code/agent-runner.ts` lines 913–928 のpostWorkPrompts エラー return に `invocationMetrics: extractedMetrics` が存在している（line 923）。

```typescript
return {
  completionReason: "error",
  resultContent: null,
  toolResult: capturedToolResult,
  followUpAttempts,
  ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
  addedTurns: { reportRetry, postWork, outputRepair },
  // Main-work metrics are available (extractedMetrics was set when main work succeeded).
  invocationMetrics: extractedMetrics,
  error: Object.assign(...),
};
```

**結論**: 固定済み。リグレッションなし。

---

### Finding 9 — TC-JSTATS-024 が 2 つの競合する schema authority を作る

**Verified**: TC-JSTATS-024 のタイトル自体は "row keys match spec" のままだが（AC #10 の既存テスト無変更制約による）、TC-JSTATS-024b のヘッダコメント（lines 522–523）が両テストの役割を明確に記述している。

```typescript
// TC-JSTATS-024b: deriveRunStat always sets measuredCostUsd and turns (8-field output schema)
// TC-JSTATS-024 tests the 6-field hand-crafted row; this test verifies the real deriveRunStat schema.
```

「どちらが正典か」の曖昧さは TC-JSTATS-024b のコメントで解消されており、TC-JSTATS-024b が 8-field 実 schema の権威テストとして機能する。rename の代わりにコメントで対処（AC #10 制約のため rename は適用不可）。

**結論**: 実用上の懸念は解消。リグレッションなし。

---

### Finding 10 — TC-JSTATS-024 label が stale 6-field schema を指す

**Verified**: TC-JSTATS-024b が追加され（lines 522–578）、finding の rationale で明示された「TC-JSTATS-024b closes the coverage gap」が達成されている。

**結論**: 固定済み。リグレッションなし。

---

### Finding 11 — TC-JSTATS-020 が SDK $ / Turns ヘッダを未検証

**Verified**: `tests/unit/core/command/job-stats-metrics.test.ts` に以下のヘッダ検証テストが追加されている。

- line 354: `it("includes 'Turns' column header when rendering a table with turn data", ...)` — Turns が出力に含まれることを `toMatch(/turn/i)` で検証
- line 408: `it("AC-8-table: shows 'SDK $' column header in the table for measured cost", ...)` — SDK $ が出力に含まれることを `toMatch(/sdk/i)` で検証

TC-JSTATS-020 自体の変更は AC #10 の制約で不可のため、新テストファイルで補完された。

**結論**: 固定済み。リグレッションなし。
