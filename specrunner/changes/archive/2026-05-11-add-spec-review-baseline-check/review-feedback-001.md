# Code Review — add-spec-review-baseline-check — Iteration 1

- **verdict**: approved

## Summary

実装は design.md に忠実で、変更は最小限かつ集約的。enrichContext の optional hook 設計は buildMessage の pure function 制約を壊さず、将来の拡張性も確保している。型チェック・全 1610 テスト PASS。指摘は MEDIUM 1 件、LOW 2 件のみ。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.30** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/adapter/claude-code/agent-runner.ts:104 | `stepCtx.dynamicContext!` の non-null assertion。StepContext の dynamicContext は型上 optional であり、enrichContext のシグネチャは `DynamicContext`（non-optional）を要求する。実行時は collectDynamicContext() が必ず値を返すため実害はないが、型安全性が破れている。同じパターンが managed-agent/agent-runner.ts:308 にも存在 | enrichContext 呼び出し前に `if (stepCtx.dynamicContext)` ガードを追加し、undefined の場合は enrichContext をスキップする。または enrichContext のシグネチャを `DynamicContext \| undefined` に変更して内部で対応する |
| 2 | LOW | performance | src/core/step/spec-review.ts:93-99 | capability ごとの baseline spec 読み取りが sequential for-loop。通常 1-3 capability なので実害はないが、capability 数が増えた場合に I/O 待ちが線形に増加する | `Promise.all(capabilities.map(...))` で並列化する。現時点では対応不要 |
| 3 | LOW | testing | tests/prompts/spec-review-system.test.ts | TC-008, TC-009, TC-011（must priority）の enrichContext I/O 挙動テストが未実装。design.md の Scope Boundaries で「enrichContext の unit test は追加しない」と明記されており意図的だが、test-cases.md の must priority と乖離がある | design decision として許容。将来 enrichContext を他 Step に展開する際にテスト戦略を再検討する |

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-001 | must | covered | DynamicContext 型定義で確認 |
| TC-002 | must | covered | tests/git/dynamic-context.test.ts |
| TC-003 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-004 | must | structural | adapter コード順序で確認（unit test 困難） |
| TC-005 | must | covered | 既存テスト 1610 PASS で regression なし |
| TC-006 | must | structural | adapter コード順序で確認 |
| TC-007 | must | covered | 既存テスト PASS |
| TC-008 | must | not-tested | design.md で意図的に省略（I/O mock 複雑） |
| TC-009 | must | not-tested | 同上 |
| TC-010 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-011 | must | not-tested | design.md で意図的に省略 |
| TC-012 | should | not-tested | 同上 |
| TC-013 | must | structural | adapter にて catch なし確認 |
| TC-014 | must | structural | buildMessage に I/O なし確認 |
| TC-015 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-016 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-017 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-018 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-019 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-020 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-021 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-022 | must | covered | tests/prompts/spec-review-system.test.ts |
| TC-023 | must | covered | bun run typecheck PASS |
| TC-024 | must | covered | bun run test 1610 PASS |
| TC-025 | must | covered | 全 143 test files PASS |
| TC-026 | should | structural | adapter コードで spread 確認 |
| TC-027 | should | structural | enrichContext が specs/ 子ディレクトリのみ列挙確認 |

## Verification

- `bun run typecheck`: PASS (0 errors)
- `bun run test`: 143 files, 1610 tests PASS
