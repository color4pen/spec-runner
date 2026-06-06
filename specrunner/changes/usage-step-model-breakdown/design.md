# Design: `specrunner usage` に step × model の内訳と USD コストを表示する

## Context

`specrunner usage`（引数なし）は `showUsageSummary(cwd)`（`src/core/command/usage-summary.ts`）で
archive 配下の各 `usage.json` を横断集計し、**slug × model** の token 内訳と grand total を表示する。

`usage.json` は append-only の `commandInvocations[]` で、各 entry は次を持つ:

- `command`: `"request-review" | "request-generate" | "job"`
- `timestamp`: ISO 8601
- `modelUsage`: `Record<model, ModelUsage> | null`（`ModelUsage` = `inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheCreationInputTokens`）
- `jobId?` / `stepName?`（`"job"` entry のみ `stepName` を持つ）

つまり **step 単位の `modelUsage` は既にデータとして存在する**が、集計・表示に出ていない。さらに USD コストは
どの surface でも計算されていない（usage.json コスト追跡基盤を導入した既存 ADR が、USD 換算を明示的に後続
request へ deferral していた）。本変更がその後続にあたる。

model key の実データは date suffix / context-window suffix を含む 3 系統が観測される:

- `claude-sonnet-4-6`（素）
- `claude-haiku-4-5-20251001`（`-YYYYMMDD` date suffix 付き）
- `claude-opus-4-6[1m]`（`[1m]` = 1M-context window suffix 付き）

USD 換算にはこの key を料金テーブルへ正しく解決する必要がある。

## Goals / Non-Goals

**Goals**:

- 引数なし `specrunner usage`（`showUsageSummary`）の出力に **step × model の交差表**（step 名・model 名・input/output token・USD コスト）を追加する
- 既存の **slug × model 集計**を上位サマリとして維持する
- 出力の各行に **USD コスト**を表示する（slug 行・step×model 行・grand total 行）
- USD 計算を **モデルごとの料金テーブル**（input / output / cacheRead / cacheWrite）で行う純粋モジュールを新設する
- 集計・整形ロジックを純粋関数として分離し、IO なしで unit test 可能にする

**Non-Goals**:

- `usage.json` のスキーマ / フォーマット変更（既存データをそのまま読む）
- リアルタイム（pipeline 実行中）の usage 表示
- 引数付き `specrunner usage <slug>`（`showUsage`）の表示変更
- 外部 API からの動的料金取得（料金は静的テーブル）

## Decisions

### D1: 表示拡張の対象は引数なし `specrunner usage`（`showUsageSummary`）に限定する

要件2「既存の slug × model の集計は維持する（上位サマリとして）」は、step × model 交差表と slug × model 集計が
**同一出力内**に共存することを要求する。slug × model 集計を持つのは `showUsageSummary`（archive 横断）だけである。
よって拡張対象は `showUsageSummary` とする。

**Rationale**: 引数付き `showUsage <slug>` は単一 slug の per-invocation 行を出すが slug × model 集計を持たないため、
要件2 の「上位サマリ」が成立しない。対象を summary に絞ることで要件と surface が一致する。

**Alternatives**: `showUsage <slug>` も同時に拡張する案 → 不採用。要件が要求する「slug × model を上位サマリとする
交差表」は summary 固有であり、per-slug view への波及は scope 外の機能追加になる。

### D2: 料金計算は純粋モジュール `src/core/usage/pricing.ts` に集約する

新規 `pricing.ts` に次を置く（外部依存なし、`core/usage` 直下＝純粋ロジック層）:

- `interface ModelPricing { input; output; cacheRead; cacheWrite }` — **USD per 1,000,000 tokens** で統一
- `const MODEL_PRICING: Record<string, ModelPricing>` — model variant 別の静的テーブル
- `normalizeModelKey(raw: string): string` — 末尾 `-YYYYMMDD`（8 桁 date suffix）を除去し、`[...]`（context-window suffix）は**保持**する
- `lookupPricing(raw: string): ModelPricing | null` — 正規化 key でテーブル参照、未登録は `null`
- `computeCostUsd(model: string, usage: ModelUsage): number | null` — `null` は料金不明
- `formatUsd(value: number | null): string` — `null` → `"$?"`、それ以外 → `"$" + value.toFixed(4)`

cost 計算式:

```
cost = inputTokens            / 1e6 * pricing.input
     + outputTokens           / 1e6 * pricing.output
     + cacheReadInputTokens   / 1e6 * pricing.cacheRead
     + cacheCreationInputTokens/ 1e6 * pricing.cacheWrite
```

**Rationale**: 料金は純粋関数で表現でき port を要しない。`core/usage` に置けば command 層（`usage-summary.ts`）が
唯一の参照点となり、将来 per-slug view へ再利用する際も同一モジュールを使える。minimal-deps 原則どおり外部依存ゼロ。

**Alternatives**:
- 料金を `usage-summary.ts` に inline する → 不採用。再利用不能で test 単位も粗くなる。
- config 化（`.specrunner/config.json` に料金を持たせる）→ 不採用。要件は「料金テーブル」を求めるのみで設定可変性は
  求めていない。scope を増やさない。

### D3: model key 正規化は date suffix のみ除去し、`[1m]` 等の context-window suffix はテーブル key に残す

