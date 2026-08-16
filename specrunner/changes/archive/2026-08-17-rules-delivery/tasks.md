# Tasks: rules の配送方式 `delivery: prompt`

## T-01: 配送分類の core pure module を追加する

- [x] `src/core/step/` に新 module（例 `rules-delivery.ts`）を追加する。node:fs を import しない pure 関数のみ。
- [x] frontmatter 分割関数を実装する。先頭行が `---` のとき次の `---` までを frontmatter、以降を本文とする。閉じ `---` が無い場合は reviewers 定義（`src/core/reviewers/definition.ts` の `splitFrontmatter`）と同じ規約で扱う。frontmatter が無ければ frontmatter="" / 本文=全体。
- [x] frontmatter から `delivery` キー（単一スカラ）を読む。未指定は `followup`。値は `followup` / `prompt` のみ許容。
- [x] 分類関数（例 `splitRulesByDelivery(contents: string[]): { followup: string[]; prompt: string[] }`）を実装する。各内容を frontmatter 分割し、本文（frontmatter 除去済み）を delivery に応じたバケットへ入れる。順序は入力順を保つ。
- [x] 未知の `delivery` 値のとき例外を投げる。メッセージに不正値・許容値（followup / prompt）・本文冒頭行（locator）を含める。
- [x] 上記を固定する unit テストを追加する（別 T にせずこの T 内で完結させてよい）:
  - frontmatter が本文から除去される（`delivery: prompt` / `delivery: followup` 双方）
  - frontmatter 無しは全体が本文かつ followup バケット
  - 未指定 delivery は followup バケット
  - 未知 delivery で throw（メッセージに不正値と許容値を含む）

**Acceptance Criteria**:
- `splitRulesByDelivery` が followup / prompt を正しく分離し、いずれの本文からも frontmatter が除去されている。
- 未知 delivery 値で例外を投げ、silent fallback しない。
- 追加した unit テストが green。

## T-02: prompt 配送の framing pure 関数を追加する

- [x] design D5 の framing を返す pure 関数（例 `buildRulesPromptSection(bodies: string[]): string | undefined`）を実装する。T-01 の module 内でよい。
- [x] framing は `<project-rules>` preamble +「作業全体でこの規約を遵守する」旨の文言 + 各本文を `<rule>` タグで昇順連結、preamble は 1 回のみ。follow-up の 3 要素（修正範囲 / stop 条件 / 意図解釈）を含めない。
- [x] 入力が空配列のとき `undefined` を返す。
- [x] unit テスト: 複数本文が昇順で `<rule>` 連結される / preamble が 1 回 / 3 要素 wrap の文言を含まない / 空入力で undefined。

**Acceptance Criteria**:
- framing 出力が design D5 の文言・構造と一致する。
- follow-up wrap の 3 要素を一切含まない。
- 追加した unit テストが green。

## T-03: port 契約に `promptRules` を追加する

- [x] `src/core/port/agent-runner.ts` の `AgentRunPolicy` に `promptRules?: string`（provider 中立、prompt 配送ルールを framing 済みの 1 ブロック、0 件時 undefined）を追加し doc コメントを付す。
- [x] `postWorkPrompts` とは別フィールドであること（重複配送しない旨）をコメントに明記する。

**Acceptance Criteria**:
- `AgentRunPolicy.promptRules?: string` が定義され、typecheck が通る。
- 既存の `AgentRunContext` 構築サイトが無改変でコンパイルできる（optional 追加）。

## T-04: buildStepContext で配送を振り分ける

- [x] `src/core/step/step-context-builder.ts` で `resolveStepRules` の出力を T-01 の `splitRulesByDelivery` に通す。
- [x] followup バケット → 既存 `buildRulesFollowUpPrompts` に渡し、現行どおり `allFollowUpPrompts` → `policy.postWorkPrompts` に載せる（既存の step 固有 follow-up 連結順は不変）。
- [x] prompt バケット → T-02 の framing を適用し `policy.promptRules` に載せる（0 件時 undefined）。
- [x] `splitRulesByDelivery` が投げる例外はそのまま伝播させる（catch しない）。`buildStepContext` は adapter の `run()` より前に呼ばれるため step 実行前に fail する。
- [x] `buildStepContext` のヘッダーコメント（手順 2 の説明）を配送分岐に合わせて更新する。

