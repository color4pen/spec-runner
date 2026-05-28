# agent step の完了 signal を report_result custom tool に倒す

## Meta

- **type**: spec-change
- **slug**: tool-driven-step-completion
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

現状の agent step の終了判定は **「LLM が end_turn で turn を終わらせた」+ 「branch HEAD の SHA が進んだ (`requiresCommit` guard)」+ 「期待ファイルが GitHub raw fetch できた」+ 「ファイル内容を regex parse して verdict が抽出できた」** の 4 段ガードで構成されており、以下の確率的脆弱性を抱える:

1. **format 違反による pipeline 死亡**: agent が `- **verdict**: approved.` のような末尾ピリオド付きや、Findings table の column ズレで markdown を書くと、`parseReviewVerdict` / `parseFindingSeverityCounts` / `parseFixableFindings` が `null` / `0` を返し、step が `escalation` にフォールバックする。PR #415 (delta spec format)、#328 (ADR 配置) など format 起因の事故が複数回発生している。
2. **「LLM が黙った理由」を CLI が判断できない**: タスク完了 / 諦め / 幻覚で完了宣言 / 暗黙の max_turns 超過 が、`completionReason: "success"` として同一視される。`stop_reason: end_turn` か `retries_exhausted` の区別はあるが、これは「LLM が話を切り上げた理由」レベルで、「step として目的を達成したか」とは別軸。
3. **遷移テーブル内で md を再 parse する**: `src/core/pipeline/types.ts:117-124` の `when:` predicate が、遷移時に `parseFixableFindings(outcome.fileContent)` を呼ぶ。`outcome.fileContent` を保存しておきながら、verdict 以外の情報を取り出すたびに md を再 parse している（構造化情報を outcome に保存していない）。
4. **format 制約が prompt + テンプレ HTML comment + parser の 3 箇所で重複管理**: 「verdict 行は exact format で」「Findings table は 7 columns」のような format 制約が、prompt 文 / テンプレファイルの HTML comment / parser の regex の 3 箇所で重複して定義され、矛盾が発生する。

memory `LLM uncertainty principle` (根本対策は「agent が判断する場面を消す」) に従い、**「LLM が黙ったタイミングを CLI が判断する」をやめて、「agent が tool 呼び出しで自分の完了を能動的に宣言する」に倒す**。判断主体を CLI から agent に移し、tool input_schema で形式を縛ることで、確率的判定を構造的判定に置き換える。

## 要件

### 1. 新規 port `src/core/port/report-result.ts`

```ts
import type { ZodRawShape } from "zod/v4";  // type-only import

export interface BaseReportResult {
  ok: boolean;
  reason?: string;
}

export interface ReportToolSpec<TResult = BaseReportResult> {
  name: string;                              // 第 1 段は "report_result" 固定
  description: string;
  /**
   * Zod v4 schema (zod/v4-mini で書く)。step ごとに static const として保持。
   * - Local runtime: そのまま createSdkMcpServer の inputSchema に渡す
   * - Managed runtime: z.toJSONSchema(z.object(zodSchema)) で JSON Schema に変換し、agents.create の tools.input_schema に渡す
   * schema は両 runtime で 1 箇所のみ定義し、二重管理を回避する。
   */
  zodSchema: ZodRawShape;
  parseInput: (raw: unknown) =>
    | { ok: true; value: TResult }
    | { ok: false; missingFields: string[]; rawInput: unknown };
}

export interface FollowUpPolicy {
  maxAttempts: number;                        // 既定: 2
  buildPrompt: (input: {
    attempt: number;                          // 1-indexed
    reason: "no-tool-call" | "invalid-input";
    missingFields?: string[];
    rawInput?: unknown;
  }) => string;
}
```

### 2. `AgentRunContext` のグループ化リファクタ

既存の `AgentRunContext` は session 制御 / 業務情報注入 / retry 制御 / event egress が混在して SRP が崩れている。今回の retry 制御フィールド追加を契機にグループ化する:

