# Spec: job state の event journal / projection / liveness 分離と slug ディレクトリ branch 同伴

## Requirements

### Requirement: 単一 JSON を event journal と cursor/descriptor に分割する（段1）

`JobStateStore` は job state を、append-only な event journal（`events.jsonl`）と overwrite な cursor/descriptor（`state.json`）に分割して永続化 SHALL する。段1 では置き場（`.specrunner/jobs/<jobId>/`）・キー（jobId）・列挙元（`.specrunner/jobs/` スキャン）を据え置き、観測可能な挙動を不変に保つ MUST。`create` / `load` / `persist` / `update` / `appendStepRun` / `appendHistory` / `list` / `resolveId` の外部契約（戻り値・解決セマンティクス）を保つ MUST。

#### Scenario: 新規 job が分割レイアウトで作られる

**Given** `.specrunner/jobs/` に既存 state が無い
**When** `JobStateStore.create` で新規 job を作成する
**Then** `.specrunner/jobs/<jobId>/events.jsonl` と `.specrunner/jobs/<jobId>/state.json` が生成され、`load()` の戻り値が従来の `NormalizedJobState` 等価（`steps` は `Record<string, StepRun[]>`、`history` は `HistoryEntry[]`）になる

#### Scenario: 観測可能な挙動が不変

**Given** 段1 適用後の分割レイアウト
**When** local resume / `job ls` / `job show` / 画面出力 / PR 生成を実行する
**Then** 段1 適用前と同じ観測結果になる

### Requirement: event 追記と cursor rewrite を物理的に分離する（段1）

event の追記は `events.jsonl` への `appendFile` のみで行い、`state.json` の overwrite（`atomicWriteJson`）と別ファイル操作に分離 MUST する。`events.jsonl` は決して全体 rewrite SHALL されない。

#### Scenario: cursor 書き込み中の crash で event が失われない

**Given** `events.jsonl` に複数の step-attempt / transition record が記録済み
**When** `state.json`（cursor）の書き込み中に process が中断される
**Then** `events.jsonl` の既存 event は 1 件も失われず、再 load 後に fold で全件復元できる

### Requirement: fold は不完全な末尾行を無視し、それ以前を全復元する（段1）

`events.jsonl` の fold は、不完全な末尾行（partial write）を無視し、それ以前の event をすべて復元 MUST する。

#### Scenario: 末尾 partial 行を捨ててそれ以前を復元する

**Given** `events.jsonl` の最終行が途中までしか書かれていない（partial write）
**When** `load()` が fold を実行する
**Then** 最終行は無視され、それ以前のすべての step-attempt / transition record が `steps` / `history` に復元される

### Requirement: fold 結果が再開 routing と transition 判定の読む値を従来同値に保つ

`events.jsonl` の fold 結果は、`resolveResumeStep` Tier 2a が読む loop step 最終 attempt の `outcome.verdict` と fixer の attempt 数、transition の `when` 節が読む `outcome.toolResult`（`CodeReviewReportResult.fixableCount`）を従来同値に保つ MUST。`StepRun.attempt` は record の出現順から導出 SHALL する。

#### Scenario: code-review approved + fixableCount>0 の routing が従来どおり動く

**Given** code-review step が `approved` かつ `toolResult.fixableCount > 0` を fold 結果に持つ
**When** transition table の `when` 節を評価する
**Then** 従来と同じ遷移先が選ばれる

#### Scenario: fixer-empty 検出の再開が従来どおり動く

**Given** `resumePoint.step` が fixer step を指し、fold 結果の `steps[fixer]` が空、かつ paired loop step の最終 `outcome.verdict` が `needs-fix`
**When** `resolveResumeStep` を評価する
**Then** paired loop step（reviewer）へ再開する

### Requirement: 新規 job の journal / cursor / usage を change folder に置き step commit に同梱する（段2）

新規 job の `events.jsonl` / `state.json` / `usage.json` は `changes/<slug>/` に作られ、既存の step ごとの commit/push に同梱 MUST される。

#### Scenario: step ごとの commit に state が含まれる

**Given** local runtime で新規 job を run する
**When** 任意の step が完了し commit/push される
**Then** その commit に `changes/<slug>/events.jsonl` / `state.json` / `usage.json` が含まれる

### Requirement: 同一 branch を再 checkout した状態から resume が成立する（段2）

machine-local 値が消えた状態（別ディスク・worktree 無し）で、同一 branch を checkout し直すだけで resume が成立 MUST する。

#### Scenario: CI 再実行相当の resume

**Given** branch 上に `changes/<slug>/{events.jsonl,state.json,usage.json}` だけがあり、`worktreePath` / `pid` / `session` は不在
**When** その branch を checkout して resume する
**Then** liveness（pid / session / worktreePath）が再生成され、fold 結果から正しい再開 step に進む

### Requirement: machine-local 値を branch 同伴 state から除外し sidecar に分離する（段2）

