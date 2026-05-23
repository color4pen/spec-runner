# Design: per-step-rule-followup

## Overview

project 固有の規約 (コーディング規約、評価観点、ドメイン知識) を step 別 rules ファイルとして配置し、作業 turn 後に 1 ファイル = 1 follow turn として N 段注入する。ADR `2026-05-22-intra-step-follow-up-prompt` D2 の「1 本」を「ファイル数で bounded な N 段」に一般化する。

## Design Decisions

### D1: rules ファイル配置パス

`specrunner/rules/<step-name>/<NN-name>.md`

- project root 直下。change folder には置かない (job 横断で共有)
- `<step-name>` は `AGENT_STEP_NAMES` に一致するディレクトリ名のみ有効。CLI step (`verification` / `pr-create` / `delta-spec-validation`) 配下の rules ファイルは executor が無視する
- `<NN-name>` は数字 prefix (`01-coding-style.md`, `02-domain-terms.md` 等) で昇順ソート
- ファイルの中身は完全自由文。frontmatter なし。CLI は中身を解釈・検証しない

**path utility**: `src/util/paths.ts` に `stepRulesDirRel(stepName: string): string` を追加。`"specrunner/rules/${stepName}"` を返す

### D2: port 契約変更 — followUpPrompts: string[]

`AgentRunContext.followUpPrompt?: string` → `followUpPrompts?: string[]`

- 空配列 `[]` と `undefined` は同義 (follow turn なし)
- 既存の design step `followUpPrompt` は executor が `followUpPrompts[0]` に配置
- rules follow-ups は `followUpPrompts[1..N]` に追加される (既存 follow-up → rules の順)
- `AgentStep.followUpPrompt` / `getFollowUpPrompt` は変更なし (要件 11 準拠: AgentStep interface に新 field を追加しない)

**後方互換**: `followUpPrompt` field はソース互換で残すが deprecated 扱い。adapter は `followUpPrompts` のみ参照。executor の転記ロジックで `followUpPrompt` → `followUpPrompts[0]` に変換。

### D3: rules-resolve.ts — ファイル列挙・順序合成

`src/core/step/rules-resolve.ts` (sibling 配置、ADR 2026-05-23 パターン)

```ts
interface RulesResolveFs {
  readdir(dir: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

async function resolveStepRules(
  stepName: string,
  cwd: string,
  fs: RulesResolveFs,
): Promise<string[]>;
```

- `path.join(cwd, stepRulesDirRel(stepName))` のファイルを列挙
- `.md` のみ対象、ディレクトリは除外
- 数字 prefix 昇順でソート (`01-a.md` < `02-b.md` < `10-c.md`)
- 各ファイルの中身を readFile して `string[]` で返す
- ディレクトリ不存在時は空配列 (ENOENT catch)
- `fsAdapter` は required inject。default fallback を作ると core → node:fs の boundary 違反 (要件 D7)

### D4: rules-followup-prompts.ts — wrap 文言付き prompt 変換

`src/core/step/rules-followup-prompts.ts` (pure function)

```ts
function buildRulesFollowUpPrompts(ruleContents: string[]): string[];
```

各 rule content に 3 要素 wrap を付加:

```
以下の project 規約に基づいて、直前の作業結果を確認してください。

<rule>
{ruleContent}
</rule>

- 修正範囲: この規約に関連するファイルのみ修正してください。関係のないファイルには触れないでください。
- stop 条件: この規約に対する違反がなければ、何も変更せず end_turn してください。
- 意図解釈: 書かれた言葉をそのまま機械的に適用するのではなく、規約の意図を汲んで判断してください。
```

3 要素以外の wrap を CLI が追加することは禁止 (要件 5)。wrap 文言の拡張は新 ADR が必要。

### D5: executor の rules 解決

`StepExecutor.runAgentStep` に rules 解決ロジックを追加:

1. `resolveStepRules(step.name, cwd, fsAdapter)` で rules ファイル中身を取得
2. `buildRulesFollowUpPrompts(ruleContents)` で wrap 付き prompt 列を生成
3. 既存 `followUpPrompt` (step.getFollowUpPrompt ?? step.followUpPrompt) と結合:
   - 既存あり: `[existingFollowUp, ...rulesPrompts]`
   - 既存なし: `[...rulesPrompts]`
