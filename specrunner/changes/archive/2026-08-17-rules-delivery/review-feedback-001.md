# Code Review Feedback — rules-delivery — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（25 ファイル、2254 行追加）
- `src/core/step/rules-delivery.ts` — pure module 実装確認。frontmatter 分割・delivery 分類・framing 関数を完全読解
- `tests/core/step/rules-delivery.test.ts` — TC-001/002/009-015/027 カバレッジ確認
- `src/core/step/step-context-builder.ts` — `splitRulesByDelivery` 呼び出しと policy 組み立てを読解（line 94: catch なし伝播）
- `src/core/port/agent-runner.ts` — `AgentRunPolicy.promptRules?: string` の追加とコメント確認
- `src/adapter/claude-code/agent-runner.ts` diff — baseFullPrompt + promptRulesSection + firstTurnCompletionDirective の順を確認
- `src/adapter/managed-agent/agent-runner.ts` diff — resumeSection 後・gitPushInstruction 前の位置を確認
- `src/adapter/codex/agent-runner.ts` diff — baseFullPrompt + promptRulesSection + completionInstruction の順を確認
- `src/adapter/claude-code/__tests__/prompt-rules-injection.test.ts` — TC-003/005/019 カバレッジ確認
- `src/core/step/__tests__/step-context-builder.test.ts` — `readdir: async () => []`（ルール 0 件）のみ使用。delivery 配送の統合テストが存在しないことを確認
- `specrunner/rules/implementer/02-test-command.md` — `delivery: prompt` frontmatter 先頭存在確認（TC-021）
- `src/core/command/rules-new.ts` — `RULE_TEMPLATE` が `delivery: followup` frontmatter を含むことを確認（TC-023）
- `src/cli/command-registry.ts` RULES_USAGE — delivery 宣言の説明セクション（followup/prompt 双方）が存在することを確認（TC-024）
- `tests/unit/core/command/rules-new.test.ts` — TC-023 assertion (`/^---\ndelivery: followup\n---/`) 確認
- `specrunner/changes/rules-delivery/verification-result.md` — build/typecheck/test/lint/changed-line-coverage 全 passed 確認（TC-025/026）
- `specrunner/adr/` 一覧 — `rules-delivery` ADR が未生成であることを確認（adr-gen step pending）

## 検証できなかった項目

- TC-017/TC-018（managed/codex adapter injection 統合テスト）— コード実装を読んで正しさを確認済みだが、自動テストが存在しない（should priority のため non-blocking）

## Findings 詳細

### F-001: TC-008 統合テスト欠如

`test-cases.md` TC-008 シナリオ「buildStepContext が例外を投げ、AgentRunContext を返さない」に対応する
`step-context-builder` レベルの統合テストが存在しない。

`splitRulesByDelivery` が throw することは TC-027 で固定済み。
`buildStepContext` が catch しないことは `step-context-builder.ts:94` の実装から自明だが、
この伝播パスは自動テストで固定されていない。将来 buildStepContext に try/catch が追加された場合、
サイレントに fail-safe が失われてもテストは通過し続ける。

受け入れ基準「未知の `delivery` 値が設定エラーで fail し、silent fallback しないことをテストで固定する」
は `splitRulesByDelivery` 単体テスト（TC-027）では部分的にしか充足されない。
TC-008 で求められているのは buildStepContext 経由の fail-fast を固定することである。

**修正方針**: `src/core/step/__tests__/step-context-builder.test.ts` に
`readdir: async () => ["01-bogus.md"]` / `readFile: async () => "---\ndelivery: bogus\n---\nbody"`
を返す fsAdapter を用意し、`buildStepContext(...).rejects.toThrow()` を assert するテストを追加する。

---

### F-002: TC-006/TC-007 統合テスト欠如

`test-cases.md` TC-006「未指定ルールが従来どおり follow-up に載る」/ TC-007「delivery:followup のルールが
follow-up のみに配送される」は「integration / must」だが、`buildStepContext` を経由したテストが存在しない。

現在の `step-context-builder.test.ts` は全テストで `readdir: async () => []`（ルール 0 件）を使用しており、
`buildStepContext` が `splitRulesByDelivery` の followup バケットを `policy.postWorkPrompts` に、
prompt バケットを `policy.promptRules` に正しく割り当てることが統合レベルで固定されていない。

受け入れ基準「未指定 / `delivery: followup` のルールが postWork follow-up だけに配送され、
未指定の挙動が現行と同一であることをテストで固定する」の充足が不完全である。

**修正方針**: `step-context-builder.test.ts` に frontmatter なし / `delivery: followup` それぞれのルール内容を
返す fsAdapter を用意し、`ctx.policy.postWorkPrompts` にルール本文が含まれ、
`ctx.policy.promptRules` が undefined であることを assert するテストを追加する。
