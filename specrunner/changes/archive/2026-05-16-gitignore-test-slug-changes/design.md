# Design: gitignore-test-slug-changes

## Summary

`.gitignore` に `specrunner/changes/test-slug/` を追加し、既存 tracked file を untrack する。

## Approach

既存の `openspec/changes/test-slug/` エントリと同じパターンで、`specrunner/changes/test-slug/` をディレクトリ単位で gitignore する。

### Steps

1. `.gitignore` に `specrunner/changes/test-slug/` を追加（既存の `openspec/changes/test-slug/` 行の直後が自然な位置）
2. `git rm --cached` で tracked file を untrack
3. テスト実行後に git status が clean であることを確認

## Design Decisions

- **ディレクトリ単位の ignore**: 個別ファイル指定ではなくディレクトリ全体を対象。将来 test artifact が増えても自動で吸収される
- **コメント追記**: 既存の `openspec/changes/test-slug/` のコメントを拡張し、`specrunner/` 側も同じ理由であることを明示する
- **spec 影響なし**: build artifact / dev hygiene の変更のみ

## Risks

なし。`.gitignore` と `git rm --cached` のみの変更で、ソースコードに触れない。
