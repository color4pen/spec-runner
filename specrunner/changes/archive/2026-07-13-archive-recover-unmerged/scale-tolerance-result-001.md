# Scale-Tolerance Review Result

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

変更の中心は `listWithSourceDirs` への section 2b（worktree archive 走査）追加と、`merge-then-archive` Step 1 の `list` → `listWithSourceDirs` 切り替えである。スケール観点から以下を確認した。

**走査コストの成長軸**

| 走査 | 比例先 | gate |
|------|--------|------|
| section 1b（main checkout archive） | total-archived-jobs | `includeArchived: true`（既存） |
| section 2（worktree active） | active-jobs | 無条件（既存） |
| section 2b（worktree archive）【新規】 | active-jobs × archive-entries-per-wt | `includeArchived: true`（新規） |

section 2b の成長軸は **active-worktrees**（= 実行中 job 数）であり、単調増加する historical archive 件数ではない。archive-record 後 merge まで stuck している worktree は通常 0 〜 1 件であり、merge+cleanup 後に worktree ごと除去される。したがって section 2b のコストは archive 歴史が増えても比例成長しない。

**呼び出し経路の頻度**

`includeArchived: true` 呼び出しは以下に限定される（既存 + 今回変更）:

- `archive --with-merge`（Step 1: 今回 `listWithSourceDirs` に切り替え）
- `job archive` plain（orchestrator Phase 0: `list` 経由、既存）
- `resolveId`（prefix 解決）
- `ps --all` / `job show`

いずれも **手動コマンド**（tick / exit-guard / polling ループではない）。section 2b が定期実行経路に新規コストを追加していないことを確認した。

**GitHub API 一覧呼び出し**

本変更は GitHub API の追加呼び出しを一切含まない。`merge-then-archive` の wait ループ内 `getPullRequest` / `getCheckStatus` は既存挙動であり変更なし。

**成果物の蓄積と cleanup**

worktree archive entries（section 2b の走査対象）は `runPostMergeCleanup` による worktree 除去で cleanup される。新たに永続的に増え続けるファイル・ディレクトリは作成されていない。

**軽微な非効率**

sections 2 と 2b が `.git/specrunner-worktrees/` に対して `fs.readdir` を 2 回実行する（詳細は findings #1）。コスト軸は O(active-jobs) であり archive 歴史に比例しないため blocking ではない。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Redundant I/O | `src/store/job-state-store.ts` | section 2 と section 2b がそれぞれ独立して `fs.readdir(worktreesDir, { withFileTypes: true })` を呼ぶ。`.git/specrunner-worktrees/` のディレクトリ列挙が 2 回走る。コスト軸は O(active-jobs) であり archive 歴史には比例しないため scale 違反ではないが、同一 `readdir` 結果を再利用すれば削減可能。 | `includeArchived === true` ブロック冒頭で `worktreeDirs` を `reuse` するか、section 2 のループ内で archive scan を合算する（section 2b を 2b のループとして section 2 に fold する）。今回のスコープ外だが次回 list 整理時の候補。 |
