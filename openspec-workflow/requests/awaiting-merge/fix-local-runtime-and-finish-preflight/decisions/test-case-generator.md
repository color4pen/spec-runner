# Test Case Generator Decisions

## 決定事項

- executor completionVerdict fallback の全テストケースを must にする :: pipeline-context.md の must-areas に明記されているため
- executor setsBranch flag の全テストケースを must にする :: pipeline-context.md の must-areas に明記されているため
- review-verdict parser tolerance の全テストケースを must にする :: pipeline-context.md の must-areas に明記されているため
- preflight MERGED bypass の全テストケースを must にする :: pipeline-context.md の must-areas に明記されているため
- TC-003（step 名ハードコード禁止）を must にする :: request.md の受け入れ基準で明示的に要求されており、応急処置汚染の直接的教訓から中核機能の前提条件である
- setsBranch フラグが managed runtime path に影響しないことを should にする :: design.md の Non-Goals に「managed runtime path の変更はしない」とあり、regression 防止だが中核機能ではない
- regex 境界値テスト（既存パターン維持、false positive 防止）を should にする :: design.md の Risks に「想定外マッチ」が挙げられているが、verdict 値のリテラル制約で低リスクと設計者が評価している
- finish-orchestrator MERGED モック整合を should にする :: tasks.md 5.1 に記載されているが、unit test の前提修正であり直接機能テストではない
- completionVerdict が定義されていない null-result のエスカレーション維持を should にする :: 既存挙動の regression 防止だが、must-areas 外
- typecheck pass の確認を manual にする :: ビルドアーティファクト検証であり自動化可能だが CI パイプライン依存の検証
- delta spec（openspec validate pass）の確認を manual にする :: openspec CLI を使った外部ツール検証であり、コードの振る舞いではない
