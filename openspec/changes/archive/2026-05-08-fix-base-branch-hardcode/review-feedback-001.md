# Code Review — fix-base-branch-hardcode — Iteration 1

## Summary

全 10 箇所の `"main"` / `"origin/main"` ハードコードが `ParsedRequest.baseBranch` 参照に正しく置換されている。パーサーの fail-fast バリデーション、`WorkspaceOptions` / `FinishInput` への field 追加、テスト fixture の一括更新いずれも設計通り。typecheck pass、直接関連テスト 48/48 pass。残存 TODO(base-branch) ゼロ。

2 件の stale comment と 2 件のテストインデント崩れを指摘するが、承認阻止要因はない。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 8 | 0.25 | 2.00 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.45** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/finish/orchestrator.ts:8 | モジュール冒頭コメント `Phase 4: markJobArchived → git checkout main → git pull --ff-only` が baseBranch 動的化後も `main` のまま | `git checkout main` → `git checkout <baseBranch>` に更新 |
| 2 | MEDIUM | maintainability | src/core/finish/orchestrator.ts:258 | インラインコメント `// Managed mode / no worktree: checkout main + pull` が baseBranch 動的化後も `main` のまま | `checkout main` → `checkout base branch` に更新 |
| 3 | LOW | maintainability | tests/finish-orchestrator.test.ts:201 | `baseBranch: "main",` 追加時にインデントが崩れている（`flags: {},` が 8 スペースインデント、周囲は 6 スペース） | インデント修正 |
| 4 | LOW | maintainability | tests/finish-orchestrator.test.ts:690 | 同上。TC-WT-FIN-003 の `flags: {},` インデント崩れ | インデント修正 |

## Verdict

- **verdict**: approved
- **CRITICAL**: 0
- **HIGH**: 0
- **MEDIUM**: 2
- **LOW**: 2
- **Total Score**: 8.45 (threshold: 7.0)
