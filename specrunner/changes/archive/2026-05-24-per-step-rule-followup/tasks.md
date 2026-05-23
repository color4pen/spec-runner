# Tasks: per-step-rule-followup

## T-01: path utility — stepRulesDirRel

**File**: `src/util/paths.ts`

`stepRulesDirRel(stepName: string): string` を追加。`"specrunner/rules/${stepName}"` を返す。

既存の path utility パターン (pure function, relative path, no imports from other src/ modules) に従う。

**Test**: `test/util/paths.test.ts` に追加。`stepRulesDirRel("design")` → `"specrunner/rules/design"` を検証。

- [x] 実装完了
- [x] テスト完了

---

## T-02: rules-resolve.ts — ファイル列挙・順序合成

**File**: `src/core/step/rules-resolve.ts` (新規)

```ts
export interface RulesResolveFs {
  readdir(dir: string): Promise<string[]>;
  readFile(path: string, encoding: string): Promise<string>;
}

export async function resolveStepRules(
  stepName: string,
  cwd: string,
  fs: RulesResolveFs,
): Promise<string[]>;
```

実装要件:
- `path.join(cwd, stepRulesDirRel(stepName))` のファイルを `fs.readdir` で列挙
- `.md` 拡張子のみ対象。ディレクトリは除外 (readdir の結果を stat せず拡張子判定で十分。ディレクトリ名が `.md` で終わることは想定しない)
- ファイル名の数字 prefix で昇順ソート。ソートキーは `parseInt(fileName, 10)` — NaN (数字なし) のファイルは末尾に配置
- 各ファイルの中身を `fs.readFile` で読み、`string[]` で返す (順序保証)
- ディレクトリ不存在時は空配列 (ENOENT catch)
- `AGENT_STEP_NAMES` に含まれない step 名でも呼び出し可能 (executor 側でフィルタする)

**Test**: `test/core/step/rules-resolve.test.ts` (新規)

- ファイルが 3 つあるケース: 数字 prefix 昇順で中身が返る
- ディレクトリ不存在: 空配列
- `.md` 以外 (`.txt`, `.json`) は無視
- 数字 prefix なしファイルは末尾にソート
- 混在ケース: `01-a.md`, `10-b.md`, `02-c.md` → `[a, c, b]` の順

- [x] 実装完了
- [x] テスト完了

---

## T-03: rules-followup-prompts.ts — wrap 文言付き prompt 変換

**File**: `src/core/step/rules-followup-prompts.ts` (新規)

```ts
export function buildRulesFollowUpPrompts(ruleContents: string[]): string[];
```

実装要件:
- 各 rule content を 3 要素 wrap で囲んで prompt string を生成
- wrap テンプレート:
  ```
  以下の project 規約に基づいて、直前の作業結果を確認してください。

  <rule>
  {ruleContent}
  </rule>

  - 修正範囲: この規約に関連するファイルのみ修正してください。関係のないファイルには触れないでください。
  - stop 条件: この規約に対する違反がなければ、何も変更せず end_turn してください。
  - 意図解釈: 書かれた言葉をそのまま機械的に適用するのではなく、規約の意図を汲んで判断してください。
  ```
- 空配列入力 → 空配列出力
- pure function (no I/O)

**Test**: `test/core/step/rules-followup-prompts.test.ts` (新規)

- 1 ファイル: wrap 3 要素が含まれること
- 3 要素以外の wrap が含まれないこと (正規表現で `修正範囲` / `stop 条件` / `意図解釈` 以外の `- ` 箇条書きが wrap 部分に存在しないことを検証)
- 空配列入力: 空配列出力
- 複数ファイル: 出力配列の長さが入力と一致

- [x] 実装完了
- [x] テスト完了

---

## T-04: port 契約変更 — followUpPrompts

**File**: `src/core/port/agent-runner.ts`

`AgentRunContext` を変更:

