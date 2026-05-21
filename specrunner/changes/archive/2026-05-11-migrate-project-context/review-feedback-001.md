# Code Review: migrate-project-context (Iteration 1)

## Metadata

- **request**: migrate-project-context
- **iteration**: 1
- **reviewer**: code-reviewer
- **date**: 2026-05-11

---

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 3 | 0.10 | 0.30 |
| **Total** | | | **8.00** |

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | testing | tests/ | test-cases.md の must シナリオ TC-007〜TC-021（StepExecutor allowlist 判定、adapter 注入）に対応するユニットテストが一切実装されていない。core の新機能（projectContext 注入）がテストカバレッジゼロ | `tests/unit/step/executor.test.ts` に allowlist 内ステップでの projectContext 設定・allowlist 外での undefined を検証するテストを追加。`tests/unit/adapter/claude-code/agent-runner.test.ts` と `tests/unit/adapter/managed-agent/agent-runner.test.ts` に projectContext 有無での注入挙動テストを追加 |
| 2 | MEDIUM | testing | tests/pipeline.test.ts:285 | TC-038 のアサーションが `toBe` から `toContain` に弱化された。`specrunner/project.md` が cwd に存在するか否かでテスト結果が変わる環境依存テストになっている | テスト内で `deps.cwd` を `specrunner/project.md` が存在しない一時ディレクトリに設定し、`toBe` アサーションを維持する。または projectContext 有無の両ケースを明示的にテストする |
| 3 | LOW | correctness | src/core/step/executor.ts:105 | catch ブロックが ENOENT 以外の全エラー（権限エラー等）も黙殺する。TC-037 は could 優先度だが、本番での I/O 障害を隠蔽するリスクがある | 現時点では許容（design D4 準拠）。将来的に `if (err.code !== 'ENOENT') logger.warn(...)` で非 ENOENT エラーをログ出力することを推奨 |

---

## Summary

実装は design.md に忠実で、StepExecutor → AgentRunContext → adapter の注入経路が正しく構築されている。allowlist パターン、adapter ごとの注入方式、ファイル不在時のフォールバックすべて仕様通り。

しかし、**テストカバレッジが致命的に不足**している。test-cases.md が must と宣言する 15 シナリオ（TC-007〜TC-021: StepExecutor の allowlist 判定、claude-code/managed-agent adapter の projectContext 注入挙動）に対応するユニットテストが 1 件も実装されていない。既存テスト（`executor.test.ts`, `agent-runner.test.ts`）は存在するが `projectContext` への言及がゼロ。加えて既存の pipeline.test.ts のアサーションが弱化されており、回帰検出力が低下している。

---

- **verdict**: needs-fix
