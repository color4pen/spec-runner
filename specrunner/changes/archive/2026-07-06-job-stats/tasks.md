# Tasks: `job stats` — run 単位の統計

## T-01: 共有ヘルパ `resolveChangeDir` を抽出する

- [x] `src/cli/job-show.ts` の private `resolveChangeDir(slug, repoRoot)` を新規モジュール
  `src/core/job-access/resolve-change-dir.ts` に `export` として移設する（振る舞いは不変: active → archive、
  archive は最新日付、未発見は `null`）。
- [x] `src/cli/job-show.ts` を、抽出したヘルパを import して使うよう書き換える（ローカル定義を削除）。
- [x] `parseArchiveDirName` / `archivedChangesDirRel` への依存は移設先で解決する。

**Acceptance Criteria**:
- `resolve-change-dir.ts` が `resolveChangeDir(slug, repoRoot): Promise<string | null>` を export する。
- `job-show` の既存テスト（`tests/unit/cli/job-show.test.ts`）が無変更で green。
- `typecheck` が green。

## T-02: pure 導出 / 集計 module を追加する

- [x] `src/core/command/job-stats.ts` を新規作成し、型を定義する:
  - `JobStatRow = { slug: string; date: string | null; durationSec: number | null; convergence: number | null; costUsd: number | null; outcome: string }`
  - `JobStatsSummary = { runCount: number; costUsdTotal: number | null; costUsdMedian: number | null; durationSecMedian: number | null; convergenceMean: number | null }`
  - `JobStatsReport = { runs: JobStatRow[]; summary: JobStatsSummary }`
- [x] `deriveRunStat(state: NormalizedJobState, usageFile: UsageFile | null): JobStatRow` を実装する:
  - `slug` = `getJobSlug(state)`。
  - `date` = `state.createdAt` の `YYYY-MM-DD` 部（`createdAt` が無効なら `null`）。
  - `durationSec` = `state.steps` の全 `StepRun` 横断で `min(startedAt)` 〜 `max(endedAt)` の秒差。
    有効 timestamp を持つ run が無ければ `null`。
  - `convergence` = review-loop 集合 `{ "spec-review", "code-review" }` ∪ `state.reviewers?.map(r => r.name)` に属する
    step の `StepRun` のうち `outcome.verdict !== "skipped"` の件数。`Object.keys(state.steps).length === 0` なら `null`、
    それ以外で該当 0 件なら `0`。
  - `costUsd` = `usageFile` の全 `commandInvocation.modelUsage`（`null` を除く）に `computeCostUsd(model, usage)` を
    適用し priced 分を合算。priced pair が 0 件（`usageFile === null` 含む）なら `null`。
  - `outcome` = `state.status`。
- [x] review-loop step 集合を導出するヘルパ（built-in `{spec-review, code-review}` ∪ reviewer 名）を module 内に定義する。
- [x] `buildJobStatsReport(rows: JobStatRow[]): JobStatsReport` を実装する:
  - 行を `date` 昇順・同点 `slug` 昇順でソート��
  - `runCount` = 全行数。
  - `costUsdTotal` / `costUsdMedian` = `costUsd !== null` の行のみ母数（全欠損なら `null`）。
  - `durationSecMedian` = `durationSec !== null` の行のみ（全欠損なら `null`）。
  - `convergenceMean` = `convergence !== null` の行のみ（全欠損なら `null`）。
  - median: 昇順ソート後、偶数件は中央 2 値の平均、奇数件は中央値。

**Acceptance Criteria**:
- `deriveRunStat` / `buildJobStatsReport` が上記型・規則どおり動作し unit テストで固定される。
- `computeCostUsd`（`core/usage/pricing.ts`）と `getJobSlug`（`state/job-slug.ts`）を再利用し、集計を再実装しない。
- `typecheck` が green。

## T-03: テーブル / JSON レンダラを追加する

- [x] `renderJobStatsTable(report: JobStatsReport): string` を実装する:
  - 列: slug / 日付 / 所要時間 / 収束回数 / コスト / 最終 outcome の 1 行 1 run。
  - 欠損セル（`null`）は `-` で表示。所要時間は人間可読形式、コストは `formatUsd` 準拠（`null` は `-`）。
  - テーブル後に summary（件数 / コスト合計・中央値 / 所要時間中央値 / 収束回数平均）を出力。
  - run 0 件は 0 件である旨を表示。