```ts
export interface AgentRunContext {
  step: AgentStep;
  state: JobState;
  branch: string;
  slug: string;
  cwd: string;
  config: SpecRunnerConfig;
  requestType?: string;

  input: {
    requestContent: string;
    requestAdr?: boolean;
    projectContext?: string;
    dynamicContext?: DynamicContext;
  };

  session: {
    resumeSessionId?: string;
    resumePrompt?: string;
    logPath?: string;
  };

  policy: {
    postWorkPrompts?: string[];               // 旧 followUpPrompts をリネーム
    reportTool?: ReportToolSpec;              // 新規
    toolReportRetry?: FollowUpPolicy;         // 新規
  };

  emit: (event: DomainEvent, payload: Record<string, unknown>) => void;
}
```

リネーム理由: 既存 `followUpPrompts` (fixer 用の作業後 prompt) と新規 `FollowUpPolicy` (tool 呼び忘れ retry) は別概念だが、両方 "followUp" を含むと adapter 実装者が混乱する。`postWorkPrompts` + `toolReportRetry` で命名分離する。

### 3. `AgentRunResult` 拡張

```ts
export interface AgentRunResult {
  completionReason: "success" | "error" | "timeout";  // 既存 3 値維持
  resultContent: string | null;                       // 既存 (markdown best-effort)
  toolResult: BaseReportResult | null;                // 必須、null = tool 呼ばれなかった
  followUpAttempts: number;                           // 必須、0 = 初回成功
  sessionId?: string;
  agentBranch?: string;
  error?: Error & { code?: string; hint?: string };
  modelUsage?: Record<string, ModelUsage>;
}
```

`completionReason` は技術的 3 値を維持し、`ok: false` (LLM の自発的失敗宣言) / `no-tool-call` (tool 呼ばれなかった) などの business semantic は `toolResult` 経由で表現する。adapter は事実のみを返し、解釈は StepExecutor / 遷移テーブル側で行う。

`toolResult` は `TResult | null` の必須フィールドにし、`undefined` (機能未サポート) と `null` (呼ばれなかった) と value の 3 状態問題を 2 状態に閉じる。

### 4. `requiresCommit` guard 廃止

agent step に `requiresCommit: boolean` を持たせ、`agent-runner.ts:333-365` の `guardCommit` で SHA 進行を強制する仕組みを廃止する:

- `AgentStep.requiresCommit` フィールド削除
- `agent-runner.ts:333-365` の `guardCommit` 呼び出しおよび実装削除
- `preSessionHeadSha` snapshot 廃止
- `src/core/step/commit-push.ts:55, 67` の `step.requiresCommit` 参照を削除し、新挙動に整理する:
  - git add 失敗 + 変更なし → **silently skip**（`noCommitDetectedError` スローを廃止）
  - 変更なし + HEAD 進行検知時 → **push-only path** を維持（agent 自己 commit のための authority spec violation 警告ロジックは残す）
  - 変更あり → 通常の commit + push（既存挙動維持）
- 結果として、変更不要な step (spec-review が approved を返すだけのケース等) で空 commit や dummy ファイル書き込みが不要になる

markdown ファイル本文 (design.md / tasks.md / review-feedback.md など) の commit & push は agent の自由とし、書きたければ書く、書かなくても tool 呼び出しで完了とする。`fetchResultFile` は file not found を返しても halt せず、`outcome.fileContent: null` で best-effort 保存。

**impact ファイル**:
- `src/core/port/agent-runner.ts` (`guardCommit` 削除、`preSessionHeadSha` snapshot 削除、`AgentRunContext` の requiresCommit 参照削除)
- `src/adapter/managed-agent/agent-runner.ts` (`guardCommit` 呼び出し削除)
- `src/core/step/commit-push.ts` (`step.requiresCommit` 参照削除、新挙動への整理)
- `src/core/step/types.ts` (`AgentStep.requiresCommit` フィールド削除)
- 各 step ファイル (Req 13 と同じ 10 ファイル、`requiresCommit: true` の記述削除)
- `noCommitDetectedError` を使用しなくなるが、関数自体は別 path での再利用可能性があるため削除は別 change 判断

### 5. ClaudeCodeRunner の対応実装

