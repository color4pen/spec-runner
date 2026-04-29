# Module Analysis — 2026-04-29-executor-cleanup

Step 2.5 mechanical analysis. Scope: testability, readability, cohesion, coupling, reusability, SRP.
Out of scope: extensibility, deployment independence, security boundary, domain boundary.

This file is a reference for the implementer. Adoption is at the implementer's discretion.

## 1. 既存コードパターン一覧

### 1.1 executor.ts に観察される反復パターン (主観察対象)

| Pattern | Occurrences | Sites |
|---|---|---|
| `appendHistory({ ts: new Date().toISOString(), step, status, message })` | 約 24 回 | runProposeStyleStep / runPollingStyleStep / verifyBranchLegacy / verifyChangeFolderLegacy 全域 |
| session-create then update + appendHistory ok / on error fail + appendHistory + attach state + throw | 2 回 | runProposeStyleStep:111-159, runPollingStyleStep:657-704 |
| `pushStepResult(state, step.name, { session, verdict: null, findingsPath: null, completedAt: ..., error })` | 4 回 (失敗パス) + 2 回 (成功パス) | propose: 209-215, 257-263, 311-317, 381-387 / polling: 633-639, 690-696, 722-728, 772-778, 864-871 |
| `(err as unknown as Record<string, unknown>)["state"] = state; throw err;` | 7 回 | propose: 157, 217, 319, 340, 456, 496, 568 / polling: 641, 847 |
| `const wrappedErr = new Error(...) as Error & { code; hint; state }; wrappedErr.code/hint/state = ...; throw wrappedErr;` | 4 回 | propose: 265-269 / polling: 699-703, 731-735, 783-787 |
| `await store.fail(state, errorInfo, stepName)` then `await store.persist(state)` | 5 回 | propose 失敗パス全箇所 / polling 失敗パス全箇所 |
| `config.environment!.id` non-null assertion | 6 回 | propose: 124, 134 / polling: 672, 773, 794 |
| `config.github!.accessToken` non-null assertion | 2 回 | propose: 126 / polling: 674 |

### 1.2 命名規則

- private helper は `verifyXxxViaPort` / `verifyXxxLegacy` の対称命名で port/legacy 二重実装が表現されている (executor.ts:398-605)。
- step lifecycle の history step ラベルは `${step.name}-session-create` / `${step.name}-completed` / `${step.name}-terminated` / `${step.name}-timeout` / `${step.name}-verdict` のテンプレート規約 (executor.ts:660, 686, 711, 757, 765, 800, 877)。propose は固定文字列 `session-create` / `events-stream-connected` / `idle-end-turn-detected` / `success` のため両者で命名規約が分岐している。

### 1.3 ファイル構成

- `src/core/agent/` には `definition.ts` (型) / `registry.ts` (集約) / `hash.ts` (純関数) / `syncer.ts` 系列が分離されている。helper 抽出を `src/core/step/executor-helpers.ts` で行えば既存の「機能別 sibling file」パターンに整合する。
- `src/core/step/` 下: `executor.ts` / `types.ts` / `spec-review.ts` / `propose.ts` 等が同一階層。helper sibling 配置は前例に整合。

## 2. 共通化すべき箇所と理由

