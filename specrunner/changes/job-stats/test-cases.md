# Test Cases: `job stats` — run 単位の統計

## Summary

- **Total**: 33 cases
- **Automated** (unit/integration): 32
- **Manual**: 1
- **Priority**: must: 27, should: 5, could: 1

---

### TC-001: archive fixture のテーブル出力

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: `job stats` は active + archive の run を 1 行 1 run で表示する > Scenario: archive fixture のテーブル出力

### TC-002: run が 0 件

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: `job stats` は active + archive の run を 1 行 1 run で表示する > Scenario: run が 0 件

### TC-003: summary の集計母数

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: summary 行を出力する > Scenario: summary の集計母数

### TC-004: トップレベルキー集合の固定

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: `--json` は安定したキー集合の機械可読出力を出す > Scenario: トップレベルキー集合の固定

### TC-005: 行キー集合の固定

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: `--json` は安定したキー集合の機械可読出力を出す > Scenario: 行キー集合の固定

### TC-006: 収束回数が review-loop の非 skip attempt 数になる

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: 導出は既存機構を再利用する > Scenario: 収束回数が review-loop の非 skip attempt 数になる

### TC-007: skip された custom reviewer は収束回数に数えない

- **Category**: unit
- **Priority**: must
- **Source**: spec.md > Requirement: 導出は既存機構を再利用する > Scenario: skip された custom reviewer は収束回数に数えない

### TC-008: usage.json 不在

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: データ欠損に寛容である > Scenario: usage.json 不在

### TC-009: modelUsage が null

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: データ欠損に寛容である > Scenario: modelUsage が null

### TC-010: events.jsonl 不在

- **Category**: integration
- **Priority**: must
- **Source**: spec.md > Requirement: データ欠損に寛容である > Scenario: events.jsonl 不在

### TC-011: 所要時間は全 StepRun の min(startedAt) 〜 max(endedAt) の秒差

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D3
- **GIVEN** `state.steps` に 3 つの `StepRun` があり、最初の `startedAt` が T0、最後の `endedAt` が T0+120s、中間 step の区間は T0+30s〜T0+60s
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `durationSec` は `120` である

### TC-012: 全 timestamp 欠落時は durationSec が null

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D3
- **GIVEN** `state.steps` の全 `StepRun` に `startedAt` / `endedAt` が存在しない run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `durationSec` は `null` である

### TC-013: コストは priced invocation のみ合算し未登録 model は除外する

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D4
- **GIVEN** `usage.json` に priced model の invocation 2 件（合算コスト $0.50）と未登録 model の invocation 1 件が含まれる run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `costUsd` は `0.50` であり未登録分は加算されない

### TC-014: state.steps が空オブジェクトの run は収束回数 null

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D5
- **GIVEN** `state.steps` が `{}` の run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `convergence` は `null` である（`0` でない）

### TC-015: review 系 step が 0 件の run は収束回数 0（null でない）

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D5, D6
- **GIVEN** `state.steps` に `"implement"` step のみがあり review 系 step が存在しない run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `convergence` は `0` であり `null` でない

### TC-016: custom reviewer（state.reviewers 由来）の非 skip attempt は収束回数に加算される

- **Category**: unit
- **Priority**: should
- **Source**: design.md > D5
- **GIVEN** `state.reviewers` に `{ name: "my-reviewer" }` があり `state.steps["my-reviewer"]` に `verdict: "approved"` の `StepRun` が 1 件ある run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `convergence` は 1 以上であり `"my-reviewer"` が集計に含まれる

### TC-017: spec-review と code-review はデフォルト review-loop 集合として集計される

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D5
- **GIVEN** `state.reviewers` が未定義で `state.steps["spec-review"]` に非 skip `StepRun` 1 件、`state.steps["code-review"]` に非 skip `StepRun` 2 件がある run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `convergence` は `3` である

### TC-018: 欠損セルはテーブル表示で `-`、`0` と区別される

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D6
- **GIVEN** `convergence: 0` の行と `convergence: null` の行が混在するレポート
- **WHEN** `renderJobStatsTable` を呼ぶ
- **THEN** `0` の行は収束回数列に `"0"` が、`null` の行には `"-"` が表示され両者は区別される

### TC-019: summary キー集合が固定されている

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D7
- **GIVEN** 任意の run 集合
- **WHEN** `renderJobStatsJson` の出力を JSON.parse する
- **THEN** `summary` オブジェクトのキー集合が `["runCount","costUsdTotal","costUsdMedian","durationSecMedian","convergenceMean"]` の 5 キーのみである

### TC-020: JSON 出力の欠損値は null（文字列 "-" でない）

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D7
- **GIVEN** `costUsd: null` を含む行があるレポート
- **WHEN** `renderJobStatsJson` の出力を JSON.parse する
- **THEN** `runs[*].costUsd` が `null`（JavaScript の null）であり文字列 `"-"` でない

