# Design: tool-driven-step-completion

## Context

agent step の終了判定は現在「end_turn + SHA 進行 + GitHub raw fetch + regex parse」の 4 段ガードで構成されている。このうち regex parse による verdict 抽出は format 違反に脆弱で、末尾ピリオドや column ズレで escalation にフォールバックする事故が複数回発生している。また「LLM が黙った理由」を CLI が判断する構造は、完了 / 諦め / 幻覚 / max_turns 超過を同一視してしまう。

memory `LLM uncertainty principle`（根本対策は「agent が判断する場面を消す」）に従い、agent が `report_result` custom tool を能動的に呼び出すことで step 完了を宣言する方式に切り替える。tool の `input_schema` で形式を縛り、確率的判定を構造的判定に置き換える。

本 change は第 1 段として `{ok, reason?}` の最小スキーマを全 step に一律適用する。step 固有 schema 拡張（verdict, fixableCount 等）は第 3 段で別 change として実施する。

### 影響範囲

- **新規ファイル**: `src/core/port/report-result.ts`
- **大規模変更**: `src/core/port/agent-runner.ts` (AgentRunContext / AgentRunResult の再構造化)、`src/adapter/claude-code/agent-runner.ts`、`src/adapter/managed-agent/agent-runner.ts`
- **中規模変更**: `src/core/step/types.ts`、`src/core/step/executor.ts`、`src/core/step/commit-push.ts`、`src/state/schema.ts`、`src/adapter/codex/agent-runner.ts`、`src/adapter/dispatching/agent-runner.ts`、`src/adapter/shared/follow-up.ts`、`src/logger/pipeline-logger.ts`
- **機械的変更**: 全 10 step ファイル + 全 10 prompt ファイル + `package.json`

## Goals / Non-Goals

**Goals**:

- agent が `report_result` tool で step 完了を能動的に宣言する仕組みを導入する
- `requiresCommit` guard を廃止し、変更不要な step で空 commit が不要になる
- `AgentRunContext` を `input` / `session` / `policy` にグループ化して SRP を回復する
- `AgentRunResult` に `toolResult` / `followUpAttempts` を追加して completion semantic を構造化する
- tool 未呼び出し時の follow-up retry（最大 2 回）を導入する

**Non-Goals**:

- step ごとの schema 拡張（verdict / fixableCount / severityCounts 等）
- `outcome.fileContent` から `outcome.toolResult` への parse 経路移行（既存 regex parse は維持）
- 遷移テーブルの `parseFixableFindings` 再 parse 廃止
- Codex adapter の `report_result` 本対応
- `AgentStep` の `StepContract` グルーピング

## Decisions

### D1: `report_result` custom tool を MCP server (Local) / custom tool (Managed) で登録する

Local runtime では `createSdkMcpServer` で in-process MCP server を立て、`query({ mcpServers })` で渡す。`SdkMcpToolDefinition.inputSchema` が `AnyZodRawShape` を要求するため、step の `zodSchema` (ZodRawShape) をそのまま渡す。

Managed runtime では `z.toJSONSchema(z.object(zodSchema))` で JSON Schema に変換し、`agents.create({ tools: [{ type: "custom", name, description, input_schema }] })` に渡す。

**Why custom tool and not structured output**: Managed Agents Session API は `output_config` / `structured-outputs-2025-11-13` に未対応（SDK 0.91.1 の型に存在しない）。custom tool であれば両 runtime で共通のスキーマ定義で動作する。

**Why MCP server for Local**: Claude Agent SDK の `query()` API は native custom tool を持たず、MCP tool 経由でしか custom tool を追加できない。`createSdkMcpServer` で in-process MCP server として登録するのが唯一のパス。

### D2: `AgentRunContext` を `input` / `session` / `policy` にグループ化する

既存の AgentRunContext は session 制御 / 業務情報注入 / retry 制御 / event egress が平坦に混在し SRP が崩れている。`reportTool` / `toolReportRetry` を平に追加すると patch on patch になるため、本 change で subfield に整理する:

```
input:   { requestContent, requestAdr, projectContext, dynamicContext }
session: { resumeSessionId, resumePrompt, logPath }
policy:  { postWorkPrompts, reportTool, toolReportRetry }
```

`step` / `state` / `branch` / `slug` / `cwd` / `config` / `emit` / `requestType` はトップレベルに残す（全 adapter が頻繁にアクセスするため）。

**Why rename followUpPrompts → postWorkPrompts**: 既存の `followUpPrompts`（fixer 用の作業後 prompt）と新規の `FollowUpPolicy`（tool 呼び忘れ retry）は別概念だが、両方 "followUp" を含むと adapter 実装者が混同する。`postWorkPrompts` + `toolReportRetry` で命名分離する。

**Why 本 change に含める**: 第 3 段で TResult 拡張時に同じ場所をまた触ることになり、refactor を遅らせると change が積層する（memory `Avoid patchwork fixes`）。adapter 3 つ + executor + テストの機械的置換は実装難度が低い。