| # | Location | Axis | 観測根拠 | 推奨 |
|---|---|---|---|---|
| 1 | propose:111-159, polling:657-704 (session-create + history + fail-on-throw) | reusability + SRP | 同一構造 (history started → createSession → on success: update + history ok / on failure: fail + history + attach state + throw) が 2 関数に重複 | `createSessionWithHistory(store, state, client, params, { stepLabel, errorMessageFmt, errorHint })` を抽出。返り値 `{ state, sessionId }` |
| 2 | propose:209-215, 257-263, 311-317 / polling:633-639, 690-696, 722-728, 772-778 | reusability | 失敗時の `pushStepResult` 呼び出しが「null findings + completedAt + error」テンプレートで 7 回出現 | `recordFailedStepResult(state, stepName, errorInfo, session?)` を抽出 |
| 3 | propose の throw err 直前 7 回 (executor.ts:157, 217, 319, 340, 456, 496, 568) | readability + reusability | `(err as unknown as Record<string, unknown>)["state"] = state; throw err;` パターンが反復、cast の冗長さで意図が読み取りにくい | `attachStateAndRethrow(err: unknown, state: JobState): never` ヘルパー |
| 4 | propose:265-269 / polling:699-703, 731-735, 783-787 | reusability | `wrappedErr` 生成が 4 箇所で同一構造 | `throwWrappedError(errorInfo: ErrorInfo, state: JobState): never` ヘルパー (`Error & { code; hint; state }` を生成して throw) |
| 5 | polling 失敗系の `appendHistory + pushStepResult + fail + persist + throw wrappedErr` (executor.ts:746-787) | cohesion | 5 ステップが「fail-and-record」という単一目的を共有しているのに分散展開されている | `failStepWithError(store, state, step, errorInfo, { historyLabel, completedAt, session? }): Promise<never>` |
| 6 | `appendHistory({ ts: new Date().toISOString(), step: ..., status: ..., message: ... })` 24 occurrences | readability | `new Date().toISOString()` の繰り返しが boilerplate ノイズ | `appendHistoryNow(store, state, { step, status, message })` を thin wrapper として抽出 (low priority、過剰抽象化リスクあり) |
| 7 | `verifyBranchLegacy` / `verifyChangeFolderLegacy` (executor.ts:471-605) — 既存 githubFetch path | coupling + SRP | StepExecutor が GitHub HTTP の URL 構築 / 401 検出 / 404 検出を直接握っている。`deps.githubClient` port が canonical なら legacy fallback の存在自体が executor の責務範囲を膨らませている | request 要件 5 と整合: `fetchSpecReviewResult` legacy fallback 削除と歩調を合わせ、verify*Legacy を削除し port path に一本化する。port path だけ残せば executor.ts は ~120 LOC 削減 |

各推奨は採否を implementer が判断する。#6 は過剰抽象化リスクがあり保留候補。

## 3. 既存ヘルパー / ユーティリティの活用候補

| 既存資産 | 活用候補 | 観測根拠 |
|---|---|---|
| `pushStepResult` (`src/state/helpers.ts:53-`) | recordFailedStepResult helper の内部実装で wrap する形が自然。直接呼ぶ箇所を減らすことで失敗 result の shape 一貫性を保てる | 現状は executor.ts から 7 回呼ばれており、引数の constants (`verdict: null, findingsPath: null`) が重複 |
| `JobStateStore.fail / appendHistory / update / persist` | 既に store がこれらを提供している。helper は「store の orchestration」レベルで抽出するのが自然 | helpers は store API の薄い orchestration 層に留める |
| `getAgentId` (`src/config/getAgentId.ts`) | propose / polling で同一の cast `step.agent.role as StepName` を渡している。registry 側で role を `StepName` 化すれば cast が消える | request 要件 4 (registry.ts の cast 削除) と連動 |
| `buildFindingsPath` (spec-review.ts:44) | 既に export 済。executor.ts:822 で使用済 | 追加の活用余地は無し |

## 4. 分割単位の推奨

### 4.1 file-level

- **`src/core/step/executor-helpers.ts` を新設**
  - 配置理由: executor.ts の private helper 増加で同ファイルの行数が再び膨らむのを避け、テスト容易性 (testability) を上げる。helper は store / step.name / errorInfo を引数で受ける純 orchestration なので executor インスタンス状態に依存しない
  - 含める helper (推奨署名):
    - `export async function createSessionWithHistory(store: JobStateStore, state: JobState, client: SessionClient, params: { agentId: string; environmentId: string; repoUrl: string; githubToken: string }, opts: { stepLabel: string; errorCode: string; errorMessageFmt: (msg: string) => string; errorHint: string; }): Promise<{ state: JobState; sessionId: string }>`
    - `export function recordFailedStepResult(state: JobState, stepName: StepName, errorInfo: ErrorInfo, session: SessionRef | null): JobState`
    - `export function attachStateAndRethrow(err: unknown, state: JobState): never`
    - `export function throwWrappedError(errorInfo: ErrorInfo, state: JobState): never`
    - `export async function failStepWithError(store: JobStateStore, state: JobState, stepName: StepName, errorInfo: ErrorInfo, opts: { historyLabel: string; completedAt: string; session?: SessionRef | null }): Promise<JobState>`
  - **axis**: cohesion (helpers は session-lifecycle という単一テーマで凝集) + testability (executor を経由せず unit test 可能)