- step の `ReportToolSpec.zodSchema` (ZodRawShape) を `createSdkMcpServer({ name: "specrunner_report", tools: [{ name, description, inputSchema: zodSchema, handler }] })` の `inputSchema` にそのまま渡す（`SdkMcpToolDefinition.inputSchema: AnyZodRawShape` を直接満たす）
- `mcpServers: { specrunner_report: <sdkMcpServer> }` を `query()` options に追加
- handler 内で `reportTool.parseInput(args)` を呼び、`ok: true` の場合は value を closure 経由で外に渡す
- `for await (const message of query(...))` の `message.type === "result"` 到達時、tool が呼ばれていなければ `toolReportRetry.buildPrompt(...)` で follow-up を生成し、`query({ resume: sessionId, prompt })` で再起動
- `maxAttempts` 超過時は `toolResult: null` + `followUpAttempts: maxAttempts` で返す
- tool が `ok: false` で呼ばれた場合は `toolResult: { ok: false, reason }` を返す (`completionReason: "success"` は維持)
- import は `zod/v4-mini` のみとし、Zod の重い API (parse / refine / transform 等) は spec-runner 側で使わない（parseInput は手書きで `unknown` を check する）

### 6. ManagedAgentRunner の対応実装（runtime ハンドリング）

注: agent 設定 (`agents.create({ tools })`) は **agent setup-time** の操作（`specrunner managed setup` 経由で `AnthropicClientAdapter.createAgent` / `updateAgent` が呼ばれるタイミング）であり、本要件は runtime での tool 呼び出し検出と result event 返却に絞る。setup-time の tool 登録は Req 13 で扱う。

- step の `ReportToolSpec.zodSchema` を `z.toJSONSchema(z.object(zodSchema))` で plain JSON Schema に変換し、agent setup-time (`AgentDefinition.tools` の CustomToolSpec → `agents.create({ tools: [{ name, description, input_schema }] })`) で Anthropic API に登録する
- session 作成後の polling で `session.status === "idle"` + `stop_reason.type === "requires_action"` を検出
- **SSE path の補足**: `runDesignStyle` での SSE stream では `terminationReason` が `end_turn` 以外となり polling fallback に入る。`pollUntilComplete` が throw する `sessionRequiresActionError` を `runDesignStyle` 内でも catch し、`report_result` パスへ branch する（polling path と同一の `extractReportResult` ロジックに合流させる）。
- 現状コード (`completion.ts:135-137`) は `requires_action` を `sessionRequiresActionError` で error にしているため、`report_result` 呼び出しのパスを branch する:
  ```ts
  if (stopReason === "requires_action") {
    const reportCall = await findCustomToolCall(sessionId, "report_result");
    if (reportCall) {
      return { kind: "report", input: reportCall.input };
    }
    throw sessionRequiresActionError(sessionId);
  }
  ```
- `events.list()` で対応する `agent.custom_tool_use` の `input` を取得 → `parseInput()`
- 成功時: `client.beta.sessions.events.send({ events: [{ type: "user.custom_tool_result", custom_tool_use_id, content: "ok" }]})` で完了通知 → 次の idle (end_turn) で session 終了
- 失敗時: `events.send({ events: [{ type: "user.message", content: followUpPrompt }]})` で follow-up 送信、polling 再開
- `maxAttempts` 超過時は `toolResult: null` で返す
- `agent-runner.ts` の polling-style pipeline (`preparePollingMessage → createOrResumePollingSession → guardCommit → fetchResultFile`) から `guardCommit` を削除し、`fetchResultFile` の前 (または代わり) に `extractReportResult` stage を追加

### 7. 全 agent step に最小スキーマ `{ok, reason?}` を一律適用

対象 step (`design / spec-review / spec-fixer / test-case-gen / implementer / build-fixer / code-review / code-fixer / adr-gen / delta-spec-fixer`) すべてに `AgentStep.reportTool: ReportToolSpec<BaseReportResult>` を追加する。

各 step の `reportTool` は、step ファイル内で static const として定義する (cache 安定性のため):

