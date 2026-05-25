# cli-finish-command Specification

## Purpose
TBD - created by archiving change finish-redesign. Update Purpose after archive.
## Requirements

### Requirement: `specrunner job finish` は `<slug>` を第一形の入力とし、複数 source の fallback で対象 job を解決する

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` SHALL 次の優先順位で対象 job を解決する。いずれの source にも該当しない場合、コマンドは MUST exit code 2 で停止する。

1. 第一引数 `<slug>` が与えられた場合: `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/` 配下の state を `getJobSlug(state)` で評価し、一致するものを採用する。複数該当時は最新 `updatedAt` を優先し、その旨を stdout に出す
2. `--pr <num>` が指定された場合: `gh pr view <num> --json headRefName` を呼び `headRefName` から prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip し、さらに末尾の jobId suffix（`/-[0-9a-f]{8}$/` にマッチする部分）を strip した結果を slug として 1 と同じ流れで解決する
3. `--job <jobId>` が指定された場合: `jobs/<jobId>.json` を直接読む（forensics / debug 用、互換性のため残置）

#### Scenario: --pr で jobId-suffixed branch から slug を導出

- **WHEN** `specrunner finish --pr 42` を実行し、`gh pr view 42 --json headRefName` が `{ "headRefName": "feat/my-feature-abcd1234" }` を返す
- **THEN** prefix `feat/` を strip → `my-feature-abcd1234` → jobId suffix strip → `my-feature` を slug として解決する

#### Scenario: --pr で suffix なし branch から slug を導出（後方互換）

- **WHEN** `specrunner finish --pr 42` を実行し、`gh pr view 42 --json headRefName` が `{ "headRefName": "feat/readme-status-section" }` を返す
- **THEN** prefix `feat/` を strip → `readme-status-section` → jobId suffix strip が no-op → `readme-status-section` を slug として解決する

### Requirement: `specrunner job finish` は Phase 0 pre-flight を irreversible op の前に全実行する

`specrunner finish` は MUST 以下の検査を `gh pr merge` 実行前に全部走らせる SHALL Phase 0 pre-flight を持つ。1 つでも fail（warning を除く）した場合 escalation で停止し、destructive op は一切実行しない。

| # | check | fail action |
|---|-------|------------|
| 1 | slug 解決可能（前 Requirement の解決ロジック） | escalation: "slug を `<slug>` 引数 / `--pr` / `--job` で明示してください" |
| 2 | `state.pullRequest.number` 存在 | escalation: "pr-create が完走していません" |
| 3 | `gh pr view <num> --json mergeStateStatus,state,headRefName` 成功 + state 取得 | escalation: "PR を gh で取得できません。auth / network を確認してください" |
| 4 | `mergeStateStatus=UNKNOWN` の場合は 3 秒間隔で 3 回 retry | retry 後も UNKNOWN なら escalation |
| 5 | `gh` `git` バイナリ available | fail なら escalation: "doctor を実行してください" |
| 6 | feature branch の未 push commit 無し | warning のみ（user 判断で続行） |
| 7 | feature branch の remote / local 存在確認（`git ls-remote --heads origin <branch>` で判定） | 存在しない場合は PR が MERGED 状態なら resume path（Phase 1〜3 skip）へ進む。MERGED 以外かつ branch 不在は escalation |
| 8 | ローカル conflict check: `git fetch origin <baseBranch>` + `git merge-tree --write-tree HEAD origin/<baseBranch>` | conflict 検出 → escalation (conflict path 一覧 + rebase 手順を含む)。`git fetch` 失敗 → escalation (silent skip 禁止) |

Check #8 は check #1〜#7 が全て通過した後にのみ実行される。PR が既に MERGED 状態の場合は check #8 をスキップする（Phase 1〜3 が不要なため）。`--dry-run` 時も check #8 をスキップする（destructive op の前段ガードであり dry-run では不要）。

Check #8 は deterministic（retry 不要）。`git merge-tree --write-tree` の exit code が primary 判定基準であり、exit code 非 0 = conflict ありと判定する。

#### Scenario: ローカル conflict 検出で Phase 1 阻止

- **WHEN** Phase 0 check #1〜#7 が全 pass し、check #8 で `git merge-tree --write-tree HEAD origin/main` が exit code 1 を返す（conflict あり）
- **THEN** escalation メッセージに conflict path 一覧と recovery 手順（`git rebase origin/main` + `specrunner finish <slug>` 再実行）が含まれ、Phase 1 archive は実行されない、exit code 1

#### Scenario: git fetch 失敗で escalation

- **WHEN** Phase 0 check #8 の `git fetch origin main` が non-zero exit で失敗する（ネットワーク不可等）
- **THEN** escalation メッセージに fetch エラー内容が含まれ、Phase 1 archive は実行されない、exit code 1。silent skip / フォールバックは SHALL NOT 行わない

#### Scenario: ローカル conflict check 通過で Phase 1 進行

- **WHEN** Phase 0 check #8 で `git merge-tree --write-tree HEAD origin/main` が exit code 0 を返す（conflict なし）
- **THEN** Phase 1 archive に進む（既存フローと同一）

#### Scenario: conflict escalation 後の再実行が可能

- **WHEN** check #8 で conflict escalation が発生した後、ユーザーが `git rebase origin/main` で conflict を解消する
- **THEN** `specrunner finish <slug>` の再実行が可能（job state は変更されていないため `assertJobFinishable` で block されない）

### Requirement: `specrunner job finish` は archive 操作を feature branch に commit する 1-PR モデルで動作する

`specrunner finish` は MUST archive PR を作成しない。archive 操作（openspec archive 実行 / `active → merged` の git mv / archive commit）を feature branch に直接乗せ、feature PR の merge で main に反映する SHALL 1-PR モデルを採用する。

実行 Phase:

```
Phase 1: feature branch 上で archive 操作
  ├─ git fetch origin <feature-branch>
  ├─ git checkout -B <feature-branch> origin/<feature-branch>（stale local branch の force re-point。素朴な git checkout <branch> は SHALL NOT 使用する）
  ├─ openspec archive <slug> [--skip-specs 自動判定]
  ├─ git mv active/<slug> merged/<slug>
  └─ git commit "chore: archive <slug>"
