## ADDED Requirements

### Requirement: `specrunner finish` は jobId / slug / awaiting-merge dir の 3 段階で対象 job を解決する

`specrunner finish <jobId> [--force] [--cleanup-only] [--slug <slug>]` は MUST 次の優先順位で対象 job を解決する SHALL 入力解決ロジックを備える。いずれにも該当しない場合は exit code 1 で停止する。

1. `<jobId>` 引数が与えられた場合: `${XDG_DATA_HOME:-$HOME/.local/share}/specrunner/jobs/<jobId>.json` を読み、`pullRequest.number`、`branch`、`request.path` を取得する
2. `--slug <slug>` が指定された場合: `jobs/` 配下を走査し、`request.path` の basename が `<slug>` と一致する state file を採用する。複数該当時は最新の `updatedAt` を優先し、その旨を stdout に出す
3. jobId / slug いずれも未指定の場合: `openspec-workflow/requests/awaiting-merge/` 配下に slug ディレクトリが厳密に 1 つだけ存在すれば、それを slug として 2 と同じ流れで解決する。0 個または 2 個以上の場合は usage と該当一覧を stderr に出し exit code 2 で停止する

#### Scenario: jobId 直接指定で正常解決

- **WHEN** `specrunner finish 7f3c...` を実行し state file が存在し `pullRequest.number=48` / `request.path=openspec-workflow/requests/awaiting-merge/readme-status-section` を持つ
- **THEN** PR=48 / slug=`readme-status-section` を解決し、続く PR 状態検知ステップへ進む

#### Scenario: --slug fallback で複数該当

- **WHEN** `specrunner finish --slug foo` を実行し `request.path` の basename が `foo` の state が 2 件存在する
- **THEN** 最新 `updatedAt` の state を採用し、`Multiple states matched slug=foo, using <jobId> (most recent)` を stdout に出す

#### Scenario: awaiting-merge 自動検出で 0 件

- **WHEN** 引数なしで `specrunner finish` を実行し `awaiting-merge/` が空である
- **THEN** `No request found in awaiting-merge/. Specify <jobId> or --slug.` を stderr に出し exit code 2 で停止する

#### Scenario: awaiting-merge 自動検出で 2 件以上

- **WHEN** 引数なしで `specrunner finish` を実行し `awaiting-merge/` 配下に slug が 2 件以上存在する
- **THEN** `Multiple slugs in awaiting-merge/: <slug1>, <slug2>. Specify --slug or <jobId>.` を stderr に出し exit code 2 で停止する

### Requirement: `specrunner finish` は PR 状態を 6 種に正規化して分岐する

`specrunner finish` は MUST `gh pr view <PR> --json state,mergeStateStatus,statusCheckRollup,headRefName` を subprocess で実行し、その出力を SHALL 次の 6 種の正規化状態にマップしたうえで、フラグに応じて分岐する。

| gh 出力 | 正規化状態 | 通常時の挙動 | `--force` 時の挙動 |
|---------|----------|-------------|--------------------|
| `state=OPEN, mergeStateStatus=CLEAN` | `OPEN_MERGEABLE` | merge へ進む | 同左 |
| `state=OPEN, mergeStateStatus=BEHIND` | `OPEN_BEHIND` | escalation（rebase 案内） | escalation（同左、rebase は手動） |
| `state=OPEN, mergeStateStatus=DIRTY` | `OPEN_CONFLICTS` | escalation（手動解消案内） | escalation（同左） |
| `state=OPEN, mergeStateStatus=BLOCKED` または `statusCheckRollup` に failure | `OPEN_CHECKS_FAILING` | escalation（修正 / `--force` 案内） | admin merge 強行 |
| `state=MERGED` | `MERGED` | `--cleanup-only` 相当で archive へ進む | 同左 |
| `state=CLOSED` | `CLOSED` | `Use 'specrunner cancel' for closed PRs.` を stderr に出し exit code 1 | 同左 |

#### Scenario: OPEN_MERGEABLE で merge 開始

- **WHEN** `gh pr view` が `state=OPEN, mergeStateStatus=CLEAN` を返す
- **THEN** 正規化状態 `OPEN_MERGEABLE` と判定し、続く feature PR merge ステップを起動する

#### Scenario: OPEN_BEHIND で escalation

- **WHEN** `gh pr view` が `state=OPEN, mergeStateStatus=BEHIND` を返す
- **THEN** stdout に escalation block（後述の escalation フォーマット要件に準拠）を出し、exit code を non-zero で終了する。`--force` であっても自動 rebase は行わない

#### Scenario: OPEN_CHECKS_FAILING + --force

- **WHEN** `state=OPEN, mergeStateStatus=BLOCKED` かつ `--force` が指定されている
- **THEN** 正規化状態 `OPEN_CHECKS_FAILING` と判定し、`gh pr merge <PR> --squash --delete-branch --admin` を実行する

#### Scenario: CLOSED PR

