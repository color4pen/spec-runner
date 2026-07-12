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
| 1 | LOW | Precision | 背景 > `src/store/job-state-store.ts:206` | `list()` の宣言は実コードでは 211 行目（ドキュメントコメント込みで 206 付近に record が存在する）。行番号がコード修正後にずれており、実装者が誤った行を参照する可能性がある。 | 行番号の記載は参考値として扱う旨を注記するか、行番号を省略して関数名で参照する形にするとよい。実装への影響なし。 |
| 2 | LOW | Design detail | 設計の方向 > `list()` 戻り値変更 | `JobStateStore.list` は `ps.ts`・`archive.ts`・`job-show.ts`・`cancel/runner.ts`・`finish/resolve-target.ts`・`lifecycle/exit-guard.ts` など 10 箇所以上で呼ばれている。戻り型に `changeDir` を追加する場合、呼び出し元への影響がゼロになるよう加算的（optional field or new method）な変更が必要。 | design step で `{ state: NormalizedJobState; changeDir: string }[]` を返す新メソッド（`listWithDirs`）か optional フィールドの追加を検討する。既存の `list()` シグネチャを破壊しない形を選ぶこと。 |

## Summary

コード参照を実測で検証した結果、以下がすべて正確であることを確認した:

- `runJobStats` が `resolveChangeDir(slug, cwd)` でコストを集計（`job-stats.ts` L379）— **confirmed**
- `deriveRunStat` が `inv.jobId !== stateJobId` でフィルタ済み（L154–159）— **confirmed**
- `resolveChangeDir` が 1 slug → 最新 1 dir のみ返す— **confirmed**
- `list()` の戻り型 `NormalizedJobState` には source change-dir が含まれない— **confirmed**（request の「未確認」も正確）

要件 1–4 は明確・テスト可能、受け入れ基準も具体的で検証可能。type=bug-fix として適切。阻害要因なし。
