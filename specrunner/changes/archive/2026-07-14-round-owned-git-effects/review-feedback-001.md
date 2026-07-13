# Code Review Feedback — iteration 001

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
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `.specrunner/config.json` | T-06 スコープ外変更: `src/core/types.ts` を coverage 除外リストに追加。型宣言のみのファイルで除外自体は合理的だが、T-06 の変更ファイル制限に含まれていない。pipeline dogfooding 実行中に生成されたアーティファクト変更と判断。 | 対応不要。 | no |
| 2 | low | testing | `parallel-review-round-git-effects.test.ts` | TC-010（宣言範囲内の削除・置換, must, integration）に coordinator レベルの専用テストがない。ただし①`local-round-git.test.ts` が削除ファイルのパス列挙を確認、②`round-git-scope.test.ts` が削除宣言ファイルの toStage 包含を確認、③Scenario 1 が coordinator→commitRoundArtifacts の経路を確認しており、削除と変更は coordinator 経路で同一。 | 対応不要。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.65

## Summary

D3（git 副作用の round 所有 ＋ scoped staging）の実装を全体レビューした。

**受け入れ基準 4 項目すべて充足**:

- `if (!deps.roundOwnsGitEffects)` の単一ゲートで member の finalize ブロック（commit mutex + finalizeStepArtifacts）を一括 skip。executor-round-commit.test.ts で roundOwnsGitEffects=true / absent の両経路を固定。
- `partitionRoundChanges` が pure function として `round-git-scope.ts` に切り出され、changed ∩ declared = toStage / changed − declared − managed = offending を git 非依存で計算。round-git-scope.test.ts の 17 ケースで固定。
- coordinator が `offending.length > 0` 時に `aggregateVerdictResult = "escalation"` へ上書きし `commitRoundArtifacts` を呼ばないことを parallel-review-round-git-effects.test.ts Scenario 2 で固定。`ROUND_NONDECLARED_CHANGE` code と offending path が `state.error` と synthetic StepRun 両方に記録される。
- `commitScopedPaths` が `["add", "-A", "--", ...stagePaths]` 形式のみを使用し pathspec なし `git add -A` を使わないことを commit-scoped-paths.test.ts で固定。

**設計判断 D1–D4 の忠実な実装**:

- D1: `roundOwnsGitEffects?: boolean` を `PipelineDeps` に追加し、逐次経路は `undefined` のまま既存挙動不変。
- D2: `listWorktreeChanges` / `commitRoundArtifacts` を optional-on-port / required-on-RealRuntimeStrategy で追加。既存 test fake は typecheck を通り続ける。
- D3: halt / scoped commit / no-op の 3 分岐がコード上自明に分離。managed runtime は `[]` / no-op で既存 `listChangedFiles` の fail-safe 方針と一貫。
- D4: after-snapshot 単体 ＋ `pipelineManagedPaths` 除外で before-snapshot を不要にし、簿記の誤 halt 回避を 1 箇所に集約。

**typecheck && test green** を verification-result.md（全 5 フェーズ passed）で確認。**architecture/ 配下に変更なし**（B-15 ratify はスコープ外のまま保持）。

情報レベルの観察 2 件はいずれも修正不要。

