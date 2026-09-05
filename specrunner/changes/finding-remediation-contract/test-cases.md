# Test Cases: reviewer finding remediation contract

## 凡例

- **Priority**: must（合否に直結）/ should（主要シナリオ）/ could（エッジケース）
- **Source**: `spec.md §<Requirement名> / Scenario名` or `tasks.md §<Task-ID>`
- Scenario 由来 TC は Source 参照のみ（GWT 省略）。非 Scenario 由来 TC は GWT を記述する。

---

## 1. Schema & Type Contract

### TC-S-01 · must

**Category**: Schema / Type  
**Source**: `spec.md §fixable finding は remediation 契約を伴わなければならない / Scenario: fixable finding に remediation があると parse が成功する`

---

### TC-S-02 · must

**Category**: Schema / Type  
**Source**: `spec.md §fixable finding は remediation 契約を伴わなければならない / Scenario: fixable finding に remediation が無いと parse が失敗する`

---

### TC-S-03 · must

**Category**: Schema / Type  
**Source**: `spec.md §fixable finding は remediation 契約を伴わなければならない / Scenario: decision-needed finding は remediation なしでも parse が成功する`

---

### TC-S-04 · must

**Category**: Schema / Type  
**Source**: `spec.md §fixable finding は remediation 契約を伴わなければならない / Scenario: sites が空配列の remediation は拒否される`

---

### TC-S-05 · must

**Category**: Schema / Type  
**Source**: `spec.md §fixable finding は remediation 契約を伴わなければならない / Scenario: request-review は remediation を要求しない`

---

### TC-T01-01 · must

**Category**: Schema / Type  
**Source**: `tasks.md §T-01`

**Given** `src/kernel/report-result.ts` に `FindingRemediation` / `RemediationSite` が定義されている  
**When** `src/core/port/report-result.ts` から `FindingRemediation` / `RemediationSite` を import する  
**Then** 型が解決され `bun run typecheck` が green になる

---

### TC-T01-02 · must

**Category**: Schema / Type  
**Source**: `tasks.md §T-01`

**Given** `Finding` に `remediation?: FindingRemediation` が追加された実装  
**When** remediation フィールドを持たない既存の `Finding` 型の値を型検査に通す  
**Then** `bun run typecheck` が green になり、既存フィールドの型・optionality は 1 つも変わっていない

---

### TC-T02-01 · must

**Category**: Schema / Tool Schema  
**Source**: `tasks.md §T-02`

**Given** `report-tool.ts` の `findingSchema` に `remediation: optional(remediationSchema)` が追加された実装  
**When** `toCustomToolSpec(JUDGE_REPORT_TOOL)` の `input_schema` を検査する  
**Then** `findings[].remediation.invariant` / `findings[].remediation.sites[].file` / `findings[].remediation.sites[].line` / `findings[].remediation.approach` のすべてが schema に現れる

---

### TC-T02-02 · should

**Category**: Schema / Tool Schema  
**Source**: `tasks.md §T-02`

**Given** `findingSchema` に remediation が追加された実装  
**When** `toOpenAIStrictSchema(toJSONSchema(object(JUDGE_REPORT_TOOL.zodSchema)))` を実行する  
**Then** 例外なく変換が完了し、`remediation` フィールドが nullable 化され、`sites` の各 item も再帰変換されている

---

### TC-T02-03 · must

**Category**: Schema / Tool Schema  
**Source**: `tasks.md §T-02`

**Given** `REQUEST_REVIEW_REPORT_TOOL` の description  
**When** 変更前後で文字列比較する  
**Then** 文字列が完全に一致する（変更されていない）

---

## 2. Parse / Validation

### TC-T03-01 · must

**Category**: Parse / Validation  
**Source**: `tasks.md §T-03`

**Given** `remediation: null` を持つ fixable finding オブジェクト、または `sites[].line: null` を持つ remediation オブジェクト  
**When** `parseFindings` / `parseRemediation` を呼ぶ  
**Then** 例外が投げられず、`null` は「不在」として正規化される（`undefined` 相当で扱われる）

---

### TC-T03-02 · must

