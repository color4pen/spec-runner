# ADR: `report_result` custom tool による agent step 完了判定の構造化

- **Date**: 2026-05-28
- **Status**: Accepted
- **Slug**: tool-driven-step-completion

## Context

agent step の終了判定は **「LLM が end_turn で turn を終わらせた」+「branch HEAD の SHA が進んだ（`requiresCommit` guard）」+「期待ファイルが GitHub raw fetch できた」+「ファイル内容を regex parse して verdict が抽出できた」** の 4 段ガードで構成されていた。この方式は以下の確率的脆弱性を抱えていた:

1. **format 違反による pipeline 死亡**: `- **verdict**: approved.` のような末尾ピリオドや Findings table の column ズレで `parseReviewVerdict` が `null` を返し、step が escalation にフォールバック。PR #415 (delta spec format)、#328 (ADR 配置) など format 起因の事故が複数回発生。
2. **「LLM が黙った理由」を CLI が判断できない**: タスク完了 / 諦め / 幻覚で完了宣言 / max_turns 超過が `completionReason: "success"` として同一視される。
3. **遷移テーブル内で md を再 parse する**: `parseFixableFindings(outcome.fileContent)` を遷移時に毎回呼ぶ。構造化情報を outcome に保存していない。
4. **format 制約が 3 箇所で重複管理**: prompt 文 / テンプレ HTML comment / parser の regex の 3 箇所で管理され、矛盾が発生する。

`LLM uncertainty principle`（根本対策は「agent が判断する場面を消す」）に従い、「LLM が黙ったタイミングを CLI が判断する」から「agent が tool 呼び出しで自分の完了を能動的に宣言する」に倒す設計変更を行った。

