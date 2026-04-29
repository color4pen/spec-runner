# Module Architect Decisions — 2026-04-29-executor-cleanup

Step 2.5 で確定した機械的分割の決定。append-only。implementer は本ファイルの decisions を tasks.md §1 (前段) のチェックリストに 1:1 で写し取ること。

## D1: helper sibling file を新設する :: executor.ts の再肥大を避け、helper を store/step name 引数で受ける純 orchestration として unit test 可能にするため

`src/core/step/executor-helpers.ts` を新規作成し、以下 5 helper を export する。executor.ts はこれらを import する。

## D2: `createSessionWithHistory(store, state, client, params, opts) -> { state, sessionId }` を抽出する :: propose:111-159 と polling:657-704 の session-create + history + fail-on-throw 構造が完全に重複しているため

署名: `async function createSessionWithHistory(store: JobStateStore, state: JobState, client: SessionClient, params: { agentId: string; environmentId: string; repoUrl: string; githubToken: string }, opts: { stepLabel: string; errorCode: string; errorMessageFmt: (msg: string) => string; errorHint: string; }): Promise<{ state: JobState; sessionId: string }>`

## D3: `recordFailedStepResult(state, stepName, errorInfo, session) -> JobState` を抽出する :: propose 3 箇所 polling 4 箇所で同一の `pushStepResult({ verdict:null, findingsPath:null, completedAt: ..., error })` テンプレートが出現しているため

署名: `function recordFailedStepResult(state: JobState, stepName: StepName, errorInfo: ErrorInfo, session: SessionRef | null): JobState` — `pushStepResult` を内部で呼び、`completedAt` を `new Date().toISOString()` で固定する。

## D4: `attachStateAndRethrow(err, state): never` を抽出する :: `(err as unknown as Record<string, unknown>)["state"] = state; throw err;` パターンが executor.ts の 7 箇所で重複し、cast の冗長さが意図を覆い隠しているため

署名: `function attachStateAndRethrow(err: unknown, state: JobState): never`

## D5: `throwWrappedError(errorInfo, state): never` を抽出する :: `Error & { code; hint; state }` の生成が polling 系 4 箇所で同一構造のため

署名: `function throwWrappedError(errorInfo: ErrorInfo, state: JobState): never` — wrapped Error を生成して throw する。

## D6: `failStepWithError(store, state, stepName, errorInfo, opts): Promise<never>` を抽出する :: polling failure path (executor.ts:746-787) の `appendHistory + recordFailedStepResult + fail + persist + throwWrappedError` 5-step orchestration を 1 単位に集約するため

署名: `async function failStepWithError(store: JobStateStore, state: JobState, stepName: StepName, errorInfo: ErrorInfo, opts: { historyLabel: string; historyTs: string; completedAt: string; session: SessionRef | null }): Promise<never>`

## D7: `verifyBranchLegacy` と `verifyChangeFolderLegacy` を削除する :: `deps.githubClient` が port path で canonical となり、executor.ts が GitHub HTTP の URL 構築 / 401 / 404 を直接握る coupling は SRP 違反のため

前提検証: `grep -rn "createPipelineDeps\|githubClient:" tests/ src/` で `deps.githubClient` 未提供経路がテストのみであること、テスト側を fake `GitHubClient` 実装に置き換え可能であることを implementer が確認する。確認できた場合に限り削除する。約 134 LOC 削減。

## D8: `fetchSpecReviewResult` legacy fallback (spec-review.ts:113-162) を削除する :: D7 と同根で port path canonical 化により executor.ts:826-829 の分岐が不要になるため

前提検証: `grep -rn "fetchSpecReviewResult" src/ tests/` で production 経路から参照ゼロを確認、retry ロジック (MAX_RETRIES=3 / 1s sleep) が `GitHubApiClient.getRawFile` の `sleepFn` 経路に既に実装されていることを確認する。両条件を満たす場合のみ削除する。

## D9: `src/core/agent/registry.ts:27` の `def.role as StepName` cast を削除する :: `AgentDefinition.role: StepName` が定義済みで cast は不要のため

変更: `const role = def.role;` に書き換える。

## D10: `AgentRegistry.fromSteps` で `step.name !== step.agent.role` 不整合を fail-fast 検出する :: 現状は両者一致が暗黙前提となっており、Step 追加時の typo を runtime まで検出できないため

挿入位置: `registry.ts:27` の直後 (`const def = step.agent;` の後) で `if (step.name !== def.role) throw new Error(\`Step name and agent role mismatch: step=\${step.name}, role=\${def.role}\`);` を実行する。

## D11: `AGENT_TOOLSET_TYPE` 定数を `src/core/agent/definition.ts` に追加する :: `"agent_toolset_20260401"` 文字列リテラルが definition.ts:11 と spec-review.ts:24 の 2 箇所に分散しているため

実装: `export const AGENT_TOOLSET_TYPE = "agent_toolset_20260401" as const;` を definition.ts に追加。`AgentToolsetSpec.type` を `typeof AGENT_TOOLSET_TYPE` 参照に変更。spec-review.ts:24 を `{ type: AGENT_TOOLSET_TYPE }` に書き換える。grep `"agent_toolset_20260401"` で他にリテラル使用が無いことを implementer が確認する。

## D12: `canonicalJson` で undefined 値キーをスキップする :: `JSON.stringify(undefined)` が `undefined` を返すため `{"key":undefined}` という invalid JSON が組み上がる経路があり、受け入れ基準「`{ a: undefined }` と `{}` で同一 hash」を満たさないため

実装: `hash.ts:15-22` の object 分岐で、各 key について `JSON.stringify(canonicalJson(val))` を組む前に `val === undefined` のキーをスキップ (filter) する。テスト: `expect(hashObject({ a: undefined })).toBe(hashObject({}))` を unit test に追加。

## D13: helper 抽出の実施順序を session lifecycle → failure path → branch/folder verify removal とする :: 早期に session-create helper を確立すれば propose / polling 双方の失敗パス helper (D3 D4 D5 D6) の挿入位置が決まり、最後に大規模削除 (D7 D8) を行うことで途中段階の test PASS を維持しやすいため

順序: D11 (const 集約 — 副作用ゼロ) → D9 (cast 削除) → D10 (整合性 throw 追加) → D12 (hash) → D2 (createSessionWithHistory) → D3 (recordFailedStepResult) → D4 (attachStateAndRethrow) → D5 (throwWrappedError) → D6 (failStepWithError) → D7 (verifyLegacy 削除) → D8 (fetchSpecReviewResult 削除)。

## D14: helper の最終配置は sibling file `src/core/step/executor-helpers.ts` とする :: executor インスタンス状態に依存しない純 orchestration であり、private method として executor.ts に置くと再度 LOC が膨らみ前回 deferred した問題が再発するため

executor.ts の `getStore` (storeCache) のみ executor インスタンス state を持つ。helper は引数で受けるため class 内 private にする必然性が無い。`src/core/agent/{definition, registry, hash}.ts` のような機能別 sibling 配置の前例にも整合する。
