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
| 1 | LOW | Implementation gap | tasks.md T-04 | `finalizeStep` には verdict 導出ブロック（lines 647-660）と `verifyFindingRefs` ブロック（lines 675-688）が独立して `toolResult.findings` を読んでいる。T-04 は「verifyFindingRefs も合成込み findings に対して一貫して動くようにする」と要求しているが、これは「agentResult.toolResult を in-place 変更せず新オブジェクトで差し替え、その後の両ブロックが新オブジェクトを参照する」実装を意味する。spec.md は結果を正しく記述しているが、この二点注入の必要性が明示されていないため実装者が片側だけ修正するリスクがある。 | T-04 に「合成後は `modifiedToolResult = { ...agentResult.toolResult, findings: combinedFindings }` を作成し、verdict 導出・verifyFindingRefs・pushStepResult の全ブロックで `modifiedToolResult` を参照すること」を一行加えると安全。spec.md の変更は不要（tasks が補えば十分）。 |
| 2 | LOW | Ambiguity | tasks.md T-03 | `scope.ts` が使うべき glob matcher を「既存の軽量 matcher を再利用」と書くだけで、`src/util/glob-match.ts`（leaf 層、DSM 観点で domain から利用可）と `src/core/reviewers/glob-match.ts`（同一 domain 内 cross-module）のどちらかが未特定。どちらも純関数で動作するが、DSM closure の観点では `util/` の方が明快。 | T-03 に「`../../util/glob-match.ts` の `globMatch` を再利用する（B-5 / DSM 準拠）」と明記すること。動作上の問題はないが明示すると実装者の迷いが消える。 |

## 検証メモ

実コードと照合した結果を以下に示す。すべて設計文書の前提と一致した。

**コード前提の検証**:
- `PipelineDescriptor`（`src/core/pipeline/types.ts:32`）: `permissionScope` 相当フィールド不在を確認。
- `FindingResolution`（`src/kernel/report-result.ts:15`）: `"fixable" | "decision-needed"` の 2 値のみ。
- `Finding`（同上）: `origin` フィールド不在。`options?: DecisionOption[]`、`fixTarget?` は既存。
- `deriveJudgeVerdict`（`src/core/step/judge-verdict.ts`）: `decision-needed` → `escalation`、`ok=false` → `escalation` を確認。
- `computeFindingKey` / `getOpenDecisionFindings` / `filterUndecidedFindings`（`src/core/decision/decision-ledger.ts`）: 設計記載通り実装済み。key は `step|file|line|title|rationale`。
- `buildEscalationComment`（`src/core/notify/issue-notifier.ts:121`）: `getOpenDecisionFindings` 経由で `decision-needed` findings を描画。`options.length >= 2` フィルタ済み。変更不要な既存経路を確認。
- `PIPELINE_REGISTRY`（`src/core/pipeline/registry.ts`）: `standard` / `design-only` の 2 本のみ。両者ともスコープフィールド未宣言を確認。
- `listChangedFiles` seam（`src/core/port/runtime-strategy.ts:380`）: `managed` では `[]` 固定（設計 Risk と一致）。既存の reviewer activation と同一 seam。
- `composeReviewerDescriptor`（`src/core/pipeline/compose-reviewers.ts`）: `{ ...base, steps, transitions, ... }` spread を確認。`permissionScope` は上書き対象外なので自動伝播する。
- Glob matcher: `src/util/glob-match.ts`（`globMatch`）と `src/core/reviewers/glob-match.ts`（`matchGlob`）が既存。どちらも pure、no external deps。
- `parseFindings`（`src/core/port/report-result.ts:151`）: 現在 `origin` を読まない。T-02 の additive 拡張で `origin: "scope"` を補足する設計は backward-compatible。
- `buildPipeline`（`src/core/pipeline/run.ts:55`）: 現在 `new StepExecutor(bus, runner, deps.storeFactory, deps.gitTransportSpawn)` で `permissionScope` を渡さない。T-04 の trailing optional 引数追加は型安全な additive 変更。

**設計の整合性**:
- 既存の `decision-needed → escalation` 経路（`deriveJudgeVerdict` → pipeline state machine → `awaiting-resume`）を完全再利用し、並行機構を新設していない点は設計原理に適合する。
- `findingResolution` union が拡張されていないことを T-08 が型レベルで固定する設計は将来の誤拡張を防ぐ。
- `Finding.origin` absent = 現行として扱う点（T-02・T-05・T-06）は additive 後方互換を保つ。migration 不要。
- 機械源合成 finding の decision-ledger key は `step|file|line|title|rationale` で決定的。human が resolve した breach は `filterUndecidedFindings` で以降の escalation から除外される。

**セキュリティ観点（OWASP Top 10 対象面を確認）**:
- 新しい trust surface なし。`ForbiddenSurface.paths` は profile config 由来（実行時ユーザー入力ではない）。
- escalation コメントの finding 文字列は既存 `escapePlainText`（HTML entity escape + newline 除去）を通る。injection リスクなし。
- glob パターンは config から読み、`RegExp` は matcher 内で安全にエスケープされている。regex injection なし。
- `synthesizeScopeFindings` の `file` フィールドは slug 由来の決定的パス。slug は job 生成時に検証済み。
- decision-ledger key の衝突は設計上問題なし（同一 breach が同一 key に収まることが目的）。

**結論**: HIGH 以上の finding なし。非ゴール列挙が網羅的で scope creep リスクが低い。既定挙動完全一致の保証（スコープ未宣言 profile で全テスト green）が設計と受け入れ基準の両方で明示されている。
