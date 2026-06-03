# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Quality | design.md / tasks.md | `archive-change-folder.ts` と `commit-archive.ts` に `resumeCommand: "specrunner finish <slug>"` が hardcode されている。Non-Goals が「ロジック変更なし」を宣言しているため T-01〜T-08 にこれら文字列の更新タスクが含まれておらず、archive 失敗時のエラーメッセージが非推奨コマンドへ誘導する。 | T-02 または T-08 に `archive-change-folder.ts` / `commit-archive.ts` の `resumeCommand` 文字列を `specrunner job archive <slug>` へ更新するサブタスクを追加する。Non-Goals の意図が「ビジネスロジック変更なし」であることを明記し、文字列更新は許容とする。 |
| 2 | MEDIUM | Scope | request.md | 受け入れ基準に `request-merge` skill の追従が含まれているが、`.claude/skills/` に `request-merge` ディレクトリが存在しない。global ユーザースキルであればこの PR スコープ外で検証不可能。 | 受け入れ基準から `request-merge` を削除するか、「global スキルのため本 PR 対象外」と注記する。 |
| 3 | MEDIUM | Design | design.md (D5) | Phase 1 が main に直接 commit + push する設計。"Require a pull request before merging" の branch protection が有効なリポジトリでは push が拒否され `job archive` が機能しない。spec / design にこの前提条件の記載がない。 | design.md の Risks/Constraints に「archive には main への直接 push 権限が必要。PR 必須の branch protection が有効な場合は push 保護の例外設定が必要」と明記する。 |
| 4 | LOW | Coverage | spec.md | `--with-merge` 実行時に PR が既に MERGED の場合のシナリオが spec.md にない（T-03 と design.md には記述あり）。また「job が既に archived → no-op で exit 0」シナリオも spec.md にない。 | spec.md に「PR 既 MERGED 時に --with-merge → merge スキップして archive 実行」シナリオと「job 既 archived → no-op exit 0」シナリオを追加する。 |