**Category**: Parse / Validation  
**Source**: `tasks.md §T-03`

**Given** `resolution: "fixable"` で `remediation` を持たない finding を含む payload  
**When** `parseRequestReviewReportInput` を呼ぶ  
**Then** parse が成功し、finding がそのまま保持される

---

### TC-T03-03 · must

**Category**: Parse / Validation  
**Source**: `tasks.md §T-03`

**Given** persisted state から読み込んだ、remediation を持たない fixable finding の JSON  
**When** `parseFindings(raw)` を引数なし（非 strict）で呼ぶ  
**Then** parse が成功し、finding が従来どおり返される

---

### TC-T03-04 · must

**Category**: Parse / Validation  
**Source**: `tasks.md §T-03`

**Given** 以下のいずれかの不正形 remediation を持つ fixable finding: `sites: []` / `invariant: ""` / `approach: ""` / `sites: [{file: ""}]`  
**When** `parseFindings(raw, true, true)` を呼ぶ  
**Then** いずれのケースでも parse が失敗し、finding は採用されない

---

### TC-T03-05 · must

**Category**: Parse / Validation  
**Source**: `tasks.md §T-03`

**Given** `resolution: "fixable"` で remediation を持たない finding を含む judge 完了報告  
**When** `parseJudgeReportInput` を呼ぶ  
**Then** `{ ok: false, missingFields: ["findings.remediation"] }` が返る

---

### TC-T03-06 · must

**Category**: Parse / Validation  
**Source**: `tasks.md §T-03`

**Given** `resolution: "decision-needed"` で `options` を 2 件持ち、remediation を持たない finding を含む judge 完了報告  
**When** `parseJudgeReportInput` を呼ぶ  
**Then** parse が成功し、finding がそのまま返される

---

## 3. Fail-Closed & Escalation

### TC-S-06 · must

**Category**: Fail-Closed / Escalation  
**Source**: `spec.md §remediation の欠落は approved を生成してはならない / Scenario: remediation 欠落で完了報告が採用されなかった judge step は escalation になる`

---

### TC-S-07 · must

**Category**: Fail-Closed / Escalation  
**Source**: `spec.md §remediation の欠落は approved を生成してはならない / Scenario: findings が空の完了報告は従来どおり approved になる`

---

### TC-T10-02 · must

**Category**: Fail-Closed / Escalation  
**Source**: `tasks.md §T-10`

**Given** judge step が remediation 欠落の fixable finding のみを返し続け、最終的に `toolResult === null` となる状態  
**When** `step-completion.ts` が verdict を導出する  
**Then** verdict は `escalation` であり `approved` に変わらないことを drift-guard テストが検出して fail する形で固定されている

---

## 4. Site Normalization

### TC-S-08 · should

**Category**: Site Normalization  
**Source**: `spec.md §sites は finding 自身の site を必ず含む / Scenario: 自 site が欠けている sites は先頭に補完される`

---

### TC-S-09 · should

**Category**: Site Normalization  
**Source**: `spec.md §sites は finding 自身の site を必ず含む / Scenario: 自 site が既にある場合は重複追加されない`

---

### TC-T03-07 · should

**Category**: Site Normalization  
**Source**: `tasks.md §T-03`

**Given** `file: "src/a.ts"`, `line: 10` の fixable finding が `sites: [{file: "src/a.ts", line: 10}, {file: "src/b.ts"}]` を持つ  
**When** `parseFindings(raw, true, true)` を呼ぶ  
**Then** parse が成功し、`sites` は 2 件のままで `src/a.ts:10` の重複追加が発生していない

---

## 5. Reviewer Prompt Contract

### TC-S-18 · must

**Category**: Reviewer Prompt  
**Source**: `spec.md §reviewer 向けプロンプトは remediation の記述と隣接経路の走査を要求する / Scenario: custom reviewer の system prompt が remediation を要求する`

---

### TC-S-19 · must

**Category**: Reviewer Prompt  
**Source**: `spec.md §reviewer 向けプロンプトは remediation の記述と隣接経路の走査を要求する / Scenario: request-review の system prompt は remediation を要求しない`

