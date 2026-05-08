## Context

`StepExecutor.runAgentStep` の L165-226 と `runCliStep` の L282-330 は以下の同一シーケンスを持つ:

1. `step.resultFilePath()` で結果ファイルパスを取得
2. resultContent から `step.parseResult()` で verdict をパース（agent: `completionVerdict` フォールバックあり）
3. verdict null 時の warning + `"escalation"` フォールバック
4. `events.emit("verdict:parsed")` を発火
5. `pushStepResult()` で state に結果を追加
6. `store.appendHistory()` で verdict 履歴を記録
7. `store.persist()` で永続化

差分:
- **resultContent の取得元**: Agent は `AgentRunResult.resultContent`、CLI はファイルシステム読み取り → `finalizeStep` の引数で渡す
- **Agent 固有フィールド**: `sessionId`, `agentBranch`, `modelUsage`, `setsBranch` → オプショナル引数で吸収
- **completionVerdict フォールバック**: Agent step のみ。CLI step は `resultFilePath` が non-null 前提でファイルから読む → `step` 型 union と optional パラメータで判別可能

## Goals / Non-Goals

**Goals:**

- verdict パース → pushStepResult → appendHistory → persist のシーケンスを 1 箇所に集約
- agent 固有処理（sessionId 記録、agentBranch/setsBranch による branch 設定、modelUsage 記録）を finalizeStep 内でパラメータ有無により処理
- executor.ts を ~280 行以下に縮小
- 全既存テスト pass（振る舞い不変）

**Non-Goals:**

- エラーパスの統合（各 step kind で異なるため現状維持）
- `StepExecutor` 以外のモジュールの変更
- `executor-helpers.ts` の `failStepWithError` 活用（別課題）
- `finalizeStep` の公開（private のまま）

## Decisions

### D1: finalizeStep のシグネチャ

```ts
private async finalizeStep(
  step: Step,
  state: JobState,
  deps: PipelineDeps,
  resultContent: string | null,
  completedAt: string,
  agentResult?: {
    sessionId?: string;
    agentBranch?: string;
    modelUsage?: Record<string, ModelUsage>;
  },
): Promise<JobState>
```

**理由**: `resultContent` と `completedAt` は両 kind で必須。agent 固有フィールドはオプショナルオブジェクト 1 つにまとめることで、CLI 呼び出し側は引数を省略でき、agent 呼び出し側は `{ sessionId: result.sessionId, agentBranch: result.agentBranch, modelUsage: result.modelUsage }` を渡すだけで済む。

**代替案**: 全フィールドをフラットなオプショナル引数にする方法 → 引数リストが長くなり、将来の agent 固有フィールド追加時に影響範囲が広がるため不採用。

### D2: completionVerdict は step 型から判別

`finalizeStep` 内で `resultContent === null` かつ `"completionVerdict" in step` の場合に `step.completionVerdict` を使用する。`CliStep` には `completionVerdict` が存在しないため、この分岐は agent step でのみ発火する。

**理由**: `completionVerdict` を `agentResult` 引数に含める案は、呼び出し側が `step.completionVerdict` を別途取り出す必要があり冗長。`step` 自体を引数にすることで内部で直接参照できる。

### D3: setsBranch / agentBranch 分岐も finalizeStep 内に移動

branch 設定ロジックは verdict 記録 → persist の間に実行される。`agentBranch` は `agentResult?.agentBranch` の有無で判定。`setsBranch` は `"setsBranch" in step && step.setsBranch === true` で判定。

CLI step には `setsBranch` フィールドが存在しないため、finalizeStep に統合しても分岐は正確に機能する。

### D4: warning メッセージの統一

現在 agent step は `Warning: Could not parse verdict from agent step '${step.name}'.`、CLI step は `Warning: Could not parse verdict from ${findingsPath}.` と微妙に異なる。`finalizeStep` では agent step 形式に統一する:

```ts
stderrWrite(`Warning: Could not parse verdict from ${step.kind} step '${step.name}'. Treating as escalation.`);
```

**理由**: step.kind を含めることで agent/cli の区別が log から判読可能になる。findingsPath は verdict パース失敗時には診断価値が低い（ファイルは存在するが内容が不正の場合が多い）。

## Risks / Trade-offs

- **Warning メッセージの変更**: CLI step の warning 文言が変わる。stderr 出力であり、テストは `process.stderr.write` を mock しているため既存テストに影響しないが、運用時のログ grep パターンが変わる可能性 → 微小リスク
- **型の narrowing**: `finalizeStep` 内で `step.completionVerdict` や `step.setsBranch` にアクセスするには `"completionVerdict" in step` ガードが必要。TypeScript の discriminated union narrowing は `step.kind === "agent"` でも可能だが、将来 CliStep に同フィールドが追加された場合の拡張性を考慮し `in` ガードを使用
