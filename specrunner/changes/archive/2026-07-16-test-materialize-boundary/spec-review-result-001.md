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
| 1 | MEDIUM | Contract Semantics | design.md / output-contract.ts | `test-coverage` OutputContract の `path` フィールドが他の kind と語義が異なる。`"produced"` / `"tasks-complete"` / `"content-format"` では `path` = 検証対象の出力成果物だが、`"test-coverage"` では `path` = 参照入力ファイル（test-cases.md）。実装者が同一語義と誤解すると `validateStepOutputs` の分岐ロジックが誤実装されるリスクがある。tasks T-03 は実装手順を正確に記述しているが、`output-contract.ts` の型コメント（「Worktree-relative path to verify」）は `test-coverage` での逆語義を説明していない。 | `output-contract.ts` の `OutputContractKind` へ `"test-coverage"` を追加する際、同ファイルの doc コメントに「`test-coverage`: `path` は検証対象成果物ではなく参照入力ファイル（test-cases.md）を指す」旨を明記する。spec.md の当該 Scenario 記述にも同一注釈を 1 文加えると将来の読者への混乱を防げる。 |
| 2 | LOW | Spec Accuracy | spec.md | assertion 検証パターンの記述が「`expect(`/`assert(`」のみで、既存 `test-coverage.ts` の `ASSERTION_RE` が含む `assert.`（ドット形式: `assert.equal` 等）が欠落している。spec と実装の微妙な乖離は将来の修正時に誤った変更を誘発しうる。 | spec.md の "test 存在契約は満たすが…" Scenario 内の assertion パターン記述を `expect(`／`assert(`／`assert.` の 3 形式に揃える（または「既存 `ASSERTION_RE` に準じる」と記すだけでも可）。 |
| 3 | LOW | Documentation | tasks.md | T-08 が更新対象として列挙する `step-types.ts:192,203,313,323` のコメント行番号は実装時点でずれる可能性があり、`registry.ts:27` の "Standard 13-step" コメントは T-04 で別途カバーされる。他ファイルの同種コメントの見落としリスクがある。 | 実装時に `grep -r "13-step\|13 standard\|13.step pipeline\|all 12" src/` で全件確認し、見つかったものを一括更新する。行番号ではなくパターン検索を基点にするとよい。 |
| 4 | LOW | Risk Accepted | design.md | test-materialize が誤って実装コード（test 拡張子以外の src 変更）を書いた場合を阻止する機械ゲートが存在しない。base OID の純粋性は agent のプロンプト指示と T-07 の受け入れテスト（commit tree 差分検証）にのみ依存する。Risks セクションに明示・受理済み。R4 が out of scope のため現時点での許容範囲は適切。 | 現状は受理済み。将来 R4 実装時に base OID を使って test 実行証跡を生成する前に、output-contract に「src 配下の非テストファイル変更ゼロ」ゲートを追加することを検討する。 |

## Summary

仕様は request・design・spec・tasks の全ファイルにわたって一貫しており、コードベースの前提（TC-{NNN} ID、lineage 記録経路、1ノード1コミットモデル、FAST/STANDARD 共有パターン）が実際のコードと照合済みで正確。設計判断（D1〜D6）は全要件をカバーし、代替案の却下理由も明確。CRITICAL・HIGH の所見はなく、実装を開始できる状態にある。