Phase 2: git push origin <feature-branch>
Phase 3: gh pr merge <PR> --squash --delete-branch
Phase 4: markJobArchived + git checkout main + git pull --ff-only
         (worktree-aware: checkout/pull をスキップする条件は下記 Scenario を参照)
```

`createArchivePr` / `pushAndCreateArchivePr` / `prepareArchiveBranch` / `checkArchivePrAlreadyMerged` および `chore/archive-<slug>` branch の作成は SHALL NOT 実行されない。

staged 変更ゼロの検出は MUST `git diff --cached --quiet` の exit code（0 = ゼロ変更、non-zero = 変更あり）で行う。`git commit` コマンドの stdout / stderr の文言（例: "nothing to commit"）に依存した判定は SHALL NOT 行う。

Phase 3 の `gh pr merge --squash --delete-branch` において `--admin` flag は MUST 以下の条件に限り使用する:

- `mergeStateStatus=BLOCKED` かつ blocking reason が required status checks のみで構成されると判定できる場合のみ `--admin` を付与する
- `mergeStateStatus=CLEAN` または `MERGEABLE` の場合は `--admin` は SHALL NOT 付与する（不要な branch protection bypass を行わない）
- `mergeStateStatus=UNKNOWN` / `PENDING` の場合は Phase 0 check 4 の retry が先に走るため、check 通過後は `--admin` なしで merge を試みる
- `--admin` を付与しても merge が成功しない場合（権限不足等）は escalation とし、ユーザーに手動 merge を促す

#### Scenario: 通常成功フロー（archive あり）

- **WHEN** Phase 0 全通過、`openspec/changes/<slug>/` 存在、Phase 1〜4 が全部成功する（mergeStateStatus=CLEAN）
- **THEN** feature PR が squash merge され（`--admin` なし）、feature branch の全 commit（archive commit を含む）が単一 commit として main に landing する。`state.status=archived` で persist される、exit code 0

#### Scenario: archive folder 不在で commit skip

- **WHEN** Phase 0 で `openspec/changes/<slug>/` 不在の warning が出ており、Phase 1 で `openspec archive` を skip
- **AND** `active/<slug>/` も不在で git mv も skip
- **AND** staged 変更がゼロ
- **THEN** Phase 1 の commit step を skip、Phase 2 の push も skip（push する commit が無いため）、Phase 3 で feature PR を `gh pr merge` し、Phase 4 で markJobArchived のみ実行

#### Scenario: chore/archive-<slug> branch を作成しない（assertion）

- **WHEN** `specrunner finish <slug>` を実行する
- **THEN** `chore/archive-<slug>` という branch は git に作成されない、archive PR も `gh pr create` で作成されない

#### Scenario: feature PR が既に MERGED（resume）

- **WHEN** `specrunner finish <slug>` 起動時に `gh pr view` が `state=MERGED` を返す
- **THEN** Phase 1〜3 を skip、Phase 4 のみ実行（markJobArchived + main pull --ff-only）、exit code 0

#### Scenario: feature branch が既に削除済み（resume）

- **WHEN** Phase 0 で feature branch が remote / local に存在せず、PR が MERGED 状態
- **THEN** archive commit が main に反映済みと判定し、Phase 1〜3 を skip、Phase 4 のみ実行

Note: The previous requirement referenced `awaiting-merge/<slug>` as the git mv source. This delta updates the source to `active/<slug>` to match the simplified filesystem model where `awaiting-merge` is a JobStatus value (not a filesystem dir).

### Requirement: `specrunner job finish --dry-run` は Phase 0 のみ実行し destructive op を一切呼ばない

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` の `--dry-run` flag を指定した場合は MUST Phase 0 pre-flight のみ実行し、Phase 1〜4 の destructive op（`openspec archive` / `git mv` / `git commit` / `git push` / `gh pr merge` / `git checkout main` / `git pull` / `markJobArchived`）を SHALL NOT 起動する。stdout に「実行したら何が起きるか」の計画を出力する。

