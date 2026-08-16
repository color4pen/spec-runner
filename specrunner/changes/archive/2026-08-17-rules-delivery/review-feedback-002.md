# Code Review Feedback — rules-delivery — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（28 ファイル、2549 行追加）
- `src/core/step/rules-delivery.ts` — pure module 実装を完全読解。frontmatter 分割・delivery 抽出・分類・framing の 4 関数が正しく機能していることを確認
- `tests/core/step/rules-delivery.test.ts` — TC-001/002/009/010/011/012/013/014/015/027 がすべてカバーされていることを確認
- `src/core/step/__tests__/step-context-builder.test.ts` — iter 1 で指摘した F-001(TC-008) / F-002(TC-006/007) が新規 `ruleFs` ヘルパーを用いた統合テストとして追加されていることを確認
  - TC-006: `ruleFs("spec-review", ruleBody)` で frontmatter なしルールが `postWorkPrompts` に載り `promptRules` が `undefined`
  - TC-007: `delivery: followup` ルールが同様に `postWorkPrompts` に載り `promptRules` には載らない
  - TC-008: `delivery: bogus` で `buildStepContext` が throw（2 assertions: rejects.toThrow() / rejects.toThrow(/bogus/)）
- `src/core/step/step-context-builder.ts` — `splitRulesByDelivery` 呼び出し後に followup → `buildRulesFollowUpPrompts` → `allFollowUpPrompts`、prompt → `buildRulesPromptSection` → `policy.promptRules` の経路を確認。例外は catch なし伝播（line 94）
- `src/core/port/agent-runner.ts` — `AgentRunPolicy.promptRules?: string` の optional 追加とコメント（D3 rules-delivery、distinct from postWorkPrompts）を確認
- `src/adapter/claude-code/agent-runner.ts` diff — `promptRulesSection` が `baseFullPrompt` と `firstTurnCompletionDirective` の間に挿入されていることを確認（D4 仕様どおり）
- `src/adapter/managed-agent/agent-runner.ts` diff — resume-context セクション後・`buildManagedGitPushInstruction()` 前に注入されていることを確認（D4 仕様どおり）
- `src/adapter/codex/agent-runner.ts` diff — `baseFullPrompt` と `buildMainTurnCompletionInstruction()` の間に注入されていることを確認（D4 仕様どおり）
- `src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts` — TC-003/005/019 のカバレッジを確認
  - TC-003: resumeIdx < rulesIdx < directiveIdx の順序 assert
  - TC-005: main turn に `SAMPLE_PROMPT_RULES` が含まれ、follow-up turn には含まれないことを assert
  - TC-019: `promptRules` undefined 時に prompt が追加なし（byte-identical）であることを assert
- `specrunner/rules/implementer/02-test-command.md` — `delivery: prompt` frontmatter が先頭に存在し、本文（`bun test` 禁止・hang 警告）が保持されていることを確認（TC-021）
- `specrunner/rules/` — `02-test-command.md` 以外のファイルに差分がないことを `git diff main...HEAD -- specrunner/rules/ --name-only` で確認（TC-022）
- `src/core/command/rules-new.ts` — `RULE_TEMPLATE` が `---\ndelivery: followup\n---` frontmatter を含み、delivery の説明コメントが追記されていることを確認（TC-023）
- `src/cli/command-registry.ts` RULES_USAGE — delivery セクション（followup: 事後検証/prompt: 行動制約型）が追加されていることを確認（TC-024）
- `tests/unit/core/command/rules-new.test.ts` — TC-023 assertion (`/^---\ndelivery: followup\n---/`) が追加されていることを確認
- `specrunner/changes/rules-delivery/verification-result.md` — build/typecheck/test/lint/changed-line-coverage 全 passed（783 test files, 11563 tests passed）（TC-025/026）
- 既存 delivery 系テストの無改変確認（`git diff main...HEAD -- tests/core/step/rules-resolve.test.ts tests/unit/core/step/rules-followup-prompts.test.ts tests/unit/core/step/post-work-prompt-invariant.test.ts` が 0 行）（TC-026）
- `specrunner/adr/` 一覧 — `rules-delivery` ADR は adr-gen step に委任（tasks.md T-09 Note 記載どおり）

## 検証できなかった項目

- TC-017/TC-018（managed/codex adapter injection 統合テスト）— コード実装は正しく D4 仕様に従っていることを読解で確認済み。自動テストは should 優先度のため non-blocking
- TC-020（managed/codex undefined behavior）— could 優先度のため non-blocking
- ADR refine の existence — adr-gen step pending のため現時点では不存在。tasks.md・design.md に設計判断と文言は記録済み

## Findings 詳細

### iter 1 F-001 / F-002 の解消確認

- **F-001（TC-008 統合テスト欠如）**: `step-context-builder.test.ts` に `delivery: bogus` rule で `buildStepContext` が `rejects.toThrow()` することを assert する 2 件のテストが追加された。`buildStepContext` が catch しないことが統合レベルで固定された。✅ 解消
- **F-002（TC-006/007 統合テスト欠如）**: `ruleFs` ヘルパーを用いた integration-level テストが追加され、`delivery: followup` / 未指定ルールが `postWorkPrompts` に載り `promptRules` が `undefined` であることが統合レベルで固定された。✅ 解消

### 新規 Findings

None
