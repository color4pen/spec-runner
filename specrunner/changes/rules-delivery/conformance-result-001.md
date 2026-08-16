# Conformance Result — rules-delivery — Iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| 観点 | 確認方法 | 結果 |
|------|---------|------|
| Spec Requirements (4 件) | コード + テスト読解 | 全件満足 |
| Spec Scenarios (8 件) | テストファイル突合 | 7 件直接固定、1 件ギャップあり (F-001) |
| request.md 受け入れ基準 (8 件) | コード + テスト読解 | 7 件満足、1 件は adr-gen 委譲（設計どおり） |
| typecheck && test | verification-result.md 参照 | green |

### Requirement: rule ファイルの frontmatter で配送方式を宣言できる

- `src/core/step/rules-delivery.ts` `splitRulesByDelivery` が frontmatter を読み、body を両経路で除去する (D1)。
- Scenario "frontmatter が本文から除去される（prompt / followup 双方）" → `tests/core/step/rules-delivery.test.ts` TC-001 が両方向を固定。
- Scenario "frontmatter の無いファイルは全体が本文" → TC-002 が固定。
- `delivery` キー以外の rule 本文は解釈しない（SHALL NOT 維持）。

### Requirement: delivery:prompt のルールは main work prompt に前置注入される

- Scenario "resume context の後・completion directive の前に置かれる" → `src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts` TC-003 が `resumeIdx < rulesIdx < directiveIdx` を assert して固定。
- Scenario "follow-up の wrap が使われない" → `tests/core/step/rules-delivery.test.ts` TC-015 が「直前の作業結果を確認してください」等を含まないことを固定。
- managed adapter (TC-017) と codex adapter (TC-018) も各 completion directive の直前への注入を固定済み。

### Requirement: delivery:prompt のルールは follow-up prompts に配送されない

- adapter 側（adapter が promptRules を follow-up に echo しない）は claude-code TC-005 が固定。
- ただし、spec scenario の When 節「**buildStepContext** が AgentRunContext を組み立てる」に対応するテストが不在 — **F-001** 参照。

### Requirement: delivery:followup と未指定のルールは follow-up だけに配送される

- Scenario "未指定ルールが従来どおり follow-up に載る" → `step-context-builder.test.ts` TC-006 が固定。
- Scenario "delivery:followup も follow-up のみに配送される" → TC-007 が固定。frontmatter 行が stripped 済み body であることも assert。

### Requirement: 未知の delivery 値は step 実行前に設定エラーで fail する

- Scenario "未知 delivery 値で buildStepContext が throw する" → `step-context-builder.test.ts` TC-008 が固定。
- エラーメッセージの内容（不正値・許容値・本文冒頭行）は `rules-delivery.test.ts` TC-027 が固定。
- `validateDelivery` が throw し silent fallback しない (D6)。

### 受け入れ基準その他

- `specrunner/rules/implementer/02-test-command.md` 先頭に `---\ndelivery: prompt\n---` を確認。本文（bun test 禁止・hang 警告）は保持されている。
- `src/core/command/rules-new.ts` `RULE_TEMPLATE` が `---\ndelivery: followup\n---` frontmatter を含む。`rules-new.test.ts` TC-023 が固定。
- `src/cli/command-registry.ts` `RULES_USAGE` に `delivery: followup` (既定・事後検証) と `delivery: prompt` (行動制約型) の説明を確認。
- `AgentRunPolicy.promptRules?: string` が `src/core/port/agent-runner.ts` に追加済み (D3)。optional 追加のため既存構築サイトは無改変でコンパイルできる。
- ADR refine: tasks.md D7 / design.md D7 の規律により adr-gen step が生成する。conformance 時点では未生成で正常（設計どおり）。

## 検証できなかった項目

None（ADR は adr-gen 委譲であり設計上 conformance 時点では存在しない。これは未検証ではなく設計どおりの deferred）。

## Findings 詳細

### F-001: spec scenario "prompt ルールが postWorkPrompts から除外される" の buildStepContext レベル固定が不在

**対象ファイル**: `src/core/step/__tests__/step-context-builder.test.ts`

**Spec scenario (normative)**:
> Requirement: `delivery: prompt` のルールは follow-up prompts に配送されない  
> Scenario: prompt ルールが postWorkPrompts から除外される  
>
> Given step ディレクトリに `delivery: prompt` の rule のみが存在する  
> When buildStepContext が AgentRunContext を組み立てる  
> Then その rule 本文は policy.postWorkPrompts のいずれの要素にも含まれず、policy.promptRules 側に載る

`step-context-builder.test.ts` には TC-006（frontmatter なし → postWorkPrompts, promptRules undefined）と TC-007（delivery:followup → 同上）が存在するが、`delivery: prompt` ケース（promptRules に載り postWorkPrompts には載らない）を buildStepContext 経由で直接検証するテストが存在しない。

adapter レベルの TC-005（claude-code `prompt-rules-injection.test.ts`）は adapter が promptRules を follow-up に echo しないことを固定しているが、このテストは `ctx.policy.promptRules` を直接セットしており buildStepContext を経由しない。そのため spec scenario の When 節「buildStepContext が AgentRunContext を組み立てる」が実際に route を正しく振り分けるかは、TC-009（`splitRulesByDelivery` 単体）と TC-006/007（followup 方向のみ buildStepContext 経由）の組み合わせから構造的に推論されるにとどまる。

**実装コードは正しい**（`splitRulesByDelivery` が prompt バケットを返し、followup バケットのみが `buildRulesFollowUpPrompts` に渡り、promptRules は `buildRulesPromptSection(promptBodies)` で組み立てられ policy に載る）が、spec scenario が名指した component レベルでの直接固定が欠けている。

**必要な対処**: `step-context-builder.test.ts` に `ruleFs("step", "---\ndelivery: prompt\n---\nbody")` を使ったテストを追加し、`buildStepContext` 呼び出し後に `ctx.policy.promptRules` に body が含まれること AND `ctx.policy.postWorkPrompts` が undefined または body を含まないことを assert する。
