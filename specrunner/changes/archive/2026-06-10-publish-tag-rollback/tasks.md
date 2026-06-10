# Tasks: release は tag を打つ前に gate する（事後 rollback をやめる）

## T-01: publish.yml を改修する

- [x] `on` に `workflow_dispatch` トリガーを追加し、`inputs.tag` を定義する（description: "Tag to publish (e.g. v0.2.0)", required: true, type: string）
- [x] tag の解決ロジックを追加する: tag push の場合は `github.ref_name`、workflow_dispatch の場合は `inputs.tag` を使う。`env` セクションで `TAG` 変数を定義する
- [x] `actions/checkout@v4` の `ref` に解決した tag を指定し、workflow_dispatch 時も正しい SHA をチェックアウトする
- [x] `bun run typecheck` step を削除する
- [x] `bun run test` step を削除する
- [x] `bun run build` step は残す（dist/ 生成は npm publish の前提）
- [x] `npm publish` step に `id: publish` を付与する
- [x] publish 成功時に `$GITHUB_STEP_SUMMARY` へパッケージ情報（tag）を出力する step を追加する
- [x] publish 失敗時に `$GITHUB_STEP_SUMMARY` へ失敗メッセージと workflow_dispatch での再実行手順を出力する step を追加する（`if: failure()`）

**Acceptance Criteria**:
- publish.yml が `push: tags: [v*, specrunner-v*]` と `workflow_dispatch` の両方でトリガーされる
- workflow_dispatch の input `tag` が required で定義されている
- typecheck / test step が存在しない
- build step が存在する
- npm publish の成功/失敗が job summary に出力される
- `bun run typecheck && bun run test` が green（publish.yml は YAML として valid）

## T-02: delta spec を作成する（release-automation）

- [x] `specrunner/changes/publish-tag-rollback/specs/release-automation/spec.md` を作成する
- [x] baseline の「publish.yml trigger is unchanged」requirement を書き換え: publish.yml が tag push trigger を保持しつつ workflow_dispatch を追加し、build + publish のみ実行する仕様に更新する
- [x] 新規 requirement を追加: publish 失敗時の job summary 出力
- [x] 新規 requirement を追加: branch protection で ci が required check である前提の明文化

**Acceptance Criteria**:
- delta spec が `specrunner/changes/publish-tag-rollback/specs/release-automation/spec.md` に存在する
- 各 requirement に SHALL/MUST キーワードが含まれる
- 各 requirement に最低 1 つの Scenario が Given/When/Then 形式で記述されている
- baseline requirement 名 "publish.yml trigger is unchanged" と header が一致する MODIFIED requirement が存在する
