# Review Feedback — agent-invocation-metrics (iteration 2)

## 検証した項目

実装ファイル（`src/` 配下）と新規テストファイル（7 本）を全量確認し、受け入れ基準 AC #1–#10 をテスト・コードの両面でトレースした。

**読んだファイル**:
- `src/core/usage/types.ts` — `CommandInvocation` 型追加
- `src/core/port/agent-runner.ts` — `AgentInvocationMetrics` 型・`AgentRunResult.invocationMetrics`
- `src/adapter/claude-code/agent-runner.ts` — `extractInvocationMetrics` ヘルパ・success/error 抽出箇所
- `src/adapter/claude-code/query-one-shot.ts` — 4 値抽出・`turnCount` 廃止
- `src/core/step/executor.ts` — `invocationMetrics` threading
- `src/core/step/commit-orchestrator.ts` — `invocationMetrics` spread into `appendInvocation`
- `src/core/command/job-stats.ts` — `costBasis`/`turns` フィールド・per-invocation コストロジック
- `src/core/command/usage-show.ts` — metrics 表示
- `tests/unit/adapter/claude-code/agent-runner-invocation-metrics.test.ts` (TC-001/002/003/018)
- `tests/unit/adapter/claude-code/query-one-shot-metrics.test.ts` (TC-004/020)
- `tests/unit/core/step/commit-orchestrator-usage-metrics.test.ts` (TC-005/006/019)
- `tests/unit/core/usage/store-backward-compat.test.ts` (TC-007)
- `tests/unit/core/command/usage-show-metrics.test.ts` (TC-008/009)
- `tests/unit/core/command/job-stats-metrics.test.ts` (TC-010~015/021~023)
- `tests/unit/core/usage/invocation-types.test.ts` (TC-016/017)
- 既存テスト `tests/unit/core/command/job-stats.test.ts`（TC-JSTATS-020/024 の挙動を確認）
- `git diff main...HEAD` で既存テストファイルの無変更を確認（AC #10）

**確認内容**:

| AC | 確認結果 |
|----|----------|
| #1 | `CommandInvocation` に 4 optional フィールドと doc comment あり。TC-016 でラウンドトリップ確認。 |
| #2 | `extractedMetrics` が `extractedModelUsage` / `extractedSessionId` と同じ宣言位置（line 509）。success（line 861）・error subtype（line 836）双方に載る。TC-001/002 で固定済み。 |
| #3 | `queryOneShot` の success 抽出で 4 値を個別 typeof ガードで取り出す。`turnCount` は型に `@deprecated` で残し返却オブジェクトには載せない。TC-004/020 で固定済み。 |
| #4 | `readUsageFile` → metrics フィールドを持たない既存 JSON → `appendInvocation` → 読み返しで既存エントリ保持。TC-007 で固定済み。 |
| #5 | `typeof raw[key] === "number"` ガードで null / string / object は `undefined`。TC-003/018 で各型パターンを固定済み。 |
| #6 | `usage-show.ts` で metricsParts を条件付き構築し、1 件以上なら追記行を出力。ゼロの場合は行なし。TC-008/009 で固定済み。 |
| #7 | `totalCostUsd` 有 → それを加算、同 invocation の `computeCostUsd` はスキップ（二重計上防止）。無 → `computeCostUsd` にフォールバック。TC-010/011/012/013 で固定済み。 |
| #8 | `costBasis` が `JobStatRow` に optional で存在。`deriveRunStat` は常時設定（measured/estimated/mixed/null）。`renderJobStatsJson` は `JSON.stringify` でそのまま出力。TC-021/022/023 + JSON出力テストで固定済み。 |
| #9 | `turns` が `JobStatRow` に optional で存在。`deriveRunStat` は numTurns 持ち invocation のみ総和、0 件なら `null`。TC-014/015 で固定済み。 |
| #10 | `job-stats.test.ts` / `store.test.ts` / `query-one-shot.test.ts` はいずれも git diff で変更なし。TC-JSTATS-024 は手書きリテラル（`turns`/`costBasis` 省略）を使うため `["convergence","costUsd","date","durationSec","outcome","slug"]` exact 一致が温存される（D8 の設計通り）。 |