`worktreePath` / `pid` / `session` は branch 同伴 state（`state.json` / `events.jsonl`）に含めない MUST。これらは `.specrunner/local/<slug>/`（gitignore）に置き、resume 時に再生成 SHALL する。worktreePath を読む archive / cancel / resume の各経路は、sidecar 参照または `slug + jobId` 規約からの再導出で worktreePath を得る MUST。

#### Scenario: branch 同伴 state に machine-local 値が無い

**Given** 段2 適用後の `changes/<slug>/state.json`
**When** 内容を検査する
**Then** `worktreePath` / `pid` / `session` フィールドが存在しない

#### Scenario: sidecar 喪失時に worktreePath を規約から再導出する

**Given** `.specrunner/local/<slug>/` の sidecar が存在しない
**When** archive / cancel / resume が worktreePath を必要とする
**Then** `slug + jobId` の規約（`.git/specrunner-worktrees/<slug>-<jobId8>`）から worktreePath を再導出して処理を継続する

### Requirement: cost を step ごとに usage.json へ append し finish 一括派生を廃止する（段2）

cost は step 完了ごとに `changes/<slug>/usage.json` へ append し step commit に同梱 MUST する。finish の一括派生（`deriveFromJobState` / `deriveAndWriteUsage`）と、それが依存する `.specrunner/jobs/` 読みを廃止 MUST する。唯一の消費者が消えるため `StepRun.modelUsage` を state から除く MUST。`usage` show / summary は従来どおり動作 SHALL する。

#### Scenario: cost が step ごとに記録される

**Given** local runtime で複数 step を run する
**When** 各 step が完了する
**Then** 各 step 完了時点で `changes/<slug>/usage.json` に当該 step の usage entry が append され、その step commit に含まれる

#### Scenario: usage show / summary が従来どおり読める

**Given** step ごと append された `usage.json`（および archive の `usage.json`）
**When** `usage show` / `usage summary` を実行する
**Then** 従来と同じ集計結果を表示する

### Requirement: 中断事由を journal の event 1 件で記録する（段2）

中断事由（現在 top-level `error` / `resumePoint.reason` / `resumePoint.exhaustionPhase` に分散）を、journal の interruption event 1 件として記録 MUST する。`resumePoint` は rebuildable cache として扱い、`state.json` に保存してよいが truth は `events.jsonl` の fold MUST とする。

#### Scenario: 中断事由が 1 箇所に記録される

**Given** step が timeout / signal / 失敗で中断する
**When** state を永続化する
**Then** 中断事由が `events.jsonl` の interruption event 1 件として記録され、`resumePoint` は fold から再生成できる cache として `state.json` に置かれる

### Requirement: history を経過トレースとして保持する（段2）

`history`（transition journal）は `events.jsonl` に保持 MUST する。CI 再 checkout 後に唯一残る経過トレースであり、machine-local の session log は代替にしない。

#### Scenario: 再 checkout 後も transition トレースが残る

**Given** branch 上の `events.jsonl` に transition record が記録済み
**When** 別ディスクで branch を checkout する
**Then** fold で全 transition が `history` に復元される

### Requirement: archive は痩せた state を strip せず main に取り込む（段2）

archive で change folder を main に取り込む際、`state.json` / `events.jsonl` / `usage.json` を strip せず一緒に移す MUST。これにより cost と来歴を `job ls --all` から追える SHALL。

#### Scenario: archive 後も state ファイルが残る

**Given** archive 対象の `changes/<slug>/`
**When** archive を実行する
**Then** main の `changes/archive/<dated-slug>/` に `state.json` / `events.jsonl` / `usage.json` が含まれる

### Requirement: active 列挙を worktree 不変量 + dual-read で成立させる（段2）

active job の列挙は worktree ベース MUST とする。**worktree がある ⟺ job が非終端（active）** の不変量を用い、local runtime は `.git/specrunner-worktrees/*`（dir 名が `<slug>-<jobId8>`）を列挙して各 worktree の `changes/<slug>/state.json` から step/status を読む MUST。managed runtime は `.specrunner/local/<slug>/` の metadata marker（index 情報のみ、truth を持たない）で列挙 MUST。archived は main の `changes/archive/*/`、legacy は `.specrunner/jobs/*.json` を dual-read で併せて列挙 MUST。`job ls` 既定は active のみ、`--all` で archive を含む SHALL。

#### Scenario: 両 runtime の active が表示される

**Given** local runtime の active job（worktree あり）と managed runtime の active job（marker あり）が併存する
**When** `job ls` を実行する
**Then** 両 runtime の active job が一覧に表示される

#### Scenario: 既定は active のみ、--all で archive を含む

**Given** active job と archived job が存在する
**When** `job ls`（既定）と `job ls --all` を実行する
**Then** 既定は active のみ、`--all` は archived を含めて表示する

