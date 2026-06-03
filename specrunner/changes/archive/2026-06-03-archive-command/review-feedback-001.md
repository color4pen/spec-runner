# Code Review Feedback — iteration 001

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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | Correctness | `src/cli/progress.ts:158` | `pipeline:complete` ヒントが `"Next: specrunner job finish ${slug}"` のまま。廃止コマンドを案内するため、パイプライン完了後のユーザーが `job finish` を実行して deprecation エラーに遭遇する。`tests/unit/cli/progress.test.ts:136` も同じ誤った値を期待しているため、テストが通っている。 | `progress.ts:158` を `specrunner job archive ${slug}` に変更する。`progress.test.ts:136` の期待値も同様に更新する。 | yes |
| 2 | HIGH | Testing | `tests/` (新規ファイルなし) | `runArchiveOrchestrator` / `runMergeThenArchive` の直接テストが一切ない。`test-cases.md` では TC-003〜TC-009 が automated/must だが、対応するテストファイルが存在しない。`finish-orchestrator.test.ts` は旧 `runFinishOrchestrator` のみを対象としており、新 orchestrator のロジックは直接検証されていない。verification green は既存テストの更新によるものであり、acceptance criteria 「`bun run typecheck && bun run test` が green」は充足しているが、新機能の正しさは未担保。 | `src/core/archive/orchestrator.ts` の統合テストを新設する（最低限: change folder あり正常系・worktree 撤去・awaiting-archive→archived 遷移・terminal status no-op・`job finish` deprecation exit 2）。`runMergeThenArchive` も BLOCKED/CLEAN/MERGED 各ケースのテストを追加する。 | yes |
| 3 | MEDIUM | UX | `src/core/finish/pr-status.ts`, `src/core/finish/preflight.ts`, `src/core/finish/archive-change-folder.ts`, `src/core/finish/orchestrator.ts` | エスカレーション / エラーメッセージの `resumeCommand` が全て `specrunner finish <slug>` のまま。`--with-merge` 失敗時にこれらのメッセージが表示されると廃止コマンドが提示される。spec-review-result-001.md の MEDIUM #1 で既摘出だが実装で未解消。 | 上記4ファイルの `resumeCommand` / `recommendedAction` 内の `specrunner finish` を `specrunner job archive --with-merge` に置換する。 | yes |
| 4 | MEDIUM | Documentation | `README.md:46,83` | README に `job finish` が一次コマンドとして記載されている（`npx specrunner job finish my-feature` 等）。`tests/unit/readme-tc.test.ts:32` も README に `job finish` が含まれることを検証しており、現在はパスしているが正しい状態ではない。 | README.md の `job finish` を `job archive` に置換し、`readme-tc.test.ts:32` の期待値を `job archive` に更新する。 | yes |
| 5 | LOW | Maintainability | `src/core/cancel/runner.ts:10`, `src/core/command/runner.ts:21` | 設計コメントに `awaiting-merge` が残存（機能には影響しない）。 | コメントを `awaiting-archive` に更新する。 | yes |
| 6 | LOW | Testing | `tests/unit/cli/specrunner-worktree-guard.test.ts:82-83` | TC-WG-002 の describe 文が `"job finish from inside a worktree"` のまま。`job archive` の worktree guard テストが別途存在するか確認が必要。 | describe 文を `"job archive from inside a worktree"` に更新するか、`job archive` の worktree guard カバレッジを確認する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 6 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 4 | 0.10 |

- **total**: 7.30

## Summary

アーキテクチャ設計（D1: GitHubClient 非依存、D2: CLI 層で直列合成、D3: remap 方式）は仕様通りに実装されており、`awaiting-merge → awaiting-archive` の rename も正確。`ArchiveOrchestrator` が GitHubClient を import しないことは構造的に保証されている。

ただし **ブロッカーが 2 件**:

1. **`progress.ts` の廃止コマンド案内**: パイプライン完了後のヒントが `job finish` のままで、ユーザーが廃止済みコマンドを実行する。テストも誤った値を期待値としているため、自動テストで検出できていない。
2. **新 orchestrator のテストゼロ**: `runArchiveOrchestrator` / `runMergeThenArchive` に対応するテストファイルが存在しない。`test-cases.md` の must TC が automated と分類されているにもかかわらず未実装。

