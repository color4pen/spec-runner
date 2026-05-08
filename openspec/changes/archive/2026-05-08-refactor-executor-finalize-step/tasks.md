## 1. finalizeStep メソッドの追加

- [x] 1.1 `src/core/step/executor.ts` に private メソッド `finalizeStep` を追加。シグネチャは design.md D1 に従う:
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
- [x] 1.2 `finalizeStep` 内に以下のシーケンスを実装:
  1. `step.resultFilePath(state, deps)` で `findingsPath` を取得
  2. `resultContent` が non-null なら `step.parseResult(resultContent, deps)` で verdict をパース
  3. `resultContent` が null かつ `"completionVerdict" in step` なら `step.completionVerdict` を使用（D2）
  4. verdict が null なら `stderrWrite` で warning を出力し `"escalation"` にフォールバック（D4: `${step.kind} step '${step.name}'` 形式）
  5. `events.emit("verdict:parsed", ...)` を発火
  6. `pushStepResult` を呼び出し。`session` は `agentResult?.sessionId` があれば `{ id, agentId: "", environmentId: "" }` を、なければ `null` を渡す。`modelUsage` は `agentResult?.modelUsage` を渡す
  7. `store.appendHistory` で `${step.name}-verdict` エントリを追加
  8. `agentResult?.agentBranch` が存在し `!state.branch` なら `state.branch` をセット（D3）
  9. `"setsBranch" in step && step.setsBranch === true && !state.branch` なら `getBranchPrefix(deps.request.type)` を使って branch を生成（D3）
  10. `store.persist(state)` で永続化
  11. `state` を return
- [x] 1.3 `ModelUsage` の import を `../../state/schema.js` から追加（既に `Verdict` import があるので同じ行に追加）

## 2. runAgentStep の成功パスを置き換え

- [x] 2.1 `runAgentStep` の L165-226（`// Success path:` コメントから `return state;` まで）を `finalizeStep` 呼び出しに置き換え:
  ```ts
  return this.finalizeStep(step, state, deps, result.resultContent, completedAt, {
    sessionId: result.sessionId,
    agentBranch: result.agentBranch,
    modelUsage: result.modelUsage,
  });
  ```
- [x] 2.2 `getBranchPrefix` import が `finalizeStep` 内で使われるため、既存 import をそのまま維持

## 3. runCliStep の成功パスを置き換え

- [x] 3.1 `runCliStep` の L282-330（`// Read the result file and parse verdict` コメントから `return state;` まで）を以下に置き換え:
  1. ファイルシステムからの `fileContent` 読み取りロジック（L287-297）はそのまま維持（`finalizeStep` の前に実行）
  2. `finalizeStep` 呼び出し:
  ```ts
  return this.finalizeStep(step, state, deps, fileContent, completedAt);
  ```
- [x] 3.2 `runCliStep` から不要になった import の確認: `pushStepResult` は `finalizeStep` 内で使うため executor.ts のトップレベル import は維持。`stderrWrite` も同様

## 4. 不要コードの削除

- [x] 4.1 `runAgentStep` から削除されたコードブロック内でのみ使われていた変数がないか確認（`findingsPath`, `verdict`, `sessionEntry` 等は `finalizeStep` 内に移動済み）
- [x] 4.2 `runCliStep` から削除されたコードブロック内でのみ使われていた変数がないか確認（`findingsPath`, `verdict`, `fileContent` は読み取りロジックが残るため `fileContent` のみ残存）

## 5. 検証

- [x] 5.1 `bun run typecheck` が green
- [x] 5.2 `bun run test` で全テスト pass（1283 passed）
- [x] 5.3 executor.ts の行数が 280 行以下であることを確認（270 行）
- [x] 5.4 `grep -c "pushStepResult" src/core/step/executor.ts` が 1（`finalizeStep` 内の 1 箇所のみ）※ import 行を含めると 2 だが呼び出し箇所は 1
- [x] 5.5 `grep -c "store.persist" src/core/step/executor.ts` が 4（`finalizeStep` 内 1 + エラーパス 3 — 元々 runAgentStep に 2 つのエラーパスがあるため 3 以下ではなく 4）
- [x] 5.6 `grep -c "verdict:parsed" src/core/step/executor.ts` が 1（`finalizeStep` 内の 1 箇所のみ）
