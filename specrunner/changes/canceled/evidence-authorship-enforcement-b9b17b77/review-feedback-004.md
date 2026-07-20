# Code Review Feedback — iteration 004

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

- **verdict**: approved
- **iteration**: 004

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | correctness | src/core/resume/verify-journal-authenticity.ts | `restoreResumeJournal` がworktreeケースで `git show` に渡すパスを誤算する（iter 003 F-1 未修正）。`sourceChangeDir` が `/repo/.git/specrunner-worktrees/<slug>/specrunner/changes/<slug>` のとき、`cwd`（`/repo`）を strip した結果 `.git/specrunner-worktrees/<slug>/specrunner/changes/<slug>` となり、`git show origin/<branch>:.git/specrunner-worktrees/.../events.jsonl` は失敗する。restore 失敗は警告ログで catch されてhaltは発生するが、D4「復元してから halt」の復元がworktreeケースで機能しない。TC-030 は `cwd=tmpdir` / `changeDir=tmpdir/specrunner/changes/<slug>` でno-worktreeケースのみ検証しており、worktreeケースの回帰テストが存在しない。 | `restoreResumeJournal` の入力に `slug` を追加し、`git show` のパスに常に `changeFolderPath(slug) + "/events.jsonl"` を使う（line 139-144 の strip ロジックを削除）。`runtime-strategy.ts` のポートシグネチャ（`RuntimeStrategy.restoreResumeJournal` と `RealRuntimeStrategy.restoreResumeJournal` の両方）、`local.ts`・`managed.ts` の実装、`resume.ts` の呼び出し側（`slugForVerify` が既にある）を揃えて更新する。worktreeケース（`cwd=/repo`, `sourceChangeDir=/repo/.git/specrunner-worktrees/<slug>/specrunner/changes/<slug>`）の回帰テストを追加する。 | yes |

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

iteration 003 から実装コードへの変更はなし（checkpoint コミットのみ）。F-1（restoreResumeJournal のworktreeパス誤算）は未修正のまま持ち越し。

設計骨格は正しく実装されており、全体スコアは変わらない。authorship 分離（sequential `git add -A` の journal 除外）、in-process anchor 累積（`JournalAnchorHolder`）、durable anchor の origin push、per-node 検証＋restore＋halt（executor wiring）、resume authenticity 検証（`verifyResumeJournalAuthenticity`、branch null / anchor absent → skip）、attach authenticity（`verifyCheckpoint` に anchorDigest 述語追加、unavailable → fail-closed）、managed no-op、factory での `JournalAnchorHolder` 注入、round sweep — すべて設計どおりに配線されている。

**F-1（medium）**: `restoreResumeJournal` がworktreeパスから誤った `git show` パスを導出する問題が残存。halt（security invariant）は常に発生するが「復元してから halt」の「復元」がworktreeケース（jobs の通常実行パス）で失敗し、ユーザーが手動復元を強いられる。修正は slug 引数追加 + changeFolderPath 使用 + ポート定義（runtime-strategy.ts の RuntimeStrategy と RealRuntimeStrategy 両方）・実装（local.ts・managed.ts）・呼び出し側（resume.ts、slugForVerify が既にある）の一斉更新 + worktreeケース回帰テスト追加。