### TC-021: 日付列は createdAt の YYYY-MM-DD 部

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D9
- **GIVEN** `state.createdAt` が `"2025-06-15T09:30:00.000Z"` の run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `date` は `"2025-06-15"` である

### TC-022: createdAt が不正・未定義の場合は date が null

- **Category**: unit
- **Priority**: should
- **Source**: design.md > D9
- **GIVEN** `state.createdAt` が空文字または `undefined` の run
- **WHEN** `deriveRunStat` を呼ぶ
- **THEN** `date` は `null` である

### TC-023: 行の並び順 — date 昇順、同点は slug 昇順

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D10
- **GIVEN** `date: "2025-06-10", slug: "beta"` / `date: "2025-06-10", slug: "alpha"` / `date: "2025-06-09", slug: "z"` の 3 行
- **WHEN** `buildJobStatsReport` を呼ぶ
- **THEN** 順序は `z(2025-06-09)` → `alpha(2025-06-10)` → `beta(2025-06-10)` になる

### TC-024: 中央値 — 偶数件は中央 2 値の平均

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D10
- **GIVEN** `durationSec` が `[10, 30, 50, 70]` の 4 件の行
- **WHEN** `buildJobStatsReport` を呼ぶ
- **THEN** `summary.durationSecMedian` は `40`（(30+50)/2）である

### TC-025: 中央値 — 奇数件は中央値

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D10
- **GIVEN** `durationSec` が `[10, 30, 50]` の 3 件の行
- **WHEN** `buildJobStatsReport` を呼ぶ
- **THEN** `summary.durationSecMedian` は `30` である

### TC-026: runCount は欠損 run を含む全 run 件数

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D10
- **GIVEN** 3 件の行のうち 1 件は `costUsd: null` / `durationSec: null` / `convergence: null`
- **WHEN** `buildJobStatsReport` を呼ぶ
- **THEN** `summary.runCount` は `3` である

### TC-027: convergenceMean は null を除外した run のみを母数とする

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D10
- **GIVEN** `convergence` が `[2, 4, null]` の 3 件の行
- **WHEN** `buildJobStatsReport` を呼ぶ
- **THEN** `summary.convergenceMean` は `3`（(2+4)/2）であり `null` の行は除外される

### TC-028: 全コスト欠損時は costUsdTotal / costUsdMedian が null

- **Category**: unit
- **Priority**: must
- **Source**: design.md > D10
- **GIVEN** 全行の `costUsd` が `null`
- **WHEN** `buildJobStatsReport` を呼ぶ
- **THEN** `summary.costUsdTotal` と `summary.costUsdMedian` がともに `null` である

### TC-029: 欠損 fixture があっても runJobStats は exit code 0 で完了する

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-04
- **GIVEN** `usage.json` 不在 / `events.jsonl` 不在 / 全 `modelUsage` null の run が混在する一時ディレクトリ
- **WHEN** `runJobStats` を実行する
- **THEN** 例外を投げず exit code `0` で完了し、欠損セルは `-` / `null` 表示になる

### TC-030: resolveChangeDir 抽出後も job-show 既存テストが green

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md > T-01
- **GIVEN** `resolveChangeDir` を `src/core/job-access/resolve-change-dir.ts` に移設し `job-show.ts` が import するよう変更済み
- **WHEN** `bun run test` を実行する
- **THEN** `tests/unit/cli/job-show.test.ts` が無変更で green である

### TC-031: job stats は guardedSubcommands に含まれない

- **Category**: unit
- **Priority**: should
- **Source**: tasks.md > T-05
- **GIVEN** `command-registry.ts` の `guardedSubcommands` リスト
- **WHEN** リストを参照する
- **THEN** `"stats"` は `guardedSubcommands` に含まれない（read-only のため guard 不要）

### TC-032: USAGE に job stats の説明行が含まれる

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md > T-05
- **GIVEN** CLI の USAGE 文字列（`Job commands` ブロック）
- **WHEN** USAGE を参照する
- **THEN** `"job stats"` を含む 1 行説明が含まれる

### TC-033: typecheck が green

- **Category**: manual
- **Priority**: should
- **Source**: tasks.md > T-06
- **GIVEN** 全実装ファイルの追加・変更が完了している
- **WHEN** `bun run typecheck` を実行する
- **THEN** 型エラーが 0 件である

### TC-BONUS-001: 数値は JSON 出力で丸めなし

- **Category**: unit
- **Priority**: could
- **Source**: design.md > D7
- **GIVEN** 所要時間が `90.5` 秒（小数を含む）の run
- **WHEN** `renderJobStatsJson` の出力を JSON.parse する
- **THEN** `runs[0].durationSec` は `90.5` であり切り捨て / 四捨五入されていない

---

## Result

```yaml
result: completed
total: 34
automated: 33
manual: 1
must: 27
should: 6
could: 1
blocked_reasons: []
```
