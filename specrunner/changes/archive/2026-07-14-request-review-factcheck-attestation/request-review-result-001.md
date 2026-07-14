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
| 1 | LOW | Clarity | request.md — 要件 1 | attestation の例示ファイル名 `request-review-attestation.json` は既存の `src/core/attestation/` モジュール（pipeline run attestation）と "attestation" という語を共有する。機能的には明確に区別されているが、実装時に命名の文脈を混同するリスクがある。 | design フェーズで新 artifact のファイル名・型名が既存の `Attestation` 型と混同されないよう、命名方針を design.md に明記することを推奨する。blocking ではない。 |

## Fact-Check Notes

### `src/prompts/request-review-system.ts:38-53`（Step 2: Code Assertion Fact-Check）
- **検証結果**: ✅ 一致。行 38 が `### Step 2: Code Assertion Fact-Check` の見出し、行 40–43 がアサーション対象の定義（file:line / 具体シンボル / ファイルパス）、行 47–53 が Read/Grep による照合と severity: high での記録。request の記述と合致する。

### `src/prompts/design-system.ts:44-60`（現状コード断定の検証）
- **検証結果**: ✅ 一致。行 44 が `## 現状コード断定の検証`、行 46–52 が対象/対象外の定義（request-review と同一のスコープ）、行 58–60 が不一致時に `ok:false + reason` で停止する旨の記述。request の記述と合致する。

### `src/prompts/request-review-system.ts:125-166`（findings 配列 + result file 出力、manifest なし）
- **検証結果**: ✅ 一致。行 125 から Output Format セクションが始まり、findings 配列のスキーマ（severity / resolution / file / line / title / rationale）が定義されている。検証済み path/symbol を記録するフィールドは存在しない。

### pipeline 上の位置（request-review は design の直前）
- **検証結果**: ✅ 一致。`src/core/pipeline/registry.ts` の `STANDARD_DESCRIPTOR` にて `REQUEST_REVIEW` が `DESIGN` の直前に配置されている（行 33–34）。
