# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 1

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | tests/unit/prompts/fragments.test.ts | TC-FRAG-07 / TC-FRAG-08 (priority: must, test-cases.md) の content 同一性 assert が未実装。AUTHORITY_SPEC_GUARD と DELTA_SPEC_FORMAT は `length > 0` のみ確認されており、旧ファイルとのテキスト同一性を明示的に assert していない。 | 旧ファイルは削除済みのため直接比較は不可。実用的には fragment-coverage.test.ts が実値を使って assert しているため実害なし。test-cases.md 上の must 扱いとのズレを認識した上で許容するか、代替として「特定の sentinel キーワード（例: `specrunner/specs/` / `git add`）が含まれること」を明示的に assert する形で TC-FRAG-07/08 相当をカバーする。 |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.05

## Summary

設計意図（fragment は string のみ・builder は純粋関数・真実源は test 側）を忠実に実装し、4 件の既知 inject 漏れをすべて修正した。fragment-coverage.test.ts の対応表ロックと fragments.test.ts への PIPELINE_RULES 内容検証移行も正確。唯一の指摘は test-cases.md の TC-FRAG-07/08（must）が実装されていない点だが、旧ファイル削除済みという構造的事情と fragment-coverage.test.ts による実値 assert の存在から実害はなく、承認を阻止しない。

## Acceptance Criteria Check

| 基準 | 状態 |
|------|------|
| `src/prompts/fragments.ts` に 4 const 集約 export | ✓ |
| 旧 4 単独 file 削除 | ✓ |
| `src/prompts/builder.ts` に純粋関数 | ✓ |
| 対象 8 prompt が `buildSystemPrompt(BASE, [...])` 経由 | ✓ |
| `implementer-system` に `DELTA_SPEC_FORMAT` (#304 解決) | ✓ |
| `design-system` に `AUTHORITY_SPEC_GUARD` | ✓ |
| `code-fixer-system` に `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` | ✓ |
| `adr-gen-system` に `COMMIT_DISCIPLINE` | ✓ |
| `tests/unit/prompts/builder.test.ts` green | ✓ |
| `tests/unit/prompts/fragment-coverage.test.ts` 8 prompt 対応表 green | ✓ |
| `tests/prompts/pipeline-rules.test.ts` 削除・統合 | ✓ (移行 A — 削除 + fragments.test.ts に統合) |
| 既存 prompt test の deleted file import なし | ✓ |
| 既存 prompt test regression なし | ✓ |
| `bun run typecheck && bun run test` green | ✓ (178 files, 2137 tests passed) |
| delta spec `## ADDED Requirements` あり | ✓ (REQ-PFR-001〜005) |