stdout 出力は MUST 以下の fixed schema（1 行 1 フィールドの bullet 形式）に従う:

```
- slug: <resolved-slug>
- source: <1|2|3|4-a|4-b>
- pr-state: <OPEN|MERGED|CLOSED|...>
- merge-state-status: <CLEAN|UNKNOWN|BLOCKED|...>
- archive-plan: <run|run+skip-specs|skip>
- merge-strategy: squash+delete-branch
- admin-flag: <yes|no>
- expected-status: archived
```

この schema は将来の tooling による parse を想定して固定する。フィールド順序は変更しない。値が確定できない場合は `unknown` を使用する。

#### Scenario: dry-run で destructive op ゼロ

- **WHEN** `specrunner finish readme-status-section --dry-run` を実行する
- **THEN** Phase 0 が全実行され、Phase 1〜4 の subprocess spawn 数は 0、state file は更新されない、stdout に計画が出力される、exit code 0

#### Scenario: dry-run で Phase 0 が fail

- **WHEN** dry-run 実行で Phase 0 のうち escalation 対象 check が fail する
- **THEN** escalation メッセージを stderr に出し、destructive op は実行されない、exit code 1

### Requirement: `specrunner job finish` は markJobArchived を Phase 4 の最後に実行し状態乖離を防ぐ

`specrunner finish` は MUST `markJobArchived`（state.status を `archived` に遷移）を Phase 4 の `git pull --ff-only` 完了後に実行する SHALL。Phase 1〜3 の途中で escalation した場合、`markJobArchived` は呼ばれず state は前の status のまま残る（filesystem と state の整合性を保つため）。

例外: feature PR が既に MERGED 状態で起動された場合（前 Requirement の resume scenario）、Phase 4 の冒頭で markJobArchived を実行してよい。merge は不可逆な完了状態のため。

#### Scenario: Phase 1 で fail した場合 markJobArchived しない

- **WHEN** Phase 1 の `openspec archive` subprocess が non-zero で終了し escalation
- **THEN** state.status は前の値（典型的には `success`）のまま、`archived` には遷移しない

#### Scenario: 全 Phase 成功で markJobArchived

- **WHEN** Phase 1〜4 が全成功
- **THEN** Phase 4 の最後で markJobArchived が呼ばれ state.status=archived で persist される

### Requirement: `specrunner job finish` は LLM を呼び出さない pure CLI である

`specrunner finish` は MUST Anthropic Managed Agents API、Claude Code、またはその他の LLM session を SHALL NOT 呼び出さない。全 Phase は決定的な subprocess spawn（`gh` / `git` / `openspec`）と filesystem 操作のみで構成される。

#### Scenario: LLM session 起動なし

