# Spec Review Result: finish-conflict-precheck — #001

- **reviewer**: spec-reviewer
- **date**: 2026-05-11
- **verdict**: approved

## Summary

要件に対して design / tasks / delta spec が網羅的かつ整合的。既存コードベースの構造（pr-status.ts のリトライパターン、orchestrator.ts の PhaseResult 型、テストの makeHappyPathSpawn）に正確に沿っており、実装可能性が高い。軽微な指摘 2 件あるが承認阻止ではない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | request.md:29 vs design.md:30 | request.md の要件 3 は「各5秒待機」、baseline spec の Phase 0 check 4 は「3秒間隔で3回」。Phase 3 guard を 5 秒にする設計判断自体は妥当（merge 直前のため余裕を持たせる）だが、Phase 0 との差異を design.md で明示的に rationalize していない | design.md D1 に「Phase 0 の UNKNOWN_RETRY_DELAY_MS=3000 に対し、Phase 3 は merge 直前のため 5000ms に設定」の一文を追加する。実装には影響しない |
| 2 | LOW | completeness | specs/cli-finish-command/spec.md | `--dry-run` の Phase 3 guard との関係が delta spec に未記載。baseline spec の dry-run 要件は「Phase 0 のみ実行」なので Phase 3 guard は dry-run 時に実行されない（正しい動作）が、delta spec 側で「dry-run 時はこの guard は実行されない」と明示すると読者に親切 | delta spec に Note を追加: 「本 guard は Phase 3 で実行されるため、`--dry-run` 時は実行されない（baseline の dry-run 仕様通り）」 |

## Checklist

### Completeness (request.md 要件の網羅)

| 要件 | design.md | tasks.md | delta spec | 判定 |
|------|-----------|----------|------------|------|
| R1: Phase 3 merge 前に mergeable 確認 | D2 | T-02 | Requirement 本文 | OK |
| R2: CONFLICTING → rebase 促す escalation | D1 返り値 | T-01, T-03 TC-001 | Scenario 1 | OK |
| R3: UNKNOWN → 3回リトライ 5秒間隔 | D1 リトライパラメータ | T-01, T-03 TC-003/004 | Scenario 2, 3 | OK |
| R4: MERGEABLE → merge 実行 | D1 返り値 | T-03 TC-002(既存) | Scenario 4 | OK |
| AC: typecheck/test pass | — | T-05 | — | OK |

### Consistency (baseline spec との整合)

- Phase 0 の `mergeStateStatus` UNKNOWN リトライ（baseline check 4）と Phase 3 の `mergeable` UNKNOWN リトライは別フィールド・別タイミングで動作。相補的であり矛盾なし
- `MergePhase3Params` への `baseBranch` / `sleepFn` 追加は既存パターン（`fetchPrViewWithRetry` の `sleepFn` DI）と一貫
- D3「PrViewData は変更しない」判断は妥当。`mergeable` は Phase 3 専用の一時クエリで、Phase 0 で取得する `PrViewData` と混ぜる必要がない
- `--admin` flag の決定ロジック（L414-417）は mergeable guard の後に実行されるため干渉なし

### Feasibility

- `checkMergeableForMerge` の配置先（pr-status.ts）は既存の PR 状態照会関数と同一モジュールで責務集約が適切
- `makeHappyPathSpawn` の `args.includes("mergeable")` 分岐は既存の `args.includes("--json")` 分岐より前に配置する設計（tasks T-03）で、既存テストへの影響を最小化
- 変更ファイル 3 つ（pr-status.ts, orchestrator.ts, test）は最小限のスコープ

### Security

- `gh pr view --json mergeable` は read-only API 呼び出し。認証・入力検証に新たなリスクなし
- spawn の引数は `prNumber`（number 型）のみで injection リスクなし