```ts
// 例: src/core/step/spec-review.ts
import { boolean, optional, string } from "zod/v4-mini";
import type { ReportToolSpec, BaseReportResult } from "../port/report-result.js";

const REPORT_TOOL: ReportToolSpec<BaseReportResult> = {
  name: "report_result",
  description: "Report the completion of this step.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
  },
  parseInput: (raw) => { /* validate ok:boolean, reason?:string */ },
};
```

`zod/v4-mini` を使う理由:
- `@anthropic-ai/claude-agent-sdk` が `peerDependencies` で `zod ^4.0.0` を要求しており、すでに `node_modules/zod` (v4.4.3) が install されている
- `zod/v4-mini` は zod v4 系の tree-shakeable な軽量版で、通常の zod から **約 60-70% bundle size 削減**
- spec-runner のコードでは `zod/v4-mini` のみ import し、`z.object` / `z.parse` 等の重い API は使わない方針

step ごとの schema 拡張 (`verdict` / `fixableCount` / `severityCounts` 等) は本 change のスコープ外。

### 8. `FollowUpPolicy.buildPrompt` のデフォルト実装

port が default 実装を提供し、step は override できる:

```ts
// src/core/port/report-result.ts
export const DEFAULT_TOOL_RETRY: FollowUpPolicy = {
  maxAttempts: 2,
  buildPrompt: ({ attempt, reason, missingFields }) => {
    if (reason === "no-tool-call") {
      return `You did not call the report_result tool. Please call it with { ok: true } or { ok: false, reason: "..." } to complete this step. (attempt ${attempt}/2)`;
    }
    return `The report_result tool input was invalid. Missing fields: ${missingFields?.join(", ")}. Please call it again with the required fields. (attempt ${attempt}/2)`;
  },
};
```

step は `AgentStep.toolReportRetry` を省略すれば default が適用される。第 1 段では全 step が default を使う。

### 9. state schema 拡張 (破壊的変更)

`StepOutcome` (`src/state/schema.ts:88`) に `toolResult` と `followUpAttempts` フィールドを追加する。spec-runner はまだ private 公開のため、後方互換コードは書かない。既存 disk 上の job.json は再実行扱いとする。

既存 `StepOutcome` のフィールドはすべて保持する（`error: ErrorInfo | null` 等を含む）。新規追加部分のみ:

```ts
// 新規追加（既存 StepOutcome に append）
export interface StepOutcome {
  // 既存フィールド（verdict / findingsPath / fileContent / error / 等）はすべて保持

  // 新規
  toolResult?: BaseReportResult | null;   // null = tool 呼ばれなかった
  followUpAttempts?: number;              // 0 = 初回成功
}
```

### 10. pipeline-logger 拡張

`src/logger/pipeline-logger.ts:112` で `outcome.verdict` を log している既存パターンに、`outcome.toolResult` と `outcome.followUpAttempts` を追加する。

### 11. follow-up retry の挙動

`toolReportRetry.maxAttempts = 2` のとき:
- 初回 tool 呼ばれなかった (or 不正 input) → 1 回目 follow-up
- 2 回目もダメ → 2 回目 follow-up
- 3 回目もダメ → `toolResult: null`、`followUpAttempts: 2` で `completionReason: "success"` で返す
- step 側は `toolResult: null` を検知して halt として扱う (StepExecutor で実装)

session は閉じずに follow-up を同 session 内で送る。Local は `query({ resume: sessionId })`、Managed は `events.send({ type: "user.message" })`。

#### tool 検出対象ターンの定義

tool 呼び出しの検出対象は **main work ターン (= initial `buildMessage` で開始した最初の作業ターン) のみ**とする。`postWorkPrompts` (旧 `followUpPrompts`、fixer 用の作業後 prompt) ターン中の `report_result` 呼び出しは検出対象外。

理由:
- main work ターンが step 本体の作業であり、step の完了 signal はそこで取るのが自然
- `postWorkPrompts` は補助的な後処理 (例: rules.md 確認 prompt) で、step の verdict 確定後に実行される
- 現状 `shared/follow-up.ts:14` の `shouldRunFollowUp` は `baseCompletionReason === "success"` で実行され、main work の結果が success と確定した後に走る
- main work で tool 呼ばれない → follow-up retry → 2 回失敗 → halt
- main work で tool 呼ばれた → main work success → `postWorkPrompts` ターンへ進行 → そのまま session 終了 (postWork 内の tool 呼び出しがあっても無視)

