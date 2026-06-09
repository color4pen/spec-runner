# Design: request-review pipeline step

## Context

`request review` は現在スタンドアロンの CLI コマンド（`COMMANDS.request.subcommands.review`）で、
`ClaudeCodeOneShotQueryClient`（`OneShotQueryClient`）経由の stateless / read-only 実行。
agent が JSON フェンスで `{ verdict, findings, summary }` を出力し、`parseReviewOutput()` が解析する。
verdict 体系は `approve` / `needs-discussion` / `reject` の 3 値。

一方、pipeline の各 AgentStep（design / spec-review / conformance ...）は次の共通機構で動く:

- `AgentStep` 定義（`src/core/step/*.ts`）が `AgentDefinition` と `reportTool` を所有。
- `StepExecutor.finalizeStep()` が `report_result` tool の typed 結果（`toolResult`）から verdict を導出。
- verdict は遷移テーブル（`STANDARD_TRANSITIONS`）で次ステップに振り分けられる。
- 結果ファイル（`*-result-NNN.md`）を change folder に書き、commit-push される。

現状の pipeline は 12 ステップで `design` から開始する（`STANDARD_DESCRIPTOR.startStep = design`、
`PipelineRunCommand.prepare()` の `startStep = design`）。

draft（`specrunner/drafts/<slug>/request.md`）は `run` 時に change folder へ **move（コピー後に削除）** される
（`LocalRuntime.setupWorkspace` / `ManagedRuntime.setupWorkspace` の run path）。

本変更は request-review を pipeline の最初の AgentStep として組み込み、スタンドアロンコマンドを廃止する。
これにより `run` だけで review → design → ... → pr-create が一気通貫で走り、
needs-discussion で止まった場合は draft を直接修正して `resume` で再開できる。

### 制約

- verdict（approve / needs-discussion / reject）は遷移表の `on: string` として扱い、`Verdict` 型は拡張しない（architect 評価済み）。
- resume 時の draft → worktree 再コピーは全 resume で無条件に実行する（request.md は pipeline 中に変更されないため安全。architect 評価済み）。
- review は read-only（request.md を修正しない）。品質改善は `request generate` 側の責務。

## Goals / Non-Goals

**Goals**:

- request-review を AgentStep（`AgentRunner` + `report_result` typed verdict）として実装する。
- 3 値 verdict 体系（approve / needs-discussion / reject）を維持する。
- 遷移表に request-review を追加し、pipeline の開始ステップにする。
- モデルは step-config 解決チェーンに従う（hardcode default = sonnet）。
- resume 時に draft の request.md が存在すれば worktree へ再コピーする。
- `request review` コマンドを廃止する。
- managed runtime の `AgentRegistry.fromSteps()` に RequestReviewStep を追加する。
- archive 時に `specrunner/drafts/<slug>/` を削除する。
- レビュー結果を `changes/<slug>/request-review-result-{n}.md` に書き出す。

**Non-Goals**:

- request.md の auto-fix。
- review のスキップ機能。
- issue 連携。
- pipeline 内の spec-review / code-review の挙動変更。

## Decisions

### D1: RequestReviewStep を judge 型 AgentStep として実装する

spec-review / conformance と同型の `AgentStep`（`kind: "agent"`）として `src/core/step/request-review.ts` に実装する。

- 専用 `AgentDefinition`（`role: "request-review"`、`model: "claude-sonnet-4-6"`、`tools: [agent_toolset, REQUEST_REVIEW_REPORT_TOOL]`、`capabilities: { gitWrite: true }`）。
- `reportTool = REQUEST_REVIEW_REPORT_TOOL`（D2）。
- `reads()` = `[ requestMdPath(slug) ]`、`writes()` = `[ requestReviewResultPath(slug, nextIteration) ]`。
- `needsProjectContext: true`、`maxTurns: 15`（read + judgment 中心、spec-review と同等）。
- ループステップではない（fixer ペアを持たない）。`resultFilePath()` は結果ファイルパスを返すが、verdict は typed toolResult から導出する（prose parse path は使わない）。
- `parseResult()` は `{ verdict: null, findingsPath: null }` を返す（spec-review と同じく contract lock 後のダミー）。

**Rationale**: 既存の judge 型ステップ（spec-review / conformance）と構造を揃えることで、executor / artifact / commit-push / rules 解決の既存機構をそのまま再利用できる。
**Alternatives considered**: CliStep として結果ファイルの prose parse に依存する案 — 要件 1（report_tool 経由の typed verdict）に反するため却下。

### D2: 3 値 verdict を Verdict 型を拡張せず扱う

新しい report tool spec を追加する:

- `RequestReviewReportResult extends BaseReportResult { verdict?: "approve" | "needs-discussion" | "reject" }`（`src/core/port/report-result.ts`）。
- `parseRequestReviewReportInput()`（`verdict` が 3 値のいずれかのときだけ採用、それ以外は無視）。
- `REQUEST_REVIEW_REPORT_TOOL: ReportToolSpec<RequestReviewReportResult>`（`src/core/step/report-tool.ts`）。

