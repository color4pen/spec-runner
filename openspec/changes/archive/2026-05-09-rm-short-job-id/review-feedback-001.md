# Code Review: rm-short-job-id (Iteration 1)

- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-09
- **verdict**: approved

## Summary

実装は仕様（design.md D1-D5）に忠実で、`resolveJobId` を store 層に配置し、`rm` と `resume` の両方から正しく利用している。エラーハンドリング、フォールバックロジック、後方互換性の維持はすべて良好。typecheck / test ともに green（137 files, 1348 tests pass）。

CRITICAL / HIGH の指摘はなく approved とする。MEDIUM 1 件は次のリファクタで対応推奨。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/resolve-job-id.test.ts:102-132 | TC-04（AMBIGUOUS_JOB_ID テスト）が random UUID の共通 prefix に依存。2 つの UUID v4 の先頭 hex が一致する確率は 1/16 ≈ 6% であり、約 94% の実行で `commonPrefix.length === 0` により `return` してテストをスキップする。must シナリオが非決定的にスキップされている | `listJobStates` を mock して deterministic な UUID リストを返すか、`createJobState` 後にジョブファイルを直接リネームして既知の prefix を持つ UUID を作る。あるいは空文字 prefix `""` で全件 match を利用する |
| 2 | LOW | correctness | src/state/store.ts:137 | `prefix.length === 36` は UUID 形式ではなく長さのみで判定。36 文字の非 UUID 文字列も pass-through する | design.md D2 で「存在確認は `loadJobState` に委ねる」と明記しており、現状は意図通り。UUID 正規表現チェックの追加は任意 |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 8 | 仕様通り。prefix match、エラー分岐、フォールバック順序すべて正確 |
| security | 9 | CLI ローカル操作のみ。入力は job ID prefix でインジェクションリスクなし |
| architecture | 9 | `resolveJobId` の store 配置は適切。rm/resume からの呼び出しパターンも統一的 |
| performance | 9 | 完全 UUID パスで `listJobStates` をスキップする最適化が入っている |
| maintainability | 8 | JSDoc 完備、エラーメッセージが具体的、既存パターンに合致 |
| testing | 6 | TC-01〜07 の unit tests 実装済みだが TC-04 が非決定的。integration tests（TC-08〜16）は未実装 |

**Total**: 0.30×8 + 0.25×9 + 0.15×9 + 0.10×9 + 0.10×8 + 0.10×6 = **8.2**

## Scenario Coverage (test-cases.md)

| TC | Priority | Category | Implemented | Notes |
|----|----------|----------|-------------|-------|
| TC-01 | must | unit | ✅ | spy で `listJobStates` 非呼出を検証 |
| TC-02 | must | unit | ✅ | |
| TC-03 | must | unit | ✅ | error code + instanceof 両方検証 |
| TC-04 | must | unit | ⚠️ | 非決定的スキップ（Finding #1） |
| TC-05 | must | unit | ✅ | |
| TC-06 | must | unit | ✅ | |
| TC-07 | must | unit | ✅ | |
| TC-08 | must | integration | — | integration scope |
| TC-09 | must | integration | — | integration scope |
| TC-10 | must | integration | — | integration scope |
| TC-11 | must | integration | — | integration scope |
| TC-12 | should | integration | — | integration scope |
| TC-13 | must | integration | — | integration scope |
| TC-14 | must | integration | — | integration scope |
| TC-15 | must | integration | — | integration scope |
| TC-16 | should | integration | — | integration scope |
| TC-17 | must | verification | ✅ | typecheck + test green |

## Verdict Rationale

- CRITICAL: 0, HIGH: 0 → 承認阻止条件に該当しない
- Total score 8.2 ≥ 7.0（pass threshold）
- 実装は design.md の全決定事項（D1-D5）に準拠
- TC-04 の非決定的スキップは MEDIUM であり、実装の正しさには影響しない