#### halt 時の job status 遷移

`toolResult: null` で halt した step は、既存の halt-class errors と同じく **`awaiting-resume`** に遷移する (`failed` ではない)。

理由および既存パターン:
- `pipeline.ts:91-94` (例外 catch)、`pipeline.ts:284-286` (escalation)、`pipeline.ts:451` (retry exhausted)、`executor.ts:235` (poll timeout) すべて **`awaiting-resume`** に遷移している
- `failed` は本当の致命的失敗のみ (`pipeline.ts:394` の `state.status === "failed"` 判定で使用)
- tool 未呼び出しは agent の prompt 問題などで起きうるが、ユーザーが prompt 修正や手動介入で resume 可能なので `awaiting-resume` が適切
- StepExecutor は `toolResult: null` 検知時に `noCommitDetectedError` 系と同様の SpecRunnerError (`stepHaltedNoToolCallError` 等の新規エラー型) を throw し、pipeline 側の既存 catch ロジック (`pipeline.ts:91-94`) で `awaiting-resume` 遷移する

### 12. Codex adapter の frozen behavior

`src/adapter/codex/agent-runner.ts` および `DispatchingAgentRunner` も `AgentRunner` interface を実装している。本 change では Codex adapter は以下の frozen behavior とする:

- `AgentRunContext.policy.reportTool` を無視する
- `AgentRunResult.toolResult` は常に `null` を返す
- `AgentRunResult.followUpAttempts` は常に `0` を返す
- 既存の markdown + regex parse 経路は維持

**既知の暫定 regression**: 本 change 適用後、Codex runtime は全 step が `reportTool` を持つようになる（Req 7）一方、toolResult が常に `null` を返すため、T-13 の halt 判定（`ctx.policy?.reportTool && runResult.toolResult === null`）により全 step が `awaiting-resume` に遷移し機能不能になる。これは既知の暫定 regression であり、Codex SDK の custom tool 対応を実装する次 change で解消する。

Codex SDK (`@openai/codex-sdk`) における custom tool 対応の調査および本実装は別 change で扱う。`DispatchingAgentRunner` は内部 adapter (ClaudeCode / Managed / Codex) の振る舞いをそのまま透過する。

### 13. 既存 step ファイルの修正 + AgentDefinition.tools への CustomToolSpec 追加

各 step ファイルで以下を行う:

1. **`AgentStep.requiresCommit` の参照を削除**
2. **`AgentStep.reportTool` を追加**（Req 7 の static const を import）
3. **`AgentStep.agent.tools` (CustomToolSpec) に `report_result` を追加** — これは **agent setup-time** に `AnthropicClientAdapter.createAgent` / `updateAgent` が読み取り、Managed 側の `agents.create({ tools })` の payload を構築する。各 step の `AgentDefinition.tools` に CustomToolSpec として report_result を追加することで、Managed runtime で agent 起動時に tool が登録される

対象ファイル:
- `src/core/step/design.ts`
- `src/core/step/spec-review.ts`
- `src/core/step/spec-fixer.ts`
- `src/core/step/test-case-gen.ts`
- `src/core/step/implementer.ts`
- `src/core/step/build-fixer.ts`
- `src/core/step/code-review.ts`
- `src/core/step/code-fixer.ts`
- `src/core/step/adr-gen.ts`
- `src/core/step/delta-spec-fixer.ts`

加えて、`AnthropicClientAdapter.createAgent` / `updateAgent` (`src/adapter/managed-agent/` 配下) が `AgentDefinition.tools` の CustomToolSpec を Anthropic API の `BetaManagedAgentsCustomToolParams` 形式にマッピングする経路を追加する（既存の MCP toolset / built-in toolset と同様の変換ロジック）。

### 14. 既存 prompt の指示追加

各 step の system prompt (`src/prompts/*-system.ts`) の末尾に「タスク完了時に必ず `report_result` tool を呼ぶこと。`{ok: true}` で正常完了、`{ok: false, reason}` で自発的失敗を宣言する」という指示を追加する。

