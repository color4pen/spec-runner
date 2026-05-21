# Code Review: migrate-project-context (Iteration 2)

## Metadata

- **request**: migrate-project-context
- **iteration**: 2
- **reviewer**: code-reviewer
- **date**: 2026-05-11

---

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.80** |

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | correctness | src/core/step/executor.ts:105 | catch ブロックが ENOENT 以外の全エラー（権限エラー等）も黙殺する。design D4 準拠だが、本番での I/O 障害を隠蔽するリスクがある | 将来的に `if (err.code !== 'ENOENT') logger.warn(...)` で非 ENOENT エラーをログ出力することを推奨。現時点では許容 |
| 2 | LOW | maintainability | tests/unit/step/executor.test.ts | `makeCapturingRunner()`, `makeStepNamed()`, `makeDepsWithCwd()` が TC-007~TC-010 と TC-011~TC-014 の describe ブロックで重複定義されている | describe ブロックの外に共通ヘルパーとして抽出する。機能的には問題なし |

---

## Iteration Comparison

### Improvements (vs Iteration 1)

- **Finding #1 (HIGH, testing)**: TC-007~TC-021 のユニットテストが全て実装された。`executor.test.ts` に allowlist/非 allowlist のパラメタライズドテスト、`claude-code/agent-runner.test.ts` に TC-016/TC-017、`managed-agent/agent-runner.test.ts` に TC-018~TC-021 が追加。testing スコア 3→8
- **Finding #2 (MEDIUM, testing)**: `pipeline.test.ts:288` のアサーションが `toBe` に戻され、`cwd: tempDir`（specrunner/project.md なし）で環境非依存化された

### Regressions

なし

### Unchanged Issues

- **Finding #3 (LOW, correctness)**: catch ブロックの全エラー黙殺。design D4 準拠のため維持

### Convergence Trend

`improving` — Total スコア 8.00 → 8.80（+0.80）

---

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Test File |
|----|----------|--------|-----------|
| TC-001 | must | covered | git 操作結果（specrunner/project.md 存在確認済み） |
| TC-002 | must | covered | git 操作結果（openspec/ は空ディレクトリのみ、git 追跡外） |
| TC-003 | must | covered | specrunner/project.md 内容確認済み |
| TC-004 | must | covered | paths.ts の `projectMdPath()` 実装確認 |
| TC-005 | must | covered | paths.ts に src/ import なし |
| TC-006 | must | covered | agent-runner.ts の型定義確認 |
| TC-007 | must | covered | executor.test.ts — propose |
| TC-008 | must | covered | executor.test.ts — spec-review |
| TC-009 | must | covered | executor.test.ts — implementer |
| TC-010 | must | covered | executor.test.ts — code-review |
| TC-011 | must | covered | executor.test.ts — spec-fixer |
| TC-012 | must | covered | executor.test.ts — build-fixer |
| TC-013 | must | covered | executor.test.ts — code-fixer |
| TC-014 | must | covered | executor.test.ts — test-case-gen |
| TC-015 | must | covered | executor.test.ts — missing file |
| TC-016 | must | covered | claude-code/agent-runner.test.ts — TC-016 |
| TC-017 | must | covered | claude-code/agent-runner.test.ts — TC-017 |
| TC-018 | must | covered | managed-agent/agent-runner.test.ts — TC-018 |
| TC-019 | must | covered | managed-agent/agent-runner.test.ts — TC-019 |
| TC-020 | must | covered | managed-agent/agent-runner.test.ts — TC-020 |
| TC-021 | must | covered | managed-agent/agent-runner.test.ts — TC-021 |
| TC-023 | must | covered | specrunner-project-md.test.ts |
| TC-024 | must | covered | specrunner-project-md.test.ts |
| TC-025 | must | covered | specrunner-project-md.test.ts |
| TC-026 | must | covered | checks/index.ts 確認 |
| TC-029 | must | covered | specrunner-project-md.test.ts |
| TC-030 | must | covered | specrunner-project-md.test.ts |
| TC-031 | must | covered | typecheck pass 確認 |
| TC-032 | must | covered | test pass 確認（143 files, 1652 tests） |

**must シナリオ: 23/23 covered**

---

## Summary

Iteration 1 の HIGH（テストカバレッジ不足）と MEDIUM（pipeline.test.ts のアサーション弱化）が両方とも解消された。実装は design.md に忠実で、StepExecutor → AgentRunContext → adapter の注入経路が正しく構築されている。allowlist パターン、両 adapter の注入方式、ファイル不在時のフォールバック、doctor check のリネーム、すべて仕様通り。テストカバレッジも must シナリオ全 23 件をカバー。`bun run typecheck` / `bun run test` 全 pass（143 files, 1652 tests）。

---

- **verdict**: approved
