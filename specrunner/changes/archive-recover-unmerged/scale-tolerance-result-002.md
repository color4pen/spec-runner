# Scale-Tolerance Review Result (Iteration 2)

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    no proportional growth added to periodic paths; growth-dependent costs bounded to manual commands
  - needs-fix:   periodic/tick path gains monotonically-growing cost, or list-API lacks pagination, or accumulating artifacts have no cleanup
  - escalation:  insufficient information to assess growth axis or caller frequency
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
-->

- **verdict**: approved

## Summary

iteration 1 からの delta を中心に確認した。実装は iteration 1 時点と同一コードであり、新たな scale 違反は導入されていない。

**変更点の再確認**

| 箇所 | 変更内容 | スケール観点 |
|------|----------|-------------|
| `job-state-store.ts` section 2b | worktree archive 走査を追加（`includeArchived: true` gate） | 成長軸 = active-worktrees × archive-entries-per-wt |
| `merge-then-archive.ts` Step 1 | `list` → `listWithSourceDirs({ includeArchived: true })` | 既存呼び出し経路と同一 gate |
| `orchestrator.ts` Phase 0 | `list({ includeArchived: true })` — 変更なし（`list` は内部で `listWithSourceDirs` を呼ぶため section 2b がトリガされる） | 手動コマンド・単一実行 |
| `merge-then-archive.ts` | `performPostMergeTransition`（Step 2 resume / Step 4 merge-during-wait / Step 5 fresh merge）の 3 か所で `markJobArchived` を呼ぶ | 単一ファイル I/O、poll ループ内ではなく各経路に 1 回 |

**走査コストの成長軸（更新版）**

| 走査 | 比例先 | gate | 変更 |
|------|--------|------|------|
| section 1b（main checkout archive） | total-archived-jobs | `includeArchived: true` | 既存 |
| section 2（worktree active） | active-jobs | 無条件 | 既存 |
| section 2b（worktree archive）【新規】 | active-worktrees × archive-entries-per-wt | `includeArchived: true` | 新規 |

section 2b の成長軸は **active-worktrees**（= 実行中 job 数）であり、`runPostMergeCleanup` による worktree 除去で上限がリセットされる。単調増加する historical archive 件数には比例しない。

**呼び出し経路の頻度（再確認）**

`includeArchived: true` 経路への追加:
- `archive --with-merge` Step 1（今回変更）: 手動コマンド、1 run に 1 回
- `orchestrator.ts` Phase 0（plain `job archive`）: `list → listWithSourceDirs` 経由、手動コマンド
- `resolveId`（既存）: prefix 解決、手動コマンド
- `ps --all` / `job show`（既存）: 手動コマンド

いずれも tick / exit-guard / polling ループではない。section 2b が定期実行経路に新規コストを追加していないことを確認した。

**wait ループ内 API 呼び出し（再確認）**

Step 4 wait ループ内の `getPullRequest` + `getCheckStatus` は既存挙動と完全に同一。`performPostMergeTransition`（`markJobArchived`）は MERGED 確定後に 1 回呼ばれるのみで、ループ内では実行されない。

**iteration 1 の finding #1（redundant readdir）の状態**

section 2 と section 2b が `.git/specrunner-worktrees/` に対して独立して `fs.readdir` を呼ぶ点は iteration 1 から変化なし。iteration 1 で「今回のスコープ外」として LOW 判定した通り、コスト軸は O(active-jobs) で scale 違反ではない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Redundant I/O | `src/store/job-state-store.ts` | section 2 と section 2b がそれぞれ独立して `fs.readdir(worktreesDir, { withFileTypes: true })` を呼ぶ（lines 292-319 / 329-362）。`.git/specrunner-worktrees/` のディレクトリ列挙が 2 回走る。コスト軸は O(active-jobs) であり archive 歴史に比例しないため scale 違反ではない（iteration 1 から継続）。 | `includeArchived === true` ブロック冒頭で section 2 の worktreeDirs をキャッシュし section 2b で再利用する、または section 2 のループ内で archive 走査を fold する（section 2 ループの中に section 2b の inner ループを埋め込む）。本変更のスコープ外。 |