format 制約 (verdict 行の format、Findings table の column 構造など) は本 change では削除しない (第 3 段で step schema 拡張時に削除予定)。

### 15. package.json への `zod` 直接依存追加

現状 `zod` は `@anthropic-ai/claude-agent-sdk` の transitive peer dep として偶然 install されているのみで、spec-runner 自身は dependency 宣言していない。本 change で spec-runner のソースが `from "zod/v4-mini"` を直接 import するため、SDK の peer dep 範囲変更で build が壊れるリスクがある。

`package.json` の `dependencies` に `"zod": "^4.0.0"` を追加する（現在 install 済みは v4.4.3）。これにより spec-runner 自身が zod に直接依存することを明示する。

## スコープ外

- **step ごとの schema 拡張** (`verdict` / `fixableCount` / `severityCounts` / `failedPhases` / `pullRequest` 等の step 固有フィールド) — 第 3 段で別 change として実施。`BaseReportResult` の `TResult` 拡張も同様。
- **`outcome.fileContent` から `outcome.toolResult` への parse 経路移行** — 第 1 段は `{ok, reason?}` のみで、`outcome.fileContent` の regex parse による verdict 抽出は維持する。第 3 段で schema 拡張と同時に parser を段階削除。
- **遷移テーブル `src/core/pipeline/types.ts:117-124` の `parseFixableFindings` 再 parse 廃止** — `outcome.fixableCount` を step schema 拡張時に追加してから対応。第 1 段は現状維持。
- **`AgentStep` の `StepContract` グルーピング** (`buildMessage / resultFilePath / parseResult / reportTool` を `contract` subfield に集約する refactor) — 第 3 段で discriminated union 化と同時に別 change で実施。
- **triage step / meta-step** — `{ok: false, reason}` の reason を読んで自律的に次 step を提示する仕組み。本 change では実装しない。
- **Codex adapter の `report_result` 本対応** — Codex SDK の custom tool 対応調査と実装は別 change。
- **prompt cache hit 率の計測 logger** — 必要になったら別途追加。
- **既存 state.json の後方互換** — private 段階のため破壊的変更 OK。migration コードは書かない。

## 受け入れ基準

- [ ] 新規 port `src/core/port/report-result.ts` が定義され、`ReportToolSpec` / `BaseReportResult` / `FollowUpPolicy` / `DEFAULT_TOOL_RETRY` が export されている
- [ ] `AgentRunContext` が `input` / `session` / `policy` の subfield にグループ化され、既存の `followUpPrompts` が `policy.postWorkPrompts` にリネームされている
- [ ] `AgentRunResult` に `toolResult: BaseReportResult | null` と `followUpAttempts: number` が必須フィールドとして追加されている
- [ ] `AgentStep.requiresCommit` フィールドが削除され、`agent-runner.ts` 内の `guardCommit` 呼び出しおよび `preSessionHeadSha` snapshot 関連コードが削除されている
- [ ] `AgentStep.reportTool: ReportToolSpec<BaseReportResult>` が全 10 step で定義され、static const として import されている。`zodSchema` は `zod/v4-mini` で書かれている
- [ ] ClaudeCodeRunner が `createSdkMcpServer` で `report_result` tool を登録し（`zodSchema` をそのまま `inputSchema` に渡す）、tool 未呼びで result message 着いたら `query({ resume })` で follow-up を送信する
- [ ] ManagedAgentRunner が agent setup-time で `z.toJSONSchema(z.object(zodSchema))` により JSON Schema に変換した上で `agents.create` の `tools.input_schema` に登録し、runtime で `requires_action` を検出した時に `events.list()` で `agent.custom_tool_use` を取得して `user.custom_tool_result` で完了通知する
- [ ] spec-runner 本体のコードで zod の import は `zod/v4-mini` (および型のみ `zod/v4` の `ZodRawShape`) と Managed adapter での `z.toJSONSchema` 変換ヘルパに限定されている (`grep -rE 'from "zod[/'\''\"]' src` でサブパス import も含めて確認、重い API import がないこと)
- [ ] follow-up retry が最大 2 回まで実行され、3 回目で `toolResult: null` を返して halt 扱いになる
- [ ] state schema の `StepOutcome` (`src/state/schema.ts`) に `toolResult` と `followUpAttempts` が追加され、既存フィールド (`error: ErrorInfo | null` を含む) は保持されている。`pipeline-logger.ts` がこれらを log 出力する
- [ ] Codex adapter (`src/adapter/codex/agent-runner.ts`) と `DispatchingAgentRunner` が新形式の `AgentRunContext` / `AgentRunResult` に対応し、Codex は `toolResult: null` の frozen behavior を返す
- [ ] 全 step の system prompt に「`report_result` tool を呼ぶこと」の指示が追加されている
- [ ] `bun run typecheck && bun run test && bun run lint` が green
- [ ] Local runtime で **少なくとも 1 step を代表例として** `report_result` tool 経由完了が新規 test で検証されている (全 10 step の個別テストは要求しない)
- [ ] Managed runtime で **少なくとも 1 step を代表例として** `requires_action` 経由の `report_result` 取得が新規 test で検証されている
- [ ] tool 未呼び出し時の follow-up retry (2 回 → halt) が新規 test で検証されている。halt 時に job status が `awaiting-resume` に遷移することが検証されている
- [ ] tool 検出が main work ターンのみで行われ、`postWorkPrompts` ターン中の `report_result` 呼び出しは無視されることが test で検証されている
- [ ] `fetchResultFile` が file not found 時に throw せず `outcome.fileContent: null` を返すことが test で検証されている
- [ ] `package.json` の `dependencies` に `"zod": "^4.0.0"` が追加されている (spec-runner の直接依存として明示)
- [ ] `commit-push.ts` から `step.requiresCommit` 参照が削除され、`noCommitDetectedError` がスローされない新挙動 (silently skip + push-only path 維持) で typecheck + 既存 test が green

