# Code Review — poll-timeout — iteration 2

- **reviewer**: code-reviewer
- **date**: 2026-05-09
- **verdict**: approved

## Summary

Iteration 1 の MEDIUM 指摘 3 件（#1 elapsedMs 不正確, #2 SSE fallback の error 欠落, #3 テストの false-pass リスク）はすべて修正済み。5 層チェーン（errors → completion → session-client → agent-runner → executor）は正しく動作し、typecheck / test ともに green（136 files, 1343 tests）。LOW 指摘 2 件（旧コメント残存）は未修正だが承認阻止要因ではない。

## Improvements (from iteration 1)

| iter-1 # | Severity | Status | Notes |
|----------|----------|--------|-------|
| 1 | MEDIUM | ✅ fixed | completion.ts に `const startTime = Date.now()` を追加し、throw 時に `Date.now() - startTime` を渡すように修正。実経過時間が正確に報告される |
| 2 | MEDIUM | ✅ fixed | `runProposeStyle` SSE fallback で `timeoutErr` を構築し `error` プロパティを返すように修正。`runPollingStyle` と対称になった |
| 3 | MEDIUM | ✅ fixed | `await expect(...).rejects.toMatchObject({ code: "POLL_TIMEOUT" })` に統合。false-pass リスク解消 |

## Regressions

なし。

## Unchanged Issues

| iter-1 # | Severity | Category | File | Description |
|----------|----------|----------|------|-------------|
| 4 | LOW | maintainability | tests/completion.test.ts:158-160 | 旧コメント `"pollUntilComplete no longer has a wall-clock timeout (design D1). The only terminal error from polling is SESSION_TERMINATED."` が残存。POLL_TIMEOUT 追加と矛盾 |
| 5 | LOW | maintainability | tests/unit/remove-session-timeout.test.ts:123 | TC-011 第2テスト description `"pollUntilComplete は AbortSignal による中断のみをサポートし timeout を throw しない"` が factually incorrect |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | tests/completion.test.ts:158-160 | 旧コメントが POLL_TIMEOUT 追加と矛盾する（iteration 1 #4 から継続） | コメントを削除するか `POLL_TIMEOUT (defense-in-depth) が追加された` 旨に更新 |
| 2 | LOW | maintainability | tests/unit/remove-session-timeout.test.ts:123 | テスト description が現在の動作と不一致（iteration 1 #5 から継続） | `"pollUntilComplete は AbortSignal pre-abort 時に SESSION_TIMEOUT を throw しない"` に修正 |

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| correctness | 8 | iter-1 #1, #2 修正済み。5 層チェーン正常動作 |
| security | 8 | 新たな脆弱性なし |
| architecture | 8 | design.md D1–D4 と整合。port 更新適切 |
| performance | 8 | defense-in-depth として妥当。hot path 影響なし |
| maintainability | 7 | 旧コメント 2 件残存（LOW）。本体コードの可読性は良好 |
| testing | 7 | false-pass 修正済み。TC-041-3/5 は暗黙的にカバー。integration テスト（TC-044/045）は scope 外で妥当 |

**Total**: 8 × 0.30 + 8 × 0.25 + 8 × 0.15 + 8 × 0.10 + 7 × 0.10 + 7 × 0.10 = 2.40 + 2.00 + 1.20 + 0.80 + 0.70 + 0.70 = **7.8**

## Convergence Trend

- **Trend**: `improving`
- iter-1 Total: 6.9 → iter-2 Total: 7.8（+0.9）
- MEDIUM 指摘 3 件すべて解消。regression なし

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-040-1 | must | ✅ | factory 出力は POLL_TIMEOUT テストで暗黙検証 |
| TC-040-2 | must | ✅ | TC-008 で SESSION_TIMEOUT 不在確認。POLL_TIMEOUT は import で存在確認 |
| TC-041-1 | must | ✅ | completion.test.ts — rejects.toMatchObject で検証 |
| TC-041-2 | must | ✅ | completion.test.ts — timeoutMs なしで idle 正常完了 |
| TC-041-3 | must | ✅ | 暗黙的カバー（deadline は関数冒頭で 1 度計算、ループ内は判定のみ） |
| TC-041-4 | must | ✅ | `DEFAULT_POLL_TIMEOUT_MS === 900_000` assert 済み |
| TC-041-5 | must | ✅ | 暗黙的カバー（1ms timeout + 50ms sleep → retrieve 前に throw） |
| TC-042-1 | must | ✅ | 静的確認。port に timeoutMs 存在、SESSION_TIMEOUT 不在 |
| TC-043-1 | must | — | 未実装（adapter passthrough の単体テスト）。コード確認で正しくパススルー |
| TC-043-2 | must | — | 未実装。コード確認で undefined パススルー動作を確認 |
| TC-044-* | must | — | integration テスト scope。単体テスト範囲外で妥当 |
| TC-045-* | must | — | integration テスト scope。単体テスト範囲外で妥当 |
| TC-046-1 | must | ✅ | TC-008 更新済み |
| TC-046-2 | must | ✅ | timeoutMs 不在 assertion 削除済み |
| TC-046-3 | must | ✅ | TC-011 更新済み |
| TC-046-4 | must | ✅ | timeoutMs 不在 assertion 削除済み |
| TC-047-1 | must | ✅ | typecheck green |
| TC-047-2 | must | ✅ | test green (136 files, 1343 tests) |
| TC-047-3 | must | ✅ | SESSION_TIMEOUT 不在確認済み |
