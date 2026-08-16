# Test Cases: rules の配送方式 `delivery: prompt`

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 22
- **Manual**: 3
- **Priority**: must: 18, should: 8, could: 1

---

### TC-001: frontmatter が本文から除去される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rule ファイルの frontmatter で配送方式を宣言できる > Scenario: frontmatter が本文から除去される

---

### TC-002: frontmatter の無いファイルは全体が本文

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: rule ファイルの frontmatter で配送方式を宣言できる > Scenario: frontmatter の無いファイルは全体が本文

---

### TC-003: prompt ルールが resume context の後・completion directive の前に置かれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `delivery: prompt` のルールは main work prompt に前置注入される > Scenario: prompt ルールが resume context の後・completion directive の前に置かれる

---

### TC-004: prompt ルールに follow-up の wrap が使われない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `delivery: prompt` のルールは main work prompt に前置注入される > Scenario: prompt ルールに follow-up の wrap が使われない

---

### TC-005: prompt ルールが postWorkPrompts から除外される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `delivery: prompt` のルールは follow-up prompts に配送されない > Scenario: prompt ルールが postWorkPrompts から除外される

---

### TC-006: 未指定ルールが従来どおり follow-up に載る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `delivery: followup` と未指定のルールは follow-up だけに配送される > Scenario: 未指定ルールが従来どおり follow-up に載る

---

### TC-007: delivery: followup も同じく follow-up のみに配送される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: `delivery: followup` と未指定のルールは follow-up だけに配送される > Scenario: delivery: followup も同じく follow-up のみに配送される

---

### TC-008: 未知 delivery 値で buildStepContext が throw する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 未知の `delivery` 値は step 実行前に設定エラーで fail する > Scenario: 未知 delivery 値で buildStepContext が throw する

---

### TC-009: splitRulesByDelivery — `delivery: prompt` 単独ファイルが prompt バケットに入る

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-01

**GIVEN** `delivery: prompt` frontmatter を持つファイルの内容文字列 1 件
**WHEN** `splitRulesByDelivery([content])` を呼ぶ
**THEN** `result.prompt` に frontmatter 除去済み本文が 1 件入り、`result.followup` は空配列である

---

### TC-010: splitRulesByDelivery — prompt / followup 混在の複数ファイルを正しく分類する

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-01

**GIVEN** `delivery: prompt` 1 件・`delivery: followup` 1 件・frontmatter なし 1 件の計 3 件のファイル内容
**WHEN** `splitRulesByDelivery([...])` を呼ぶ
**THEN** `result.prompt` に prompt 件のみ、`result.followup` に followup・未指定の計 2 件が入る

---

### TC-011: splitRulesByDelivery — 出力の順序が入力順を保つ

**Category**: unit
**Priority**: should
**Source**: design.md > D2 / tasks.md > T-01

**GIVEN** `delivery: prompt` の 3 件のファイル内容（本文が A / B / C と識別可能）
**WHEN** `splitRulesByDelivery([contentA, contentB, contentC])` を呼ぶ
**THEN** `result.prompt` の順序は [body_A, body_B, body_C] のまま保たれる

---

### TC-012: buildRulesPromptSection — preamble が 1 回のみ出力される

**Category**: unit
**Priority**: must
**Source**: design.md > D5 / tasks.md > T-02

**GIVEN** 3 件の本文文字列
**WHEN** `buildRulesPromptSection(["body1", "body2", "body3"])` を呼ぶ
**THEN** 出力文字列中に `<project-rules>` タグが 1 回だけ現れ、`</project-rules>` も 1 回だけ現れる

---

### TC-013: buildRulesPromptSection — 複数本文が `<rule>` タグで昇順連結される

**Category**: unit
**Priority**: should
**Source**: design.md > D5 / tasks.md > T-02

**GIVEN** 2 件の本文 `"RULE_A"` / `"RULE_B"`
**WHEN** `buildRulesPromptSection(["RULE_A", "RULE_B"])` を呼ぶ
**THEN** 出力中で `<rule>RULE_A</rule>` が `<rule>RULE_B</rule>` より前に現れる

---

### TC-014: buildRulesPromptSection — 空入力で undefined を返す

**Category**: unit
**Priority**: must
**Source**: design.md > D5 / tasks.md > T-02

**GIVEN** 空配列 `[]`
**WHEN** `buildRulesPromptSection([])` を呼ぶ
**THEN** 戻り値が `undefined` である

---

### TC-015: buildRulesPromptSection — follow-up 3 要素 wrap の文言を含まない

**Category**: unit
**Priority**: must
**Source**: design.md > D5 / tasks.md > T-02

**GIVEN** 任意の本文 1 件
**WHEN** `buildRulesPromptSection(["body"])` を呼ぶ
**THEN** 出力が「直前の作業結果を確認してください」を含まず、修正範囲 / stop 条件 / 意図解釈の wrap 文言も含まない