---

### TC-T04-01 · must

**Category**: Reviewer Prompt  
**Source**: `tasks.md §T-04`

**Given** `src/prompts/judge-rules.ts` の `FINDING_REMEDIATION_DEFINITION`  
**When** その文字列を検査する  
**Then** `report_result` および `end_turn` を含まない（既存 fragment coverage テストの制約を満たす）

---

### TC-T04-02 · must

**Category**: Reviewer Prompt  
**Source**: `tasks.md §T-04`

**Given** 本変更の実装後  
**When** `specrunner/reviewers/` 配下のファイルの git diff を確認する  
**Then** 差分が存在しない（reviewer 定義ファイルは一切変更されていない）

---

### TC-T04-03 · must

**Category**: Reviewer Prompt  
**Source**: `tasks.md §T-04`

**Given** `CODE_REVIEW_SYSTEM_PROMPT` / `SPEC_REVIEW_SYSTEM_PROMPT` / `CONFORMANCE_SYSTEM_PROMPT` / `REGRESSION_GATE_SYSTEM_PROMPT` の各文字列  
**When** それぞれを `FINDING_REMEDIATION_DEFINITION` の内容に対してサブストリング検索する  
**Then** 全 prompt に `FINDING_REMEDIATION_DEFINITION` の全文が含まれる

---

### TC-T04-04 · must

**Category**: Reviewer Prompt  
**Source**: `tasks.md §T-04`

**Given** `FINDING_REMEDIATION_DEFINITION` の内容  
**When** 走査義務の記述を検査する  
**Then** 「finding を 1 つ構成したら、同じ不変条件を共有する隣接関数・並列経路を走査し、成立していない箇所を sites に列挙する」旨の記述が含まれる

---

## 6. Fixer Prompt Expansion

### TC-S-13 · must

**Category**: Fixer Prompt  
**Source**: `spec.md §fixer プロンプトは invariant / 全 sites / approach / evidence path を含む / Scenario: 2 site を持つ finding の両方が fixer プロンプトに現れる`

---

### TC-S-14 · must

**Category**: Fixer Prompt  
**Source**: `spec.md §fixer プロンプトは invariant / 全 sites / approach / evidence path を含む / Scenario: code-fixer は structured findings があっても evidence file path を含める`

---

### TC-S-15 · must

**Category**: Fixer Prompt  
**Source**: `spec.md §fixer プロンプトは invariant / 全 sites / approach / evidence path を含む / Scenario: spec-fixer は structured findings があっても evidence file path を含める`

---

### TC-S-16 · should

**Category**: Fixer Prompt  
**Source**: `spec.md §fixer プロンプトは invariant / 全 sites / approach / evidence path を含む / Scenario: 継続セッションの fixer プロンプトも remediation と evidence path を含む`

---

### TC-S-17 · must

**Category**: Fixer Prompt  
**Source**: `spec.md §fixer プロンプトは invariant / 全 sites / approach / evidence path を含む / Scenario: remediation を持たない finding の出力は従来どおり`

---

### TC-T05-01 · should

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-05`

**Given** `renderEvidenceReference` を空配列 `[]` で呼ぶ  
**When** 戻り値を確認する  
**Then** 空文字列が返る

---

### TC-T05-02 · must

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-05`

**Given** structured findings がある状態で `buildContinuationMessage` を呼ぶ  
**When** 戻り値の文字列を検査する  
**Then** findings path が出力に含まれる

---

### TC-T05-03 · must

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-05`

**Given** remediation を持つ finding が 1 件以上ある findings block  
**When** `buildFindingsBlock` を呼ぶ  
**Then** ブロック末尾に「列挙された全 site を同一イテレーションで修正すること」旨の全 site 同時修正指令が 1 回だけ追加される

---

### TC-T05-04 · must

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-05`

**Given** remediation を持たない finding のみを渡す  
**When** `buildFindingsBlock` を呼ぶ  
**Then** 出力文字列が変更前の実装と完全一致する

---

