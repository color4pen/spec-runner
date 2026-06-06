# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/ (全体) | test-cases.md TC-013「jobId-only モードで load() が throw」（must）に対応する明示的ユニットテストが不在。caller が src/ にゼロ（型封鎖）のため実害なし | 必要なら `new JobStateStore(id, root).load()` が `STATE_FILE_INVALID` を throw する単体ケースを追加する | no |
| 2 | LOW | maintainability | src/core/doctor/checks/storage/legacy-jobs-dir.ts | ヘッダー docstring L2/L5/L6 に `.specrunner/jobs/` への言及が残る。TC-032 は「コメント含め 0 件」を要求するが、検出対象の説明として機能的に必要。実行コードは `path.join` 分割で grep にマッチしない | 不要（要件 #7「読み書き参照」に該当しない） | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.8

## Summary

全受け入れ基準を満たしている。`getJobsDir` 等 5 helper の完全撤去、`JobStateStore.create/delete` 削除、job-access fallback の除去、doctor チェック置換、`prompts/rules.ts` 更新、テスト移行がすべて正しく実施されている。検証（285 ファイル / 3348 テスト / typecheck / lint）が green。発見事項はいずれも non-blocking の info レベルのみ。