---

### TC-016: AgentRunPolicy.promptRules — optional 追加で既存構築サイトが無改変でコンパイルできる

**Category**: unit
**Priority**: must
**Source**: design.md > D3 / tasks.md > T-03

**GIVEN** `AgentRunPolicy` に `promptRules?: string` が追加された後の型定義
**WHEN** `promptRules` を渡さない既存の `AgentRunContext` 構築サイトをそのままコンパイルする
**THEN** TypeScript エラーが発生しない（`typecheck` が green）

---

### TC-017: managed adapter — promptRules を git push instruction の直前に注入する

**Category**: integration
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-06

**GIVEN** `ctx.policy.promptRules` に framing 済み文字列が設定された `AgentRunContext`
**WHEN** managed-agent adapter が `initialMessage` を組み立てる
**THEN** `promptRules` の内容が resume-context セクションより後かつ `buildManagedGitPushInstruction()` の前に現れる

---

### TC-018: codex adapter — promptRules を completion directive の直前に注入する

**Category**: integration
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-06

**GIVEN** `ctx.policy.promptRules` に framing 済み文字列が設定された `AgentRunContext`
**WHEN** codex adapter が main work prompt を組み立てる
**THEN** `promptRules` の内容が `baseFullPrompt` より後かつ `buildMainTurnCompletionInstruction()` の前に現れる

---

### TC-019: claude-code adapter — promptRules が undefined のとき prompt が現行と同一

**Category**: integration
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-05

**GIVEN** `ctx.policy.promptRules` が未定義の `AgentRunContext`
**WHEN** claude-code adapter が main work prompt を組み立てる
**THEN** 生成される prompt が `promptRules` を注入しない従来の出力と byte-identical である

---

### TC-020: managed / codex adapter — promptRules が undefined のとき prompt が現行と同一

**Category**: integration
**Priority**: could
**Source**: design.md > D4 / tasks.md > T-06

**GIVEN** `ctx.policy.promptRules` が未定義の `AgentRunContext`
**WHEN** managed-agent / codex adapter がそれぞれ main work prompt を組み立てる
**THEN** いずれも生成される prompt が従来の出力と同一である

---

### TC-021: 02-test-command.md が `delivery: prompt` を宣言している

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `specrunner/rules/implementer/02-test-command.md` を開く
**WHEN** ファイル先頭を確認する
**THEN** `---\ndelivery: prompt\n---` の frontmatter が先頭に存在し、それ以降の本文（`bun test` 禁止・hang 警告）が保持されている

---

### TC-022: 他の rule ファイルに差分が無い

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** `specrunner/rules/` 以下の全ファイル（02-test-command.md を除く）
**WHEN** 変更前後の diff を確認する
**THEN** 02-test-command.md 以外のファイルに一切の差分が無い

---

### TC-023: rules new scaffold が `delivery: followup` frontmatter を含む

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `src/core/command/rules-new.ts` の `RULE_TEMPLATE` 定数
**WHEN** テンプレート文字列を確認する（`rules-new.test.ts` が生成物を assert する）
**THEN** 生成される scaffold に `delivery: followup` frontmatter が含まれる

---

### TC-024: RULES_USAGE が delivery 宣言を説明している

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-08

**GIVEN** `src/cli/command-registry.ts` の `RULES_USAGE` 文字列
**WHEN** 内容を確認する
**THEN** `delivery: followup`（既定・事後検証）と `delivery: prompt`（行動制約型ルール向け）の説明が含まれている

---

### TC-025: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

`bun run typecheck && bun run test` が全て green であることを verification phase で確認する。

---

### TC-026: 既存 delivery 系テストが無改変で green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-09

`tests/core/step/rules-resolve.test.ts` / `tests/unit/core/step/rules-followup-prompts.test.ts` / `tests/unit/core/step/post-work-prompt-invariant.test.ts` / `src/core/step/__tests__/step-context-builder.test.ts` が無改変で green であることを verification phase で確認する。

---

### TC-027: splitRulesByDelivery — エラーメッセージに不正値・許容値・本文冒頭行が含まれる

**Category**: unit
**Priority**: should
**Source**: design.md > D6 / tasks.md > T-01

**GIVEN** frontmatter `delivery: unknown_value` を持つファイル内容（本文冒頭行が識別可能な文字列）
**WHEN** `splitRulesByDelivery([content])` を呼ぶ
**THEN** 投げられる例外のメッセージに不正値 `unknown_value`、許容値（`followup` / `prompt`）、および本文冒頭行（locator）がいずれも含まれる

---

## Result

```yaml
result: completed
total: 27
automated: 22
manual: 3
must: 18
should: 8
could: 1
blocked_reasons: []
```
