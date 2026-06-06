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

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Spec Inconsistency | tasks.md (T-05) | `ResumeCommand.prepare()` が `workspaceOpts.bootstrapState` を設定するタスクチェックアイテムが存在しない。design.md D2 は「PipelineRunCommand.prepare()（初期 state）と ResumeCommand.prepare()（running 遷移後 state）が設定する」と明記しているが、T-02 は pipeline-run.ts のみ列挙。T-05 は「store が null の場合は skip（後続の setupWorkspace seed が新 worktree に running state を書く）」とコメントしているだけで、ResumeCommand 側の対応ステップを明示していない。実装者が tasks.md のみを見た場合、resume-recreate / resume-null 経路での seed が実行されず、新 worktree の slug 正本がコミット済み状態（awaiting-resume）のまま残る。pipeline の in-memory state は running のため機能は継続するが、`job show` 等の状態表示が正しくない窓が生じる。 | tasks.md T-05 に下記チェックアイテムを追加する: `- [ ] src/core/command/resume.ts prepare(): workspaceOpts に bootstrapState: updatedState（running 遷移後 state）を設定し、resume-recreate / resume-null 経路の setupWorkspace seed が running state を新 worktree の slug 正本へ書くことを保証する。` |
| 2 | LOW | Trade-off Documentation | design.md (D5) | WORKSPACE_SETUP_FAILED（local）の failed state が永続化されない点（best-effort skip）は D5 で許容事項として記載されているが、`--json` 出力が in-memory failed state を使う旨が runner.ts の変更仕様（T-04）に明記されていない。実装者が JSON 出力を jobId store から読む旧実装を踏襲した場合、空出力になるリスクがある。 | tasks.md T-04 の WORKSPACE_SETUP_FAILED 変更仕様に「JSON 出力には in-memory の failedState を使う（jobId store を読まない）」を明記する。 |

## Review Notes

### 全体評価

design.md は W1–W6 の全書き込み経路を網羅的に分析し、D1–D7 の設計判断に rationale と alternatives considered を付記している。spec.md の MUST/MUST NOT 記述と Given/When/Then シナリオはテスト可能な粒度で書かれており、tasks.md の T-01→T-09 の順序依存も明確。managed runtime 温存・R1 読み取り経路保護・crash window 許容のスコープ判断は一貫している。

### Finding #1 詳細

現 `resume.ts` L194 の persist を T-05 が `resolveStateStoreByJobId` 経由に変更すると、resume-recreate（worktree 削除済み local job）では sidecar はあるが worktree slug store が存在しないため `store = null` → persist skip になる。その後 T-02 の `setupWorkspace` 内 seed が走るはずだが、`opts?.bootstrapState` が未設定のため seed が実行されない。結果として新 worktree に checkout した branch の commit 済み state（awaiting-resume）が残り、`updateJobState` が worktreePath のみ上書きする状態になる。

pipeline.run() は in-memory の running jobState で動作するため機能的な失敗は起きず、最初の step-level persist で slug 正本が running に修正される。ただし修正前の窓での `job show` 誤表示と、`handlePerJobExit` が `status !== "running"` で早期 return することが起きる。

### セキュリティ評価

OWASP Top 10 の適用範囲として: CLI ツールの state ストレージ移行のため Web 系脆弱性（XSS/SQLi/CSRF）は非該当。`resolveStateStoreByJobId` が sidecar JSON の `worktreePath` を path 解決に使う点は path traversal の潜在リスクだが、sidecar は `.specrunner/local/` 配下の process owner 所有ファイルであり、外部入力経路ではない。`jobId` は `randomUUID()` 生成で外部注入不可。セキュリティ上のブロック事由なし。
