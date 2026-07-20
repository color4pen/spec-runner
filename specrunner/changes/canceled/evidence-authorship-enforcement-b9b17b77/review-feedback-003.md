# Code Review Feedback — iteration 003

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
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 003

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | correctness | src/core/resume/verify-journal-authenticity.ts | `restoreResumeJournal` が worktree ケースで `git show` に渡すパスを誤算する。`sourceChangeDir` が `/repo/.git/specrunner-worktrees/<slug>/specrunner/changes/<slug>` のとき、`cwd`（`/repo`）を strip した結果 `.git/specrunner-worktrees/<slug>/specrunner/changes/<slug>` となり、`git show origin/<branch>:.git/specrunner-worktrees/.../events.jsonl` は失敗する（`.git/` 配下は git tree に追跡されない）。restore 失敗は警告ログで catch され halt は正常に発生するが、design D4「復元してから halt」の復元が worktree ケースで機能しない。次 resume も同じ経路をたどり手動介入なしに recovery できない状態になる。no-worktree ケース（`stateRoot = cwd`）は影響なし。 | `restoreResumeJournal` の入力に `slug` または `changeRelPath`（`changeFolderPath(slug)` の戻り値）を追加し、`git show` のパスに常に `changeFolderPath(slug) + "/events.jsonl"` を使う。呼び出し側 `resume.ts` では既に `slugForVerify` が手元にあり、`runtime-strategy.ts` ポートシグネチャも同様に更新する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.65

## Summary

iteration 002 の2点（TC-022-exec アサーション・committed-tree 歯 fail-open）は両方修正済み。

- `expect.any(String) || null` → `headBeforeStep: null` の直接チェックに修正済み（executor から渡す `headBeforeStep` は captureHeadSha が /tmp/fake-worktree 相手で null を返すため正しい）。
- committed-tree 歯の `diffPathsBetweenCommits` が unavailable → 旧来 skip（fail-open）から `{ kind: "tamper", detail: "committed-tree diff unavailable — fail-closed halt to prevent bypass" }` 返却（fail-closed）に修正済み。

設計の骨格は正しく実装されている。authorship 分離（sequential `git add -A` の journal 除外 + `pipelineManagedPaths` pathspec）、in-process anchor 累積（`JournalAnchorHolder` の fresh/delta/fast/seed 全系列）、durable anchor の origin push（`pushEvidenceAnchor`、checkpoint 時のみ best-effort）、per-node 検証＋restore＋halt（executor wiring）、resume authenticity（`verifyResumeJournalAuthenticity`、branch null / anchor absent → skip）、attach authenticity（`verifyCheckpoint` に `anchorDigest` 述語追加、unavailable → fail-closed）、managed no-op（全 seam で skip / false / no-op）、factory での `JournalAnchorHolder` 注入、round sweep（`parallel-review-round.ts` の `commitJournalArtifacts` 呼び出し）— すべて設計どおりに配線されている。typecheck green、test suite は iteration 002 修正後に green。

**F-1（medium）**: `restoreResumeJournal` が worktree path から誤った `git show` パスを導出する。halt（security invariant）は常に発生するが「復元してから halt」の「復元」が worktree ケースで失敗し、ユーザーが手動復元を強いられる。修正は `slug`（または `changeRelPath`）を引数に追加して `changeFolderPath(slug)` を `git show` のパスに使う、1〜2 ファイルの変更で完了する。
