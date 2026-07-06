# Design: run 単位の統計を集計する `job stats` コマンド

## Context

run の実測値（コスト・review 収束回数・所要時間）は `events.jsonl`（journal）と `usage.json` に
記録されているが、run 横断で集計する手段がない。既存の `usage` / `usage summary` は
トークンとコストの明細に特化しており、収束回数・所要時間は扱わない。

現状の導出資産:

- `store/event-journal.ts` の `fold(content)` が `events.jsonl` を畳み込み、`steps`
  （step 別 `StepRun[]`、各 run は `startedAt`/`endedAt` を持つ）と `stepCounts`（step 別 attempt 数）を返す。
- `store/job-state-store.ts` の `JobStateStore.list(repoRoot, { includeArchived: true })` が
  active（main checkout / worktree / managed marker）と archive の run を列挙し、
  各 run を `fold()` 済みの `NormalizedJobState`（`steps` / `status` / `createdAt` 込み）として返す。jobId で dedup 済み。
- `core/usage/pricing.ts` の `computeCostUsd(model, usage)` が読み出し時にコストを計算する（未登録 model は `null`）。
- `core/usage/store.ts` の `readUsageFile(path)` が `usage.json` を読み、不在時は `{ commandInvocations: [] }` を返す。
- `cli/job-show.ts` の private `resolveChangeDir(slug, repoRoot)` が slug → change dir（active → archive）を解決する。
- `state/job-slug.ts` の `getJobSlug(state)` が state から canonical slug を導出する。

制約（request 由来）:

- journal / usage.json のスキーマ変更はスコープ外。集計は既存の導出資産を再利用し、再実装しない。
- 既存 `usage` / `usage summary` コマンドは無変更で現状維持。
- データ欠損（usage.json 不在・`modelUsage` null・events.jsonl 不在・timestamp 欠落）で run を fail させない。

## Goals / Non-Goals

**Goals**:

- `specrunner job stats` を追加し、active + archive の run を 1 行 1 run のテーブルで表示する:
  slug / 日付 / 所要時間 / 収束回数 / コスト(USD) / 最終 outcome。
- 対象件数・コスト合計/中央値・所要時間中央値・収束回数平均の summary を出す。
- `--json` で安定したキー集合の機械可読出力を出す（後続の profile 推奨・見積もりツールの入力）。
- 導出は `fold()` / `computeCostUsd` / journal timestamp を再利用する。
- データ欠損に寛容（該当セルを欠損表示にして残りを集計、run を落とさない）。

**Non-Goals**:

- 既存 `usage` / `usage summary` の変更・統合。
- live（実行中）job のリアルタイム統計・進捗表示。
- 統計に基づく推奨・自動化（profile 推奨・見積もり）。
- journal / usage.json のスキーマ変更。

## Decisions

### D1: 新 subcommand `job stats` として追加し、`usage summary` を拡張しない

**Rationale**: `usage summary` はトークン明細の表として意味が確立しており、収束回数・所要時間の列を
足すと既存出力の互換と役割が崩れる。run 単位の運転統計は別コマンドの方が責務が明確。architect 評価で採用済み。

**Alternatives considered**: `usage summary` に列追加（却下: 役割・出力互換の破壊）。

### D2: run の列挙は `JobStateStore.list(repoRoot, { includeArchived: true })` を再利用する

`list()` は active（main checkout / worktree / managed marker / sidecar）と archive を列挙し、
各 run を `fold()` 済みの `NormalizedJobState` として返す。この戻り値から所要時間（`steps` の
timestamp）・収束回数（`steps`）・最終 outcome（`status`）・日付（`createdAt`）・slug（`getJobSlug`）を
すべて導出できる。cost 用の `usage.json` のみ change dir を解決して別途読む。

**Rationale**: 要件「archive 配下および active な run を列挙」を既存 API が正確に満たす。
`fold()` 済み `steps` が得られるため所要時間・収束回数の導出で journal を再読 / 再実装しなくてよい（要件4）。
jobId dedup も `list()` が担う。

**Alternatives considered**:
- `usage summary` 同様に archive + active を `fs.readdir` で自前走査し、各 dir で `fold()` を呼ぶ
  （却下: 列挙・slug 解決・dedup・worktree/managed 対応を再実装することになる。`list()` に集約されている責務を二重化する）。

