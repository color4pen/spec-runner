# Review Feedback: delta-spec-auto-classification (Iteration 2)

## Verdict

- **verdict**: approved

## Iteration Comparison

### Improvements

| Finding (iter-1) | Status |
|---|---|
| [HIGH] ADR ファイルが作成されていない (T-15 / 受け入れ基準未達) | ✅ 修正済み — `docs/adr/ADR-20260519-delta-spec-auto-classification.md` に ADR 作成。思想・D1〜D7 要約・PR #283/#289/#299/#323 背景・trade-off が記録されている |
| [HIGH] `applyMerge` strict name 比較による markdown decoration 付き MODIFIED の ENOENT | ✅ 修正済み — `classifyDeltaSpec` で `modified` に積む前に `block.name` を baseline 側の name にアライン（L226-239）。TC-SM-106 統合テストが `parseDeltaSpec → classifyDeltaSpec → applyMerge` の full path を検証 |
| [MEDIUM] Renamed セクションが ASCII `->` を silently 落とす | ✅ 修正済み — parser regex が `(?:→\|->|=>)` を受理するよう拡張（L154） |
| [LOW] tasks.md チェックボックスと実態の乖離 | ✅ ADR 作成により解消 |
| [LOW] `## Requirements` 重複時の flush 順序 (backlog) | 未対応（設計上の backlog として認識済み — スコープ外）|

### Regressions

なし

### Unchanged Issues

なし（iter-1 の全 must-fix は解消）

## Convergence Trend

`improving` — iter-1 の CRITICAL: 0 / HIGH: 2 / MEDIUM: 1 から iter-2 では HIGH: 0 / MEDIUM: 0 / LOW: 2 に改善。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | `tests/finish-spec-merge.test.ts` | `->` / `=>` arrow バリアントのテストがない。parser が `(?:→\|->|=>)` を受理するよう修正されたが、`->` / `=>` を使った `## Renamed` の fixture テストが存在しない。回帰時に検出不可 | `TC-SM-011` 相当のテストに `- "Old" -> "New3"` および `- "Old2" => "New4"` の fixture を追加し、それぞれ parse されることを assert する |
| 2 | LOW | testing | `tests/unit/core/spec/rules/canonical-spec-structure.test.ts` | TC-04-03 (`## REMOVED Requirements`) と TC-04-04 (`## RENAMED Requirements`) が test-cases.md で "must" として記載されているが、explicit な unit test が存在しない。TC-DSV-13 (ADDED) / TC-DSV-14 (MODIFIED) のみ。実装 regex は `(?:ADDED\|MODIFIED\|REMOVED\|RENAMED)` で全 4 パターンを網羅しているため機能的問題はないが、must coverage が未達 | `## REMOVED Requirements` および `## RENAMED Requirements` を fixture に持つ 2 テストケースを TC-DSV-15 / TC-DSV-16 として追加し、`legacy-section-header` violation が返ることを assert する |

## Scores

| Category | Score | Note |
|----------|-------|------|
| correctness | 9 | 自動分類ロジック・name-align・rename 順序保証・baseline null ガードすべて正確 |
| security | 9 | 攻撃面なし |
| architecture | 9 | ParsedDelta → DeltaSpec の型分離、D1〜D7 の設計判断が正確に実装されている |
| performance | 8 | 問題なし |
| maintainability | 8 | 関数責務が明確。JSDoc コメントと型定義が適切 |
| testing | 6 | 主要 path はカバー済み。must TC の 2 件（TC-04-03/04-04）と `->` variant テストが未実装 |

**Total** = (9×0.30) + (9×0.25) + (9×0.15) + (8×0.10) + (8×0.10) + (6×0.10) = **8.50** ≥ 7.0 (pass)

## Acceptance Criteria Check

| # | Criteria | Status |
|---|----------|--------|
| 1 | `spec-merge.ts` が新形式 delta spec を読み baseline と突合して ADDED/MODIFIED を自動分類 | ✅ |
| 2 | 新規 capability (baseline 不在) → 全 Requirement が ADDED 扱い (PR #323 再現性消滅) | ✅ |
| 3 | `## Removed` リストの name が baseline から削除される | ✅ |
| 4 | `## Renamed` の old → new が MODIFIED 判定の前に適用される | ✅ (fix 適用済み、TC-SM-019 で検証) |
| 5 | dsv が旧形式 section header (`## ADDED Requirements` 等) を HIGH violation として reject | ✅ |
| 6 | dsv が新形式 (`## Requirements` / `## Removed` / `## Renamed`) を必須とする | ✅ |
| 7 | `DELTA_SPEC_FORMAT` fragment が新形式に書き換えられている (string assertion) | ✅ |
| 8 | `design-system.ts` checklist が新形式に追随 (string assertion) | ✅ |
| 9 | `tests/` 配下の既存 delta spec fixture が全て新形式 | ✅ |
| 10 | `bun run typecheck && bun run test` green | ✅ (verification-result.md: 2239/2239 passed) |
| 11 | ADR に「LLM 不確定性に対する構造的解決」の思想と本 request の位置付けが記録 | ✅ (Finding [HIGH] #1 解消) |
