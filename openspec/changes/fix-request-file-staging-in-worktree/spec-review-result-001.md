# Spec Review Result: fix-request-file-staging-in-worktree

- **verdict**: approved
- **iteration**: 1
- **date**: 2026-05-07
- **request-type**: spec-change

## Summary

仕様は request の 3 要件・4 受け入れ基準を網羅。proposal → design → tasks → delta spec の一貫性が高い。`spawnCommand` の既存パターン踏襲、fail-fast 設計、detached HEAD での `git add` 動作の根拠も明確。CRITICAL/HIGH の指摘なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | proposal.md:1 | request は `git mv` 失敗メッセージを「source directory is empty」と記述、proposal は「source is not tracked」と記述。実際の git エラーメッセージはどちらかに統一すべき | いずれかに統一するか、「git mv が失敗する」と抽象化する。実装に影響なし |
| 2 | LOW | completeness | tasks.md:9 | T2.2 で「必要に応じて unit test を追加（`spawnCommand` を DI できる場合）」と条件付き。run.ts は現在 `spawnCommand` を直接 import しており DI 構造ではないため、実質テスト追加は困難。条件が事実上 false | 「run.ts は現在 DI 未対応のためスキップ」と明記するか、integration test レベルの検証を記載 |

## Completeness Check

| Request Requirement | Covered By | Status |
|---------------------|-----------|--------|
| R1: `fs.cp` 後に `git add` を追加 | design.md D1 / tasks T1.2 / delta spec Scenario 1 | ✅ |
| R2: detached HEAD での staging → branch 引き継ぎ | design.md D1 Rationale / delta spec Scenario 2 | ✅ |
| R3: delta spec として worktree request staging を追加 | specs/cli-commands/spec.md MODIFIED Requirements | ✅ |

| Acceptance Criteria | Covered By | Status |
|--------------------|-----------|--------|
| AC1: run 完了後 request file が feature branch にコミット済み | delta spec Scenario 2 | ✅ |
| AC2: finish の `git mv` が成功 | delta spec Scenario 2 AND 条件 | ✅ |
| AC3: delta spec が存在し openspec validate pass | tasks T3.1 | ✅ |
| AC4: typecheck + test green | tasks T1.3 / T3.2 | ✅ |

## Consistency Check

- `relativeRequestPath` は `path.relative(cwd, absolutePath)` で算出（run.ts:236）。delta spec の `<relativeRequestPath>` と一致
- `spawnCommand` は `src/util/spawn.ts:35` で export。Promise resolve で exitCode を返す（non-throw）。design D1 の fail-fast 設計と整合
- `move-requests-dir.ts` の `git mv activePath mergedPath` は tracked file 前提。本 change で request.md が tracked になることで前提が満たされる
- 既存 cli-commands/spec.md に worktree 固有の staging 要件は未定義。delta spec は純粋な追加であり既存要件と矛盾しない
