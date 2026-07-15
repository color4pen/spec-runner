# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 9.9

## Summary

実装はすべての受け入れ基準を満たし、スコープ制約も完全に遵守されている。

**受け入れ基準の確認:**

1. **`approvedAtCommit` = reviewed source revision（契約テスト）** — T-03 テストが `captureHeadSha` を stateful fake で制御し、`commitRoundArtifacts` 呼び出し前の `"source-sha"` が `approvedAtCommit` に記録され、`"round-commit-sha"` にならないことを固定している。実装側でも `headSha` の capture は fan-out 完了後・`commitRoundArtifacts` 前で正しい。✅

2. **pipeline 管理 path のみの変更では path-constrained reviewer を invalidate しない** — `excludeChangeFolderPaths` が invalidation site のみ（`parallel-review-round.ts` L126）で適用され、`specrunner/changes/` 配下のパスを `sourceTouched` から除外。T-04 Req 2a（`["specrunner/changes/**"]`）/ Req 2b（`["**"]`）のシナリオで executor spy が呼ばれないことを確認。✅

3. **真の source 変更では従来どおり invalidate** — T-04 Req 3 シナリオで `["src/**"]` + `src/foo.ts` 含む diff → executor 呼び出し確認。✅

4. **always-activate reviewer は常に invalidate（挙動保存）** — T-04 Req 4 シナリオで `activationPaths: undefined` かつ change folder path のみの diff → executor 呼び出し確認（`evaluateActivation` が paths=undefined 時は touchedFiles 非依存で activated=true を返す挙動と整合）。✅

5. **`listChangedFiles` seam 不変** — `local.ts` / `scope.ts` / `runtime-capability-gate.ts` に変更なし。全 6945 テストが green。✅

6. **typecheck && test が green** — verification-result.md で build/typecheck/test/lint/coverage の全フェーズ passed 確認。✅

**スコープ確認（TC-013）** — `git diff main...HEAD --name-only` の src/ 変更は `round-git-scope.ts` / `parallel-review-round.ts` / 対応 `__tests__` の 4 ファイルのみ。`reviewer-status.ts` / `activation.ts` / `local.ts` / `scope.ts` / `runtime-capability-gate.ts` / `architecture/` / `specrunner/adr/` への変更なし。✅

**コードの健全性** — `excludeChangeFolderPaths` の述語 `f !== root && !f.startsWith(prefix)` は正確で、同 prefix 別ディレクトリ（`specrunner/changes-not-a-child/`）の誤除外を防ぐ境界テストも備えている。`computeInvalidations([s], sourceTouched, ...)` の per-member 呼び出しパターンは既存 API との整合が取れている。maintainability を 9 にしたのは `if (invalidated)` チェックが常に真（`computeInvalidations` は常に 1 要素配列を返す）という冗長な防御的コードが 1 箇所あるのみで、動作に影響しない。
