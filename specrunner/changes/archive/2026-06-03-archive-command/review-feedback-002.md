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
| 1 | MEDIUM | Testing | `tests/unit/architecture/core-invariants.test.ts:430` | status ハードコード禁止の invariant パターンに `awaiting-merge` が残り `awaiting-archive` が含まれていない。`src/store/` / `src/core/` 内で `status: "awaiting-archive"` が直接書かれても検出されない。 | パターン文字列の `awaiting-merge` を `awaiting-archive` に置換する（`archived` は既にある）。 | no |
| 2 | LOW | Testing | `tests/unit/core/archive/orchestrator.test.ts` | TC-002（ArchiveOrchestrator が GitHubClient を import しない）は test-cases.md で unit/must 分類だが、自動テストが存在しない。現在は構造的に import がないことで満たされているが、機械的な保証はない。 | `orchestrator.ts` の import 一覧に `github-client` を含まないことを grep で assert するテストケースを追加する。 | no |
| 3 | LOW | Maintainability | `src/core/cancel/runner.ts:10`, `src/core/command/runner.ts:21` | ソースコードコメントが `awaiting-merge` のまま（iteration 001 の LOW #5 未対応）。機能影響なし。 | コメントを `awaiting-archive` に更新する。 | no |
| 4 | LOW | Testing | 複数テストファイル（`cancel/runner.test.ts`, `command/runner.test.ts`, `ps-filter.test.ts`, `reconcile.test.ts`, `finish-orchestrator.test.ts`, `finish-job-state.test.ts`） | describe / it 文字列が `awaiting-merge` のままで、実際の assertion は正しく `awaiting-archive` を使用している。テスト出力が誤解を招く。 | describe / it の文字列を `awaiting-archive` に更新する。 | no |
| 5 | LOW | Testing | `tests/unit/cli/specrunner-worktree-guard.test.ts:82-94` | TC-WG-002 は deprecated な `["job", "finish"]` を対象にしており、主コマンドである `["job", "archive"]` の worktree guard テストが存在しない（TC-016 "should"）。iteration 001 の LOW #6 未対応。 | TC-WG-002 の対象を `["job", "archive"]` に変更するか、`archive` 向けの TC-WG-009 を追加する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.90

## Summary

iteration 001 の 2 件の HIGH ブロッカーはいずれも解消されている。

1. **`progress.ts` 廃止コマンド案内**: `job archive` に修正済み。`progress.test.ts` の期待値も更新済み。
2. **新 orchestrator テストゼロ**: `tests/unit/core/archive/orchestrator.test.ts`（TC-003/005/006/013）と `merge-then-archive.test.ts`（TC-008/009/014）が新設され、test-cases.md の must ケースをカバーしている。

architecture 設計（D1: ArchiveOrchestrator に GitHubClient 非依存・D2: CLI 層で直列合成・D3: load 時 remap）は仕様通りに実装されている。`awaiting-merge → awaiting-archive` rename も正確で、`bun run typecheck && bun run test`（3088 tests）が green。

残留項目は MEDIUM 1 件（invariant テストのパターン漏れ）と LOW 4 件（stale コメント・テスト文字列・TC-016 カバレッジ）のみで、機能正確性・セキュリティ・アーキテクチャに影響しない。すべて Fix=no（次イテレーション不要）とする。
