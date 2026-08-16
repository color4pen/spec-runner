# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/rules-delivery/request.md` — 背景・要件・受け入れ基準・architect 評価済み設計判断
- `specrunner/changes/rules-delivery/design.md` — D1〜D8 の全設計判断
- `specrunner/changes/rules-delivery/tasks.md` — T-01〜T-09 の全タスク
- `specrunner/changes/rules-delivery/spec.md` — 全 Requirement・全 Scenario
- `specrunner/changes/rules-delivery/test-cases.md` — 全 27 TC

### コードベース照合

**コード前提の正確性（request.md・design.md が参照するコード位置）:**

- `src/core/step/rules-resolve.ts:29` — `resolveStepRules(stepName, cwd, fs): Promise<string[]>` を確認。ファイル内容の `string[]` を返す。frontmatter の概念なし。✅
- `src/core/step/rules-followup-prompts.ts:9-15` — `WRAP_PREFIX`（「直前の作業結果を確認してください」）と 3 要素 `WRAP_SUFFIX` を確認。pure function。✅
- `src/core/step/step-context-builder.ts:85-96` — `resolveStepRules` → `buildRulesFollowUpPrompts` → `allFollowUpPrompts` → `policy.postWorkPrompts` の 1 本経路を確認。配送分岐なし。✅
- `src/adapter/claude-code/agent-runner.ts:521-554` — プロンプト組み立て順: `baseMessage` → `artifactSection` → `touchedFilesSection` → `resumeSection` → `additionalInstructions`（= `baseFullPrompt`）→ `firstTurnCompletionDirective`（= `fullPrompt`）を確認。`promptRules` 挿入候補位置（`baseFullPrompt` と `firstTurnCompletionDirective` の間）が取れることを確認。✅
- `src/adapter/managed-agent/agent-runner.ts:611-638` — `initialMessage` 組み立て順: `buildMessage` → `project-context` → `resume-context` → `buildManagedGitPushInstruction` を確認。D4 の挿入位置（resume-context の後・git-push 指示の前）が取れることを確認。✅
- `src/adapter/codex/agent-runner.ts:348-367` — `baseFullPrompt` → `buildMainTurnCompletionInstruction()` の間に挿入できることを確認。✅
- `src/core/port/agent-runner.ts:73-100` — `AgentRunPolicy` に `promptRules` フィールドがないことを確認（追加対象）。`postWorkPrompts?: string[]` は存在。✅
- `src/core/reviewers/definition.ts:69-91` — `splitFrontmatter` の実装を確認（先頭 `---` / 閉じ `---` 規約、閉じなし → `body: ""`）。design D2 の「reviewers と同じ規約」記述と一致。✅
- `src/adapter/shared/prompt-builder.ts` — `buildAdditionalInstructions` の内容（branch/slug/projectContext/Agent-Task 禁止）を確認。`baseFullPrompt` の末尾に来る順序を確認。✅
- `src/adapter/claude-code/completion-directive.ts` — `buildReportToolCompletionDirective` が `fullPrompt` 末尾に付くことを確認。✅

**既存テストの無改変 green 要件:**

- `tests/core/step/rules-resolve.test.ts` — `string[]` を assert するテスト群。`resolveStepRules` の signature が変更されないため無改変で green を保てる。✅
- `tests/unit/core/step/post-work-prompt-invariant.test.ts` — `buildRulesFollowUpPrompts(string[])` の呼び出しをテスト。`followup` バケットの内容がこの経路に入り続けるため無改変で green を保てる。✅
- `src/core/step/__tests__/step-context-builder.test.ts` — `readdir: async () => []`（空 rules ディレクトリ）でテスト。rules が 0 件なら `splitRulesByDelivery` も実行されないため無改変で green を保てる。✅
- `src/core/command/rules-new.ts` の `RULE_TEMPLATE` — T-08 でテンプレートと TC-RULES-010 を共に更新する方針が tasks.md に明記されている。✅

**spec.md Scenario ↔ TC マッピング検証:**

全 5 Requirement・8 Scenario を確認し、対応する TC が test-cases.md に存在することを確認。✅

**セキュリティ:**

- frontmatter 解析は `delivery` の単一スカラーのみを読む。YAML デシリアライズ RCE は非該当。✅
- `delivery` の値は `["followup", "prompt"]` の固定集合と照合し、それ以外は例外を投げる。✅
- rule 本文はリポジトリ内の信頼済みコンテンツとしてプロンプトに注入する設計。OWASP A03 は非該当。✅
- `resolveStepRules` は `stepName` を `AGENT_STEP_NAMES` に対して検証済みのパスで解決するため、パストラバーサルリスクはない。✅

---

## 検証できなかった項目

- **managed / codex adapter の実際の `promptRules` 注入後挙動** — adapter コードの挿入位置を読んで構造的に確認済みだが、実行時のプロンプト文字列は実装完了後にのみ確認可能。TC-017/TC-018 が対応。
- **`splitRulesByDelivery` の実装** — 本 change で新設される関数。インターフェース設計（`{ followup: string[]; prompt: string[] }` 返却）と例外ふるまいは tasks.md T-01 で定義済みだが、コードは未実装のため照合不可。
- **ADR refine の生成物** — adr-gen step が担当するため、本 spec-review 時点では存在しない。design.md D7 が生成に必要な情報（改訂内容・framing 文言）を記録済みであることを確認。

---

## Findings 詳細

### Finding-01（low / fixable）: spec.md — "frontmatter が本文から除去される" Scenario が `delivery: prompt` のみをカバー

**場所**: `specrunner/changes/rules-delivery/spec.md` — "Scenario: frontmatter が本文から除去される"

```
Given frontmatter `---\ndelivery: prompt\n---` を持つ rule ファイル
```

Requirement 本文には「agent へ渡す rule 本文からは frontmatter を除去する」と明記されており、全配送方式に適用される。しかし Scenario の Given が `delivery: prompt` 専用であるため、TC-001（この Scenario 起源）は `delivery: followup` フロントマター除去を根拠とする自動テストが欠落する。

tasks.md T-01 は "frontmatter が本文から除去される（`delivery: prompt` / `delivery: followup` 双方）" と明記しており実装側でカバーしているが、spec Scenario → TC の導出経路から `followup` ケースが抜ける。

**修正案**: Scenario に `delivery: followup` のケースを追加するか、Given を "frontmatter を持つ rule ファイル（例: `delivery: prompt` または `delivery: followup`）" に拡張する。

---

### Finding-02（low / fixable）: design.md D6 — エラーメッセージに "step 名" を記載しているが実装制約上不可能

**場所**: `specrunner/changes/rules-delivery/design.md` — D6「未知 delivery は step 実行前に fail」

```
メッセージは step 名・不正値・許容値・本文冒頭行（locator）を含める。
```

`splitRulesByDelivery` は `string[]`（ファイル内容）のみを受け取り、step 名を知らない（D2 で `resolveStepRules` の signature を `string[]` で凍結）。`buildStepContext` も D6 の "catch しない" 指定により例外を enrich できない。結果として step 名をエラーメッセージに含めることは現設計では不可能である。

tasks.md T-01 と TC-027 はすでに正しく step 名を除外した要件を記述しており（"不正値・許容値・本文冒頭行"）、実装への影響はない。しかし design.md の記述が実装制約と矛盾しており、adr-gen や将来の参照者を混乱させる可能性がある。

**修正案**: design.md D6 の "step 名" を記述から除去し、"不正値・許容値・本文冒頭行（locator）" に揃える。