**Acceptance Criteria**:
- `delivery: prompt` の rule 本文が `policy.promptRules` に載り、`policy.postWorkPrompts` には含まれない。
- 未指定 / `delivery: followup` の rule 本文が `policy.postWorkPrompts` に載り、`policy.promptRules` には載らない。
- 未知 delivery 値で `buildStepContext` が throw する。
- rules ディレクトリが空（readdir=[]）の既存 `step-context-builder.test.ts` が無改変で green。

## T-05: claude-code adapter に prompt 配送を注入し、位置を固定する

- [x] `src/adapter/claude-code/agent-runner.ts` で `ctx.policy.promptRules` が存在すれば main work prompt に挿入する。挿入位置は `baseFullPrompt`（resume-context / additionalInstructions を含む）と `firstTurnCompletionDirective` の**間**。
- [x] `promptRules` が undefined のときは現行の prompt を一切変えない。
- [x] adapter テストを追加する（`src/adapter/claude-code/__tests__/` に既存の prompt 注入テストと同様のスタイルで）:
  - `promptRules` を含む ctx で main prompt を組み立て、rule 本文の index が resume-context セクションより後・completion directive より前であることを assert する。
  - `promptRules` を含む ctx で、rule 本文が `postWorkPrompts` 経路（follow-up）に現れないことを assert する。

**Acceptance Criteria**:
- `delivery: prompt` 由来の本文が main work prompt に含まれ、位置が resume context より後・completion directive より前であることをテストで固定する。
- `delivery: prompt` の rule が follow-up prompts に含まれないことをテストで固定する。
- `promptRules` undefined 時に prompt 出力が現行と同一。

## T-06: managed / codex adapter に prompt 配送を注入する

- [x] `src/adapter/managed-agent/agent-runner.ts`: `ctx.policy.promptRules` が存在すれば resume-context セクションの後、`buildManagedGitPushInstruction()` の前（`initialMessage` 末尾直前）に挿入する。
- [x] `src/adapter/codex/agent-runner.ts`: `ctx.policy.promptRules` が存在すれば `baseFullPrompt` と `buildMainTurnCompletionInstruction()` の間に挿入する。
- [x] いずれも `promptRules` undefined 時は現行の prompt を変えない。

**Acceptance Criteria**:
- managed / codex いずれも `promptRules` を completion directive（managed は git push instruction）の直前に注入する。
- `promptRules` undefined 時に両 adapter の prompt 出力が現行と同一。
- typecheck が通る。

## T-07: 移行第 1 号 — `02-test-command.md` に `delivery: prompt` を宣言する

- [x] `specrunner/rules/implementer/02-test-command.md` の先頭に frontmatter `---\ndelivery: prompt\n---` を追加する。本文は現行維持。
- [x] 他の rule ファイルは変更しない。

**Acceptance Criteria**:
- `specrunner/rules/implementer/02-test-command.md` が `delivery: prompt` を宣言している。
- 本文（`bun test` 禁止・hang 警告）が保持されている。
- 他 rule ファイルに差分が無い。

## T-08: `rules new` の scaffold テンプレートと usage に delivery を追随させる

- [x] `src/core/command/rules-new.ts` の `RULE_TEMPLATE` に既定 frontmatter `---\ndelivery: followup\n---` を追加し、delivery の意味（followup=事後検証 / prompt=作業中の前置制約、既定は followup）を説明する行をテンプレート冒頭コメントに追記する。
- [x] `src/cli/command-registry.ts` の `RULES_USAGE` に delivery 宣言の説明セクションを追加する（既定 followup、prompt は行動制約型ルール向け）。
- [x] `tests/unit/core/command/rules-new.test.ts` を更新し、生成テンプレートが `delivery: followup` frontmatter を含むことを assert する（既存 assertion のうちテンプレート文言変更で影響を受けるものを新文言に合わせて更新する）。

**Acceptance Criteria**:
- 生成される scaffold が `delivery: followup` frontmatter を含む。
- `RULES_USAGE` が delivery 宣言を説明している。
- 更新後の `rules-new.test.ts` が green。

## T-09: 全体検証

- [x] `bun run typecheck && bun run test` が green であることを確認する（`bun test` は使わない — `rules/implementer/02-test-command.md` 参照）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 既存 delivery 系テスト（`rules-resolve.test.ts` / `rules-followup-prompts.test.ts` / `post-work-prompt-invariant.test.ts` / `step-context-builder.test.ts`）が無改変で green。

> Note: ADR refine（旧 ADR `2026-05-24-per-step-rule-followup` の D1 / D2 / D3 改訂）は adr-gen step が生成する。design.md に改訂内容と framing 確定文言を記録済み。ADR の path / ファイル名は本 change の成果物には記載しない（この project の規律）。
