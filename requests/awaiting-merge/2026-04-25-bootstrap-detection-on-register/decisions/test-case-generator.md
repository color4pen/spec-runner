# Test Case Generator Decisions

## 2026-04-25

- must-areas（bootstrap_status 判定ロジック、GitHub API エラーハンドリング、並列 API 呼び出し）のテストケースをすべて must とする :: pipeline-context.md の must-areas 指定に従う
- `detectBootstrapStatus()` の単体テストを unit category とする :: 純粋なロジック関数として設計されており（design.md Decision 5）、外部依存をモックで完全に置換できるため
- `registerRepository()` の統合テストを integration category とする :: DB INSERT を含む複数モジュール連携のため
- 404 応答（ファイル/ディレクトリ不在）は「エラー」ではなく「存在しない」として扱うテストケースを独立させる :: design.md に「404 は例外ではなく null/空配列で返す設計」と明記されており、エラーハンドリングテストと混同しないよう分離する
- `only openspec/project.md` / `only requests/active/` の非対称ケースを別テストに分ける :: 受け入れ基準に「openspec/project.md のみ存在の場合は uninitialized」が明示されており、AND 条件の各半分を独立して検証する
- `getDirectoryContents` が空配列を返すケースと null を返すケースをディレクトリ存在チェックの根拠として区別しない :: design.md Decision 2 で「配列長チェック」と明記。空配列 = ディレクトリ不在として一元化する
- 並列実行の検証は unit category でタイミング計測なしとする :: Promise.all の呼び出し構造が並列性を保証するため、実際の並列実行タイミングは実装依存であり spec-change の検証対象外
- 既存 registerRepository テストの非退行を should とする :: tasks.md 3.3「既存テストが通る」は中核機能ではなく後方互換性の確認であり、could よりは重いが must の定義（機能の中核）には該当しない
