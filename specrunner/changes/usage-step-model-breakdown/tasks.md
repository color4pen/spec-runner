# Tasks: `specrunner usage` の step × model 内訳と USD コスト表示

## T-01: 料金計算モジュール `src/core/usage/pricing.ts` を新設する

- [x] `src/core/usage/pricing.ts` を新設（外部依存なし、`ModelUsage` は `../port/model-usage.js` から import）
- [x] `interface ModelPricing { input: number; output: number; cacheRead: number; cacheWrite: number }` を定義（単位は **USD per 1,000,000 tokens**、コメントで明記）
- [x] `const MODEL_PRICING: Record<string, ModelPricing>` を定義し、corpus に現れる variant を登録する:
  - `claude-opus-4-6`, `claude-opus-4-6[1m]`, `claude-sonnet-4-6`, `claude-haiku-4-5`
  - 単価は Anthropic 公式料金を出典としてコメントに出典・"as of" 日付を残す
  - `[1m]` の単価は 1M-context tier の近似である旨をコメントに明記
- [x] `normalizeModelKey(raw: string): string` を実装:
  - 末尾 `-YYYYMMDD`（`-` + 8 桁数字）の date suffix を除去する
  - `[...]`（context-window suffix）は保持する
  - 例: `claude-haiku-4-5-20251001` → `claude-haiku-4-5`、`claude-opus-4-6[1m]` → `claude-opus-4-6[1m]`
- [x] `lookupPricing(raw: string): ModelPricing | null` を実装（`normalizeModelKey` 経由でテーブル参照、未登録は `null`）
- [x] `computeCostUsd(model: string, usage: ModelUsage): number | null` を実装:
  - `lookupPricing` が `null` なら `null` を返す
  - それ以外は `inputTokens/1e6*input + outputTokens/1e6*output + cacheReadInputTokens/1e6*cacheRead + cacheCreationInputTokens/1e6*cacheWrite`
- [x] `formatUsd(value: number | null): string` を実装（`null` → `"$?"`、それ以外 → `"$" + value.toFixed(4)`）

**Acceptance Criteria**:
- `computeCostUsd("claude-haiku-4-5-20251001", usage)` が date suffix を解決して非 `null` を返す
- `computeCostUsd("claude-opus-4-6[1m]", usage)` と `computeCostUsd("claude-opus-4-6", usage)` が別単価で計算される
- 未登録 model に対して `computeCostUsd` が `null`、`formatUsd(null)` が `"$?"` を返す
- `bun run typecheck` が green

---

## T-02: `pricing.ts` の unit test を追加する

- [x] `tests/core/usage/pricing.test.ts` を新設
- [x] `normalizeModelKey`: date suffix 除去 / `[1m]` 保持 / 素の key 不変 を検証
- [x] `computeCostUsd`: 4 種 token × 単価の合算が期待値どおりであること（既知 model）
- [x] `computeCostUsd`: 未登録 model で `null` を返すこと
- [x] `formatUsd`: `null` → `"$?"`、数値 → 小数第4位の `$` 文字列

**Acceptance Criteria**:
- 上記ケースが green
- `bun run test` が green

---

## T-03: `usage-summary.ts` を純粋集計 + 純粋整形 + IO に分割し step × model と USD を追加する

- [x] `src/core/command/usage-summary.ts` に純粋関数を export として追加する:
  - 型 `SlugUsage = { slug: string; invocations: CommandInvocation[] }`
  - 型 `UsageAggregation = { bySlug; byStepModel; grandTotal; entryCount }`
    - `bySlug`: slug → model → `ModelUsage`
    - `byStepModel`: step → model → `ModelUsage`（step key = `inv.stepName ?? inv.command`）
    - `grandTotal`: model → `ModelUsage`
  - `aggregateUsage(collected: SlugUsage[]): UsageAggregation`（純粋）
    - `modelUsage === null` の invocation は集計対象外
  - `renderUsageSummary(agg: UsageAggregation, skippedCount: number): string`（純粋、完成テキストを返す）
- [x] `renderUsageSummary` の出力レイアウト（design D6 のとおり）:
  - ヘッダ `Usage Summary (N archive entries)` + 区切り線
  - `By slug:` セクション — 各 slug 行に既存の `in/out/cacheRead/cacheCreate` ＋ `cost=$<x.xxxx>`
  - `By step × model:` セクション — step 見出し配下に `<model>: in=<i> out=<o> cost=$<x.xxxx>`
  - 区切り線 + `Grand Total:`（model 行に token 内訳 ＋ cost）
  - `Total cost: $<x.xxxx>`（料金既知のみ合算、未登録があれば ` (excludes N unpriced model(s))`）
  - skippedCount > 0 なら末尾に `(K archive entries skipped — no usage.json)`
- [x] 決定的ソート: slug 昇順 / step は合計コスト降順（同点 step 名昇順）/ model はコスト降順（同点 model 名昇順）
- [x] cost 計算は T-01 の `computeCostUsd` / `formatUsd` を使用する
- [x] `showUsageSummary(cwd)` を、archive スキャン（IO）で `SlugUsage[]` を集めて `aggregateUsage` → `renderUsageSummary` → `stdoutWrite` する形に書き換える（既存の archive ディレクトリ走査・`usage.json` 不在 skip・空時メッセージの挙動は維持）

**Acceptance Criteria**:
- `specrunner usage`（引数なし）の出力に `By step × model:` セクションと各 step×model 行が含まれる
- slug × model 集計と grand total が引き続き表示される
- slug 行・step×model 行・grand total 行に `cost=$...` が表示される
- 未登録 model 行は `cost=$?`、Total cost に除外注記が付く
- `bun run typecheck` が green

---

## T-04: `showUsageSummary` の集計・整形の test を追加する

- [x] `tests/core/usage/usage-summary.test.ts` を新設
- [x] `aggregateUsage`: 複数 slug / 複数 step / `stepName` 無し entry（command バケット）/ `modelUsage: null` 除外 を検証
- [x] `renderUsageSummary`: step × model 行・slug 集計・grand total・`Total cost`・未登録 model の `$?` と除外注記・skipped 注記・決定的ソート順 を文字列 assert で検証
- [x] 高コスト step が "By step × model" 先頭に並ぶことを検証

**Acceptance Criteria**:
- 上記ケースが green
- `bun run typecheck && bun run test` が green

---

## T-05: 全体検証

- [x] `bun run typecheck && bun run test` が green であることを確認する
- [ ] `specrunner usage`（引数なし）を実 archive に対して実行し、step × model 内訳と USD が出力されることを目視確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- 受け入れ基準（step × model 内訳行 / 各行 USD / 既存 slug 集計維持）が満たされる