`StepExecutor.finalizeStep()` の verdict 導出に第 3 の step-class 分岐を追加する（既存の `isJudgeStep` が `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` の identity で判定しているのと同じ流儀）:

- `isRequestReviewStep = stepReportTool === REQUEST_REVIEW_REPORT_TOOL`。
- toolResult が non-null: `verdict = toolResult.verdict`（string）。
- toolResult が null（no-tool-call proceed path）: `verdict = "needs-discussion"`（保守的に halt 側へ）。
- 導出した verdict 文字列は `Verdict` のメンバーではないため `as Verdict` でキャストして格納する（`finalizeStep` は既に `verdict as Verdict | null` で push している）。

`getStepOutcome()` は格納された verdict 文字列をそのまま返し、遷移表は `on: "approve"` 等の文字列一致で振り分ける（`Transition.on: Verdict | string`）。

**Rationale**: `Verdict` union は exhaustive switch（pipeline.ts の history status 判定等）で消費されるため、3 値を混ぜると影響範囲が広がる。遷移表の `on: string` 経路に閉じることで影響を request-review の 1 ステップに局所化できる。
**Alternatives considered**:
- `Verdict` union に 3 値を追加 — architect 評価で却下。
- approve→approved / それ以外→needs-fix に潰す — needs-discussion と reject を区別できず、要件 3 を満たせない。

### D3: pipeline へのステップ登録と遷移

- `kernel/step-names.ts`: `AGENT_STEP_NAMES` に `"request-review"` を追加、`STEP_NAMES.REQUEST_REVIEW = "request-review"` を追加。
- `kernel/agent-definition.ts`: `AgentStepName` union に `"request-review"` を追加（`state/schema.ts` の双方向コンパイルガードが同期を強制）。
- `STANDARD_DESCRIPTOR`（`src/core/pipeline/registry.ts`）:
  - `steps` の先頭に `[STEP_NAMES.REQUEST_REVIEW, RequestReviewStep]` を追加。
  - `startStep = STEP_NAMES.REQUEST_REVIEW`。
  - `roles[REQUEST_REVIEW] = { role: "gate", phase: "spec" }`（ループ・fixer を持たない checkpoint なので gate。phase 不変条件「各 phase に creator/reviewer 各 1」を侵さない）。
  - `loopNames` / `loopFixerPairs` / `summaryStep`（= spec-review）は変更しない。
- `STANDARD_TRANSITIONS`（`src/core/pipeline/types.ts`）に追加:
  - `{ step: REQUEST_REVIEW, on: "approve", to: DESIGN }`
  - `{ step: REQUEST_REVIEW, on: "needs-discussion", to: "escalate" }`
  - `{ step: REQUEST_REVIEW, on: "reject", to: "escalate" }`
  - `{ step: REQUEST_REVIEW, on: "error", to: "escalate" }`（ステップ失敗時の明示遷移。既存 design と同流儀）
- `PipelineRunCommand.prepare()`（`src/core/command/pipeline-run.ts`）の `startStep` を `STEP_NAMES.REQUEST_REVIEW` に変更。

**Rationale**: 開始点を 2 箇所（descriptor.startStep / pipeline-run.ts）で一致させる必要がある。`run.ts` の標準パイプライン実行は `descriptor.startStep` を、CommandRunner は `PrepareResult.startStep` を使うため両方更新する。
**Alternatives considered**: request-review を reviewer ロールにする案 — 「phase に reviewer は 1 つ」不変条件と衝突し、かつ fixer ループ前提のロールであるため gate を採用。

### D4: draft ライフサイクル（copy 化 + archive 削除）と resume 再コピー

要件 5（resume 再コピー）・要件 9（archive 削除）・受け入れ基準「draft を修正して resume で再開できる」を成立させるには、draft が run を跨いで残存する必要がある。したがって:

- **run path**: `LocalRuntime.setupWorkspace` / `ManagedRuntime.setupWorkspace` の run path から **draft 削除処理（move semantics）を除去**する。draft は main working tree に残る（copy semantics）。
- **resume 再コピー**: 共有ヘルパ `recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn)`（`src/core/artifact/copy-artifacts.ts`）を追加し、両 runtime の setupWorkspace **resume path** から呼ぶ。`<repoRoot>/specrunner/drafts/<slug>/request.md` が存在すれば `<targetCwd>/specrunner/changes/<slug>/request.md` へ上書きコピーする（存在しなければ no-op）。
- **archive 削除**: `runArchiveOrchestrator`（`src/core/archive/orchestrator.ts`）Phase 1 で change folder archive 後・stage 前に `specrunner/drafts/<slug>/` を削除し、`git add specrunner/drafts/` で削除を stage する（tracked なら archive commit に同梱、untracked なら no-op）。best-effort。
- **request-review は on-disk の request.md を読む**: resume では `ResumeCommand.prepare()` の `parseRequestMd`（= `deps.request.content`）が再コピー前の旧内容になりうる。よって request-review の prompt は `deps.request.content` を主データソースにせず、agent に change folder の `request.md` を Read させる。setupWorkspace の再コピーは pipeline 実行前に走るため、agent が読む時点では編集済み draft が反映されている。

