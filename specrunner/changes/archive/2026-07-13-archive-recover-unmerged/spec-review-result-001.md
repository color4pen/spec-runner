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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Summary

設計と仕様は一貫しており、問題を正確に診断している。4 つの設計決定（D1: 遷移遅延 option、D2: folder 位置シグナル、D3: post-merge 遷移、D4: worktree archive 走査）は互いに補完し、要件を満たす。コアロジックの検証:

- `JobStateStore.list` が `listWithSourceDirs` の薄いラッパーであるため、D4 の走査追加が `list` と `listWithSourceDirs` の両方の呼び出し元（merge-then-archive Step 1 と orchestrator Phase 0）に自動で適用される ✓
- `composeSplitLayout` は明示的パスを引数に取るため、D4 の worktree archive 走査は section 1b（main checkout archive）と対称に実装できる ✓
- `archiveChangeFolder` は active folder 不在時 skip、`commitArchive` は staged 変更なし時 skip — idempotent 再実行が保証される ✓
- D2 のシグナル `path.basename(path.dirname(sourceChangeDir)) === "archive"` は全走査 section（active: "changes"、archive: "archive"）で正しく機能する ✓
- post-merge `markJobArchived(slug, recordDir)` は `recordDir = worktreePath` として渡すことで、`resolveCanonicalStateDir` が worktree の `changes/archive/<dated>-<slug>/` を正しく発見する ✓
- セキュリティ上の懸念なし（認証・入力バリデーション・ファイルパス処理に変更なし）

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Spec clarity | spec.md / design.md | "記録済み + PR merged の crash resume" シナリオで "job status が `archived` へ遷移する" と記述されているが、D3 の post-merge `markJobArchived` は worktree の state.json に書き込み、cleanup で worktree を撤去する。merged main の archive 内 state.json は `awaiting-archive` のまま残る（設計の既知トレードオフ）。テスト実装者が "最終永続状態の検証" として誤解するリスクがある。 | T-05 のテストコメントか設計 note に「`markJobArchived` が呼ばれたことを確認する（worktree 撤去後の main の永続状態は `awaiting-archive` のまま — 既知トレードオフ）」と明記すると実装時の誤解を防げる。スペック自体の変更は不要。 |
| 2 | LOW | Consistency | tasks.md (T-02) | `composeSplitLayout` の第 3 引数 `{ slug, stateRoot: worktreePath }` について、section 1b では `stateRoot: repoRoot` を渡しているのと同様に、worktree archive での `stateRoot` が何を表すかの明示がない。 | T-02 に "section 1b の呼び出しパターン（`stateRoot = worktreePath`）を参照して実装する" 旨を一行添えると実装ミスを防げる。 |
