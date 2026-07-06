# Spec: `job stats` — run 単位の統計

## Requirements

### Requirement: `job stats` は active + archive の run を 1 行 1 run で表示する

`specrunner job stats` は、active（`specrunner/changes/<slug>`、worktree / managed を含む）と
archive（`specrunner/changes/archive/*`）の run を列挙し、run ごとに 1 行のテーブルを stdout に
出力 SHALL する。各行は次の列を持つ MUST: slug / 日付 / 所要時間 / 収束回数 / コスト(USD) / 最終 outcome。
列挙は `JobStateStore.list(repoRoot, { includeArchived: true })` を再利用 MUST し、jobId で dedup された
run 集合を対象とする。行は日付昇順・同点 slug 昇順で決定的に並ぶ SHALL。

#### Scenario: archive fixture のテーブル出力

**Given** archive dir に `events.jsonl` + `usage.json` + `state.json` を持つ run が 1 件以上存在する
**When** `job stats` を実行する
**Then** 各 run が 1 行として、slug / 日付 / 所要時間 / 収束回数 / コスト / 最終 outcome の列で出力される

#### Scenario: run が 0 件

**Given** active にも archive にも run が存在しない
**When** `job stats` を実行する
**Then** run 0 件である旨を表示し、exit code 0 で終了する

### Requirement: summary 行を出力する

`job stats` はテーブルの後に summary を出力 MUST する。summary は対象 run 件数、コストの合計と中央値、
所要時間の中央値、収束回数の平均を含む SHALL。中央値・平均・合計は該当セルが欠損（`null`）でない run のみを
母数とする MUST。母数が 0 件の統計値は欠損表示とする SHALL。

#### Scenario: summary の集計母数

**Given** 3 件の run のうち 1 件は `usage.json` 不在でコスト欠損
**When** `job stats` を実行する
**Then** 対象 run 件数は 3、コスト合計・中央値はコストを持つ 2 件のみから算出される

### Requirement: `--json` は安定したキー集合の機械可読出力を出す

`--json` フラグ指定時、`job stats` は JSON を stdout に出力 SHALL する。トップレベルは
`runs`（行オブジェクト配列）と `summary`（集計オブジェクト）の 2 キーのみ MUST。行オブジェクトのキー集合は
`slug` / `date` / `durationSec` / `convergence` / `costUsd` / `outcome` に固定 MUST。summary のキー集合は
`runCount` / `costUsdTotal` / `costUsdMedian` / `durationSecMedian` / `convergenceMean` に固定 MUST。
欠損値は `null` として表現 SHALL する。

#### Scenario: トップレベルキー集合の固定

**Given** 任意の run 集合
**When** `job stats --json` を実行する
**Then** 出力 JSON のトップレベルキーは `runs` と `summary` の 2 つだけである

#### Scenario: 行キー集合の固定

**Given** 1 件以上の run
**When** `job stats --json` を実行する
**Then** `runs` 各要素のキー集合は `slug` / `date` / `durationSec` / `convergence` / `costUsd` / `outcome` である

### Requirement: 導出は既存機構を再利用する

収束回数は `fold()` 由来の step データから、コストは `usage.json` + `computeCostUsd` から、
所要時間は journal の timestamp から導出 MUST する。集計ロジックを再実装しない SHALL。

- 所要時間: `fold()` 済み `state.steps` の全 `StepRun` について `min(startedAt)` 〜 `max(endedAt)` の秒差。
- 収束回数: review 系 loop step 集合 = `{ "spec-review", "code-review" }` ∪ `state.reviewers[].name`
  に属する step の `StepRun` のうち `outcome.verdict !== "skipped"` の件数。
- コスト: `usage.json` の全 `commandInvocation.modelUsage`（`null` を除く）に `computeCostUsd` を適用し priced 分を合算。

#### Scenario: 収束回数が review-loop の非 skip attempt 数になる

**Given** ある run の `state.steps` で `code-review` が 2 attempt（いずれも非 skip）記録されている
**When** `job stats` でその run を集計する
**Then** その run の収束回数は 2 になる

#### Scenario: skip された custom reviewer は収束回数に数えない

**Given** ある run で custom reviewer の attempt が `verdict: "skipped"` として記録されている
**When** `job stats` でその run を集計する
**Then** その skip attempt は収束回数に加算されない

### Requirement: データ欠損に寛容である

`usage.json` 不在・`modelUsage` null・`events.jsonl` 不在・timestamp 欠落のいずれについても、
`job stats` は当該 run を fail させず、欠損セルを欠損表示（テーブルは `-`、JSON は `null`）にして
残りの run とセルを集計 MUST する。プロセスは exit code 0 で完了 SHALL する。

#### Scenario: usage.json 不在

**Given** `state.json` と `events.jsonl` はあるが `usage.json` が無い run
**When** `job stats` を実行する
**Then** その run の行は表示され、コストセルが欠損（`-` / `null`）になり、他セルは通常どおり集計される

#### Scenario: modelUsage が null

**Given** `usage.json` の全 `commandInvocation` の `modelUsage` が `null` の run
**When** `job stats` を実行する
**Then** その run のコストセルが欠損になり、run は fail しない

#### Scenario: events.jsonl 不在

**Given** `state.json` と `usage.json` はあるが `events.jsonl` が無い run
**When** `job stats` を実行する
**Then** その run の所要時間・収束回数セルが欠損になり、slug / 日付 / コスト / 最終 outcome は表示される
