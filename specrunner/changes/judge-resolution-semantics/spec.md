# Spec: judge resolution semantics

## Requirements

### Requirement: judge 系 3 prompt の decision-needed 定義は作成者判断に限定される

spec-review / code-review / request-review の各 system prompt の Resolution 定義は、`decision-needed` を「**request 作成者でなければ決められない事項に限る**」と規定し、該当例（要件同士の矛盾・複数の妥当な選択肢があり作成者の意図が必要・前提となる文脈の不足）と非該当例（実装者が選べる技術判断・推奨改善・ドキュメント追記の提案 → `fixable` と適切な severity で表現する）を含み、迷った場合は `fixable` に倒す旨を含めなければならない（MUST）。

#### Scenario: 3 prompt の decision-needed 定義が作成者判断限定になっている

**Given** `SPEC_REVIEW_SYSTEM_PROMPT` / `CODE_REVIEW_SYSTEM_PROMPT` / `REQUEST_REVIEW_SYSTEM_PROMPT` を読み込む
**When** 各 prompt 文字列の Resolution 定義部分を検査する
**Then** いずれも「作成者でなければ決められない」趣旨・該当例・非該当例・「迷ったら fixable」の 4 要素を含み、旧定義「設計判断が必要で、自動修正では解決不可能」「人間の設計判断が必要」のみの記述が残っていない

### Requirement: result template の blocking 規則は導出ルールと一致する

`step-output-templates.ts` の FORMAT REQUIREMENTS は、blocking 条件に `decision-needed` を含め、`HIGH のみ` を blocking とする旧記述を残してはならない（MUST）。また markdown の verdict 行と report_result の findings が矛盾した場合は findings 由来の導出が優先される旨を記載しなければならない（MUST）。

#### Scenario: request-review / spec-review template の blocking に decision-needed が含まれる

**Given** `REQUEST_REVIEW_RESULT_TEMPLATE` と `SPEC_REVIEW_RESULT_TEMPLATE`
**When** FORMAT REQUIREMENTS の blocking 記述を検査する
**Then** blocking 条件に `decision-needed` が含まれ、「Approval is blocked when HIGH ≥ 1」のような HIGH のみを blocking とする旧記述が存在しない

#### Scenario: verdict 行より findings 由来の導出が優先される旨が記載される

**Given** judge result template（request-review / spec-review / review-feedback）
**When** verdict に関する記述を検査する
**Then** markdown の verdict 行と report_result の findings が矛盾した場合は findings 由来の導出が優先される旨が記載され、「verdict line is the authoritative decision」のように verdict 行を権威とする旧記述が残っていない

### Requirement: verdict 規則の説明文は単一参照元から共有される

`decision-needed` 定義および verdict/blocking 規則の説明文は単一の参照元として定義され、各消費者（3 prompt・PIPELINE_RULES・result template）は重複コピーではなく参照によって取り込まなければならない（SHALL）。参照元は `judge-verdict.ts` の導出（`deriveJudgeVerdict` / `deriveRequestReviewVerdict`）と意味的に一致しなければならない（MUST）。

#### Scenario: 規則記述が単一参照元を共有する

**Given** verdict 規則を記述する prompt とテンプレート
**When** decision-needed 定義および blocking 規則の説明文を検査する
**Then** 同一の参照元由来の文字列が共有されており、各消費者に独立した重複コピーが存在しない

### Requirement: verdict 導出ロジックと findings スキーマは不変

本変更は `deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings` / `collectFixableFindings` の挙動と `Finding` 型を変更してはならない（MUST NOT）。`decision-needed = escalation`（request-review では `needs-discussion`）の意味論を維持する。

#### Scenario: 導出テストが回帰なく green を維持する

**Given** 既存の verdict 導出テスト群（`judge-verdict.test.ts` / `executor-verdict.test.ts` 等）
**When** prose 変更後に test を実行する
**Then** 導出に関する全テストが green のまま変更なく通過する