## 外部 SDK / API の制約

### `@anthropic-ai/sdk@0.91.1` (Managed Agents API)

- `BetaManagedAgentsCustomTool` (`resources/beta/agents/agents.d.ts:249`) で custom tool 定義可能
- `AgentCreateParams.tools` (`agents.d.ts:486`) に `BetaManagedAgentsCustomToolParams` を渡せる
- agent が tool 呼ぶと `agent.custom_tool_use` event (`sessions/events.d.ts:65-84`) がストリームに流れる
- 結果は `user.custom_tool_result` event (`sessions/events.d.ts:713-725`) を `events.send` で返す
- `input_schema` (`BetaManagedAgentsCustomToolInputSchema`) で JSON Schema 強制可
- **`output_config` / `structured-outputs-2025-11-13` beta header は SDK 0.91.1 に未対応** (`AgentCreateParams` / `SessionCreateParams` の型に存在しない)。Messages API の `output_config` は使えるが、Session API では使えないため、本 change は custom tool 経由で対応する
- beta header `managed-agents-2026-04-01` 配下の仕様変更リスクあり

### `@anthropic-ai/claude-agent-sdk`

- `createSdkMcpServer({ name, tools })` で in-process MCP server 立ち上げ可能
- `query({ mcpServers })` で渡す
- tool handler は同期 / Promise を返す関数として実装
- handler 内で structured input を受け取り、closure 経由で外に状態を渡せる
- session resume は `query({ resume: sessionId, prompt })` で可能
- **`SdkMcpToolDefinition.inputSchema` は `AnyZodRawShape` (Zod v3 または v4 系) を要求する** (`sdk.d.ts:2962`)。plain JSON Schema や `as any` キャストは SDK が内部で zod 内部 API (`._def` 等) を参照するため runtime で壊れる可能性が高い

### Zod の取り扱い

- `@anthropic-ai/claude-agent-sdk` の `peerDependencies` で `zod: ^4.0.0` が要求されており、`bun install` 時点で `node_modules/zod` (v4.4.3) が自動 install されている
- spec-runner 本体のコードでは現状 zod を import していないが、本 change で Local runtime の tool 登録のため `zod/v4-mini` を最小利用する
- `zod/v4-mini` を選ぶ理由は **tree-shakeable で bundle size 増分が最小** (約 60-70% 削減) のため
- spec-runner のコードでの zod 利用範囲は: (1) 各 step の `zodSchema: ZodRawShape` 定義、(2) Managed adapter での `z.toJSONSchema(...)` 変換、の 2 箇所のみとする
- `parseInput` は zod の API を使わず、`unknown` を手書き check する（`typeof raw.ok === "boolean"` 等）。これは tree-shake 維持と「zod 依存を schema 表現のみに限定する」原則のため

