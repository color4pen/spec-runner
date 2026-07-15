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
| None | | | | | |

## Observations

### O-1 — T-03 の fake step に `writes()` 実装が必要

`commitRoundArtifacts` を呼ばせるには `toStage.length > 0` が必要で、そのためには `writes()` が非空を返す fake step が必要。既存の `makeStep` ヘルパーは `writes` を定義していない。tasks.md に「`listWorktreeChanges` は member の宣言出力を返し `commitRoundArtifacts` が実際に呼ばれる（= HEAD が進む）ようにする」と明記されており設計意図は伝わっているが、fake step の `writes()` 実装を忘れると `commitRoundArtifacts` が呼ばれず契約テストとして成立しない。実装時に `writes: () => [{ path: DECLARED_A }]` を明示的に追加すること。

### O-2 — `captureHeadSha` は `parallel-review-round.ts` 内で 2 回呼ばれる

L108（invalidation の `currentHeadSha`）と L187–189（approvedAtCommit の `headSha`）の 2 箇所。D1 contract test の stateful fake は両呼び出しで "source-sha" を返すように作ればよい（どちらも `commitRoundArtifacts` より前）。後者のみが `approvedAtCommit` に書き込まれるため、テストのアサーション対象は L187 の呼び出し結果のみ。

## Summary

問題設定・設計・仕様・タスクの一貫性を確認した。

**filter logic の正確性**: `file === changesDirRel() || file.startsWith(changesDirRel() + "/")` は同 prefix 別ディレクトリ（`specrunner/changes-other/...`）を誤除外しない。archive/canceled パス（`specrunner/changes/archive/...`、`specrunner/changes/canceled/...`）は `specrunner/changes/` 配下として正しく除外される。リスクは design.md § Risks で識別・mitigated 済み。

**always-activate 挙動保存**: `evaluateActivation` は `cond.paths` が undefined のとき `changedFiles` を見ずに `activated: true` を返す（`activation.ts:62`）。`sourceTouched = []` でも invalidation が発火する挙動は実装変更なしで保存される。仕様（spec.md § Requirement 4）・tasks（T-04 要件 4）とも正しく記述されている。

**seam 非変更の徹底**: filter を `parallel-review-round.ts` の invalidation site のみに置き、`listChangedFiles` / `computeInvalidations` / `evaluateActivation` を変更しない判断は blast radius 最小化として適切。`scope.ts` / `runtime-capability-gate.ts` への副作用なし。

**D1 contract test の実現可能性**: `captureHeadSha`（L187）が `commitRoundArtifacts`（L270）より前に呼ばれる現在の順序を stateful fake で捕捉できる。順序が逆転したとき（意味 (b) 化）にテストが落ちる設計になっている。

**セキュリティ**: 変更は純粋な内部 pipeline ロジックであり、外部入力の処理・認証・認可に触れない。OWASP Top 10 該当なし。
