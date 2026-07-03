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
| 1 | MEDIUM | 現状コード前提の不正確な記述 | `request.md` 「現状コードの前提」節 / `src/config/type-config.ts` | `specImpact` は「spec-review プロンプトに注入される文字列ガイダンス」と記述されているが、実コードを検証したところ `specImpact` は `type-config.ts` で定義されているだけでどのプロンプトファイルにも import・使用されておらず、事実上デッドフィールドである。design agent が「注入されている」という前提で実装方針を立てると、spec-exempt 判定を `specImpact` 経由で行おうとする誤った実装につながるリスクがある。 | design agent は `type-config.ts` と `src/prompts/spec-review-system.ts` を Read/Grep で突き合わせ、`specImpact` が現状どこからも参照されていないことを確認してから設計に入ること。新属性（例: `specRequired`）は `specImpact` とは独立して追加すればよい。 |
| 2 | LOW | followUpPrompt の spec-exempt 対応の明示欠落 | `src/core/step/design.ts:65-75`（followUpPrompt） | design step の `followUpPrompt` は「spec.md を作成した場合は Read tool で読んでください / spec 記法の指針を確認してください」と記述している。spec-exempt 型では scaffold（SPEC_TEMPLATE）が executor によって事前配置されており、「作成した」かどうかに関わらず spec.md が存在する。agent が follow-up で scaffold を読んで Requirement 不在を検出し、不要な修正を試みる可能性がある。受け入れ基準にこの挙動の固定が含まれていない。 | design agent は `followUpPrompt` を spec-exempt 型で安全にスキップするか、「型が spec 対象外の場合は spec.md の spec 記法チェックを省略する」旨を followUpPrompt に条件として追記する。または spec-exempt 型の scaffold を「振る舞い spec なし」ノートに差し替えることで agent が誤検知しないようにする（request の設計採用案に記載済み）。 |
| 3 | LOW | conformance での spec-exempt spec.md 取り扱い | `src/prompts/conformance-system.ts:29`（judgment item 3） | conformance の judgment item 3 は「spec.md — Are all Requirements (SHALL/MUST) satisfied?」と記述している。spec-exempt spec.md に「振る舞い spec なし」ノートのみが書かれている場合、Requirement がゼロになり conformance agent は空集合を満たしているとして approved を返すことが期待されるが、プロンプトに明示的な取り扱い規定がない。受け入れ基準はこの挙動の固定を求めているが、conformance プロンプト変更は不要かどうかを implementer が判断する必要がある。 | spec-exempt spec.md の conformance テスト（requirements 4）実装時に、「Requirement ゼロ = vacuously approved」の動作をテストで固定する。conformance プロンプトの変更は必須ではないが、混乱を防ぐためにプロンプトへ一文（「spec-exempt 型の場合 spec.md に Requirement がゼロであることは正常」）を追記することも検討する。 |

## 検証サマリ

実コードとの突き合わせ結果（request の「現状コードの前提」記述に対する検証）:

| 前提 | 実コード | 一致 |
|------|----------|------|
| `design.ts:83-90` が `writes()` で spec.md を宣言 | 確認済み（全型に対して無条件に spec.md を含む） | ✓ |
| `buildAllOutputContracts` → `produced` contract（`executor.ts:460`） | `output-verify.ts:173` の `buildAllOutputContracts`、`executor.ts:460` で呼び出し確認 | ✓ |
| `produced` contract の violation 判定（local: `local.ts:721-724`、managed: `managed.ts:419-426`） | `local.ts:721-724`、`managed.ts:419-426` ともに同一ロジックを確認 | ✓ |
| scaffold は `step-output-templates.ts:300-338` の SPEC_TEMPLATE | `step-output-templates.ts:291-336` に SPEC_TEMPLATE 確認、`getOutputTemplates` の `design` case で無条件に配置 | ✓ |
| contract gate は commit 前に halt（`executor.ts:455-495`） | 確認済み | ✓ |
| `specImpact` は spec-review プロンプトに注入される文字列ガイダンス | `specImpact` は `type-config.ts` に定義のみ、どのプロンプトファイルにも import/参照なし → **不正確**（Finding #1） | ✗ |
| chore `specImpact: "通常不要..."` は `type-config.ts:51-54` | 実際には line 54 に存在（51-54 の範囲内で誤差小） | ✓ |
| spec-review が spec.md を reads（`spec-review.ts:83`） | `spec-review.ts:80-86` の `reads()` で spec.md 確認、lightweight mode はチェック不要（spec-review-system.ts:52-61 で type 条件付き） | ✓ |
| conformance が spec.md を reads（`conformance.ts:68,94`） | `conformance.ts:63-71` の `reads()` で spec.md 確認、prompt が全 Requirements チェックを要求 | ✓ |
| `IoRef.verify?: boolean` による escape hatch が存在 | `src/core/port/step-types.ts:42`、`producedContractsFromWrites` の `verify === false` スキップ（`output-verify.ts:73`）確認済み | ✓（採用設計を支持） |

## 評価

問題は実在し、再現手順・影響範囲・修正方針いずれも明確。採用設計（`specRequired` 宣言属性を contract 構築層で適用）は既存の `IoRef.verify?: boolean` escape hatch と整合しており、runtime 実装（local/managed）を触らない点で要件 5 を満たす。`state.request.type` は `getOutputTemplates` の引数 `state` から参照可能なため、scaffold の型条件切り替えも API 変更なしで実装できる。

Finding #1（`specImpact` の誤記述）は design agent が実コード検証フェーズで発見・訂正すべき MEDIUM 所見。Finding #2・#3 は設計採用案に方向性が示されており LOW として管理する。HIGH 所見なし、decision-needed なし。