### TC-T06-01 · must

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-06`

**Given** coordinator 経路で needs-fix member が 2 件ある code-fixer の起動  
**When** `buildMessage` の戻り値を検査する  
**Then** 2 件の member 全員の result file path が出力に含まれる

---

### TC-T06-02 · must

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-06`

**Given** findings が空の code-fixer fallback 経路  
**When** `buildMessage` の戻り値を変更前後で比較する  
**Then** 出力文字列が変更前と完全一致する

---

### TC-T07-01 · must

**Category**: Fixer Prompt  
**Source**: `tasks.md §T-07`

**Given** findings が空の spec-fixer fallback 経路  
**When** `buildSpecFixerInitialMessage` の戻り値を変更前後で比較する  
**Then** 出力文字列が変更前と完全一致する

---

### TC-T10-01 · must

**Category**: Fixer Prompt / Integration  
**Source**: `tasks.md §T-10`

**Given** `cross-boundary-invariants-result-002` の F-001 を remediation 付きで表現した fixture（invariant: 「exclusion filter より前に全 changed path に write-scope 検査を適用する」、sites: `src/core/step/commit-push.ts:584` と `src/core/pipeline/parallel-review-round.ts:401`）  
**When** code-fixer の `buildMessage` を呼ぶ  
**Then** 出力に `src/core/step/commit-push.ts` と `src/core/pipeline/parallel-review-round.ts` の両文字列が同時に含まれる

---

## 7. Fixer System Prompt

### TC-S-20 · must

**Category**: Fixer System Prompt  
**Source**: `spec.md §code-fixer の「最小限」は全 site での不変条件成立を意味する / Scenario: code-fixer system prompt が全 site 成立を最小限の定義とする`

---

### TC-S-21 · must

**Category**: Fixer System Prompt  
**Source**: `spec.md §code-fixer の「最小限」は全 site での不変条件成立を意味する / Scenario: code-fixer system prompt の入力記述が実際の受け渡しと一致する`

---

### TC-T08-01 · must

**Category**: Fixer System Prompt  
**Source**: `tasks.md §T-08`

**Given** 変更後の `CODE_FIXER_SYSTEM_PROMPT`  
**When** 文字列を検査する  
**Then** 「最小限の機械的修正」という単独表現が存在しない

---

### TC-T08-02 · must

**Category**: Fixer System Prompt  
**Source**: `tasks.md §T-08`

**Given** 変更後の `CODE_FIXER_SYSTEM_PROMPT`  
**When** write-set 禁止条項を検査する  
**Then** 「新機能の追加は禁止」または同義の条項が維持されている

---

### TC-T08-03 · must

**Category**: Fixer System Prompt  
**Source**: `tasks.md §T-08`

**Given** 変更後の `SPEC_FIXER_SYSTEM_PROMPT`  
**When** 文字列を検査する  
**Then** 「全 site で不変条件を成立させる最小の変更」旨の記述が含まれる

---

### TC-T08-04 · must

**Category**: Fixer System Prompt  
**Source**: `tasks.md §T-08`

**Given** 変更後の code-fixer / spec-fixer system prompt  
**When** `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` を実行する  
**Then** 5 セクション構成 / COVERAGE_GATE_INTEGRITY 共有 / write-set 宣言の各チェックが green

---

## 8. Regression-Gate / Ledger

### TC-S-22 · must

**Category**: Regression-Gate / Ledger  
**Source**: `spec.md §regression-gate の ledger entry は sites を保持し全 site を検証対象にする / Scenario: ledger block に sites が展開される`

---

### TC-S-23 · must

**Category**: Regression-Gate / Ledger  
**Source**: `spec.md §regression-gate の ledger entry は sites を保持し全 site を検証対象にする / Scenario: remediation を持たない ledger entry の表示は従来どおり`

---

### TC-T09-01 · must

**Category**: Regression-Gate / Ledger  
**Source**: `tasks.md §T-09`

**Given** `buildLedgerBlock` の導入文  
**When** 文字列を検査する  
**Then** 「Sites がある entry は列挙された全 site で不変条件が成立しているかを確認する」旨の記述が含まれる

---

### TC-T09-02 · must

