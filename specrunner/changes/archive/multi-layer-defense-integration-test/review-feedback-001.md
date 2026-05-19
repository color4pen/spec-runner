# Code Review — multi-layer-defense-integration-test — iter 1

## Summary

- **verdict**: approved
- **date**: 2026-05-19
- **reviewer**: code-review agent

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|---|---|---|---|---|
| 1 | LOW | dead-code | tests/multi-layer-defense.test.ts:141 | `designBranch` が `buildPipelineMockClient` の opts で destructure されているが、関数本体で一度も参照されていない。pipeline-integration.test.ts からのコピー時の残滓。 | `designBranch = "feat/test-branch",` の行と opts 型の `designBranch?` を削除する。または pipeline-integration.test.ts 側と同じ状態なら放置でも可（回帰なし）。 |
| 2 | LOW | documentation | tests/multi-layer-defense.test.ts:135 | JSDoc コメント「sess2=spec-fixer-1, sess3=spec-review-1」の順序がパイプラインの実際の実行順（design → dsv → spec-review → spec-fixer）と逆になっており、sessionIds 配列の名称と合わせると誤解を招く。 | コメントを「sess2=spec-review-1, sess3=spec-fixer-1, sess4=spec-review-2, …」に修正する。テスト動作への影響はない（session ID はラベルのみ）。 |
| 3 | LOW | documentation | specrunner/changes/multi-layer-defense-integration-test/design.md:55 | D6「delta spec は作成しない」と記述しているが `specrunner/specs/multi-layer-defense-integration-test/spec.md` が実際に存在する。spec-review-result-001.md finding #1 で既指摘。 | D6 の記述を実態（type=new-feature のため delta spec を作成した）に合わせて修正する。 |

## Coverage Check

### test-cases.md (must シナリオ) vs 実装

| TC | Priority | 実装行 | verdict assert | fixer route assert | 判定 |
|---|---|---|---|---|---|
| TC-MLD-01 happy path | must | L259-303 | `awaiting-merge` + dsv×1 approved + spec-review×1 approved | delta-spec-fixer undefined + spec-fixer undefined | ✓ |
| TC-MLD-02 Sub-B catch | must | L316-366 | dsv×2 approved + spec-review×2 [needs-fix→approved] | spec-fixer×1 defined, delta-spec-fixer undefined | ✓ |
| TC-MLD-03 Sub-A catch | must | L379-437 | dsv×2 [needs-fix→approved] + spec-review×1 approved | delta-spec-fixer×1 defined, spec-fixer undefined | ✓ |
| TC-MLD-04 5-a (dsv sole) | must | L452-513 | dsv×2 [needs-fix→approved] + `no-specs-for-required-type` repr | delta-spec-fixer×1, spec-fixer undefined | ✓ |
| TC-MLD-05 5-b (spec-review sole) | must | L530-581 | dsv×2 approved (bugged) + spec-review×2 [needs-fix→approved] | spec-fixer×1, delta-spec-fixer undefined | ✓ |
| TC-SCAFFOLD-01 typecheck | must | — | verification-result.md: typecheck passed | — | ✓ |
| TC-GREEN-01 all tests green | must | — | verification-result.md: 2215 passed | — | ✓ |

### 受け入れ基準チェック

| 基準 | 判定 |
|---|---|
| `tests/multi-layer-defense.test.ts` 新規作成 | ✓ (581 lines) |
| TC-MLD-01〜05 全 5 ケース実装 | ✓ |
| Sub-B catch が spec-fixer 経由 (delta-spec-fixer ではない) | ✓ L355-361 |
| Sub-A catch が delta-spec-fixer 経由 (spec-fixer ではない) | ✓ L420-432 |
| 2 層同時 failure でも残る 1 層が catch し完走 | ✓ TC-MLD-04/05 |
| mock agent + 実物 pipeline state machine | ✓ vi.mock×3 + createManagedAgentRunner 実物 |
| `buildRequest()` type デフォルト `spec-change` (D5) | ✓ L123 |
| PR #282 reproduction: `no-specs-for-required-type` | ✓ TC-MLD-04 L459-468 |
| dsv bugged セマンティクスがコメント記録 (TC-MLD-05) | ✓ L519-525 |
| `bun run typecheck && bun run test` green | ✓ verification-result.md 全 2215 passed |

## 総評

テストロジック・state transition アサーション・mock 構成はすべて設計通りに実装されており、要件の 5 シナリオ全てを網羅している。指摘はすべて LOW（dead code / comment / doc 不整合）でテスト動作への影響はない。