```diff
- followUpPrompt?: string;
+ /**
+  * 作業 turn 後に同一 session へ投げる follow プロンプト列。
+  * 指定時: adapter が作業 turn 完了後に同一 session で各 prompt を順番に投げる。
+  * 未指定 / 空配列: adapter は作業 turn のみで返す (既存挙動)。
+  */
+ followUpPrompts?: string[];
```

**注意**: `followUpPrompt` (単数) field は削除する。adapter / shared / executor の参照を `followUpPrompts` に一括置換する。

**Test**: 型チェック (`bun run typecheck`) で全参照箇所の compile error を検出・修正。

- [x] 実装完了
- [x] テスト完了

---

## T-05: shared/follow-up.ts — N 段判定 helper

**File**: `src/adapter/shared/follow-up.ts`

`shouldRunFollowUp` を `followUpPrompts` 対応に変更:

```ts
export function shouldRunFollowUp(
  ctx: Pick<AgentRunContext, "followUpPrompts">,
  baseCompletionReason: AgentRunResult["completionReason"],
): boolean {
  return (ctx.followUpPrompts?.length ?? 0) > 0 && baseCompletionReason === "success";
}
```

`mergeFollowUpResult` は変更なし (最終 turn の resultContent を採用)。

**Test**: `test/adapter/shared/follow-up.test.ts` を更新

- `followUpPrompts: ["a", "b"]` + success → true
- `followUpPrompts: []` + success → false
- `followUpPrompts: undefined` + success → false
- `followUpPrompts: ["a"]` + error → false

- [x] 実装完了
- [x] テスト完了

---

## T-06: executor — rules 解決 + followUpPrompts 構築

**File**: `src/core/step/executor.ts`

`runAgentStep` に rules 解決ロジックを追加:

1. `resolveStepRules(step.name, cwd, { readdir, readFile })` を呼ぶ
2. `buildRulesFollowUpPrompts(ruleContents)` で wrap 付き prompt 列を生成
3. 既存 `followUpPrompt` (step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt) と結合:
   ```ts
   const existingFollowUp = step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt;
   const rulesPrompts = buildRulesFollowUpPrompts(ruleContents);
   const followUpPrompts = [
     ...(existingFollowUp ? [existingFollowUp] : []),
     ...rulesPrompts,
   ];
   ```
4. ctx に `followUpPrompts` を設定 (空配列の場合は `undefined` でも可)

import 追加:
- `import { resolveStepRules } from "./rules-resolve.js";`
- `import { buildRulesFollowUpPrompts } from "./rules-followup-prompts.js";`
- `import { readdir, readFile } from "node:fs/promises";`

旧 `followUpPrompt` 参照の削除: ctx 構築で `followUpPrompt` → `followUpPrompts` に変更。

**Test**: `test/core/step/executor.test.ts` を更新

- rules ファイルがある step: `ctx.followUpPrompts` に rules prompt が含まれる
- rules ファイルなし + 既存 followUpPrompt あり: `ctx.followUpPrompts` は `[existingFollowUp]`
- rules ファイルなし + 既存 followUpPrompt なし: `ctx.followUpPrompts` は `undefined` or `[]`
- 既存 followUpPrompt + rules: 既存が先頭、rules が後続

- [x] 実装完了
- [x] テスト完了

---

## T-07: Claude Code adapter — N 段 follow-up loop

**File**: `src/adapter/claude-code/agent-runner.ts`

既存の単一 follow-up ブロックを N 段ループに変更:

```ts
if (shouldRunFollowUp(ctx, "success") && extractedSessionId) {
  for (const followPrompt of ctx.followUpPrompts!) {
    const followUpOptions = { ...queryOptions, resume: extractedSessionId };
    const followMessages = this.queryFn({ prompt: followPrompt, options: followUpOptions });
    // ... existing stream processing ...
    // ... usage accumulation ...
  }
}
```

`followUpPrompt` → `followUpPrompts` の参照変更。usage 累積は全 turn 分。

**Test**: `test/adapter/claude-code/agent-runner.test.ts` を更新