## 検証できなかった項目

- `bun run test` の実行結果（sandbox 環境でテスト実行不可）。検証済 verification-result.md では all green。

## Findings 詳細

### F-001 — `deriveRunStat` の JSDoc が新ロジックを反映していない

**Severity**: low / fixable  
**File**: `src/core/command/job-stats.ts`  
**Line**: 100

doc comment が旧ロジックの記述のまま:
```
- costUsd: sum of computeCostUsd for all non-null modelUsage entries; null if no priced pairs
```

実際は invocation 単位の `totalCostUsd` 優先・`computeCostUsd` フォールバックに変わっており、`costBasis` と `turns` も新設されている。関数シグネチャのコメントからだけでは挙動が読み取れない。

**修正**: 3 つの bullet を書き直し、`costBasis` / `turns` の bullet を追加する。

---

### F-002 — `renderJobStatsTable` が `costBasis` を表示しない

**Severity**: medium / fixable  
**File**: `src/core/command/job-stats.ts`  
**Line**: 319 (`renderJobStatsTable`)

`tasks.md` T-06 には「Turns 列を追加し、**cost basis を可視化する**（Cost セルへの注記 or 独立列。undefined/null は `-`）」と明記されている。

実装では Turns 列のみ追加されており、`costBasis` はテーブル出力に現れない:
```typescript
const headers = ["Slug", "Date", "Duration", "Convergence", "Cost", "Turns", "Outcome"];
// Cost セルは formatUsd(r.costUsd) のみ — basis 注記なし
```

`job stats --json` を使えば `costBasis` フィールドが確認できるが、デフォルトのテーブルモードでは試算か実測かを判別できない。テーブル出力のテストでも `costBasis` の表示を固定するケースが存在しない。

AC #8 の「出力が判別できる情報を含む」は JSON パスで満足されているが、tasks.md のテーブル仕様が未実装。

**修正案（どちらかを選択）**:
1. Cost セルに basis の接尾辞を付与（`$1.23(est)` / `$1.23` / `$1.23(mix)`）し、テーブルレンダリングテストに basis 表示を固定するケースを追加する。
2. `Basis` 列を独立追加（`measured` / `estimated` / `mixed` / `-`）し、テーブルレンダリングテストに追加する。

---

### F-003 — `CommandInvocation` に型が付いた後の `as unknown as` キャストが冗長

**Severity**: low / fixable  
**Files**: `src/core/command/job-stats.ts` (line 182), `src/core/command/usage-show.ts` (line 67)

`job-stats.ts`:
```typescript
const invRaw = inv as unknown as { totalCostUsd?: unknown; numTurns?: unknown };
if (typeof invRaw.totalCostUsd === "number") {
```

`usage-show.ts`:
```typescript
const invRaw = inv as unknown as { numTurns?: number; durationMs?: number; durationApiMs?: number; totalCostUsd?: number };
```

`CommandInvocation` に 4 フィールドが型付きで追加されたため、`inv.totalCostUsd` / `inv.numTurns` 等は直接アクセスできる。`as unknown as` キャストを挟まなくても `typeof inv.totalCostUsd === "number"` で同じ動作になる。JSON パース安全性のための `typeof` ガード自体は必要（寛容パーサが型を保証しないため）だが、中間キャストは不要になった。

**修正**: `const invRaw = ...` を削除し、`typeof inv.フィールド` に直接変更する。

---

## 非指摘観察

- **follow-up ターンのコスト欠落**: `extractedMetrics` はメイン作業ターンの result message から 1 回だけ取得し、postWork / report-retry / outputRepair ターンでは更新しない。多段 retry が多い run では `totalCostUsd` が実際より低くなる。設計書 Risks に明記済み・スコープ外のため指摘なし。
- **error subtype の metrics が usage.json に記録されない**: success 経路のみ `applySuccessPostPersistEffects` を通る設計。D3 に trade-off として記載済み。
- **TC-JSTATS-024 の永続的な行スキーマロック欠損**: 手書きリテラルが `turns`/`costBasis` を含まないため、TC-JSTATS-024 は新フィールドを検査しない。D8 の意図的 trade-off であり、AC #8/#9 の新テストが補完している。