**Category**: Regression-Gate / Ledger  
**Source**: `tasks.md §T-09`

**Given** `REGRESSION_GATE_SYSTEM_PROMPT` の Method  
**When** 文字列を検査する  
**Then** 「entry に Sites がある場合、全 site を確認し、いずれかで破れていれば退行として報告する」旨と「退行 finding の remediation には ledger entry の invariant / sites を引き継ぐ」旨が含まれる

---

## 9. Compatibility & Identity

### TC-S-10 · must

**Category**: Compatibility / Identity  
**Source**: `spec.md §remediation を持たない既存 finding は additive に読み込める / Scenario: 旧 persisted finding から ledger が生成される`

---

### TC-S-11 · should

**Category**: Compatibility / Identity  
**Source**: `spec.md §remediation を持たない既存 finding は additive に読み込める / Scenario: remediation は永続化と復元を往復する`

---

### TC-S-12 · must

**Category**: Compatibility / Identity  
**Source**: `spec.md §finding の identity は remediation に依存しない / Scenario: remediation の有無で ledgerRef が変わらない`

---

### TC-T10-03 · must

**Category**: Compatibility / Identity  
**Source**: `tasks.md §T-10`

**Given** `file` / `line` / `title` / `rationale` が同一で、一方だけが remediation を持つ 2 つの finding  
**When** `findingFingerprint` / `computeLedgerRef` / `computeFindingKey` をそれぞれ計算する  
**Then** 各関数の戻り値が 2 つの finding 間で一致する（remediation を含まない identity が維持されている）

---

### TC-T11-01 · must

**Category**: Compatibility / Identity  
**Source**: `tasks.md §T-11`

**Given** remediation を持たない persisted finding を扱う既存テスト群  
**When** `bun run test` を実行する  
**Then** 対象テストが 1 件以上 green で残っており、非 strict 経路での互換性が証明されている

---

### TC-T11-02 · must

**Category**: Compatibility / Identity  
**Source**: `tasks.md §T-11`

**Given** `computeRegressionLedger` / `dedupeFindings` / `buildProvenanceIndex` を remediation を持たない persisted finding fixture で呼ぶ  
**When** 各関数を実行する  
**Then** 従来どおりの動作結果が得られ、エラーが発生しない

---

## 10. Integration & Drift Guard

### TC-T12-01 · must

**Category**: Integration  
**Source**: `tasks.md §T-12`

**Given** 全実装が完了した状態  
**When** `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` を順に実行する  
**Then** 4 コマンドすべてが exit 0 で終了する

---

### TC-T12-02 · must

**Category**: Integration  
**Source**: `tasks.md §T-12`

**Given** verdict 導出 / `AgentRunResult` / Git・PR profile に関する既存テスト群  
**When** `bun run test` を実行する  
**Then** 対象テストが 1 件も変更されておらず、すべて green である

---

### TC-T04-05 · must

**Category**: Integration  
**Source**: `tasks.md §T-04`

**Given** 変更後の実装  
**When** `src/prompts/__tests__/fragment-coverage.test.ts` / `prompt-skeleton-drift-guard.test.ts` を実行する  
**Then** 両テストが green

---

### TC-T06-03 · must

**Category**: Integration  
**Source**: `tasks.md §T-06`

**Given** 変更後の code-fixer 実装  
**When** `src/core/step/__tests__/fixer-reviewer.test.ts` / `fixer-push-capability.test.ts` を実行する  
**Then** 両テストが green

---

### TC-T09-03 · must

**Category**: Integration  
**Source**: `tasks.md §T-09`

**Given** 変更後の regression-gate / ledger 実装  
**When** `src/core/pipeline/__tests__/findings-ledger.test.ts` / `src/core/step/__tests__/regression-gate-step.test.ts` を実行する  
**Then** 両テストが green

---

### TC-T02-04 · must

**Category**: Integration  
**Source**: `tasks.md §T-02`

**Given** 変更後の report-tool 実装  
**When** `src/core/step/__tests__/report-tool-evidence-schema.test.ts` を実行する  
**Then** テストが green

---
