## Requirements

### Requirement: resume は legacy state の request.md パスをフォールバック解決する

`state.request.path` が `specrunner/drafts/` 配下を指す（draft 削除後の legacy state file）場合、resume は MUST 以下の順序でフォールバック解決を行い、最初に存在するパスを使用する。

1. `state.worktreePath` が non-null かつディレクトリ実在 → `<worktreePath>/specrunner/changes/<slug>/request.md`
2. 上記が無効 → `<process.cwd()>/specrunner/changes/<slug>/request.md`
3. いずれも存在しない → 元の `state.request.path` を使用（結果として ENOENT エラー）

`slug` は `getJobSlug(state)` で解決する。

`state.request.path` が `specrunner/drafts/` を含まない場合はフォールバックを MUST NOT 行い、そのまま使用する。

#### Scenario: legacy state + local runtime (worktreePath あり)

- **GIVEN** `state.request.path` が `/repo/specrunner/drafts/my-slug/request.md` を指す
- **AND** `state.worktreePath` が `/repo/.git/worktrees/my-slug-abc` で実在する
- **AND** `/repo/.git/worktrees/my-slug-abc/specrunner/changes/my-slug/request.md` が存在する
- **WHEN** `specrunner job resume my-slug` を実行する
- **THEN** `/repo/.git/worktrees/my-slug-abc/specrunner/changes/my-slug/request.md` を読んで resume が成功する

#### Scenario: legacy state + managed runtime (worktreePath null)

- **GIVEN** `state.request.path` が `/repo/specrunner/drafts/my-slug/request.md` を指す
- **AND** `state.worktreePath` が `null`
- **AND** `<cwd>/specrunner/changes/my-slug/request.md` が存在する
- **WHEN** `specrunner job resume my-slug` を実行する
- **THEN** `<cwd>/specrunner/changes/my-slug/request.md` を読んで resume が成功する

#### Scenario: legacy state + 両候補不在（完全 ENOENT）

- **GIVEN** `state.request.path` が `/repo/specrunner/drafts/my-slug/request.md` を指す
- **AND** worktreePath 配下にも cwd 配下にも `specrunner/changes/my-slug/request.md` が存在しない
- **WHEN** `specrunner job resume my-slug` を実行する
- **THEN** 現状と同等の ENOENT エラーが stderr に出力され exit code 1 で終了する