4. `ctx.followUpPrompts = combined` (空配列なら undefined でも可)

`StepExecutor` は `RulesResolveFs` の実装として `node:fs/promises` の `readdir` / `readFile` を渡す。テスト時は mock を注入。

### D6: adapter の N 段対応

#### shared/follow-up.ts

`shouldRunFollowUp` を N 段対応に拡張:

```ts
function shouldRunFollowUps(
  ctx: Pick<AgentRunContext, "followUpPrompts">,
  baseCompletionReason: AgentRunResult["completionReason"],
): boolean;
```

`followUpPrompts` が non-empty かつ base が success なら true。

#### Claude Code adapter

`followUpPrompts` をループ。各 prompt で `resume: sessionId` の query を投げる。usage は全 turn 累積。

#### Codex adapter

`followUpPrompts` をループ。各 prompt で `activeThread.run(prompt)` を呼ぶ。usage は全 turn 累積。

#### Managed Agent adapter

`followUpPrompts` をループ。各 prompt で `executeFollowUpTurn(sessionId, step, prompt, timeoutMs)` を呼ぶ。失敗時は当該 follow turn をスキップし warning。残り follow turn は続行 (graceful degradation の N 段拡張)。

### D7: CodexThread.id 型修正

`CodexThread.id` の型を `string` → `string | null` に修正。`@openai/codex-sdk@0.130.0` の `dist/index.d.ts:203` で `get id(): string | null` と定義されており、現状の `string` 型は不正確。

`sessionId` を設定する箇所で null check を追加 (null の場合は undefined として AgentRunResult に渡す)。

### D8: AbortController

現状維持。run() 全体に 1 本の AbortController。N 段全 follow turn を同一 AbortController で覆う。timeout が発火すれば残り follow turn も含めて中断。

### D9: project.md inline 注入の維持

`project.md` の initial inline 注入 (needsProjectContext → projectContext) は維持する。follow-up に降格させない。review 系が project context を知らないまま review を書き終える事故を避ける。

### D10: ADR

新 ADR を起票:

- ADR 2026-05-22 D2 を refine: 「follow プロンプトは 1 本」→「ファイル数で bounded な N 段」
- supersede ではなく一般化 (既存の design step follow-up は引き続き有効)
- wrap 文言の 3 要素制約を ADR level で記録

## Module Map

| ファイル | 操作 | 責務 |
|---|---|---|
| `src/util/paths.ts` | 追加 | `stepRulesDirRel(stepName)` |
| `src/core/step/rules-resolve.ts` | 新規 | rules ファイル列挙・順序合成 |
| `src/core/step/rules-followup-prompts.ts` | 新規 | wrap 文言付き prompt 列変換 |
| `src/core/port/agent-runner.ts` | 変更 | `followUpPrompt` → `followUpPrompts` |
| `src/core/step/executor.ts` | 変更 | rules 解決 + followUpPrompts ctx 構築 |
| `src/adapter/shared/follow-up.ts` | 変更 | N 段判定 helper |
| `src/adapter/claude-code/agent-runner.ts` | 変更 | N 段 follow-up loop |
| `src/adapter/codex/agent-runner.ts` | 変更 | N 段 follow-up loop + Thread.id 型修正 |
| `src/adapter/managed-agent/agent-runner.ts` | 変更 | N 段 follow-up loop + graceful degradation |
| `specrunner/adr/<adr-gen が生成>` | 新規 | ADR |

## Risks

- **rule 忘却**: N 段の最大リスクは後続 turn で前 turn の制約が巻き戻されること。wrap の修正範囲要素 (= この rule に関連する file のみ修正) で touch scope を限定して緩和。
- **token cost O(N^2)**: Claude Code の resume は session 全文を re-read するため N 段で input token が O(N^2) に膨張。rules ファイル数の実用的な上限は 5-10 程度を想定。CLI 側の上限は設けない (利用者の自己責任)。
- **managed agent multi-turn**: 各 follow turn で sendUserMessage が失敗するリスクあり。graceful degradation で非致命的に処理。
