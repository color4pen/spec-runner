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
| 1 | LOW | Clarity | 背景・現状コードの前提 | `src/store/event-journal.js` と記載されているが実ファイルは `event-journal.ts`。実装時に path 解決で迷う可能性がある。 | 実装には `.ts` を使用すれば問題なし。ドキュメント上の誤記のみで機能要件に影響なし。 |
| 2 | LOW | Clarity | T8（backward-compat） | "無変更で green" と書かれているが、`bite-evidence-e2e-gate.test.ts` の `expect(output.achieved.biteEvidence).toBe("required")` は P0-2 シナリオ凍結チェック追加後に失敗する（lineage/test-cases.md を用意していない）。括弧書き「意味が変わる期待の更新を除く」でカバーされているが、どのテストが更新対象かを名指しすると明確になる。 | 実装時に既存 e2e テストを P0-2 対応に更新することを想定内として扱えばよく、ブロッカーではない。 |

## Code Assertion Verification Summary

全アサーションを実コードで確認済み（`request-review-attestation.json` 参照）。

| アサーション | 結果 |
|---|---|
| `deriveAchievedAssurance` signature (L84) | ✓ |
| `specReview` が run 存在のみ確認（L96-99） | ✓ P0-1 再現確認 |
| `finalHeadOid` が freeze diff のみに使用、HEAD-green 実測なし（L190, L241） | ✓ P0-1 ギャップ確認 |
| `testDerivation:"frozen"` がシナリオ hash を見ない（L209-212） | ✓ P0-2 ギャップ確認 |
| `FORWARD_TYPES` が未 export（`gate.ts:23`） | ✓ |
| `gate.ts` は type を見るが `achieved-assurance.ts` は見ない | ✓ P0-3 ギャップ確認 |
| `tamper.ts` の inconclusive→proceed（archive は参照しない） | ✓ |
| `LineageRecord.outputs: ArtifactRef[]`、`fold()` が lineage を返す | ✓ |
| `StepRun.outcome.verdict`（types.ts:173-200） | ✓ |
| `deriveJudgeVerdict` が "approved" を返す（judge-verdict.ts:32-40） | ✓ |
| 5 type 定義（type-config.ts） | ✓ |
| `archiveChangeFolder` が `git mv` で archived path へ移動 | ✓ |
| `NONE_CHECK_GRACE_MS=60_000`、floor gate が CI wait より前（Step 3.6） | ✓ |
| `digestArtifacts` が working-tree のみ（local.ts:1044） | ✓ |
| `git show` が checkpoint-ref.ts:152-170 / verification/runner.ts:224 で使用済み | ✓ |
| `runTestsAtCommit` が任意 OID 対応（runtime-strategy.ts:628-633） | ✓ |

## 評価

**4 点のギャップはすべて実コードで確認済みで ADR に照らして正当。**

- P0-1（HEAD-green 未実測）: `achieved-assurance.ts` は `runTestsAtCommit(baseOid, ...)` のみ実行し `finalHeadOid` でのテスト実行がない。base:red・HEAD:依然 red でも `biteEvidence:"required"` が成立する。要件通りの修正が必要。
- P0-2（scenario 二層凍結欠落）: `testDerivation:"frozen"` は materialized blob の freeze のみ見ており、`events.jsonl` lineage の scenario hash と `test-cases.md@finalHeadOid` の一致を確認していない。事後改変を見逃す。
- P0-3（type↔strategy 不整合）: `achieved-assurance.ts` は `state.request.type` を参照せず、refactoring/spec-change にも forward strategy（base-red→HEAD-green）を適用する。ADR-20260716 D2 違反。
- P1（spec-review verdict 未確認）: run 存在のみで `specReview:"required"` が成立し、needs-fix/escalation でも通過する。

要件定義・受け入れ基準（T1-T8）は具体的で機械検証可能。スコープ境界も ADR rationale 付きで明確。設計判断は rejected alternatives 付きで記録済み。新 runtime primitive（commit-file-hash）の必要性も正しく識別されている。

ブロッキング所見なし。