### D3: 所要時間は journal timestamp から導出する

`fold()` 済み `state.steps` の全 `StepRun` を横断し、`min(startedAt)` 〜 `max(endedAt)` の差を所要時間とする。
有効な timestamp を持つ run が 1 件も無ければ欠損（`null`）とする。

**Rationale**: journal timestamp は run の実行区間を表し意味が明確。architect 評価で採用済み。

**Alternatives considered**: `state.json` の `createdAt`/`updatedAt` 差
（却下: `updatedAt` は run 完了以外の操作でも動き得て意味が曖昧。architect 評価で却下済み）。

### D4: コストは読み出し時計算（`computeCostUsd`）を維持する

change dir の `usage.json` を `readUsageFile` で読み、全 `commandInvocation` の `modelUsage`
（`null` を除く）について `computeCostUsd(model, usage)` を合算する。合算対象は priced な model のみ。
priced な pair が 1 件も無い run（usage.json 不在 / 全 `modelUsage` null / 全 model 未登録）は
コスト欠損（`null`）とする。

**Rationale**: 読み出し時計算はスキーマ変更を伴わず pricing 改定にも追従する。architect 評価で採用済み。

**Alternatives considered**:
- `usage.json` に事前計算コストを追加（却下: スキーマ変更はスコープ外、pricing 改定で腐る。architect 評価で却下済み）。
- 未登録 model 混在時に partial フラグを別キーで持つ（却下: JSON キー集合を増やす。priced 分の合算値を
  そのまま示し、未登録分は無視する簡略化を採る。過小計上は既知の割り切りとして文書化）。

### D5: 収束回数 = review 系 loop step の非 skip attempt 数

review 系 loop step 集合を `{ "spec-review", "code-review" }` ∪ `state.reviewers[].name`（custom reviewer 名、
存在すれば）と定義し、`state.steps` の当該 step の `StepRun` のうち `outcome.verdict !== "skipped"` の件数を合算する。
step データが空（`Object.keys(state.steps).length === 0`）の run は収束回数を欠損（`null`）とする。
step データはあるが review step が無い run は `0`。

**Rationale**: 要件は「review が何周で収束したか」を測る。custom reviewer は
`state.reviewers` snapshot から名前を得られ、path/type 不一致で skip された review round は
`verdict: "skipped"` で記録されるため実際の収束ラウンドではない。skip 除外は要件4の
「`fold()` の stepCounts を再利用」を、skip 分を差し引く形で精緻化したもの（`steps` は同じ fold 出力から得る）。

**Alternatives considered**:
- 生の `stepCounts` を合算（却下: skip された custom reviewer が 1 round として過大計上される）。
- `code-review` のみを対象（却下: spec-review / custom reviewer の収束を落とす）。
- `conformance` を含める（却下: conformance は architecture gate であり review round ではない。再検証ループは所要時間側に現れる）。

### D6: 欠損許容 — セル単位 `null` → 表示は `-`、run は落とさない

各セル（日付 / 所要時間 / 収束回数 / コスト）は独立に導出し、欠損時は行内で `null`（表示は `-`）とする。
1 セルの欠損が run 全体の除外や集計中断を引き起こさない。`0` と `null` を区別する（例: review round 0 回は `0`、
journal 不在は `null`）。

**Rationale**: 要件5。部分的な観測でも運用判断に足る集計を残す。

### D7: `--json` のトップレベルキー集合を凍結する

トップレベルは `{ runs, summary }` の 2 キーで固定。`runs` は行オブジェクト配列、`summary` は集計オブジェクト。
行 / summary のキー集合も凍結する（下記スキーマ）。数値は raw（丸めなし）、欠損は `null`。

- 行（`JobStatRow`）キー: `slug` / `date` / `durationSec` / `convergence` / `costUsd` / `outcome`
- summary（`JobStatsSummary`）キー: `runCount` / `costUsdTotal` / `costUsdMedian` / `durationSecMedian` / `convergenceMean`

**Rationale**: 後続ツール（profile 推奨・見積もり）が依存する安定契約。キー集合をテストで固定する（受け入れ基準）。

