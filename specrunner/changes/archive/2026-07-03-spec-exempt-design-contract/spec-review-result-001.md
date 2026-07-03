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
| 1 | LOW | completeness | spec.md | spec-fixer の chore 動作が Risks 節の散文にのみ記載され、Requirement / Scenario がない。通常 chore で spec-fixer は起動しないが、軽量 spec-review が needs-fix を返した場合に到達しうる。現状 spec-fixer の `writes()` には `verify: false` 設定がなく、SPEC_EXEMPT_NOTE（非空）なので violation にはならないが、この保証は散文に留まっている。 | スコープ判断は実装者に委ねるが、必要に応じて tasks.md に「spec-fixer の chore パスは SPEC_EXEMPT_NOTE が非空のため violation にならないことを確認する」旨の検証メモを追記すること。 |

## Review Notes

### コード前提の検証

全主要参照を実コードで確認した。

- `DesignStep.writes()` は `src/core/step/design.ts:83-90` で spec.md を無条件に宣言している（verified）
- `producedContractsFromWrites()` は `src/core/step/output-verify.ts:73` で `w.verify === false` を skip する（verified）
- `IoRef.verify` は `src/core/port/step-types.ts:36-42` に文書化済みの opt-out 機構（verified）
- local / managed 両 runtime の violation 判定コード（`local.ts:721-724` / `managed.ts:423-426`）は同一ロジックで重複している（verified）
- `getOutputTemplates()` の `design` case は `src/templates/step-output-templates.ts:420-435` で `SPEC_TEMPLATE` を spec.md に設定している（verified）
- spec-review-system の Spec Presence Check（line 52-61）はすでに `new-feature` / `spec-change` のみを対象とし、chore を "any other type" として除外している（verified）

### 設計判断の評価

**D1（`specRequired` 属性）**: `specReviewMode` の流用を避けて独立フィールドを持つ判断は正しい。refactoring は `specReviewMode: "lightweight"` だが spec-required であり、流用すると要件 2（fail-closed 維持）が崩れる。`getBranchPrefix` / `getSpecReviewMode` と同じ fallback 規約（未知型は安全側 `true`）を踏襲しており整合性がある。

**D2（contract 構築層での免除）**: `buildAllOutputContracts` は local / managed 両 runtime が消費する単一の出力であり、ここで spec.md contract を除去すれば runtime 側の重複コードを一切変更せずに要件 5 を満たす。既存の `verify` 機構の文書化された用途に正確に一致しており、新しい概念の導入ではない。

**D3（scaffold 差し替え）**: chore で agent が spec.md を未編集で残すのが正常系になるため、`SPEC_TEMPLATE`（空 `## Requirements` 雛形）をそのまま commit させると silent fail-open になる。`getOutputTemplates()` が `state` を受け取るため型分岐が自然に書けるポイントであり、template 設置の single seam を維持している。

**D4（下流プロンプト更新）**: CLI に spec.md の Requirement を機械抽出して落ちる箇所は設計上存在しないため、下流リスクは「agent が空 spec を見て findings を捏造する」ことに限られる。既存の spec-review Semantic Review は present な spec.md 全般を対象とするため、chore でも SPEC_EXEMPT_NOTE に対してレビューを試みる可能性があり、マーカー認識ガイダンスの追加は必要。

### セキュリティ観点

この変更は pipeline 内部の contract 構築ロジック・scaffold テンプレート・プロンプトの変更のみであり、外部入力の処理経路・認証・API エンドポイントへの影響はない。OWASP Top 10 の適用対象外。

`SPEC_EXEMPT_MARKER` はプロンプトに埋め込まれるが、実行環境は信頼された LLM agent セッションであり、外部ユーザー入力由来のデータが混入する経路も存在しない。

### 受け入れ基準との対応確認

| 受け入れ基準 | 対応タスク | 状態 |
|---|---|---|
| chore で design が halt しない（再現テスト） | T-03 / T-04 | ✓ spec Scenario 対応 |
| 非 chore（bug-fix）で scaffold 放置 → halt（回帰テスト） | T-03 / T-04 | ✓ spec Scenario 対応 |
| local / managed 両 runtime で同結果 | T-04 | ✓ spec Scenario 対応 |
| spec-review / conformance が Requirement ゼロで通過 | T-05 | ✓ spec Scenario 対応 |
| 既存テスト無変更で green / typecheck / lint / build 成功 | T-06 | ✓ 受け入れ基準に明示 |
