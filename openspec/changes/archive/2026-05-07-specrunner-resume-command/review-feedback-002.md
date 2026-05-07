# Code Review — specrunner-resume-command — Iteration 2

## Summary

Iteration 1 の HIGH 2 件（`request.content` 空文字、`enabled: []` 空配列）は `parseRequestMd()` による正規パースで完全に解消。`deps` 構築の二重記述も一本化され、テストも全 10 ケース実装済み。`vi.mock()` のホイスト問題も解消。残存は日本語エラーメッセージ 1 件（LOW）のみ。設計判断（D1〜D7）に忠実な実装で、`createStandardPipeline` の抽出と `handlePostPipelineState` の再利用は適切。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.90** |

- **pass threshold**: 7.0
- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/cli/resume.ts:112 | エラーメッセージが日本語（"再開位置が不明です"）。他の全エラーメッセージは英語で統一されている。Iter 1 Finding #6 から未対応 | `"Error: Resume position unknown. Specify --from to set the resume step."` に変更し、対応テスト（TC-RESUME-005）の assertion も英語に合わせる |

## Iteration Comparison

### Improvements (iter 1 → iter 2)

| iter 1 # | Severity | Description | Status |
|-----------|----------|-------------|--------|
| 1 | HIGH | `request.content` が空文字で全 step に影響 | **Resolved** — `parseRequestMd(state.request.path)` で正規パース |
| 2 | HIGH | `enabled: []` が空配列で optional feature 無効化 | **Resolved** — 同上、`parseRequestMd` が `enabled` を返す |
| 3 | MEDIUM | TC-RESUME-001/004/006/008 の 4 テスト未実装 | **Resolved** — 全 10 ケース実装済み、1025 tests pass |
| 4 | MEDIUM | `deps` 構築が local/managed で二重記述 | **Resolved** — line 297-305 で一本化 |
| 5 | MEDIUM | `vi.mock()` が関数内にネスト | **Resolved** — ファイルトップレベルに移動 |
| 7 | LOW | `loadJobState` が dynamic import | **Resolved** — static import に統合 |
| 8 | LOW | `request` オブジェクトに型不一致の `path` フィールド | **Resolved** — `parseRequestMd()` で正規の `ParsedRequest` を使用 |

### Regressions

なし。

### Unchanged Issues

| iter 1 # | Severity | Description |
|-----------|----------|-------------|
| 6 | LOW | 日本語エラーメッセージ（本 iter Finding #1） |

## Convergence Trend

- **improving** — Total: 6.45 → 7.90（+1.45）。HIGH 2 件解消、MEDIUM 3 件解消。