**Alternatives considered**: フラットな行配列のみ（却下: summary を別取得させると契約が二分する）。

### D8: 集計ロジックは pure module に分離し、CLI は薄い wiring とする

`usage-summary.ts` の pure（`aggregateUsage` / `renderUsageSummary`）+ IO（`showUsageSummary`）分離を踏襲する。

- `src/core/command/job-stats.ts`（新規）:
  - 型: `JobStatRow` / `JobStatsSummary` / `JobStatsReport`（= `{ runs, summary }`）。
  - pure `deriveRunStat(state, usageFile | null, reviewerNames): JobStatRow` — 1 run 分の導出。
  - pure `buildJobStatsReport(rows: JobStatRow[]): JobStatsReport` — summary（合計 / 中央値 / 平均）算出。
  - pure `renderJobStatsTable(report): string` / `renderJobStatsJson(report): string`。
  - IO `runJobStats({ cwd, json }): Promise<number>` — `list()` で列挙 → change dir 解決 → `usage.json` 読取 → pure 呼出 → 出力。exit 0。
- `resolveChangeDir(slug, repoRoot)` を `cli/job-show.ts` から共有ヘルパへ抽出し、job-show と job-stats が共用する。

**Rationale**: pure 関数群でテーブル/JSON 出力とキー集合をテスト固定できる（受け入れ基準）。resolveChangeDir 抽出で cost 解決の重複実装を避ける。

**Alternatives considered**:
- job-stats 内に `resolveChangeDir` を複製（却下: 同一ロジックの二重管理。ただし抽出は job-show の
  振る舞い・既存テストを不変に保つ機械的リファクタに限定する）。

### D9: 日付列は `state.createdAt` の日付部（`YYYY-MM-DD`）とする

**Rationale**: run が作成された日で、active/archive の両方に存在し欠損しない。archive dir 名の日付は
「archive された日」で run の実行日と一致しない。所要時間の導出（D3）とは独立の列であり、
createdAt は「いつの run か」を素直に表す。

### D10: 行の並び順と summary の集計母数

- 行は `date` 昇順、同点は `slug` 昇順で決定的に並べる。
- `runCount` = 列挙した全 run 件数。
- `costUsdTotal` / `costUsdMedian` = `costUsd !== null` の run のみを母数とする。全欠損なら `null`。
- `durationSecMedian` = `durationSec !== null` の run のみ。全欠損なら `null`。
- `convergenceMean` = `convergence !== null` の run のみ。全欠損なら `null`。
- 中央値: 昇順ソートし、偶数件は中央 2 値の平均、奇数件は中央値。

**Rationale**: 決定的順序と明示的な母数定義でテーブル/JSON をテスト固定でき、欠損 run が集計を歪めない。

## Risks / Trade-offs

- [Risk] `list()` は worktree / managed の in-flight run も列挙するが、それらの `usage.json` は
  worktree 内にあり main の `repoRoot` から `resolveChangeDir` で解決できず cost が `-` になる。
  → Mitigation: in-flight run のコストは元来未確定であり欠損表示が妥当。所要時間・収束回数は
  `list()` の `fold()` 済み `steps` から得られる。受け入れ基準が対象とする archive run は
  change dir が main checkout の archive にあり cost 解決が成立する。既知の限定として文書化。

- [Risk] 収束回数の定義（review-loop 集合 / skip 除外）が直感と乖離し得る。
  → Mitigation: D5 の定義を spec.md の Requirement + Scenario で固定し、テストで pin する。

- [Risk] 未登録 model 混在時にコストを過小計上する（priced 分のみ合算）。
  → Mitigation: D4 の割り切りとして文書化。`usage summary` は unpriced 件数を注記するが、
  本コマンドは run 単位の 1 セルに畳むため priced 合算値を採る。

- [Risk] `resolveChangeDir` 抽出で job-show の既存テストが壊れる。
  → Mitigation: 抽出は import 先の移動のみで振る舞いを変えない。job-show の既存テストが green であることを検証で担保。

## Open Questions

なし（canceled run は列挙対象外 = `list()` の既定に従う、として確定）。