- **WHEN** `specrunner finish` の任意の Phase を実行する
- **THEN** Anthropic API への HTTP request は発生しない、Claude Code session は起動されない

### Requirement: `specrunner job finish` は escalation 時に統一フォーマットで report する

escalation で停止する場合、stderr に以下を MUST 含める:

- 失敗した Phase 名（Phase 0 / Phase 1 / Phase 2 / Phase 3 / Phase 4）と check 番号
- 検知された state（`gh pr view` の状態 / mergeStateStatus / archive folder 有無 / etc.）
- 推奨される人間の操作（例: "auth を確認してください" / "doctor を実行してください"）
- 同じ操作を resume するための再実行コマンド（例: `specrunner finish <slug>`）

exit code は SHALL non-zero（典型的には 1。引数解析失敗は 2）。

#### Scenario: Phase 0 fail の escalation メッセージ

- **WHEN** Phase 0 check 4（mergeStateStatus）が retry 後も UNKNOWN で fail
- **THEN** stderr に「Phase 0 check 4 fail: mergeStateStatus is UNKNOWN after 3 retries. Please verify branch protection / required checks. Re-run: `specrunner finish <slug>`」相当のフォーマットで出力する

### Requirement: `specrunner job finish` は冪等で resume 可能である

同一 `<slug>` への 2 回目の `specrunner finish` 実行は MUST 副作用ゼロ（`status=archived` の場合）または前回の中断地点から再開する SHALL。

冪等性条件:

- `state.status=archived` で feature PR が MERGED → 全 Phase skip、exit code 0、`Already archived` を stdout に出力
- `state.status=success` で feature PR が MERGED → Phase 1〜3 skip、Phase 4 のみ実行
- Phase 1 の archive commit が既に作成済み（git log で検出）→ 再 archive を skip、Phase 2 へ進む
- Phase 2 の push が既に成功済み（remote にも同 commit あり）→ 再 push は冪等（git の no-op）
- `openspec/changes/<slug>/` 不在 → archive subprocess skip
- `active/<slug>/` 不在 → mv skip
- `merged/<slug>/` が既に存在 → mv 自体を skip

#### Scenario: 2 回目実行が no-op

- **WHEN** `state.status=archived` の job に対し `specrunner finish <slug>` を再実行する
- **THEN** 全 Phase skip、`Already archived` を stdout に出力、exit code 0、subprocess spawn 数は最小（gh pr view のみまで）

Note: The previous requirement listed `awaiting-merge/<slug>/` as the absent-source skip condition. This delta updates the source to `active/<slug>/` to match the simplified filesystem model.

### Requirement: `specrunner job finish` は Phase 3 の merge 実行前に PR の mergeable 状態を確認する

`specrunner finish` は MUST Phase 3 で `gh pr merge` を実行する前に `gh pr view <prNumber> --json mergeable` で PR の mergeable 状態を確認する SHALL。

判定ロジック:

- `mergeable=MERGEABLE` の場合: そのまま `gh pr merge` を実行する
- `mergeable=CONFLICTING` の場合: rebase を促す escalation メッセージを出力し、`gh pr merge` を SHALL NOT 実行せず exit code 1 で停止する
- `mergeable=UNKNOWN` の場合: 5 秒間隔で最大 3 回リトライする。リトライ後に `MERGEABLE` になれば merge を実行する。3 回リトライ後も `UNKNOWN` のままなら escalation で停止する

escalation メッセージには MUST 以下を含める:
- 失敗した Phase 名（Phase 3）
- 検知された mergeable 状態
- rebase コマンド例（`git rebase <baseBranch>` を含む）
- resume コマンド（`specrunner finish <slug>`）

この guard は Phase 2 の `mergeStateStatus=DIRTY` ガードと相補的に動作する。Phase 2 ガードは push 直後の即座な検出、Phase 3 ガードは merge 直前の最終確認を担う。

#### Scenario: mergeable=CONFLICTING で escalation

- **WHEN** Phase 3 で `gh pr view --json mergeable` が `{ "mergeable": "CONFLICTING" }` を返す
- **THEN** escalation メッセージに rebase を促す指示が含まれ、`gh pr merge` は実行されない、exit code 1

#### Scenario: mergeable=UNKNOWN のリトライ後に MERGEABLE

