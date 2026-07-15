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

`commitAndPush` / `commitScopedPaths` の fail-open を typed halt 化する仕様。コードと仕様が正確に対応しており、設計判断の根拠も明確。実装阻害となる矛盾・欠落はなし。

**検証したコード**:
- `src/core/step/commit-push.ts:33-207` — 問題サイトと正当経路を確認
- `src/util/git-exec.ts:57-68` — `gitExecExitCode` spawn 例外→1 の conflation を確認
- `src/core/step/step-halt.ts:305-316` — `makeCommitFailHalt` / `err.code ?? "COMMIT_AND_PUSH_FAILED"` を確認
- `src/core/step/executor.ts:438-455` — Path A catch → `makeCommitFailHalt` 経路を確認
- `src/core/pipeline/pipeline.ts:149-183` — Path B safety net（`PIPELINE_UNHANDLED_ERROR` → awaiting-resume）を確認
- `src/core/runtime/local.ts:633-644, 781-792` — `finalizeStepArtifacts` / `commitRoundArtifacts` の caller を確認
- `src/errors.ts` — `COMMIT_AND_PUSH_FAILED` が ERROR_CODES 未登録（magic string）なことを確認
- `tests/unit/step/commit-and-push.test.ts` — TC-CAP-008/009 が silent skip 期待（fail-open 固定）であることを確認
- `src/core/step/__tests__/commit-scoped-paths.test.ts` — Branch 2 が silent return 期待であることを確認

**設計の正確性**:

1. **fail-open サイトの特定が正確**。`commit-push.ts:44-50`（add silent return）、`:55`（diff exit≥2 を `hasChanges=false` に潰す）、`:72`（commit 結果未チェックで push へ進む）は仕様記述どおり。

2. **Path A / Path B の非対称分析が正確**。executor の `.catch()` が `finalizeStepArtifacts` のみを囲み、`commitRoundArtifacts` は `parallel-review-round.ts:282` から直接 await され try/catch がない。`commitScopedPaths` の throw は pipeline の last-resort safety net（pipeline.ts:149-183）に落ちる。`pushFailedError` が既にこの非対称を体現しているという主張はコードで確認できる。

3. **D4（`gitExecResult` 新設）の必要性が正確**。`gitExecExitCode` は spawn 例外時に `catch { return 1; }` を返す（git-exec.ts:66）。diff の exit 1 は「変更あり」なので、spawn 失敗を「変更あり」と誤分類する conflation が存在する。

4. **`makeCommitFailHalt` のフォールバックコードと factory の整合**。`makeCommitFailHalt` は `err.code ?? "COMMIT_AND_PUSH_FAILED"` を使う（step-halt.ts:311）。新設 factory `commitEffectFailedError` が code `COMMIT_AND_PUSH_FAILED` を持てば halt code は字義どおり `COMMIT_AND_PUSH_FAILED` になる。

5. **スコープ外の正確な識別**。`commitFinalState` は `PipelineSpawnFn`（spawn.ts 型）を使い、`gitExecResult`（SpawnFn / git-exec.ts 型）とは型境界が異なる。自然な隔離壁があり、スコープ外を維持しやすい。

**セキュリティ評価**（OWASP Top 10）:

本変更は local git 操作の内部経路のみを対象とする。外部入力がない（`stagePaths` は coordinator 内部宣言、branch/slug はパイプライン内部状態）。inject 可能な外部文字列なし、認証変更なし、新規ネットワーク露出なし。fail-closed への変更はオペレーショナルセキュリティ（障害隠蔽の排除）を向上させる。OWASP Top 10 に該当する懸念なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Stale comment | `tests/unit/step/commit-and-push.test.ts:8-12` | ファイル先頭の JSDoc コメント（TC-CAP-008: `requiresCommit:true → NO_COMMIT_DETECTED`、TC-CAP-009: `requiresCommit:false → silent skip`）は現行テスト実装と既に不一致（実装は両方 silent skip）であり、T-05 完了後はさらに古くなる。 | T-05 でテスト更新時にヘッダコメントを新しい期待（add 失敗 → `COMMIT_AND_PUSH_FAILED` で reject）に合わせて書き直す。スコープ内の作業として対応可能。 |
| 2 | LOW | Magic string removal | `src/errors.ts` | `COMMIT_AND_PUSH_FAILED` が現状 `ERROR_CODES` に未登録で、`makeCommitFailHalt`（step-halt.ts:311）内の文字列リテラルとテスト（executor-commit-mutex.test.ts:259）の 2 か所で magic string として使われている。 | T-01 で `ERROR_CODES.COMMIT_AND_PUSH_FAILED` を登録することで解消される。既にタスクに含まれており対応済み。 |
| 3 | LOW | Stale doc comment | `src/core/runtime/local.ts:777` | `commitRoundArtifacts` のコメント「Never throws — errors propagate from commitScopedPaths / pushOnly」は T-04 後に不正確になる（add/diff/commit 失敗が throw するため）。 | T-04 の Acceptance Criteria でコメント更新が明示されており対応済み。 |