`[1m]`（1M-context window）は通常の context window と料金体系が異なるため、`claude-opus-4-6` と
`claude-opus-4-6[1m]` を**別 key**として扱う。normalize では `-YYYYMMDD` のみ落とし、`[...]` は保持する。
テーブルは観測される variant（`claude-opus-4-6`, `claude-opus-4-6[1m]`, `claude-sonnet-4-6`, `claude-haiku-4-5`）を
登録する。

**Rationale**: date suffix は同一料金の version 表記揺れだが、`[1m]` は料金が異なる別 SKU。両者を一律 strip すると
1M-context のコストを誤って標準料金で過小評価する。

**Alternatives**: `[...]` も strip して base 料金を流用 → 不採用。1M-context 利用分のコストが過小になり、
本 feature の目的（コスト最適化判断）を損なう。

### D4: 未登録 model はコストを `null` とし `"$?"` 表示、Total cost から除外する

テーブル未登録 model の行は `cost=$?` を表示する。集計の "Total cost" は**料金既知の分のみ**を合算し、未登録が
1 件以上あれば `Total cost: $X.XXXX (excludes N unpriced model(s))` と注記する。

**Rationale**: 不明料金を 0 と混同すると total が静かに誤る。`$?` と除外注記で「計上できていない」ことを可視化し、
total の信頼性を保つ（memory: verify don't trust と整合）。

**Alternatives**: 未登録を 0 円扱い → 不採用。total が黙って過小になり判断を誤らせる。

### D5: 集計・整形を純粋関数化し、IO は command 関数に隔離する

`usage-summary.ts` を次の責務に分割する（同一ファイル内 export で可、ファイル増は最小に留める）:

- `aggregateUsage(collected: SlugUsage[]): UsageAggregation` — 純粋集計
  - `SlugUsage = { slug: string; invocations: CommandInvocation[] }`
  - `UsageAggregation = { bySlug; byStepModel; grandTotal; entryCount }`
  - **step 軸の key は `inv.stepName ?? inv.command`** とする（`request-review` / `request-generate` 等 stepName を
    持たない entry も command 名でバケットされ、step×model 表が全コストを網羅し grand total と整合する）
  - `modelUsage === null` の entry は集計対象外（既存挙動を踏襲）
- `renderUsageSummary(agg: UsageAggregation, skippedCount: number): string` — 純粋整形（完成テキストを返す）
- `showUsageSummary(cwd)` — archive スキャン（IO）→ `aggregateUsage` → `renderUsageSummary` → `stdoutWrite`

**Rationale**: 純粋関数は IO（`fs` / `process.stdout`）なしで直接 assert でき、出力契約のテストが容易になる。
ports & adapters の「core は純粋」方針と一致する。

**Alternatives**: `stdoutWrite` を呼びながら逐次組み立てる現行スタイルを維持 → 不採用。stdout capture が必要になり
テストが脆くなる。

### D6: 出力レイアウトとセクション順・決定的ソート

`renderUsageSummary` は次の順で出力する:

```
Usage Summary (N archive entries)
────────────────────────────────────────
By slug:
<slug>:
  <model>: in=<i> out=<o> cacheRead=<cr> cacheCreate=<cc> cost=$<x.xxxx>
  ...

By step × model:
<step>:
  <model>: in=<i> out=<o> cost=$<x.xxxx>
  ...

────────────────────────────────────────
Grand Total:
  <model>: in=<i> out=<o> cacheRead=<cr> cacheCreate=<cc> cost=$<x.xxxx>
Total cost: $<x.xxxx>[ (excludes N unpriced model(s))]

[(K archive entries skipped — no usage.json)]
```

決定的ソート（test 再現性のため）:

- slug 行: slug 名の昇順
- step×model の step: step 合計コスト降順（同点は step 名昇順）→「どの step が高コストか」を冒頭に出す
- 各 step / grand total 内の model: コスト降順（同点は model 名昇順）

**Rationale**: 降順ソートは要件の動機（高コスト step の特定）に直接応える。全セクションを決定的に並べることで
render 出力を文字列等価で test できる。

**Alternatives**: 現行の readdir / 挿入順を維持 → 不採用。OS 依存で非決定的になり test しづらく、コスト順の
気づきも得られない。

## Risks / Trade-offs

- [Risk] `[1m]` 等 1M-context の Anthropic 料金は prompt サイズ閾値（200K 超で premium）に依存するが、`usage.json` は
  集約 token のみ保持し prompt 単位の内訳を持たない → variant 単位のフラット単価は**近似**になる。
  - Mitigation: `[1m]` を別 key として最も妥当な単価を割り当て、近似である旨を `pricing.ts` のコメントに明記する。
- [Risk] 料金テーブルは時間とともに陳腐化する。
  - Mitigation: `MODEL_PRICING` に出典（Anthropic 公式料金）と "as of" 日付をコメントとして残し、未登録 model は
    `$?` で顕在化させる。
- [Risk] 出力レイアウト変更（`By slug:` ラベル追加・cost 列追加・ソート順変更）で既存の目視運用が変わる。
  - Mitigation: 既存の token 列（in/out/cacheRead/cacheCreate）と slug/grand-total 集計は保持し、追加のみとする。
    出力契約の snapshot 的 test は本変更で新設する（既存に snapshot test は無い）。
- [Risk] step 軸に `request-review` / `request-generate` が混在することへの誤解。
  - Mitigation: これらは stepName を持たないため `command` 名でバケットする旨を spec / コメントに明記。全コストを
    網羅して grand total と一致させる利点を取る。

## Open Questions

なし