- **WHEN** Phase 3 の mergeable チェックで 1 回目が `UNKNOWN`、5 秒後の 2 回目が `MERGEABLE` を返す
- **THEN** リトライが成功扱いになり `gh pr merge` が実行される

#### Scenario: mergeable=UNKNOWN が 3 回連続でリトライ超過

- **WHEN** Phase 3 の mergeable チェックで 3 回リトライ後も `UNKNOWN` のまま
- **THEN** escalation で停止、`gh pr merge` は実行されない、exit code 1

#### Scenario: mergeable=MERGEABLE で通常 merge

- **WHEN** Phase 3 で `gh pr view --json mergeable` が `{ "mergeable": "MERGEABLE" }` を返す
- **THEN** `gh pr merge --squash` が実行され、通常の Phase 3 フローが継続する

### Requirement: Remove gh CLI binary dependency from finish command

The finish command SHALL NOT require the `gh` CLI binary.

#### Scenario: Binary check excludes gh
- **WHEN** Phase 0 check 6 (binary check) runs
- **THEN** only `git` is checked; `gh` is not in the required binary list

#### Scenario: PR operations use REST API
- **WHEN** Phase 0 (pr view), Phase 2 (post-push poll), or Phase 3 (merge) executes PR operations
- **THEN** the operations use the injected `GitHubClient` port (REST API) instead of spawning `gh` subprocess

#### Scenario: --pr reverse lookup uses REST API
- **WHEN** `specrunner finish --pr <num>` resolves the target
- **THEN** `GitHubClient.getPullRequest()` is used to fetch `headRefName` instead of `gh pr view --json headRefName`

#### Scenario: merge without --admin flag
- **WHEN** Phase 3 merges a PR via REST API
- **THEN** the merge uses `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with `{ merge_method: "squash" }`. Admin bypass is implicit via token permissions (no explicit `--admin` parameter).

#### Scenario: merge failure on blocked PR
- **WHEN** the REST API merge returns 405 (PR not mergeable due to required status checks)
- **THEN** the finish command escalates with a message indicating admin permissions may be required

### Requirement: FinishInput accepts GitHubClient

The `FinishInput` interface SHALL accept `githubClient`, `owner`, and `repo` instead of relying on `githubToken` for gh CLI subprocess injection.

#### Scenario: GitHubClient injection
- **WHEN** `runFinishOrchestrator()` is called
- **THEN** the `githubClient`, `owner`, and `repo` fields are used for all PR operations
- **AND** the `githubToken` field is no longer required

### Requirement: `specrunner finish` コマンドは `specrunner job finish` に移動する

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` の全機能は `specrunner job finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` として提供される。コマンド名以外の振る舞い・引数・フラグ・Phase 構造はすべて既存仕様を維持する。

旧 top-level `specrunner finish` は SHALL NOT 動作する（`Unknown command: finish` を返す）。

#### Scenario: `specrunner job finish <slug>` が旧 `specrunner finish` と同等に動作する

- **WHEN** ユーザーが `specrunner job finish my-feature` を実行する
- **THEN** 既存の `specrunner finish my-feature` と同一の Phase 0〜4 フローで動作し、exit code / stderr / stdout 出力は旧コマンドと同等である

#### Scenario: 旧 top-level `specrunner finish` は廃止される

- **WHEN** ユーザーが `specrunner finish my-feature` を実行する
- **THEN** `Unknown command: finish` を stderr に出し exit code 2 で終了する（`job finish` へ誘導するヒントを含む）

### Requirement: `specrunner job finish` の archive path は `<YYYY-MM-DD>-<slug>` 形式である

`specrunner finish` の Phase 1 で `specrunner/changes/<slug>/` を archive する際、archive 先パスは MUST `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` 形式とする。`<YYYY-MM-DD>` は finish 実行時刻のローカル日付（`new Date()` の `getFullYear()` / `getMonth()` / `getDate()`、実行マシンの timezone）。

この命名規約は ADR の `docs/adr/<YYYY-MM-DD>-<slug>.md` と同一の思想（「動作した日を path に刻む」）に基づく。

既存の archive dir（日付付き / 日付なし混在）は rename しない。新規 archive のみ本仕様を適用する。

#### Scenario: archive path に日付 prefix が付与される

