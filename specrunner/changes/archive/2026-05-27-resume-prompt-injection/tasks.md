# Tasks: resume-prompt-injection

## [x] T-01: `AgentRunContext` に `resumePrompt` フィールドを追加

**対象ファイル**: `src/core/port/agent-runner.ts`

`AgentRunContext` interface に以下を追加する:

```typescript
/**
 * resume 時にユーザーが --prompt / --prompt-file で注入した追加コンテキスト。
 * 最初の agent ステップのみに適用される（one-shot）。
 * 未指定時は undefined（既存動作と同一）。
 */
resumePrompt?: string;
```

---

## [x] T-02: `PipelineDeps` に `resumePrompt` フィールドを追加

**対象ファイル**: `src/core/types.ts`

`PipelineDeps` interface に以下を追加する:

```typescript
/**
 * resume 時にユーザーが注入した追加プロンプト。
 * StepExecutor が最初の agent ステップで消費し undefined にする。
 */
resumePrompt?: string;
```

---

## [x] T-03: `PrepareResult` に `resumePrompt` フィールドを追加

**対象ファイル**: `src/core/command/runner.ts`

### 3-a: `PrepareResult` に追加

```typescript
/** resume 時に注入する追加プロンプト。ResumeCommand のみが設定する。 */
resumePrompt?: string;
```

### 3-b: `execute()` で `deps` にコピー

`execute()` 内の `deps = this.runtime.buildDeps(...)` の直後に以下を追加:

```typescript
if (prepared.resumePrompt) {
  deps.resumePrompt = prepared.resumePrompt;
}
```

---

## [x] T-04: `StepExecutor` で one-shot 消費

**対象ファイル**: `src/core/step/executor.ts`

`runAgentStep()` の `AgentRunContext` 構築部分（`const ctx = { ... }` ブロック）に `resumePrompt` を追加する:

```typescript
resumePrompt: deps.resumePrompt,
```

その直後に消費済みクリアを追加する:

```typescript
// One-shot: 最初の agent ステップで消費し、後続ステップには引き継がない
if (deps.resumePrompt) {
  deps.resumePrompt = undefined;
}
```

---

## [x] T-05: ClaudeCodeRunner で `resumePrompt` を prompt に注入

**対象ファイル**: `src/adapter/claude-code/agent-runner.ts`

`run()` メソッド内で `fullPrompt` を構築している箇所を変更する。

現状:
```typescript
const fullPrompt = additionalInstructions
  ? `${baseMessage}\n\n${additionalInstructions}`
  : baseMessage;
```

変更後:
```typescript
const resumeSection = ctx.resumePrompt
  ? `\n\n<resume-context>\n${ctx.resumePrompt}\n</resume-context>`
  : "";
const fullPrompt = additionalInstructions
  ? `${baseMessage}${resumeSection}\n\n${additionalInstructions}`
  : `${baseMessage}${resumeSection}`;
```

---

## [x] T-06: ManagedAgentRunner で `resumePrompt` を prompt に注入

**対象ファイル**: `src/adapter/managed-agent/agent-runner.ts`

T-05 と同じパターンで、メッセージ構築箇所に `resumePrompt` の注入ロジックを追加する。managed adapter のメッセージ構築位置を確認し、`<resume-context>` セクションを同様に挿入する。

---

## [x] T-07: `ResumeOptions` に `prompt` を追加（core/command 層）

**対象ファイル**: `src/core/command/resume.ts`

### 7-a: `ResumeOptions` に追加

```typescript
prompt?: string;
```

### 7-b: `prepare()` の return で `resumePrompt` を設定

`prepare()` の最終 return 文に追加:

```typescript
resumePrompt: this.options.prompt,
```

---

## [x] T-08: `ResumeOptions` に `prompt` を追加（cli 層）

**対象ファイル**: `src/cli/resume.ts`

`ResumeOptions` interface に追加:

```typescript
prompt?: string;
```

`runResumeCore` で `ResumeCommand` 生成時に `options` をそのまま渡しているため、追加の配線は不要。

---

## [x] T-09: `command-registry.ts` に `--prompt` / `--prompt-file` フラグを追加

**対象ファイル**: `src/cli/command-registry.ts`

### 9-a: flag 定義の追加

`job.subcommands.resume.flags` に以下を追加:

```typescript
prompt: { type: "string" },
"prompt-file": { type: "string" },
```

### 9-b: handler で排他チェック + ファイル読み込み

handler 内、`runResume` 呼び出しの前に以下のロジックを追加:

```typescript
const promptText = parsed.flags["prompt"] as string | undefined;
const promptFile = parsed.flags["prompt-file"] as string | undefined;

if (promptText !== undefined && promptFile !== undefined) {
  process.stderr.write("Error: --prompt and --prompt-file are mutually exclusive.\n");
  process.exit(2);
}

let resolvedPrompt: string | undefined;
if (promptFile !== undefined) {
  try {
    resolvedPrompt = fs.readFileSync(path.resolve(process.cwd(), promptFile), "utf-8");
  } catch (err) {
    process.stderr.write(`Error: Cannot read prompt file '${promptFile}': ${(err as Error).message}\n`);
    process.exit(1);
  }
} else {
  resolvedPrompt = promptText;
}
```

`runResume` 呼び出しの options に `prompt: resolvedPrompt` を追加する。

### 9-c: USAGE 文字列の更新

`USAGE` 内の `job resume` 行を更新し、`--prompt` / `--prompt-file` の存在を示す:

```
  job resume <slug>               halted job を再開
```

この行の説明は簡潔に維持し、詳細な flag 説明は `--help` 時に別途表示する設計のため変更不要。

---

## [x] T-10: テスト追加

### 10-a: `tests/unit/core/command/resume.test.ts` (既存ファイルに追記、なければ新規)

ResumeCommand の prepare() が `resumePrompt` を `PrepareResult` に含めるテスト:

- `options.prompt` が設定されている → `PrepareResult.resumePrompt` に値が入る
- `options.prompt` が未設定 → `PrepareResult.resumePrompt` が `undefined`

### 10-b: `tests/unit/core/step/executor.test.ts` (既存ファイルに追記)

StepExecutor の one-shot 消費テスト:

- `deps.resumePrompt` が設定されている → 最初の `AgentRunContext.resumePrompt` に値が入る
- 最初の agent step 実行後 → `deps.resumePrompt` が `undefined` になる

### 10-c: `tests/unit/adapter/claude-code/agent-runner.test.ts` (既存ファイルに追記)

ClaudeCodeRunner のプロンプト注入テスト:

- `ctx.resumePrompt` が設定されている → `fullPrompt` に `<resume-context>` セクションが含まれる
- `ctx.resumePrompt` が未設定 → `fullPrompt` に `<resume-context>` が含まれない

### 10-d: 排他チェックのテスト

`--prompt` と `--prompt-file` の両方指定時にエラーが出ることのテスト。command-registry handler のテストが既存の場合はそこに追記、なければ unit test で flag 解析の排他チェック部分をカバーする。

---

## [x] T-11: 型チェック + テスト実行

`bun run typecheck && bun run test` を実行し、green を確認する。
