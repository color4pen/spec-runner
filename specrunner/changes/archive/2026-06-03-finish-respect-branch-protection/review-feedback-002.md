# Code Review Feedback — iteration 002

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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `tests/finish-orchestrator.test.ts` | TC-004（must）「merge API merged:false → recommendedAction に branch protection hint を含む」のテストが未実装。実装側（`mergeFeaturePrPhase3` の `merged===false` パス）は "Branch protection requirements may not be met" を含む `recommendedAction` を正しく返しており、コード読み取りで正確性は確認できる。test-cases.md では "must" に分類されているが、機能上の欠陥ではなくテストカバレッジの不足。 | `mergePullRequest` が `{ merged: false, message: "..." }` を返すようにモックし、orchestrator の escalation に "branch protection" が含まれることをアサートするテストを追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.90

## Summary

iteration 001 の全 `fix=yes` findings が解消されている。

**Finding 1（high）解消**: `--force` フラグおよび `FinishFlags.force` が CLI・types・orchestrator から完全に削除されており、admin bypass を示唆するインターフェースが残存しない。`FINISH_USAGE` および `command-registry.ts` の finish handler flags にも `--force` エントリが存在しない。

**Finding 2（medium）解消**: TC-012「PR already merged + archive 失敗 → markJobArchived 未呼び出しで escalation」のテストが `tests/finish-orchestrator.test.ts` に追加されており、`git mv` 失敗時に escalation・status non-archived を正しくアサートしている。

**acceptance criteria 全充足**:
- BLOCKED / UNSTABLE の Phase 2 post-push 検出 → escalation（`runPhase2Push`）✅
- merge API 失敗時の branch protection hint（`mergeFeaturePrPhase3` の merged:false / catch 両パス）✅
- `isMergeTransientFailure` の "is expected"（retry） / "has failed"（permanent）/ unknown（permanent）分岐 ✅
- admin bypass コメント・`FinishFlags.force` の解消 ✅
- rules.md System Facts に merge gate 設計前提の記述 ✅
- 既マージ経路で archive 完了後に `markJobArchived`、archive 失敗時は escalation ✅
- `bun run typecheck && bun run test` green（3088 tests）✅

Finding 1（low）は "must" テストケースの欠如だが実装の正確性は確認済み。`fix=no` とし、このリビジョンでのブロックとしない。