- **WHEN** `specrunner finish my-feature` を 2026-05-21 に実行し、Phase 1 で `specrunner/changes/my-feature/` を archive する
- **THEN** archive 先は `specrunner/changes/archive/2026-05-21-my-feature/` である

#### Scenario: slug collision 検出が日付 prefix 付き archive dir に対応する

- **WHEN** `specrunner/changes/archive/2026-05-20-my-feature/` が存在する状態で slug `my-feature` の collision check を実行する
- **THEN** collision が検出される（日付 prefix を strip して slug 比較するため）

#### Scenario: 既存の日付なし archive dir でも collision 検出される

- **WHEN** `specrunner/changes/archive/my-feature/` が存在する状態で slug `my-feature` の collision check を実行する
- **THEN** collision が検出される（後方互換）

### Requirement: Phase 1 は staging された変更を archive commit として確定する

`specrunner finish` の Phase 1 は、`mergeSpecsForChange` + `archiveChangeFolder` が staging した変更を MUST 末尾で `git commit -m "chore: archive <slug>"` として確定する。

staging 検出は MUST `git diff --cached --quiet` の exit code で行う:

- exit 0 (staging なし) → commit を skip する (= idempotent。resume 経路での二重 commit を防止する)
- exit 1 (staging あり) → `git commit -m "chore: archive <slug>"` を実行する

commit 失敗時は MUST escalation を返し、Phase 2 push に進まない SHALL。

この commit は Phase 2 の `git push` で feature branch に反映され、Phase 3 の squash merge で main に到達する。commit がない場合、spec-merge と archive の変更が main に反映されない。

#### Scenario: Phase 1 で staging あり → archive commit が作成される

- **WHEN** `specrunner finish my-feature` を実行し、Phase 1 の `mergeSpecsForChange` + `archiveChangeFolder` が staging を生成した
- **THEN** `git diff --cached --quiet` が exit 1 を返し、`git commit -m "chore: archive my-feature"` が実行される

#### Scenario: Phase 1 で staging なし → commit skip (idempotent)

- **WHEN** `specrunner finish my-feature` を実行し、Phase 1 で staging が空である（例: resume 経路で既に commit 済み）
- **THEN** `git diff --cached --quiet` が exit 0 を返し、commit は実行されない

#### Scenario: commit 失敗 → escalation

- **WHEN** Phase 1 の `git commit` が exit code 非 0 で失敗した
- **THEN** escalation を返し、Phase 2 push には進まない

### Requirement: Phase 1 で usage.json を derive

finish Phase 1 SHALL derive pipeline step token usage from the job state file and append entries to `specrunner/changes/<slug>/usage.json` before archiving the change folder.

#### Scenario: pipeline 完走後の finish で usage entries が追加される

- WHEN `specrunner job finish <slug>` を実行する
- AND job state に pipeline step の `modelUsage` 記録がある
- THEN `specrunner/changes/<slug>/usage.json` の `commandInvocations` に各 step の entry が append される
- AND 各 entry の `command` は `"job"` である
- AND 各 entry に `jobId`, `stepName`, `timestamp`, `modelUsage` が含まれる
- AND derive 後に `git add` で staging される
- AND その後の `archiveChangeFolder` で `usage.json` が archive に含まれる

#### Scenario: draft 段階の entries が保持される

- WHEN `specrunner job finish <slug>` を実行する
- AND `specrunner/changes/<slug>/usage.json` に既に draft 段階の entries (request-review 等) が存在する
- THEN 既存 entries が保持されたまま pipeline entries が append される

#### Scenario: change folder が存在しない場合

- WHEN `specrunner job finish <slug>` を実行する
- AND `specrunner/changes/<slug>/` が存在しない (PR 既 merge で archive 済み等)
- THEN usage derivation は skip される
- AND finish は通常通り続行する

#### Scenario: state に modelUsage がない step

- WHEN `specrunner job finish <slug>` を実行する
- AND job state の一部 step で `modelUsage` が undefined (managed runtime 等)
- THEN その step の entry は `modelUsage: null` として記録される
- AND `stepName`, `timestamp`, `jobId` は記録される

#### Scenario: derive 失敗時に finish が中断されない

- WHEN `specrunner job finish <slug>` を実行する
- AND usage.json の derive / 書き込みが何らかの理由で失敗する
- THEN warning ログが出力される
- AND finish の残りのフェーズ (archive, push, merge) は通常通り続行する
