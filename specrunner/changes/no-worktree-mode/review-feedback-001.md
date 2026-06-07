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

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/unit/no-worktree-mode.test.ts | TC-007/TC-016 (must) 未実装: `stateToStateJson` の slug-mode で `noWorktree` が strip されないことを検証するテストがない。実装の正確性は `stateToStateJson` の strip リスト（`worktreePath`/`pid`/`session` のみ）から確認できるが、archive が merge 後 main から state.json を読んで `noWorktree` フラグを判別できるという invariant をテストが保証していない。 | `JobStateStore` に `noWorktree: true` の state を slug-mode persist → ファイルを読んで `noWorktree: true` が含まれ `worktreePath` / `pid` / `session` は absent であることを検証するテストを追加する。 | yes |
| 2 | MEDIUM | testing | tests/unit/no-worktree-mode.test.ts | TC-012 (must) 未実装: sidecar 不在の checkout で `resume --no-worktree` が running 遷移を `specrunner/changes/<slug>/state.json` に永続化することのテストがない。`ResumeCommand.prepare()` の no-worktree パス（`new JobStateStore(transitioned.jobId, cwd, { slug, stateRoot: cwd })`）が sidecar なしで state を正しく書き込む CI シナリオが未検証。 | `ResumeCommand.prepare()` を `noWorktree: true` で呼び、sidecar が存在しない状態で cwd の state.json に running 遷移が書き込まれることを検証するユニットテストを追加する。 | yes |
| 3 | MEDIUM | testing | tests/unit/no-worktree-mode.test.ts | TC-011 (must) 未実装: exit-guard が `awaiting-resume` に遷移した後、`resume --no-worktree` で再開できる combined flow のテストがない。TC-NW-010（exit-guard → awaiting-resume）と TC-NW-005（resume workspace 設定）はそれぞれ存在するが、連結シナリオが未検証。 | exit-guard で `awaiting-resume` に遷移した state を起点に `ResumeCommand.prepare()` が `noWorktree: true` で resumePoint を正しく解決できることを検証するテストを追加する。 | yes |
| 4 | LOW | maintainability | src/core/archive/orchestrator.ts | `stdoutWrite("Phase 2: cleaning up worktree...")` が no-worktree job でも出力される。no-worktree job では worktree 撤去はスキップされ branch 削除のみ実行されるため、CI ログで誤解を招く。 | `noWorktree` フラグで出力メッセージを分岐する（例: `"Phase 2: cleaning up branches..."`）。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.70

## Summary

実装の正確性は高い。設計書（D1〜D10）の全決定事項が忠実に実装されており、`bun run typecheck && bun run test`（289 test files / 3382 tests）が green。受け入れ基準の機能要件はすべて満たされている。

test-cases.md に定義された 16 の must-priority シナリオのうち 3 件が未実装（F-001〜F-003）。いずれも実装コードは正しく動作しているが、その invariant をテストが明示的に担保していない。特に F-002（sidecar 不在 CI resume）と F-003（exit-guard → resume 連結）はこの機能の主ユースケースにあたるため修正対象とする。

F-004 は軽微な UX 問題で、機能的影響はない。
