# Tasks: gitignore-test-slug-changes

## Task 1: `.gitignore` に `specrunner/changes/test-slug/` を追加

- [x] **file**: `.gitignore`
- **action**: 既存の `openspec/changes/test-slug/` 行の直後に `specrunner/changes/test-slug/` を追加する
- **detail**: コメント行 `# pipeline-integration test fixture residue` のスコープに含まれるため、コメント追加は不要（既存コメントがそのまま適用される）

## Task 2: 既存 tracked file を untrack

- [x] **action**: `git rm --cached specrunner/changes/test-slug/pr-create-result.md specrunner/changes/test-slug/verification-result.md` を実行
- **detail**: ファイルはワーキングツリーに残るが、git の追跡対象から外れる

## Task 3: 検証

- [x] **action**: `bun run typecheck && bun run test` を実行し green を確認
- [x] **action**: `git ls-files specrunner/changes/test-slug/` が空であることを確認
- [x] **action**: テスト実行後に `git status` で `specrunner/changes/test-slug/` 配下が表示されないことを確認
