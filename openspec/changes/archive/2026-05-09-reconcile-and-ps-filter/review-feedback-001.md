# Code Review: reconcile-and-ps-filter (Iteration 1)

## Summary

reconcile.ts は純粋関数として正しく設計・実装されており、ps.ts への --status フィルタと PR hint 表示も仕様通り。モジュール境界違反なし、型安全、テストスイート全 green。checkPrMerged の must テストケースが未実装。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 8 | 0.25 | 2.00 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **8.35** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/cli/ps-pr-hint.test.ts | test-cases.md の must シナリオ TC-26, TC-27, TC-28 が未実装。`checkPrMerged` に対する直接テスト（pullRequest なし→null、gh 不在→null、MERGED→true）がない | `spawnCommand` を vi.mock してテストケース 3 件追加。TC-26: pullRequest なしの job を渡して null 検証。TC-27: spawnCommand が throw → null。TC-28: spawnCommand が `{ exitCode: 0, stdout: "MERGED" }` → true |
| 2 | LOW | maintainability | src/state/reconcile.ts:20, src/cli/ps.ts:34 | `STALE_THRESHOLD_MS` が 2 ファイルに異なる値で定義（reconcile: 15min, ps: 1h）。名前が同一で用途が異なるため混乱の元 | ps.ts 側を `PS_STALE_HINT_THRESHOLD_MS` 等に rename して意図を明示する（ps.ts の 1h は pre-existing なので本 PR のスコープ外でも可） |

## Scenario Coverage

### must シナリオ (27 件)

| Status | Count | Details |
|--------|-------|---------|
| Implemented | 24 | TC-01〜05, 07〜11, 14〜20, 23〜25, 33, 34, 36 |
| Missing | 3 | TC-26, TC-27, TC-28 (checkPrMerged 系) |

Coverage: 24/27 = **89%**

**TC-32** (ps は state 変更しない) は構造的保証（runPs に writeJobState 呼び出しなし）で充足。

### should シナリオ (10 件)

| Status | Count |
|--------|-------|
| Implemented | 4 | TC-06, 21, 37 + TC-35 (import 検査は目視確認) |
| Not implemented | 6 | TC-12, 13, 22, 29, 30, 31 |

## Verification

- `bun run typecheck`: **PASS** (TC-33)
- `bun run test`: **PASS** — 141 files, 1533 tests (TC-34)
- Module boundary (TC-35): `reconcile.ts` の import は `./lifecycle.js` と `./schema.js` のみ。`src/core/` への依存なし

## Iteration Comparison

N/A (初回イテレーション)

- **verdict**: approved
