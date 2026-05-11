## MODIFIED Requirements

### Requirement: `specrunner finish` は archive 操作を feature branch に commit する 1-PR モデルで動作する

`specrunner finish` は MUST archive PR を作成しない。archive 操作（delta spec → baseline spec マージ / change folder の archive / `active → merged` の git mv / archive commit）を feature branch に直接乗せ、feature PR の merge で main に反映する SHALL 1-PR モデルを採用する。

実行 Phase:

```
Phase 1: feature branch 上で archive 操作
  ├─ git fetch origin <feature-branch>
  ├─ git checkout -B <feature-branch> origin/<feature-branch>（stale local branch の force re-point。素朴な git checkout <branch> は SHALL NOT 使用する）
  ├─ delta spec → baseline spec マージ（specs/ 存在時のみ）
  ├─ change folder を archive/ へ git mv
  ├─ git mv active/<slug> merged/<slug>
  └─ git commit "chore: archive <slug>"
Phase 2: git push origin <feature-branch>
Phase 3: gh pr merge <PR> --squash --delete-branch
Phase 4: markJobArchived + worktree cleanup / git checkout main + git pull --ff-only
```

Phase 1 の delta spec マージは `mergeSpecsForChange()` が担う:
- change folder 内に `specs/` ディレクトリが存在しない場合はマージをスキップする
- `specs/` 内の各 capability ディレクトリに対して delta spec を baseline spec に適用する
- マージ順序: REMOVED → MODIFIED → ADDED
- バリデーションエラー（Requirement 名重複、クロスセクション競合、存在しない Requirement への操作）時は escalation で停止する
- マージは archiveChangeFolder 呼び出しの前に実行する（merge → archive → move → commit）

`createArchivePr` / `pushAndCreateArchivePr` / `prepareArchiveBranch` / `checkArchivePrAlreadyMerged` および `chore/archive-<slug>` branch の作成は SHALL NOT 実行されない。

staged 変更ゼロの検出は MUST `git diff --cached --quiet` の exit code（0 = ゼロ変更、non-zero = 変更あり）で行う。`git commit` コマンドの stdout / stderr の文言（例: "nothing to commit"）に依存した判定は SHALL NOT 行う。

Phase 3 の `gh pr merge --squash --delete-branch` において `--admin` flag は MUST 以下の条件に限り使用する:

- `mergeStateStatus=BLOCKED` かつ blocking reason が required status checks のみで構成されると判定できる場合のみ `--admin` を付与する
- `mergeStateStatus=CLEAN` または `MERGEABLE` の場合は `--admin` は SHALL NOT 付与する（不要な branch protection bypass を行わない）
- `mergeStateStatus=UNKNOWN` / `PENDING` の場合は Phase 0 check 4 の retry が先に走るため、check 通過後は `--admin` なしで merge を試みる
- `--admin` を付与しても merge が成功しない場合（権限不足等）は escalation とし、ユーザーに手動 merge を促す

#### Scenario: 通常成功フロー（archive あり + delta spec マージ）

- **WHEN** Phase 0 全通過、`specrunner/changes/<slug>/specs/` 存在、Phase 1〜4 が全部成功する（mergeStateStatus=CLEAN）
- **THEN** delta spec が baseline spec にマージされ、change folder が archive に移動され、feature PR が squash merge される。`state.status=archived` で persist される、exit code 0

#### Scenario: specs/ 不在で delta spec マージ skip

- **WHEN** `specrunner/changes/<slug>/` は存在するが `specs/` サブディレクトリがない
- **THEN** delta spec マージをスキップし、archive + move + commit のみ実行する

#### Scenario: delta spec マージエラーで Phase 1 停止

- **WHEN** delta spec に不正な内容（存在しない Requirement への MODIFIED 等）がある
- **THEN** mergeSpecsForChange が escalation を返し、Phase 1 が停止する。archive / move / commit は実行されない

#### Scenario: archive folder 不在で commit skip

- **WHEN** Phase 0 で `specrunner/changes/<slug>/` 不在の warning が出ており、Phase 1 で archive を skip
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
