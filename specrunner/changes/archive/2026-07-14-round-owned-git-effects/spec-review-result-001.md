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

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | Design Gap | design.md / tasks.md T-04 | `commitRoundArtifacts` が throw（push 失敗）した場合、sequential の commit 失敗（`makeCommitFailHalt` → 明示的エラーコード）と違い、pipeline.run() の safety-net catch に流れて `PIPELINE_UNHANDLED_ERROR` になる。エラーコードの粒度が粗く診断性が下がる。 | `round.run()` 内で `commitRoundArtifacts` の throw を catch し、push 失敗を escalation outcome + `PUSH_FAILED` 等の固有 error code で返すか、tasks.md に「push 失敗は PIPELINE_UNHANDLED_ERROR + awaiting-resume で許容する（sequential の commitFailHalt と同等扱い）」と明示して設計意図を記録する。 |
| 2 | LOW | Correctness | design.md D3 / tasks.md T-04 | `headSha`（→ `approvedAtCommit`）は `commitRoundArtifacts` より前に `captureHeadSha` で取得されるため、ラウンド commit 後の HEAD を指さない。invalidation の `listChangedFiles(approvedAtCommit, ...)` がラウンドの宣言出力を「変更済み」と見なしうる。実際の reviewer activation paths は `src/**` 系が主で宣言出力（`specrunner/changes/…`）と重ならないため実害はほぼ無いが、論理的不整合として残る。 | `commitRoundArtifacts` 後に `captureHeadSha` を再度呼んで `headSha` を更新するか（最小修正）、または tasks.md に「pre-commit SHA を使う設計選択であり、activation paths との overlap が生じないことを前提とする」と注記する。 |
| 3 | LOW | Spec Clarity | tasks.md T-04 | `this.steps.get(name)?.writes?.(state, roundDeps) ?? []` が返す型は `IoRef[]`（`{ path, required?, … }`）であり `string[]` ではない。T-04 は「`path` を union する」と記述しているが、コード例がなく `IoRef → path` の変換が暗黙。 | tasks.md T-04 の declared union 計算部分に `.map(ref => ref.path)` の変換を明示するか、ひと言「`IoRef.path` を抽出して union する」と補足する。 |
| 4 | LOW | Spec Clarity | tasks.md T-04 | `toStage.length === 0` かつ `offending.length === 0`（メンバーが宣言出力を一切書かなかった）のケースで round commit が発生しないことは `commitScopedPaths` の `stagePaths が空なら no-op` ガードに委ねられているが、spec.md にシナリオが無く受け入れ基準にも言及が無い。 | spec.md に「メンバーが宣言出力を書かなかった場合は round commit が no-op になる」シナリオを追加するか、tasks.md T-05 の coordinator-level テストに `toStage = []` の case を加える。 |

## レビュー概要

### コードベースとの整合性

request.md / design.md / spec.md / tasks.md で参照されているコードの実装位置をすべて確認した。

- `executor.ts` L343–374 の finalize ブロック（`finalizeStepArtifacts` を commitMutex 経由で呼ぶ部分）: 確認済み。T-02 のゲート位置は正確。
- `ParallelReviewRound` L185 の `roundDeps = { ...deps }` 構築: 確認済み。T-04 の拡張点は正確。
- `RuntimeStrategy` の optional/required パターン（`canDeriveChangedFiles` / `snapshotMainCheckoutGuard`）: 確認済み。D2 の seam 追加方針は既存パターンと一致。
- `snapshotMainCheckoutGuard` の NUL パース実装（`git status --porcelain -z --no-renames`）: 確認済み。`listWorktreeChanges` の流用元として適切。
- `slugStateJsonPath` / `slugEventsPath` / `usageJsonPath` が `src/util/paths.ts` に存在: 確認済み。T-01 の `pipelineManagedPaths` 実装は正確。
- `custom-reviewer.ts` の `writes()` が `customReviewerResultPath(slug, name, iteration)` を返す: 確認済み。宣言出力の計算方法は正確。
- `pipeline.ts` L259 で `this.round!.run(...)` を直接呼ぶ経路（try/catch なし）: 確認済み。push 失敗が `pipeline.run()` の safety-net に落ちる経路は実在（Finding #1）。

### 設計判断の評価

- D1（`roundOwnsGitEffects` flag）: finalize ブロック全体をゲートするため commitMutex も含めて skip される。sequential は length-1 chain のまま（挙動不変）。妥当。
- D2（RuntimeStrategy seam）: optional-on-port / required-on-real の既存パターンに沿っており、managed の `[]` / no-op は fail-safe として正確。
- D3（pure `partitionRoundChanges`）: `changed ∩ declared` → toStage、`changed − managed − declared` → offending。ロジックは正確で、pathspec-mismatch 回避の理由（未作成 pathspec 除外）も妥当。
- D4（after-snapshot 単一 + 簿記除外）: round 前に sequential step が `git add -A` を commit 済みであるという前提は、executor の commit 経路（`finalizeStepArtifacts` → `commitAndPush`）が成功した後にのみ次 step へ進む pipeline 構造から保証される。妥当。

### セキュリティ

git pathspec に使用される宣言出力 path は内部生成（`customReviewerResultPath` = `specrunner/changes/<slug>/<name>-result-NNN.md`）であり、外部入力を直接 git コマンドに渡す経路は無い。`gitExec` は spawn 経由で配列引数渡しのためシェルインジェクション経路も無し。セキュリティ上のブロッカーは存在しない。

### 受け入れ基準の実現可能性

4 つの受け入れ基準はすべて T-01〜T-05 のテスト計画でカバーされており、pure function テスト（git 非依存）と spy を使った behavior テストの組み合わせで機械的に固定できる。既存 `parallel-review-round-resume.test.ts` の fake は `listWorktreeChanges` / `commitRoundArtifacts` を持たず、optional なので T-05 の regression concern も解消済み。