- **WHEN** `gh pr view` が `state=CLOSED` を返す
- **THEN** `Use 'specrunner cancel' for closed PRs.` を stderr に出し exit code 1 で停止する

### Requirement: `specrunner finish` は feature PR を gh CLI で squash-merge する

`specrunner finish` は MUST OPEN_MERGEABLE 時に `gh pr merge <PR> --squash --delete-branch` を、OPEN_CHECKS_FAILING + `--force` 時に `gh pr merge <PR> --squash --delete-branch --admin` を `node:child_process.spawn` で SHALL 実行する。`--delete-branch` により remote feature branch も同時に削除されるため、CLI 側で追加の branch 削除操作は行わない。MERGED 状態または `--cleanup-only` 指定時はこのステップを skip する。

#### Scenario: 通常 squash merge

- **WHEN** OPEN_MERGEABLE 状態で merge ステップに入る
- **THEN** `gh pr merge <PR> --squash --delete-branch` を実行し、exit code が 0 であることを確認したうえで archive ステップへ進む。stdout に `Merged PR #<n> (squash, branch deleted)` を出す

#### Scenario: --cleanup-only で merge skip

- **WHEN** `--cleanup-only` が指定され PR が OPEN_MERGEABLE である
- **THEN** merge ステップを skip し、`Skipping merge (--cleanup-only)` を stdout に出して archive ステップへ進む

#### Scenario: gh subprocess が non-zero で終了

- **WHEN** `gh pr merge` が exit code 1 で終了し stderr に GitHub のエラー文字列が出る
- **THEN** stderr の内容を escalation block に含め、exit code を non-zero で終了する。archive ステップは実行しない

### Requirement: `specrunner finish` は archive ブランチを切って openspec change と requests dir を移送する

`specrunner finish` は MUST main worktree で `git fetch origin main && git checkout -b chore/archive-<slug> origin/main` を実行して archive ブランチを SHALL 作成する。続けて以下の subprocess を順に実行する。local main への直 commit / 直 push は MUST NOT 行う。

1. `openspec/changes/<slug>/` の存在チェック → 不在なら openspec archive 全体を skip
2. `openspec/changes/<slug>/specs/` 配下に delta spec が存在するか判定
   - 存在する場合: `openspec archive <slug>` を実行
   - 存在しない場合: `openspec archive <slug> --skip-specs` を実行
3. `openspec-workflow/requests/awaiting-merge/<slug>/` が存在し `merged/<slug>/` が不在の場合のみ `git mv openspec-workflow/requests/awaiting-merge/<slug> openspec-workflow/requests/merged/<slug>` を実行
4. `git commit -m "chore: archive <slug>"` を実行（変更がない場合は commit を skip し、その旨を stdout に出す）

#### Scenario: delta spec ありで archive

- **WHEN** `openspec/changes/<slug>/specs/` に 1 つ以上の `.md` がある
- **THEN** `openspec archive <slug>` を実行し、続けて `git mv` と `git commit` を実行する

#### Scenario: delta spec なしで archive

- **WHEN** `openspec/changes/<slug>/specs/` 配下に `.md` が存在しない
- **THEN** `openspec archive <slug> --skip-specs` を実行する

#### Scenario: openspec change 不在

- **WHEN** `openspec/changes/<slug>/` が存在しない
- **THEN** openspec archive 関連 subprocess を skip し、`Skipping openspec archive (no change folder)` を stdout に出して requests dir 移送のみ行う

#### Scenario: requests dir 既に移送済み（冪等）

- **WHEN** `awaiting-merge/<slug>/` が不在で `merged/<slug>/` が既に存在する
- **THEN** `git mv` を skip し、`requests dir already migrated` を stdout に出す

### Requirement: `specrunner finish` は archive PR を作成して auto-merge を試みる

`specrunner finish` は MUST `git push -u origin chore/archive-<slug>` 後、`gh pr create --title "chore: archive <slug>" --body "Automated archive PR from specrunner finish." --head chore/archive-<slug> --base main` を SHALL 実行し、続けて `gh pr merge --auto --squash --delete-branch <archive PR URL>` を実行する。`--auto` が利用不可（auto-merge 機能 OFF）でエラーになった場合は `gh pr merge --squash --delete-branch <archive PR URL>` を fallback で即時実行する。

#### Scenario: auto-merge 成功

- **WHEN** `gh pr merge --auto --squash --delete-branch <url>` が exit code 0 で終了する
- **THEN** stdout に `Archive PR #<n> queued for auto-merge` を出し、archive PR URL を表示して次ステップへ進む

#### Scenario: auto-merge 不可で即時 merge fallback

- **WHEN** `gh pr merge --auto` が `auto-merge is not enabled for this repository` 系のエラーで exit code 1 を返す
- **THEN** `gh pr merge --squash --delete-branch <url>` を実行し、`Auto-merge unavailable; merged immediately` を stdout に出す

#### Scenario: archive PR push 失敗

