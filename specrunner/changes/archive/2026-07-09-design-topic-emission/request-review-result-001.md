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
| 1 | MEDIUM | Scope ambiguity | 要件 5 / orchestrator.ts:299-301 | topic emission のエラー時挙動が未定義。mark-hook はエラーで archive を abort するが、topic emission は「独立したステージング」と記述されておりどちらの扱いか不明。実装者が abort vs warn-and-continue を推測で選ぶ必要がある。 | topic emission はアーカイブの補助出力であり、ファイル書き出し・git add 失敗は warn-and-continue（archive は続行）と明記することを推奨。mark-hook abort の後段に topic emission を配置した場合、mark-hook error で archive が中断されても topic emission 未実行は問題ないため、独立性の主眼は "topic emission の失敗が archive を止めない" と明示すれば十分。 |
| 2 | LOW | Clarity | 要件 2・3 (`source:` / `<finding-index>`) | `source: specrunner:<job-slug>/<step>-<iteration>#<finding-index>` の `<finding-index>` が、step run の raw findings 配列（フィルタ前）における 0-based index なのか、フィルタ後の対象 finding 内での index なのか未指定。slug 導出式（`<job-slug>-<step>-<iteration>-<index>`）と整合するなら raw index の方が自然。 | "raw findings 配列（toolResult.findings）内の 0-based index" と明記することを推奨。 |

## 検証メモ

以下は request に記載された前提コードの照合結果（read-only 調査）。

| 主張 | 実コード | 合否 |
|------|---------|------|
| orchestrator.ts:292-298 で `runDesignLayerMarkHook` を呼ぶ | 確認 (orchestrator.ts:292-298) | ✅ |
| mark-hook が `git add -A -- design` でステージする実装パターンを持つ (mark-hook.ts:60-77) | 確認 (mark-hook.ts:65) | ✅ |
| `DesignLayerConfig { enabled?, command?, requireCitationTypes? }` (schema.ts:464-481) | 確認 (schema.ts:464-481) | ✅ |
| `resolveDesignLayerConfig` (schema.ts:1255-1261) | 確認 (schema.ts:1255-1261) | ✅ |
| `Finding { resolution: "fixable" \| "decision-needed", origin?: "scope" }` (report-result.ts:15,40-75) | 確認 (report-result.ts:40-74) | ✅ |
| `dedupeFindings` (findings-ledger.ts:28-47) | 確認 (findings-ledger.ts:97-110) | ✅ |
| `state.decisions: DecisionRecord[]` (schema.ts:322) | 確認 (schema.ts:322) | ✅ |
| merge-then-archive で designLayer 伝播済み (merge-then-archive.ts:86,124,223) | 確認 (merge-then-archive.ts:86,124,222-224) | ✅ |

全コード参照が実コードと一致。`dedupeFindings` の実際の行番号 (97) は request 記載 (28-47) と異なるが、関数の存在・シグネチャは正確。