**Rationale**: copy 化により draft が「修正可能な single source」として run〜archive 間に残る。再コピーを setupWorkspace に置くのは run path の draft→change folder コピーと同じ層であり、worktree が確実に存在するため。on-disk 読みにより resume での編集反映を保証する。
**Alternatives considered**:
- 再コピーを `ResumeCommand.prepare()` に置く案 — worktree が prepare 時点で未生成（再作成は setupWorkspace）のため却下。
- `deps.request` を再コピー後に再パースする案 — PrepareResult を貫く request オブジェクトの再構築が必要で侵襲的。agent に Read させる方が局所的。

### D5: 結果ファイルとテンプレート

- `util/paths.ts` に `requestReviewResultPath(slug, iteration)` を追加（`specrunner/changes/<slug>/request-review-result-NNN.md`、3 桁ゼロ埋め）。
- `templates/step-output-templates.ts` に `REQUEST_REVIEW_RESULT_TEMPLATE`（verdict 行 + findings table）を追加し、`getOutputTemplates()` に `case "request-review"` を追加（iteration = past count + 1）。
- iteration 解決は `nextIteration(state, "request-review")` を使用。

**Rationale**: spec-review-result / conformance-result と同じ A-group テンプレート機構に揃える（要件 10「他のステップと同じ形式」）。

### D6: `request review` コマンド廃止

- `command-registry.ts`: `COMMANDS.request.subcommands.review` を削除、`USAGE` から `request review` 行を削除、`executeReview` import を削除。
- `src/core/command/request-review.ts`（`executeReview`）と `src/core/request/reviewer.ts`（`runReview` / `parseReviewOutput` / `formatHumanReadable` / `verdictToExitCode` / `buildInitialMessage`）を削除（他に消費者がないことを確認した上で）。
- `request review <slug>` は「Unknown request subcommand: review」で exit 2 になる（既存の未知サブコマンド経路）。

**Rationale**: review はステップ化されたため一回限りのコマンドは不要（要件 6）。`OneShotQueryClient` 自体は `request generate` が使い続けるため残す。

### D7: モデル解決

`AgentDefinition.model = "claude-sonnet-4-6"`（step-config 解決チェーン level 5 = ステップ定義の hardcode default）。
config の `steps.request-review.*` / `steps.defaults.*` / `byRequestType.*`（level 1〜4）が既存機構で自動的に上書きする。request-review 固有の解決処理は不要。

**Rationale**: 他ステップと同一の解決チェーンに乗せるだけでよい（要件 4）。

### D8: managed runtime 登録

`cli/managed.ts` の `AgentRegistry.fromSteps([...])` に `RequestReviewStep` を追加する。`managed setup` 再実行で agent が登録される（要件 8）。

## Risks / Trade-offs

- [Risk] resume 時に `deps.request.content` が再コピー前の旧内容になりうる
  → Mitigation: request-review は on-disk の request.md を agent に Read させる（D4）。再コピーは agent 実行前（setupWorkspace）に完了する。
- [Risk] executor が `REQUEST_REVIEW_REPORT_TOOL` の identity に結合する
  → Mitigation: 既存の `isJudgeStep`（JUDGE_REPORT_TOOL identity 判定）と同じパターンで、影響は finalizeStep の 1 分岐に局所化される。
- [Risk] run-time の draft 削除を外したことで既存テスト（draft が消える前提）が落ちる
  → Mitigation: 該当テストを copy semantics 前提に更新する。削除点は archive に一本化される。
- [Risk] verdict 文字列が `Verdict` union 外のため、Verdict を exhaustive に switch するコードが request-review verdict を取りこぼす
  → Mitigation: request-review verdict を読むのは遷移表（文字列一致）のみ。pipeline.ts の history status 判定は未知 verdict を `warning` に落とすため安全。summary は spec-review 基準で request-review verdict を参照しない。
- [Risk] copy 化で run 後も draft が `request ls` に残る
  → Mitigation: draft は archive まで「修正可能な source」として残す設計意図に合致。archive で削除される。
- [Risk] managed runtime の resume 再コピー先は worktree でなく cwd
  → Mitigation: 共有ヘルパは runtime の workspace cwd を target に取り、両 runtime の resume path から呼ぶ。

## Open Questions

- `src/core/usage/types.ts` 等に残る `"request-review"` コマンド文字列（draft usage 追跡用）の扱い。新ステップの usage は `command: "job"` / `stepName: "request-review"` で記録されるため、旧コマンド用の文字列は不要なら整理する（実装時に消費者を確認）。
- archive の draft 削除を main へ commit するか否かは draft が git tracked かどうかに依存する。設計上は「tracked なら stage して archive commit に同梱、untracked なら filesystem 削除のみ」で両対応する。