- **WHEN** `git push -u origin chore/archive-<slug>` が non-zero で終了する
- **THEN** escalation block を出して exit code を non-zero にする。job state は archive 未完了のままで、再実行で続きから resume できる

### Requirement: `specrunner finish` は job state を `archived` に更新し history に finish エントリを append する

`specrunner finish` は MUST 全ステップ成功後に対象 job の state file の `status` を `archived` に SHALL 更新し、`history` 配列に `{ ts: ISO8601, step: "finish", status: "ok", message: "finish completed" }` を append する。書き込みは既存の atomic write プロトコル（`*.tmp.<random>` → `fs.rename`）に従う。escalation 終了時は state を更新しない。

#### Scenario: 全ステップ成功で archived へ遷移

- **WHEN** feature PR merge / openspec archive / requests dir mv / archive PR auto-merge がすべて成功する
- **THEN** state.status が `archived` に更新され、history に `step="finish", status="ok"` が 1 件 append される

#### Scenario: escalation 終了時は state 不変

- **WHEN** PR 状態が OPEN_BEHIND と判定され escalation で終了する
- **THEN** state.status は変更されず、history にも finish エントリは追加されない

### Requirement: `specrunner finish` の escalation 出力フォーマットを統一する

escalation 終了時、`specrunner finish` は MUST stdout に以下 4 要素を含む block を SHALL 出力する。exit code は non-zero とする。

1. `Failed step:` 失敗ステップ名（例: `PR state detection` / `feature PR merge` / `openspec archive` / `archive PR creation`）
2. `Detected state:` 検知された状態（例: `OPEN_BEHIND` / `OPEN_CONFLICTS` / `OPEN_CHECKS_FAILING`）
3. `Recommended action:` 推奨される人間操作（例: `git rebase origin/main && git push --force-with-lease`）
4. `Resume command:` 再実行コマンド（例: `specrunner finish <jobId>` または `specrunner finish <jobId> --force`）

#### Scenario: OPEN_BEHIND の escalation

- **WHEN** PR 状態が OPEN_BEHIND と判定される
- **THEN** stdout に `Failed step: PR state detection`、`Detected state: OPEN_BEHIND`、`Recommended action: git rebase origin/main && git push --force-with-lease`、`Resume command: specrunner finish <jobId>` を含む block を出し exit code を non-zero にする

#### Scenario: OPEN_CHECKS_FAILING の escalation（--force 未指定）

- **WHEN** PR 状態が OPEN_CHECKS_FAILING と判定され `--force` が未指定
- **THEN** `Recommended action: Fix failing checks or re-run with --force to admin-merge.` を含む escalation block を出力する

### Requirement: `specrunner finish` は冪等であり部分実行から resume できる

`specrunner finish` は MUST 同じ jobId に対する 2 回目以降の実行で副作用を生まない SHALL 冪等性を備える。具体的には次の状態を観測したらそれぞれを skip する。

- PR が既に MERGED → feature PR merge を skip
- `awaiting-merge/<slug>/` 不在かつ `merged/<slug>/` 存在 → requests dir mv を skip
- `chore/archive-<slug>` ブランチが remote に既に存在し、関連 archive PR が MERGED → archive 全体を skip
- 全ての step が完了済み（PR MERGED + requests dir 移送済み + main に archive commit 反映済み）→ `Already finished, nothing to do.` を stdout に出して exit code 0 で終了

#### Scenario: 完全完了済みでの再実行

- **WHEN** PR=MERGED、`merged/<slug>/` 存在、`awaiting-merge/<slug>/` 不在、archive PR も MERGED 済みの状態で `specrunner finish <jobId>` を再実行する
- **THEN** すべての step を skip し、`Already finished, nothing to do.` を stdout に出して exit code 0 で終了する。state.history に追加 entry は append されない

#### Scenario: 部分完了からの resume

- **WHEN** feature PR は MERGED 済みだが archive PR がまだ作成されていない状態で `specrunner finish <jobId>` を実行する
- **THEN** feature PR merge は skip され、archive ステップ以降が実行される

### Requirement: `specrunner finish` は LLM を呼び出さない deterministic な CLI である

`specrunner finish` は MUST 実行中に Anthropic Managed Agents API、その他の LLM API を SHALL 一切呼び出さない。すべての判断（PR 状態分岐 / archive 分岐 / 冪等チェック）は subprocess の出力とローカルファイルシステムの観測のみで決定される。
これは `request-fixup` / `request-merge` 等の openspec-workflow skill が LLM 駆動である点との明示的な区別であり、Managed Agents 環境下で worktree が存在しない SpecRunner で deterministic に再実行可能な finish を提供するための制約である。

#### Scenario: ネットワーク呼び出しの範囲

- **WHEN** `specrunner finish` の実行中に発生する outbound HTTP 呼び出しを観測する
- **THEN** Anthropic API への呼び出しは 0 件であり、観測される呼び出しは `gh` CLI（GitHub API）のみである
