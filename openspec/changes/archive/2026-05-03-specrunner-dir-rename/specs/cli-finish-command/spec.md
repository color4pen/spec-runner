# cli-finish-command Delta Spec (specrunner-dir-rename)

This delta spec modifies the `cli-finish-command` specification for the `specrunner-dir-rename` change.

## Modified Requirements

### Requirement: `specrunner finish` は `<slug>` を第一形の入力とし、複数 source の fallback で対象 job を解決する

`specrunner finish [<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` SHALL 次の優先順位で対象 job を解決する。いずれの source にも該当しない場合、コマンドは MUST exit code 2 で停止する。

1. 第一引数 `<slug>` が与えられた場合: `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/` 配下の state を `getJobSlug(state)` で評価し、一致するものを採用する。複数該当時は最新 `updatedAt` を優先し、その旨を stdout に出す
2. `--pr <num>` が指定された場合: `gh pr view <num> --json headRefName` を呼び `headRefName` から prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip した残部を slug として 1 と同じ流れで解決する
3. `--job <jobId>` が指定された場合: `jobs/<jobId>.json` を直接読む（forensics / debug 用、互換性のため残置）
4. 引数なしの場合:
   - 4-a. cwd が `specrunner/requests/active/<dir>/` 配下なら `<dir>` を slug として 1 と同じ流れで解決する
   - 4-b. main worktree から起動された場合、`specrunner/requests/active/<dir>/` が厳密に 1 件のみ存在すれば `<dir>` を slug として 1 と同じ流れで解決する
   - 4-c. 0 件 / 2 件以上の場合は usage と該当 slug 一覧を stderr に出し exit code 2 で停止する

#### Scenario: cwd auto-detect（worktree 内）

- **WHEN** cwd が `specrunner/requests/active/readme-status-section/` 配下で `specrunner finish` を引数なしで実行する
- **THEN** `readme-status-section` を slug として採用し、対応 state を解決する

#### Scenario: active 自動検出で 0 件

- **WHEN** 引数なしで `specrunner finish` を実行し `active/` が空である
- **THEN** `No request found in active/. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で停止する

#### Scenario: active 自動検出で 2 件以上

- **WHEN** 引数なしで `specrunner finish` を実行し `active/` に 2 件以上の slug が存在する
- **THEN** `Multiple slugs in active/: <list>. Specify <slug>, --pr, or --job.` を stderr に出し exit code 2 で停止する

Note: The previous requirement for `openspec-workflow/requests/{active,awaiting-merge}/<dir>/` is superseded by this delta spec. The `awaiting-merge/` directory is no longer used for auto-detection.

### Requirement: `specrunner finish` は archive 操作を feature branch に commit する 1-PR モデルで動作する

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

### Requirement: `specrunner finish` は冪等で resume 可能である

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