- **`verifyBranchLegacy` / `verifyChangeFolderLegacy` の削除を検討**
  - request 要件 5 と歩調を合わせ、`deps.githubClient` を必須化することで 134 LOC の削減
  - axis: coupling (HTTP 詳細を executor から剥がす) + SRP (executor は session orchestration に責務を絞る)
  - **判断は implementer**: test 経由で `deps.githubClient` 未提供の経路が残るかを `grep -rn "createPipelineDeps" tests/` で確認してから決定

### 4.2 function-level

- `runProposeStyleStep` (290 LOC) は現状で 8 段階のシーケンス番号付きコメント (1.〜8.) を持つ。helper 抽出後に番号セクションが残るならそのまま維持。さらに分割するなら:
  - branch-registration block (5.〜6.: executor.ts:275-321) を `handleBranchRegistration(state, registeredBranch, store): Promise<JobState>` として抽出可
  - GitHub verification block (7.: executor.ts:323-370) を `verifyGithubArtifacts(state, registeredBranch, deps, store): Promise<JobState>` として抽出可
  - **axis**: SRP (1 関数 1 責務) / readability (関数長を半減)

- `runPollingStyleStep` (280 LOC) の段階:
  - agent-id 解決 (619-643) → `resolveAgentIdOrFail(step, store, state, config): Promise<{ state; agentId }>`
  - poll error handling (746-788) → 上記 #5 helper `failStepWithError` で吸収
  - result file fetch + parse (805-858) → `fetchAndParseStepResult(step, state, deps, slug): Promise<{ state; fileContent; verdict; findingsPath }>`

### 4.3 module-level (secondary targets)

- **`src/core/agent/registry.ts`**:
  - `def.role as StepName` cast は `AgentDefinition.role` が既に `StepName` 型のため不要。`registry.ts:27` を `const role = def.role;` に変更
  - `step.name !== step.agent.role` 不整合検出を `fromSteps` ループ内に追加 (現状は両者が一致する暗黙前提)。`throw new Error(\`Step name and agent role mismatch: step=\${step.name}, role=\${def.role}\`)` を recommend
  - **axis**: correctness boundary では無く SRP (registry は集約と整合性検出の責務)

- **`src/core/agent/definition.ts`**:
  - `"agent_toolset_20260401"` 文字列リテラルは型定義 (definition.ts:11) と spec-review.ts:24 の 2 箇所に出現
  - 推奨: `definition.ts` に `export const AGENT_TOOLSET_TYPE = "agent_toolset_20260401" as const;` を追加し、`AgentToolsetSpec.type` を `typeof AGENT_TOOLSET_TYPE` で参照、spec-review.ts は const を import
  - **axis**: reusability (single source of truth)

- **`src/core/agent/hash.ts`**:
  - `canonicalJson({ a: undefined })` は `JSON.stringify(undefined) === undefined` を経由するため `{"a":undefined}` という invalid JSON をビルドする可能性がある (hash.ts:18)
  - 推奨実装: object branch で `if (val === undefined) return undefined;` を map し、その後 `.filter((s): s is string => s !== undefined)` で undefined キーをスキップする
  - 代替: JSDoc で「undefined 値を持つキーを入力に含めない」と明示し検証は呼び出し側に委ねる
  - **axis**: correctness (deterministic hash) / readability — 受け入れ基準で「`{ a: undefined }` と `{}` で同一 hash」が要求されているため実装変更を推奨

- **`src/core/step/spec-review.ts` の `fetchSpecReviewResult`**:
  - executor.ts:818-829 の分岐により `deps.githubClient` がある場合 `fetchSpecReviewResult` は経由されない
  - `grep -rn "fetchSpecReviewResult" src/ tests/` で実 production 使用箇所が tests のみなら削除候補
  - 削除した場合、`githubTokenExpiredError` import / `MAX_RETRIES = 3` の retry ロジックが port 側 (`GitHubApiClient.getRawFile` の `sleepFn` 経路) に既に存在することを確認すること
  - **axis**: coupling (executor が legacy fallback を握る理由が消える) / SRP

## Notes

- 依頼軸 (testability / readability / cohesion / coupling / reusability / SRP) のみで判断した。
- 拡張性 / デプロイ独立性 / セキュリティ境界 / ドメイン境界はスコープ外であり、推奨を出力していない。
- helper の最終的な配置 (executor.ts 内 private vs sibling file) は「sibling file が前例に整合し testability も上がる」と分析したが、最終判断は implementer。
- 抽出実施順は cross-module concern (decisions log) を参照。