### `@openai/codex-sdk`

- 本 change ではスコープ外。frozen behavior (`toolResult: null`) で対応。Codex SDK の custom tool 対応は別途調査。

## architect 評価済みの設計判断

module-architect agent (`openspec-workflow:module-architect`) による 6 軸評価 (testability / readability / cohesion / coupling / reusability / SRP) の結果を反映:

### A. `TResult` を固定スタート (generics 不採用)

`RuntimeStrategy.createAgentRunner()` が step を知らないため、generics を入れても `AgentRunner<BaseReportResult>` で呼ぶしかなく無意味化する。第 3 段で step 固有 schema が出てきたら discriminated union (`type AnyReportResult = BaseReportResult | DesignReportResult | ...`) に切り替える方が型推論が安定する。

### B. `parseInput` を step 側に置く

step が `ReportToolSpec` を export し、`parseInput` も step 側に持つ。adapter は `ReportToolSpec` interface だけ知ればよく、step を追加するたびに adapter を変更しなくて済む (OCP 整合)。`buildMessage / resultFilePath / parseResult / parseInput` は「step の I/O 契約」という単一責務の subviews で cohesion 上問題ない。

### C. `completionReason` は技術的 3 値維持

`ok-false` (LLM の business 自己申告) と `no-tool-call` (adapter の technical observation) を同じ enum に混ぜると、adapter が business semantic を運搬する責任を持つことになり層の混入が起きる。adapter は事実 (`toolResult: TResult | null`) だけ返し、解釈は StepExecutor 側に集約する。

### D. `FollowUpPolicy.buildPrompt` は port が default 提供 + step override 可

第 1 段は全 step で default で十分。第 3 段で step 固有 schema フィールド名 (`severityCounts` の不足など) が prompt に出てくる可能性があり、override の余地を残す。

### E. `AgentRunContext` のグループ化リファクタを本 change に含める

既存の `AgentRunContext` は session 制御 / context 注入 / retry 制御 / event egress が混在し SRP が崩れている。`reportTool` / `toolReportRetry` を平に追加すると patch on patch になる。`input` / `session` / `policy` の subfield にグループ化することで:
- retry 関連 3 フィールドのグループ化が説明しやすい転換点である
- 第 3 段で TResult 拡張時に同じ場所をまた触ることになり、refactor を遅らせると change が積層する (memory `Avoid patchwork fixes` に相当)
- adapter 3 つ + executor + テストの機械的置換は実装難度が低い

### F. `completionReason` の business semantic は `toolResult` で表現

「LLM が tool を `ok: false` で呼んだ」と「LLM が tool を呼ばずに end_turn で黙った」は意味が異なるが、adapter から見れば「tool input が `{ok: false, reason}`」と「tool 呼び出しが無かった (`null`)」で表現できる。StepExecutor 側で `toolResult === null` → halt、`toolResult.ok === false` → step を rejected として記録、`toolResult.ok === true` → 正常完了、と semantic 判定を集約する。

### G. 既存 `followUpPrompts` のリネーム

現状 `followUpPrompts: string[]` は fixer 用の **作業後 prompt** (例: rules.md 確認 prompt) で、tool 呼び忘れ retry とは別概念。両方 "followUp" 語彙を持つと adapter 実装者が混乱するため、`postWorkPrompts` にリネームし、新規は `toolReportRetry: FollowUpPolicy` とする。

### H. `toolResult` は必須フィールド (TResult | null)

optional (`toolResult?`) だと `undefined` (adapter 非対応) / `null` (呼ばれなかった) / value の 3 状態問題が発生する。必須フィールド + `TResult | null` で 2 状態に閉じ、adapter は必ず判断結果を返す契約にする。
