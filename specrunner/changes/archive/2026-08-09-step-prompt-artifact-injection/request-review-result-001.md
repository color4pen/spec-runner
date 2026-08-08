# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（現状コードの前提）

1. **`src/adapter/claude-code/agent-runner.ts:459-486`** — `baseMessage = step.buildMessage(state, stepCtx)` + `resumeSection` + `buildAdditionalInstructions(ctx)` + completion directive の連結で `fullPrompt` を組み立てていることを確認（line 459: baseMessage, 461: additionalInstructions, 484-486: fullPrompt 確定）✓

2. **`src/adapter/shared/prompt-builder.ts`** — `buildAdditionalInstructions(ctx: AgentRunContext): string`（同期関数）と `buildResumeSection(ctx): string` を export していることを確認 ✓

3. **`src/adapter/claude-code/agent-runner.ts:43`** — `import { buildAdditionalInstructions } from "../shared/prompt-builder.js"` を確認 ✓

4. **`src/adapter/codex/agent-runner.ts:23`** — `import { buildAdditionalInstructions, buildResumeSection } from "../shared/prompt-builder.js"` を確認 ✓

5. **`src/core/step/implementer.ts:96`** — `1. Read ${changeFolderPath(slug)}/tasks.md` の指示文を確認 ✓

6. **`src/core/step/conformance.ts:85-86`** — `Read ${changeFolder}/tasks.md` / `Read ${changeFolder}/design.md` を確認 ✓

7. **`src/core/step/code-review.ts:78`** — `Read the spec in ${changeFolderPath(opts.slug)}/` の指示を確認 ✓

8. **`src/core/step/custom-reviewer.ts:62`** — `Read the spec in ${changeFolderPath(opts.slug)}/` の指示を確認 ✓

### 設計整合性

- `AgentRunContext` に `cwd`（worktree path）と `slug` フィールドが存在することを確認。これで `path.join(cwd, "specrunner/changes", slug)` として change folder を特定でき、artifact を読める ✓
- managed-agent adapter（`src/adapter/managed-agent/agent-runner.ts`）は `prompt-builder.ts` を import しておらず、`buildAdditionalInstructions` を使っていない。managed runtime ではワーカー（agent）がリモートで動くためローカルファイルアクセスがなく、injection がローカル runtime のみに適用されることは設計的に妥当 ✓
- codex adapter は claude-code と同じ共有層（`buildAdditionalInstructions`）を使っており、shared layer に注入を追加すれば両方に自然に適用される ✓
- 現在の `buildAdditionalInstructions` は同期関数。ファイル読み取りは async であるため、実装者は「新たな async 関数を shared layer に追加し、両 adapter から個別に呼び出す」パターンを取るのが自然（既存関数のシグネチャを変えずに既存テストを無改変で維持できる）。request.md 要件 2 に合致 ✓
- `src/adapter/claude-code/__tests__/agent-redirect.test.ts` と `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` は `buildAdditionalInstructions` を同期で呼ぶテストが存在するが、新規 async 関数を分離すれば無改変 ✓

### 受け入れ基準の検証可能性

- (a)～(d) の unit test 要件はいずれも具体的で機械検証可能 ✓
- `src/core/step/__tests__/` 配下の既存テストは buildMessage を直接テストするものではなく、adapter 経由の注入が加わっても無改変で green を維持できる ✓
- `typecheck && test` は既存 pipeline で green を要求するもので明確 ✓

## 検証できなかった項目

None — 全コードアサーションをソースで直接確認済み。

## Findings 詳細

None — blocking / decision-needed 項目なし。

**観察事項（非ブロッキング）:** codex adapter（`agent-runner.ts:316-320`）と claude-code adapter（`agent-runner.ts:459-486`）では prompt の組み立て順が微妙に異なる（codex は `buildResumeSection` を外で呼ぶ）。実装者は両 adapter で artifact injection ブロックの挿入位置を統一するよう注意すること。これは request の要件を外れるものではない。
