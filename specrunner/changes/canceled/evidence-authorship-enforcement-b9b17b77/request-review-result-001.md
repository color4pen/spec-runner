# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No blocking findings (no HIGH, no decision-needed). Request is ready for pipeline execution.
  - needs-discussion: One or more blocking findings (HIGH or decision-needed) resolvable through discussion.
  - reject:           Multiple blocking findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approve

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
| 1 | MEDIUM | Code assertion accuracy | request.md §現状コードの前提 — "CommitOrchestrator だけが呼ぶ（唯一の persistence owner）" | `JobStateStore.persist()` は CommitOrchestrator 以外にも `pipeline.ts`・`local.ts`・`managed.ts`・`exit-guard.ts`・`resume.ts`・`cancel/runner.ts`・`run-inbox.ts`・`job-state-update.ts`・`workspace-materializer.ts` など 9+ ファイルから直接呼ばれる（Grep で確認）。"唯一の writer" という前提でアーカーを CommitOrchestrator の `JobJournal` インスタンスに限定実装すると、他経路の書込が anchor に反映されず per-node 検査の false-positive が生じ得る。anchor を `JobJournal.persist()` 内に置く（要件2の仕様どおり）なら全経路をカバーできるが、**同一 journal ファイルを指す複数 `JobJournal` インスタンスが並存するため anchor はインスタンスローカルではなくジャーナルパスをキーとした module-level singleton にする必要がある**。| 実装時は anchor を `JobJournal` インスタンスフィールドでなく `Map<eventsPath, digest>` のような module-level singleton として管理し、全 `persist()` 呼び出しが同一アンカーを更新するよう設計する。request.md の前提記述は誤解を招くため、next iteration で "pipeline pipeline-owned code のみが書く（CommitOrchestrator が主経路）" 程度の表現に訂正することを推奨。 |
| 2 | LOW | Line number inaccuracy | request.md §現状コードの前提 — "executor.ts:436 の finalizeStepArtifacts" | 実際には行 436 が `if (!deps.roundOwnsGitEffects) {` ブロック先頭であり、`finalizeStepArtifacts` の呼び出しは行 445。ブロック全体を指す意図であれば "executor.ts:436–459 の finalizeStepArtifacts ブロック" と表記するのが正確。 | 次 iteration で行番号を 445（または 436–459）に修正。実装への影響なし。 |
| 3 | LOW | Line number inaccuracy | request.md §現状コードの前提 — "round-git-scope.ts:54-55" | `pipelineManagedPaths` 関数は行 54–56（`return [...]` まで3行）。行 55 で関数定義が閉じていないため、":54-55" は不完全。 | 次 iteration で ":54-56" に修正。実装への影響なし。 |

## Code Assertion Verification Summary

以下のすべての主要な事実主張をコードで確認した（attestation.json 参照）。

- **journal path**: `specrunner/changes/<slug>/{events.jsonl,state.json}`・`src/store/job-location-resolver.ts`・`stateRoot = worktreePath`（job-catalog.ts:115）✅
- **JobJournal.persist**: events.jsonl append + state.json atomic overwrite ✅
- **commitAndPush**: `git add -A`（commit-push.ts:48）で journal 除外なし（sequential 経路）✅
- **commitFinalState**: `commit-push.ts:105-146`・`messageLabel="checkpoint"` for `awaiting-resume` ✅
- **executor.ts output-contract gate**: 行 404–405 ✅
- **executor.ts captureHeadSha**: 行 461–466 ✅
- **round-git-scope.ts pipelineManagedPaths**: 行 54–56、`[slugStateJsonPath, slugEventsPath, usageJsonPath]` ✅
- **resolve-job.ts → JobStateStore.list**: authenticity 検証なし ✅
- **loadSplitLayout**: jobId 経路（job-state-store.ts:227）✅
- **verify-checkpoint.ts**: fold/counter/profile/identity self-consistency のみ、authenticity なし ✅
- **checkpoint-ref.ts**: `git show <ref>:path` 前例確認 ✅
- **readFileAtCommit / diffPathsBetweenCommits / listCommitChangedFiles / digestArtifacts**: runtime-strategy.ts port に全存在 ✅
- **StepHalt / makeDriftHalt**: executor.ts に import 済み ✅
- **CommitOrchestrator唯一性**: 誤り（finding #1 参照）⚠️

## Architecture Assessment

要件1〜6 の設計は一貫している。特筆すべき点:

- **要件1（journal 非包含 commit）**: round 経路に既存する `pipelineManagedPaths` 除外を sequential の `commitAndPush` に拡張する変更は明快で低リスク。
- **要件2（durable anchor）**: `refs/specrunner/evidence/<branch>` への blob push は既存 `commitFinalState` への add-on として実装可能。agent は push 権を持たないため改竄不能という論拠は正しい。
- **要件3（全経路検証）**: per-node / resume / attach の3経路を明示的に列挙しており、検査漏れ経路がない。
- **要件4（復元 + halt）**: tampered bytes のまま halt するのを禁止する設計は resume/attach 経路の汚染防止として重要。
- **要件5（false-positive 禁止）**: crash-recovery resume での halt を「accepted posture」として要件6 と分離している整理は明確。
- **受け入れ基準 T1–T8**: 各テストに adversarial negative と破壊確認を要求しており、設計の gap を機械的に塞ぐ構造になっている。

finding #1 の anchor singleton 問題は実装者が適切に設計すれば解決できる範囲であり、request.md の要件記述（"JobJournal.persist の書込直前に digest を更新する"）自体は正しい方向を指している。HIGH 相当の阻害要因はなし。