### D3: `completionReason` は技術的 3 値維持、business semantic は `toolResult` で表現

`completionReason: "success" | "error" | "timeout"` の既存 3 値を維持する。`ok: false`（LLM の自発的失敗宣言）と `no-tool-call`（tool 呼ばれなかった）を同じ enum に混ぜると、adapter が business semantic を運搬する責任を持つことになる。

adapter は事実（`toolResult: TResult | null`）のみを返す。StepExecutor / 遷移テーブル側で `toolResult === null` → halt、`toolResult.ok === false` → rejected、`toolResult.ok === true` → 正常完了、と semantic 判定を集約する。

### D4: `toolResult` は必須フィールド (TResult | null)

`optional` にすると `undefined`（adapter 非対応）/ `null`（呼ばれなかった）/ value の 3 状態問題が発生する。必須フィールド + `TResult | null` で 2 状態に閉じ、全 adapter が必ず判断結果を返す契約にする。Codex adapter は frozen behavior として常に `null` を返す。

### D5: `requiresCommit` guard 廃止

`report_result` tool で完了を宣言する設計により、SHA 進行による完了判定が不要になる。`commit-push.ts` の新挙動:
- git add 失敗 + 変更なし → silently skip（`noCommitDetectedError` スローを廃止）
- 変更なし + HEAD 進行検知時 → push-only path を維持（authority spec violation 警告ロジックは残す）
- 変更あり → 通常の commit + push

結果として、変更不要な step（spec-review が approved を返すだけのケース等）で空 commit や dummy ファイル書き込みが不要になる。

### D6: `parseInput` を step 側に置く（OCP 整合）

step が `ReportToolSpec` を export し、`parseInput` も step 側に持つ。adapter は `ReportToolSpec` interface だけ知ればよく、step を追加するたびに adapter を変更しなくて済む。第 1 段は全 step が同じ `BaseReportResult` schema を使うため、shared な `parseBaseReportInput` ヘルパーを port 層に提供し、各 step はそれを呼ぶだけ。

### D7: follow-up retry は main work ターンのみ

tool 呼び出しの検出対象は main work ターン（initial `buildMessage` で開始した最初の作業ターン）のみ。`postWorkPrompts` ターン中の `report_result` 呼び出しは無視する。

理由: `postWorkPrompts` は補助的な後処理で、step の verdict 確定後に実行される。main work → tool 呼ばれない → follow-up retry → halt、main work → tool 呼ばれた → postWorkPrompts ターンへ進行、という flow。

### D8: `FollowUpPolicy.buildPrompt` は port が default 提供 + step override 可

第 1 段は全 step で default で十分。第 3 段で step 固有 schema フィールド名が prompt に出てくる可能性があり、override の余地を残す。

### D9: TResult は固定スタート（generics 不採用）

`RuntimeStrategy.createAgentRunner()` が step を知らないため、generics を入れても `AgentRunner<BaseReportResult>` で呼ぶしかなく無意味化する。第 3 段で step 固有 schema が出てきたら discriminated union に切り替える。

### D10: halt 時は `awaiting-resume` に遷移

`toolResult: null` で halt した step は既存の halt-class errors と同じく `awaiting-resume` に遷移する（`failed` ではない）。tool 未呼び出しは agent の prompt 問題で起きうるが、ユーザーが prompt 修正や手動介入で resume 可能。StepExecutor は `stepHaltedNoToolCallError` を throw し、pipeline の既存 catch ロジックで `awaiting-resume` 遷移する。

### D11: `zod/v4-mini` を schema 表現のみに使用

`@anthropic-ai/claude-agent-sdk` が `peerDependencies` で `zod ^4.0.0` を要求しており、すでに install 済み。spec-runner のコードでは `zod/v4-mini`（tree-shakeable 軽量版）のみ import し、`parseInput` は zod API を使わず手書き check する。`package.json` に `"zod": "^4.0.0"` を直接依存として追加する。

## Risks / Trade-offs

- **[Risk] agent が `report_result` を呼ばない** → follow-up retry（最大 2 回）で対処。3 回失敗で halt（`awaiting-resume`）。第 1 段はこの fallback で十分。prompt 指示の強化で呼び出し率を上げる。
- **[Risk] AgentRunContext の破壊的リファクタが adapter 3 つ + executor + テストに波及する** → 機械的な field access 書き換え。型チェックで漏れを検出できる。
- **[Risk] `requiresCommit` 廃止で managed runtime の commit 検出が弱くなる** → managed runtime は元々 `report_result` tool で完了判定に移行するため、SHA guard は不要になる。push は managed agent 自身が行い、`fetchResultFile` は best-effort で保持。
- **[Trade-off] 第 1 段は `{ok, reason?}` のみで、verdict 等の既存 regex parse は維持** → 段階的移行を選択。全 parser を一度に廃止するリスクを回避。

## Open Questions

なし（architect 評価で D1-D11 の判断は確定済み）。