- [x] `renderJobStatsJson(report: JobStatsReport): string` を実装する:
  - トップレベルは `{ runs, summary }` の 2 キーのみ。
  - 行キー = `slug` / `date` / `durationSec` / `convergence` / `costUsd` / `outcome`。
  - summary キー = `runCount` / `costUsdTotal` / `costUsdMedian` / `durationSecMedian` / `convergenceMean`。
  - 欠損値は `null`。数値は丸めなし。

**Acceptance Criteria**:
- `renderJobStatsTable` / `renderJobStatsJson` が pure（I/O なし）で、出力とキー集合が unit テストで固定される。
- JSON トップレベルキー集合が `["runs", "summary"]` に一致することがテストで固定される。
- `typecheck` が green。

## T-04: IO orchestrator `runJobStats` を追加する

- [x] `src/core/command/job-stats.ts` に `runJobStats(opts: { cwd: string; json: boolean }): Promise<number>` を実装する:
  - `JobStateStore.list(cwd, { includeArchived: true })` で run を列挙。
  - 各 run について `resolveChangeDir(getJobSlug(state), cwd)`（T-01）で change dir を解決し、
    `path.join(changeDir, "usage.json")` を `readUsageFile` で読む（change dir 未発見 / 不在なら `usageFile = null`）。
  - `deriveRunStat` → `buildJobStatsReport` を呼び、`json` に応じて `renderJobStatsJson` / `renderJobStatsTable` を
    `stdoutWrite` で出力。
  - 全 run について例外を握り潰し（欠損は `null` セル化）、run を落とさない。exit code は常に 0。

**Acceptance Criteria**:
- fixture の change dir（`events.jsonl` + `usage.json` + `state.json`）に対する `runJobStats` の
  テーブル出力と `--json` 出力が fixture テストで固定される。
- `usage.json` 不在・`modelUsage` null・`events.jsonl` 不在の各 fixture で fail せず欠損表示になることがテストで固定される。
- exit code 0。

## T-05: `job stats` subcommand を CLI に配線する

- [x] `src/cli/command-registry.ts` の `job.subcommands` に `stats` を追加する:
  - `flags: { json: { type: "boolean" } }`、positional なし。
  - handler で `runJobStats({ cwd: process.cwd(), json: !!parsed.flags["json"] })` を呼び `process.exit` する。
  - `guardedSubcommands` には追加しない（read-only）。
- [x] `runJobStats` を `command-registry.ts` に import する。
- [x] `USAGE` の `Job commands` ブロックに `job stats` の 1 行説明を追記する。
- [x] `README.md` の job コマンド一覧に `job stats`（および `--json`）の説明を追記する。

**Acceptance Criteria**:
- `specrunner job stats` および `job stats --json` が dispatch され動作する。
- `USAGE` に `job stats` が含まれる（help/README の既存 `toContain` テストは無変更で green）。
- `typecheck` が green。

## T-06: テストを追加し全体を green にする

- [x] pure テスト: `deriveRunStat`（duration / convergence（skip 除外含む）/ cost（priced 合算）/ date / outcome）、
  `buildJobStatsReport`（median / mean / total、欠損母数除外）、レンダラ（テーブル / JSON キー集合）。
- [x] IO fixture テスト: 一時ディレクトリに archive change dir を作り、
  (a) 正常 run、(b) `usage.json` 不在、(c) 全 `modelUsage` null、(d) `events.jsonl` 不在 の各 fixture で
  `runJobStats` を実行し、テーブル / JSON の欠損表示と exit 0 を固定する。
- [x] `--json` トップレベルキー集合が `["runs", "summary"]` ���固定されることを検証する。
- [x] `bun run typecheck && bun run test` が green（既存テストは無変更）であることを確認する。

**Acceptance Criteria**:
- request の受け入れ基準（fixture テーブル/JSON 固定、欠損 3 種の fail 回避、トップレベルキー集合固定、
  既存テスト無変更で green、`typecheck && test` green）をすべて満たす。