#### Scenario: legacy が dual-read で列挙される

**Given** `.specrunner/jobs/<jobId>.json`（旧 full state）が存在する
**When** `job ls` を実行する
**Then** legacy job も列挙に含まれる

### Requirement: worktree 存在 ⟺ 非終端の不変量と exit-guard（段2）

worktree 存在 ⟺ 非終端の不変量を保つ MUST。exit-guard（`beforeExit`）は自 worktree の branch state（`state.json` cursor ＋ `events.jsonl`）に `awaiting-resume` を記録 MUST し、worktree 存在＋branch status から resume が成立 SHALL する。ハード crash で status が stale な場合に備え、pid 突き合わせで liveness を判定できる MUST。

#### Scenario: exit-guard が自 worktree の branch state を更新する

**Given** running 状態の job が自 worktree で実行中に process が exit する
**When** `beforeExit` guard が発火する
**Then** 自 worktree の `changes/<slug>/state.json` cursor が `awaiting-resume` に遷移し、`events.jsonl` に transition が記録され、再 checkout 後に resume が成立する

#### Scenario: stale running を pid で判定する

**Given** status が `running` のまま残った job
**When** 記録された pid の生死を突き合わせる
**Then** プロセスが生きていなければ stale と判定し resume を許可する

### Requirement: 再 run は新 jobId / 新 branch を生やし旧 attempt を破壊しない（段2）

再 run は新 jobId として新しい branch / worktree を生やし、旧 attempt の push 済み branch には触れない（force-push も上書きもしない）MUST。同一 slug の複数 attempt は併存しうる SHALL。併存分は `job ls` に jobId で区別表示 MUST し、不要な attempt は `job cancel <jobId>` で worktree / branch ごと個別に片付けられる MUST（再 run 時の自動 supersede はしない）。

#### Scenario: 再 run が旧 branch を破壊しない

**Given** slug `foo` の attempt が branch `<prefix>foo-aaaaaaaa` で push 済み
**When** 同一 slug を再 run する
**Then** 新 jobId の新 branch `<prefix>foo-bbbbbbbb` / worktree が生え、旧 branch `<prefix>foo-aaaaaaaa` は force-push も上書きもされない

#### Scenario: 複数 attempt を jobId で区別し個別に片付ける

**Given** 同一 slug の attempt が複数併存する
**When** `job ls` を実行し、続いて `job cancel <jobId>` を実行する
**Then** `job ls` は jobId で各 attempt を区別表示し、`job cancel <jobId>` は対象 attempt の worktree / branch のみを片付ける

### Requirement: 旧 full state からの非破壊移行（段2）

旧 `.specrunner/jobs/<jobId>.json`（full state）を読んで新形式（journal + cursor）へ移行し resume できる MUST。移行後も旧ファイルは削除せず残す（非破壊）MUST。新規書き込みは新形式のみ SHALL。

#### Scenario: 旧 full state から移行して resume する

**Given** 旧 `.specrunner/jobs/<jobId>.json`（full state）の job
**When** resume する
**Then** 新形式へ移行して resume が成立し、移行後も旧 `.specrunner/jobs/<jobId>.json` が残る

### Requirement: pullRequest を state.json に materialize して読み手が動作する（段2）

`pullRequest` は pr-create event から materialize した cache として `state.json` に保持 MUST する。merge / archive / finish / `job ls` の読み手が `state.json` の `pullRequest` を読んで動作 SHALL する。

#### Scenario: pr-create 後に pullRequest が materialize される

**Given** pr-create step が成功して PR を作成する
**When** state を永続化する
**Then** `state.json` に `pullRequest`（url / number / createdAt）が cache され、merge / archive / finish / `job ls` がそれを読んで動作する

### Requirement: 導出可能フィールドと fileContent を state から除く（段2）

location が identity になることで導出可能になった `request.slug`（ディレクトリ名）/ `request.path`（`changes/<slug>/request.md` 規約）を state から除く MUST。`fileContent`（実ファイルが真実）を除去 MUST する。

#### Scenario: 痩せた state に導出フィールドが無い

**Given** 段2 適用後の `changes/<slug>/state.json` と `events.jsonl`
**When** 内容を検査する
**Then** `request.slug` / `request.path` / `StepOutcome.fileContent` / `StepRun.modelUsage` が存在せず、slug はディレクトリ名から、request.md は `changes/<slug>/request.md` 規約から解決される

### Requirement: pipeline 実行・画面出力・PR 生成が不変

storage の分離・移設・組み替えを通じて、pipeline 実行・画面出力・PR 生成は不変 MUST。`bun run typecheck && bun run test` が green SHALL。

#### Scenario: pipeline の観測可能挙動が不変

**Given** 段2 適用後
**When** request.md を投入して pipeline を完走させる
**Then** 段2 適用前と同じ pipeline 実行・画面出力・PR 生成になる