関連先行 ADR:
- [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunContext` / `AgentRunResult` ポートの初期定義
- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — intra-step follow-up の 2 段実行パターン（本 ADR はこの retry 機構を tool 呼び忘れ対策に拡張する）
- [2026-05-23-executor-commit-push-extraction](./2026-05-23-executor-commit-push-extraction.md) — `commit-push.ts` の分離（本 ADR で `requiresCommit` フィールドが廃止され、commit-push.ts の挙動が変化する）

## 決定

### D1: `report_result` custom tool で step 完了を宣言する（Local は MCP、Managed は custom tool）

**Local runtime**: `createSdkMcpServer` で in-process MCP server を立て、`query({ mcpServers })` で渡す。`SdkMcpToolDefinition.inputSchema` が `AnyZodRawShape` を要求するため、step の `zodSchema`（ZodRawShape）をそのまま渡す。

**Managed runtime**: `z.toJSONSchema(z.object(zodSchema))` で JSON Schema に変換し、`agents.create({ tools: [{ type: "custom", name, description, input_schema }] })` に渡す。runtime ハンドリングでは `requires_action` を検出し `events.list()` で `agent.custom_tool_use` を取得、`user.custom_tool_result` で完了通知する。

**Why not structured output**: Managed Agents Session API は `output_config` / `structured-outputs-2025-11-13` beta header に未対応（SDK 0.91.1 の型に存在しない）。custom tool であれば Local / Managed 両 runtime でスキーマ定義を共通化できる。

**Why MCP for Local**: Claude Agent SDK の `query()` API は native custom tool を持たず、MCP tool 経由でしか custom tool を追加できない。`createSdkMcpServer` が唯一のパス。

**schema の single source of truth**: `zodSchema`（ZodRawShape）を step 側で static const として定義し、Local はそのまま `inputSchema` に渡し、Managed は `toJSONSchema(object(zodSchema))` で変換する。手書き JSON Schema による dual-management は行わない。

### D2: `AgentRunContext` を `input` / `session` / `policy` にグループ化する

既存の `AgentRunContext` は session 制御 / 業務情報注入 / retry 制御 / event egress が平坦に混在し SRP が崩れていた。`reportTool` / `toolReportRetry` を平に追加すると patch on patch になるため、本 change で subfield に整理する:

```
input:   { requestContent, requestAdr, projectContext, dynamicContext }
session: { resumeSessionId, resumePrompt, logPath }
policy:  { postWorkPrompts, reportTool, toolReportRetry }
```

`step` / `state` / `branch` / `slug` / `cwd` / `config` / `emit` / `requestType` はトップレベルに残す（全 adapter が頻繁にアクセスするため）。

既存の `followUpPrompts`（fixer 用の作業後 prompt）を `policy.postWorkPrompts` にリネーム。新規の `FollowUpPolicy`（tool 呼び忘れ retry）と両方 "followUp" を含むと adapter 実装者が混同するため、命名を分離する。

### D3: `completionReason` は技術的 3 値維持、business semantic は `toolResult` で表現

`completionReason: "success" | "error" | "timeout"` の既存 3 値を維持する。`ok: false`（LLM の自発的失敗宣言）と `no-tool-call`（tool 呼ばれなかった）を同じ enum に混ぜると、adapter が business semantic を運搬する責任を持つことになり層が混入する。

adapter は事実（`toolResult: TResult | null`）のみを返す。StepExecutor / 遷移テーブル側で `toolResult === null` → halt、`toolResult.ok === false` → rejected、`toolResult.ok === true` → 正常完了、と semantic 判定を集約する。

### D4: `toolResult` は必須フィールド (TResult | null)

`optional` にすると `undefined`（adapter 非対応）/ `null`（呼ばれなかった）/ value の 3 状態問題が発生する。必須フィールド + `TResult | null` で 2 状態に閉じ、全 adapter が必ず判断結果を返す契約にする。Codex adapter は frozen behavior として常に `null` を返す。

### D5: `requiresCommit` guard 廃止

`report_result` tool で完了を宣言する設計により、SHA 進行による完了判定が不要になる。`commit-push.ts` の新挙動:

- git add 失敗 + 変更なし → silently skip（`noCommitDetectedError` スロー廃止）
- 変更なし + HEAD 進行検知時 → push-only path を維持（authority spec violation 警告ロジックは残す）
- 変更あり → 通常の commit + push

結果として、変更不要な step（spec-review が approved を返すだけのケース等）で空 commit や dummy ファイル書き込みが不要になる。markdown ファイルの commit & push は agent の自由とし、`fetchResultFile` は file not found でも halt せず `outcome.fileContent: null` で best-effort 保存。

### D6: `parseInput` を step 側に置く（OCP 整合）

step が `ReportToolSpec` を export し、`parseInput` も step 側に持つ。adapter は `ReportToolSpec` interface だけ知ればよく、step を追加するたびに adapter を変更しなくて済む。第 1 段は全 step が同じ `BaseReportResult` schema を使うため、`parseBaseReportInput` ヘルパーを port 層に提供し、各 step はそれを呼ぶ。

### D7: follow-up retry は main work ターンのみ検出

tool 呼び出しの検出対象は main work ターン（initial `buildMessage` で開始した最初の作業ターン）のみ。`postWorkPrompts` ターン中の `report_result` 呼び出しは無視する。

`postWorkPrompts` は補助的な後処理であり、step の verdict 確定後に実行される。main work で tool 呼ばれない → follow-up retry → 2 回失敗 → halt、main work で tool 呼ばれた → `postWorkPrompts` ターンへ進行、という flow を維持する。

### D8: `toolResult: null` で halt した step は `awaiting-resume` に遷移する

`failed` ではなく `awaiting-resume` に遷移する。tool 未呼び出しは agent の prompt 問題で起きうるが、ユーザーが prompt 修正や手動介入で resume 可能。`pipeline.ts:91-94`（例外 catch）、`pipeline.ts:284-286`（escalation）、`executor.ts:235`（poll timeout）すべて `awaiting-resume` に遷移するパターンと整合する。

StepExecutor は `toolResult: null` 検知時に `stepHaltedNoToolCallError` を throw し、pipeline の既存 catch ロジックで `awaiting-resume` 遷移する。

### D9: `zod/v4-mini` を schema 表現のみに使用

`@anthropic-ai/claude-agent-sdk` の `peerDependencies` で `zod ^4.0.0` が要求されており、すでに install 済み。spec-runner のコードでは `zod/v4-mini`（tree-shakeable 軽量版、bundle size 約 60-70% 削減）のみ import し、`parseInput` は zod API を使わず手書き check する。`package.json` に `"zod": "^4.0.0"` を直接依存として追加し、SDK の peer dep 範囲変更で build が壊れるリスクを排除する。

### D10: Codex adapter は frozen behavior（`toolResult: null` 固定）

Codex SDK の custom tool 対応調査と実装は別 change。本 change では Codex adapter は `toolResult: null` / `followUpAttempts: 0` を返す frozen behavior とする。これは既知の暫定 regression であり（全 step が `awaiting-resume` に遷移）、Codex 対応 change で解消する。

### D11: TResult は固定スタート（generics 不採用）

`RuntimeStrategy.createAgentRunner()` が step を知らないため、generics を入れても `AgentRunner<BaseReportResult>` で呼ぶしかなく無意味化する。第 3 段で step 固有 schema が出てきたら discriminated union（`type AnyReportResult = BaseReportResult | DesignReportResult | ...`）に切り替える。第 1 段は全 step が `{ok, reason?}` の `BaseReportResult` を使う。

## Alternatives Considered

### Alternative 1: Messages API の `output_config`（structured output）を使う

- **Pros**: tool 呼び出しより自然な形で構造化 JSON を受け取れる
- **Cons**: Managed Agents Session API は `output_config` / `structured-outputs-2025-11-13` beta header に未対応（SDK 0.91.1 の型に存在しない）。Local runtime の Claude Agent SDK も Session API 経由のため同様
- **Why not**: 両 runtime で動作しない。custom tool が唯一の共通パス

### Alternative 2: `completionReason` に `ok-false` / `no-tool-call` を追加する

- **Pros**: 呼び出し元で `completionReason` 1 フィールドだけ見れば判断できる
- **Cons**: adapter が business semantic を運搬する責任を持ち、技術層と業務層の混入が起きる。`completionReason: "ok-false"` は LLM の判断であり adapter の技術的 completion reason ではない
- **Why not**: D3 の層の分離原則。adapter は事実（toolResult）のみを返す

### Alternative 3: `toolResult` を optional にする（`toolResult?: TResult`）

- **Pros**: 既存 adapter へのインパクトが小さい
- **Cons**: `undefined`（adapter 非対応）/ `null`（呼ばれなかった）/ value の 3 状態問題が発生。呼び出し元で undefined チェックと null チェックの両方が必要になる
- **Why not**: D4 の 2 状態設計。必須フィールドで全 adapter に判断結果の返却を強制する

### Alternative 4: `requiresCommit` guard を維持しつつ tool も追加する

- **Pros**: 既存 guard をそのまま保持できる
- **Cons**: tool-driven 完了と SHA 進行の二重チェックになり、「tool を呼んだがコミットしなかった」ケースで guard に引っかかる。変更不要な step（spec-review approved 等）で依然として空 commit が必要
- **Why not**: tool-driven 完了に移行するなら SHA guard は不要になる。二重管理は複雑性を増すだけ

### Alternative 5: `AgentRunContext` のグループ化を別 change に分離する

- **Pros**: 本 change のスコープを最小化できる
- **Cons**: `reportTool` / `toolReportRetry` を平に追加すると patch on patch になる。第 3 段（TResult 拡張）で同じ場所をまた触ることになり change が積層する（`Avoid patchwork fixes`）
- **Why not**: retry 関連 3 フィールドのグループ化が説明しやすい転換点であり、adapter 3 つ + executor + テストの機械的置換は実装難度が低い。今やる方が合理的

## リスクと受容判断

**[Risk] agent が `report_result` を呼ばない**

→ follow-up retry（最大 2 回）で対処。3 回失敗で halt（`awaiting-resume`）。各 step の system prompt 末尾に「タスク完了時に必ず `report_result` tool を呼ぶこと」を追加することで呼び出し率を向上させる。第 1 段はこの fallback で十分。

**[Risk] `AgentRunContext` の破壊的リファクタが adapter 3 つ + executor + テストに波及する**

→ 機械的な field access 書き換えで、型チェックで漏れを検出できる。`bun run typecheck` を防衛ゲートとして使用。

**[Known regression] Codex adapter が全 step で `awaiting-resume` に遷移する**

→ 既知の暫定 regression として受容。Codex SDK の custom tool 対応を実装する次 change で解消する。Codex を使用しているユーザーへの影響は次 change のリリースタイミングで説明する。

**[Risk] `requiresCommit` 廃止で managed runtime のコミット検出が弱くなる**

→ managed runtime は `report_result` tool で完了判定に移行するため、SHA guard は不要になる。`fetchResultFile` は best-effort で保持し、file not found でも halt しない新挙動で対処する。

## Consequences

### Positive

- agent の format 違反（末尾ピリオド、table column ズレ等）による escalation フォールバックがなくなる
- 「タスク完了 / 諦め / 幻覚 / max_turns 超過」の区別が `toolResult.ok` フィールドで明示化される
- `requiresCommit` 廃止により、変更不要な step での空 commit や dummy ファイル書き込みが不要になる
- `AgentRunContext` の subfield 化により SRP が回復し、第 3 段での schema 拡張の場所が明確になる
- schema は `zodSchema`（ZodRawShape）の single source of truth で管理され、dual-management が解消される

### Negative

- Codex adapter は暫定 regression（全 step が `awaiting-resume` に遷移）
- `AgentRunContext` の contract 変更により、全 adapter のテストコードが機械的な書き換えを必要とする
- 第 1 段では既存の `outcome.fileContent` regex parse による verdict 抽出が維持されるため、parser と tool の二重存在状態が第 3 段まで継続する

### Known Debt

- `outcome.fileContent` から `outcome.toolResult` への parse 経路移行は第 3 段（step 固有 schema 拡張時）で実施
- 遷移テーブルの `parseFixableFindings` 再 parse 廃止も第 3 段で実施
- `spec-fixer-system.ts` 等の手順ステップに残る "end_turn する" の記述と末尾の "report_result tool を呼び出してください" の矛盾は第 3 段（phase 3 cleanup）で解消する
- `AgentStep` の `StepContract` グルーピング（`buildMessage / resultFilePath / parseResult / reportTool` を `contract` subfield に集約）は第 3 段で discriminated union 化と同時に実施

## Files Changed

| File | Change |
|------|--------|
| `src/core/port/report-result.ts` | 新設（`ReportToolSpec` / `BaseReportResult` / `FollowUpPolicy` / `DEFAULT_TOOL_RETRY` / `parseBaseReportInput`） |
| `src/core/step/report-tool.ts` | 新設（`REPORT_TOOL` static const + `REPORT_TOOL_CUSTOM_TOOL_SPEC`、`zodSchema` から `toJSONSchema` で変換） |
| `src/core/port/agent-runner.ts` | `AgentRunContext` を `input` / `session` / `policy` にグループ化。`AgentRunResult` に `toolResult` / `followUpAttempts` 追加 |
| `src/core/step/types.ts` | `AgentStep.requiresCommit` 削除、`AgentStep.reportTool` 追加 |
| `src/core/step/executor.ts` | `toolResult: null` → `stepHaltedNoToolCallError` throw、`awaiting-resume` 遷移ロジック追加 |
| `src/core/step/commit-push.ts` | `requiresCommit` 参照削除、silently skip + push-only path への新挙動 |
| `src/adapter/claude-code/agent-runner.ts` | `createSdkMcpServer` で `report_result` 登録、follow-up retry ループ追加 |
| `src/adapter/managed-agent/agent-runner.ts` | `requires_action` 検出 → `handleRequiresAction` → `user.custom_tool_result` 送信、follow-up retry 追加 |
| `src/adapter/codex/agent-runner.ts` | frozen behavior（`toolResult: null` / `followUpAttempts: 0`）、新 `AgentRunContext` 構造対応 |
| `src/adapter/shared/follow-up.ts` | `followUpPrompts` → `postWorkPrompts` リネーム対応 |
| `src/state/schema.ts` | `StepOutcome` に `toolResult` / `followUpAttempts` 追加 |
| `src/logger/pipeline-logger.ts` | `toolResult` / `followUpAttempts` の log 出力追加 |
| 全 10 step ファイル | `requiresCommit` 削除、`reportTool` 追加、`AgentDefinition.tools` に `REPORT_TOOL_CUSTOM_TOOL_SPEC` 追加 |
| 全 10 system prompt ファイル | 末尾に `report_result` tool 呼び出し指示（`## Completion` セクション）追加 |
| `package.json` | `"zod": "^4.0.0"` を `dependencies` に追加 |

## 関連 ADR

- [2026-05-05-agent-runner-port-and-local-runtime](./2026-05-05-agent-runner-port-and-local-runtime.md) — `AgentRunContext` ポートの初期定義。本 ADR で `input` / `session` / `policy` にグループ化し、`toolResult` / `followUpAttempts` を追加。
- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — intra-step 2 段実行の基盤となる follow-up retry パターン。本 ADR は tool 呼び忘れ対策として同パターンを `FollowUpPolicy` に拡張し、`followUpPrompts` を `postWorkPrompts` にリネームする。
- [2026-05-23-executor-commit-push-extraction](./2026-05-23-executor-commit-push-extraction.md) — `commit-push.ts` の分離。本 ADR で `requiresCommit` フィールドが廃止され、`silently skip` の新挙動が追加される。
- [2026-04-29-module-architecture-style](./2026-04-29-module-architecture-style.md) — hexagonal-lite + module-boundary 原則。本 ADR の port/adapter 分離設計の基盤。