- `followUpPrompts: ["a", "b"]`: queryFn が 3 回呼ばれる (work + 2 follow)
- `followUpPrompts: []`: queryFn が 1 回 (work のみ)
- follow turn 中のエラー: 既存のエラーハンドリングが動作

- [x] 実装完了
- [x] テスト完了

---

## T-08: Codex adapter — N 段 follow-up loop + Thread.id 型修正

**File**: `src/adapter/codex/agent-runner.ts`

### 8a: CodexThread.id 型修正

```diff
export interface CodexThread {
- id: string;
+ id: string | null;
  run(prompt: string, opts?: { signal?: AbortSignal }): Promise<Turn>;
}
```

`threadId` を設定する箇所で null check 追加:

```ts
threadId = activeThread.id;
// AgentRunResult.sessionId は string | undefined なので:
sessionId: threadId ?? undefined,
```

### 8b: N 段 follow-up loop

既存の単一 follow-up ブロックを N 段ループに変更:

```ts
if (shouldRunFollowUp(ctx, "success")) {
  for (const followPrompt of ctx.followUpPrompts!) {
    const turnN = await activeThread.run(followPrompt, { signal: abortController.signal });
    // ... usage accumulation ...
    turn = { ...turnN, usage: accumulatedUsage };
  }
}
```

**Test**: `test/adapter/codex/agent-runner.test.ts` を更新

- Thread.id が null の場合: sessionId が undefined になる
- `followUpPrompts: ["a", "b"]`: thread.run が 3 回呼ばれる
- usage 累積: 3 turn 分の加算

- [x] 実装完了
- [x] テスト完了

---

## T-09: Managed Agent adapter — N 段 follow-up + graceful degradation

**File**: `src/adapter/managed-agent/agent-runner.ts`

### 9a: Design style (SSE) の N 段対応

```ts
if (sseEndTurn && shouldRunFollowUp(ctx, "success")) {
  for (const followPrompt of ctx.followUpPrompts!) {
    await this.executeFollowUpTurn(sessionId, ctx.step, followPrompt, effectiveTimeoutMs);
  }
}
```

### 9b: Polling style の N 段対応

```ts
if (shouldRunFollowUp(ctx, "success")) {
  for (const followPrompt of ctx.followUpPrompts!) {
    await this.executeFollowUpTurn(sessionId, ctx.step, followPrompt, effectiveTimeoutMs);
  }
}
```

`executeFollowUpTurn` は既に graceful degradation (catch + warning) を実装済み。N 段拡張により、1 つの follow turn が失敗しても残りの follow turn は続行される。

**Test**: `test/adapter/managed-agent/agent-runner.test.ts` を更新

- `followUpPrompts: ["a", "b"]`: sendUserMessage が 2 回追加で呼ばれる
- 1 つ目の follow turn が失敗: 2 つ目の follow turn は引き続き実行される
- `followUpPrompts: []`: sendUserMessage は作業 turn のみ

- [x] 実装完了
- [x] テスト完了

---

## T-11: worktree 環境での rules ファイル解決テスト

**File**: `test/core/step/rules-resolve.test.ts` (T-02 と同ファイル、シナリオ追加)

worktree 環境 (cwd が `.git/specrunner-worktrees/<name>` 配下) で rules ファイルが解決可能であることを確認:

- cwd を worktree パスに設定した mock で `resolveStepRules` を呼ぶ
- `path.join(worktreeCwd, "specrunner/rules/design/01-style.md")` が正しく解決される

- [x] 実装完了
- [x] テスト完了

---

## Task Dependencies

```
T-01 ─────┐
T-02 ─────┤
T-03 ─────┼─→ T-06 ─→ T-07, T-08, T-09
T-04 ─────┤
T-05 ─────┘
T-11 (T-02 と同時)
```

T-01 〜 T-05 は並列実行可能。T-06 は T-01 〜 T-05 に依存。T-07 〜 T-09 は T-06 に依存 (型変更の伝搬)。T-10 は独立。
