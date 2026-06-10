# Tasks: judge resolution semantics

実装者向けメモ: `judge-verdict.ts` の導出ロジックと `Finding` スキーマは変更しない。本変更は prompt / template / 共有 prose の編集に限る。集約モジュールの配置・命名は裁量だが、design.md D2 の不変条件（単一定義・参照取り込み・import 循環なし・導出と意味的一致）を満たすこと。

## T-01: verdict 規則 prose の単一参照元を作る

- [x] `decision-needed` 定義（作成者でなければ決められない / 該当例 / 非該当例 / 迷ったら fixable）を共有定数として定義する
- [x] verdict・blocking 規則（`decision-needed → escalation`、request-review では `needs-discussion`、`critical|high → needs-fix`、findings 由来の導出が markdown verdict 行より優先）を共有定数として定義する
- [x] 参照元モジュールは他モジュールを import しない leaf にし、import 循環を作らない
- [x] 定数は `judge-verdict.ts` の `deriveJudgeVerdict` / `deriveRequestReviewVerdict` の挙動と意味的に一致させる

**Acceptance Criteria**:
- `decision-needed` 定義と verdict/blocking 規則がそれぞれ 1 箇所の共有定数として存在する
- 参照元モジュールの import が leaf（循環なし）である
- `typecheck` が green

## T-02: 3 prompt の decision-needed 定義を共有定数参照に置き換える

- [x] `src/prompts/code-review-system.ts:87` の Resolution 定義を共有定数参照に置き換える
- [x] `src/prompts/spec-review-system.ts:107` の Resolution 定義を共有定数参照に置き換える
- [x] `src/prompts/request-review-system.ts:139` の Resolution 定義を共有定数参照に置き換える
- [x] 旧定義「設計判断が必要で、自動修正では解決不可能」「人間の設計判断が必要」のみの記述を残さない

**Acceptance Criteria**:
- 3 prompt いずれの文字列も「作成者でなければ決められない」趣旨・該当例・非該当例・「迷ったら fixable」を含む（spec.md > Requirement: judge 系 3 prompt の decision-needed 定義は作成者判断に限定される）
- 3 prompt とも重複コピーではなく共有定数を参照している
- `fragment-coverage.test.ts`（各 prompt が PIPELINE_RULES を含む）が green のまま

## T-03: result template の FORMAT REQUIREMENTS を導出ルールと一致させる

- [x] `src/templates/step-output-templates.ts` request-review template（`:41` approve 説明・`:50` blocking 行）の blocking に `decision-needed` を含め、「No HIGH」「Approval is blocked when HIGH ≥ 1」の旧記述を除去する
- [x] spec-review template（`:85` blocking 行）の blocking に `decision-needed` を含める
- [x] review-feedback template（`:121`）の「The verdict line is the authoritative decision」を、findings 由来の導出が markdown verdict 行より優先される旨に改める
- [x] blocking 規則・findings 優先の prose は T-01 の共有定数を参照する

**Acceptance Criteria**:
- request-review / spec-review template の blocking 条件に `decision-needed` が含まれ、HIGH のみを blocking とする旧記述が残っていない（spec.md > Requirement: result template の blocking 規則は導出ルールと一致する > Scenario: request-review / spec-review template の blocking に decision-needed が含まれる）
- judge result template に「markdown verdict 行と findings が矛盾した場合は findings 由来の導出が優先」の旨が記載され、「verdict line is the authoritative decision」の旧記述が残っていない（同 Requirement > Scenario: verdict 行より findings 由来の導出が優先される旨が記載される）
- `step-output-templates.test.ts` が green（旧文言に依存する assert があれば更新する）

## T-04: prompt 側の verdict 規則記述を導出ルールと一致させる

- [x] `src/prompts/request-review-system.ts:150-156` の Verdict Derivation Rules の blocking に `decision-needed` を含め、「No HIGH」記述を除去する（T-01 共有定数を参照）
- [x] `src/prompts/code-review-system.ts:48` の「Your verdict line is the authoritative decision」を、findings 由来の導出が優先される旨に改める
- [x] `src/prompts/fragments.ts:32` PIPELINE_RULES の承認阻止条件に `decision-needed → escalation` を補い、導出と一致させる

**Acceptance Criteria**:
- request-review prompt / code-review prompt / PIPELINE_RULES の verdict・blocking 記述が `judge-verdict.ts` の導出と意味的に一致し、HIGH のみ blocking / verdict 行を権威とする旧記述が残っていない（spec.md > Requirement: verdict 規則の説明文は単一参照元から共有される）
- 各記述が T-01 の共有定数を参照している
- `fragment-coverage.test.ts` が green のまま

## T-05: テストで定義改訂を固定し、導出不変を保証する

- [x] 3 prompt の decision-needed 定義に「作成者でなければ決められない」趣旨・該当例・非該当例・「迷ったら fixable」が含まれることを assert するテストを追加する
- [x] request-review / spec-review template の blocking に `decision-needed` が含まれ、HIGH のみの旧記述がないことを assert するテストを追加する
- [x] judge result template / prompt に findings 優先（verdict 行は非権威）の旨が含まれることを assert するテストを追加する
- [x] 既存の verdict 導出テスト（`judge-verdict.test.ts` / `executor-verdict.test.ts`）が無変更で green であることを確認する

**Acceptance Criteria**:
- spec.md の各 Scenario に対応する文言テストが存在し green
- `deriveJudgeVerdict` / `deriveRequestReviewVerdict` の導出テストが変更なく green（spec.md > Requirement: verdict 導出ロジックと findings スキーマは不変）

## T-06: 検証

- [x] `typecheck` を実行し green を確認する
- [x] `test` を実行し green を確認する

**Acceptance Criteria**:
- `typecheck && test` が green（受け入れ基準）
- 導出ルール（`deriveJudgeVerdict` / `deriveRequestReviewVerdict`）に変更がない（受け入れ基準）
