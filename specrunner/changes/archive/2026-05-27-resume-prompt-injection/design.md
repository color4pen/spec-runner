# Design: resume-prompt-injection

## Overview

`specrunner job resume <slug>` に `--prompt` / `--prompt-file` オプションを追加し、resume 時に agent の最初のステップへ追加コンテキストを注入できるようにする。注入は 1 回限りで state に永続化しない。

## 変更方針

CLI flag → ResumeOptions → PrepareResult → PipelineDeps → StepExecutor → AgentRunContext → adapter prompt 構築の既存データフローに `resumePrompt` フィールドを追加する。最初の agent ステップで消費し、後続ステップには引き継がない。

## Component Structure

### Modified Files

| File | Change |
|------|--------|
| `src/cli/command-registry.ts` | `job resume` の `flags` に `prompt` (string) と `prompt-file` (string) を追加。handler で排他チェック + ファイル読み込みを行い `runResume` に渡す |
| `src/cli/resume.ts` | `ResumeOptions` に `prompt?: string` を追加。`runResumeCore` が `ResumeCommand` に渡す |
| `src/core/command/resume.ts` | `ResumeOptions` に `prompt?: string` を追加。`prepare()` の `PrepareResult` に `resumePrompt` を設定 |
| `src/core/command/runner.ts` | `PrepareResult` に `resumePrompt?: string` を追加。`execute()` で `deps.resumePrompt` にコピー |
| `src/core/types.ts` | `PipelineDeps` に `resumePrompt?: string` を追加 |
| `src/core/step/executor.ts` | `runAgentStep()` で `deps.resumePrompt` を `AgentRunContext.resumePrompt` に設定し、直後に `deps.resumePrompt = undefined` で消費済みにする |
| `src/core/port/agent-runner.ts` | `AgentRunContext` に `resumePrompt?: string` を追加 |
| `src/adapter/claude-code/agent-runner.ts` | `ctx.resumePrompt` がある場合、`buildMessage` で組み立てた `baseMessage` の末尾に注入テキストを追加 |
| `src/adapter/managed-agent/agent-runner.ts` | 同上（managed adapter 側も対応） |

### New Files

なし。

## Data Flow

```
CLI flag --prompt / --prompt-file
  ↓ (command-registry.ts: 排他チェック + file read)
ResumeOptions.prompt: string
  ↓ (resume.ts → ResumeCommand)
PrepareResult.resumePrompt: string
  ↓ (runner.ts execute())
PipelineDeps.resumePrompt: string
  ↓ (executor.ts runAgentStep() — 消費後 undefined に)
AgentRunContext.resumePrompt: string
  ↓ (adapter prompt 構築)
fullPrompt = baseMessage + "\n\n" + resumePromptSection + "\n\n" + additionalInstructions
```

## D1: CLI Flag 設計

### `--prompt <text>`

- `flag-parser` 型: `string`
- inline テキストをそのまま `ResumeOptions.prompt` に設定

### `--prompt-file <path>`

- `flag-parser` 型: `string`
- handler 内で `fs.readFileSync(path, "utf-8")` でファイル内容を読み取り、`ResumeOptions.prompt` に設定
- ファイルが存在しない場合は stderr にエラーを出し `process.exit(1)`

### 排他チェック

`--prompt` と `--prompt-file` の両方が指定された場合、handler 内で:
```
Error: --prompt and --prompt-file are mutually exclusive.
```
を stderr に出力し `process.exit(2)` で終了する。flag-parser に到達する前の handler 層で検出する。

## D2: 注入テキストのフォーマット

adapter が prompt を構築する際、`resumePrompt` が存在する場合は以下のセクションを `baseMessage` と `additionalInstructions` の間に挿入する:

```
<resume-context>
{resumePrompt text}
</resume-context>
```

XML タグで囲むことで、agent が注入テキストの境界を明確に認識できる。

## D3: One-shot 消費メカニズム

`StepExecutor.runAgentStep()` で `deps.resumePrompt` を `AgentRunContext` にコピーした直後、`deps.resumePrompt = undefined` に設定する。PipelineDeps は mutable object として pipeline 内を流れるため、次の step 実行時には `resumePrompt` は存在しない。

これにより要件「resume 起動時に実行される最初の agent ステップのみに適用する」を満たす。CLI ステップ（verification 等）が最初のステップの場合、`runCliStep` は `resumePrompt` を消費せず、次の agent ステップが最初の消費者となる。

## D4: 後方互換

- `--prompt` / `--prompt-file` 未指定時: `resumePrompt` は `undefined`。adapter は追加テキストを挿入しない。既存の動作と完全に同一。
- `PrepareResult.resumePrompt` は optional field。既存の `PipelineRunCommand` は設定しない。
- `AgentRunContext.resumePrompt` は optional field。既存のすべての adapter パスで `undefined` のまま無視される。
