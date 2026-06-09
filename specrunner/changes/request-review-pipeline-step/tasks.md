# Tasks: request-review pipeline step

## T-01: request-review ステップ名を登録する

- [x] `src/kernel/step-names.ts`: `AGENT_STEP_NAMES` 配列に `"request-review"` を追加する
- [x] `src/kernel/step-names.ts`: `STEP_NAMES` に `REQUEST_REVIEW: "request-review"` を追加する
- [x] `src/kernel/agent-definition.ts`: `AgentStepName` union に `"request-review"` を追加する
- [x] `state/schema.ts` の双方向コンパイルガード（`_AgentStepExtraInArray` / `_AgentStepExtraInUnion`）が pass することを確認する

**Acceptance Criteria**:
- `"request-review"` が `AGENT_STEP_NAMES` と `AgentStepName` の両方に存在する
- `typecheck` が green（同期ガードが通る）

## T-02: REQUEST_REVIEW_REPORT_TOOL と typed result を追加する

- [x] `src/core/port/report-result.ts`: `RequestReviewReportResult extends BaseReportResult { verdict?: "approve" | "needs-discussion" | "reject" }` を追加する
- [x] `src/core/port/report-result.ts`: `parseRequestReviewReportInput()` を追加する（`verdict` が 3 値のいずれかのときだけ採用、不正値は無視。base 解析失敗はそのまま伝播）
- [x] `src/core/step/report-tool.ts`: `REQUEST_REVIEW_REPORT_TOOL: ReportToolSpec<RequestReviewReportResult>` を追加する（`zodSchema` に `verdict: optional(union([literal("approve"), literal("needs-discussion"), literal("reject")]))`、`parseInput = parseRequestReviewReportInput`、description に verdict の意味を記載）

**Acceptance Criteria**:
- `parseRequestReviewReportInput({ ok: true, verdict: "approve" })` が `{ ok: true, value: { ok: true, verdict: "approve" } }` を返す
- `parseRequestReviewReportInput({ ok: true, verdict: "xxx" })` が verdict を含まない value を返す
- `toCustomToolSpec(REQUEST_REVIEW_REPORT_TOOL)` が有効な input_schema を生成する

## T-03: 結果ファイルパスヘルパを追加する

- [x] `src/util/paths.ts`: `requestReviewResultPath(slug, iteration)` を追加する（`specrunner/changes/<slug>/request-review-result-NNN.md`、3 桁ゼロ埋め）

**Acceptance Criteria**:
- `requestReviewResultPath("foo", 1) === "specrunner/changes/foo/request-review-result-001.md"`
- このファイルが他の `src/` モジュールを import しない（TC-034 不変条件維持）

## T-04: 結果ファイルテンプレートを追加する

- [x] `src/templates/step-output-templates.ts`: `REQUEST_REVIEW_RESULT_TEMPLATE`（verdict 行 + findings table。verdict 値は `approve | needs-discussion | reject`）を追加する
- [x] `getOutputTemplates()` に `case "request-review"` を追加する（iteration = `(state.steps?.["request-review"]?.length ?? 0) + 1`、`requestReviewResultPath` を使用、A-group: cleanup なし）

**Acceptance Criteria**:
- `getOutputTemplates("request-review", "foo", state)` が `request-review-result-001.md` を 1 件返す（初回）
- テンプレートの verdict 行フォーマットが machine-parse 用に固定されている

## T-05: request-review ステップのプロンプトを実装する

- [x] `src/prompts/request-review-system.ts` を pipeline ステップ用に書き換える: 既存の architect レビュープロセス（codebase 文脈把握 → 要件検証 → 外部依存 → scope → complexity/reuse、severity scope 制約）を維持しつつ、出力を **JSON フェンスではなく結果ファイル + `report_result` tool** に変更する
- [x] system prompt に「rules.md を読む」「change folder の `request.md` を Read して評価する」「結果を user message 指定の `request-review-result-NNN.md` へ書く」「`report_result` を `{ ok: true, verdict: <approve|needs-discussion|reject> }` で呼んで end_turn」を記載する
- [x] system prompt に read-only 制約（request.md / source を変更しない）を明記する
- [x] `buildRequestReviewInitialMessage(input)` を追加する（slug / requestType / branch / iteration / findingsPath を受け取り、agent に request.md を Read させる初期メッセージを生成。`deps.request.content` を主データソースにしない）

**Acceptance Criteria**:
- system prompt が verdict を `report_result` tool で報告するよう指示している
- 初期メッセージが結果ファイルパスと「request.md を Read せよ」を含む
- verdict 導出ルール（HIGH 件数ベースの approve/needs-discussion/reject）が維持されている

## T-06: RequestReviewStep を実装する

- [x] `src/core/step/request-review.ts` を新規作成する（`AgentStep`、spec-review/conformance を参照）
- [x] 専用 `AgentDefinition`（`name: "specrunner-request-review"`、`role: STEP_NAMES.REQUEST_REVIEW`、`model: "claude-sonnet-4-6"`、`tools: [{ type: AGENT_TOOLSET_TYPE }, toCustomToolSpec(REQUEST_REVIEW_REPORT_TOOL)]`、`capabilities: { gitWrite: true }`）
- [x] `reportTool = REQUEST_REVIEW_REPORT_TOOL`、`needsProjectContext: true`、`maxTurns: 15`、`toolHandlers: undefined`
- [x] `reads()` = `[{ path: requestMdPath(deps.slug) }]`、`writes()` = `[{ path: requestReviewResultPath(deps.slug, nextIteration(state, "request-review")) }]`
- [x] `buildMessage()` = `buildRequestReviewInitialMessage(...)`、`resultFilePath()` = `requestReviewResultPath(slug, iteration)`、`parseResult()` = `{ verdict: null, findingsPath: null }`
- [x] ループステップではない（`completionVerdict` / `setsBranch` を設定しない）

**Acceptance Criteria**:
- `RequestReviewStep.kind === "agent"` かつ `name === "request-review"`
- `reads()` が request.md を必須入力として宣言する
- `typecheck` が green

## T-07: executor の verdict 導出に request-review 分岐を追加する

- [x] `src/core/step/executor.ts`: `REQUEST_REVIEW_REPORT_TOOL` を import する
- [x] `finalizeStep()` に第 3 の step-class 分岐を追加する: `isRequestReviewStep = stepReportTool === REQUEST_REVIEW_REPORT_TOOL`
- [x] non-null toolResult: `verdict = (toolResult as RequestReviewReportResult).verdict ?? "needs-discussion"`（`as Verdict` キャスト）
- [x] null toolResult（no-tool-call proceed path）: `verdict = "needs-discussion"`
- [x] 既存の judge / producer 分岐の挙動を変えない

**Acceptance Criteria**:
- toolResult `{ verdict: "approve" }` → step verdict `approve`
- toolResult `{ verdict: "reject" }` → step verdict `reject`
- toolResult null → step verdict `needs-discussion`
- spec-review / code-review / design の既存 verdict 導出が回帰しない

## T-08: pipeline 登録と遷移表を更新する

- [x] `src/core/pipeline/registry.ts`: `RequestReviewStep` を import し、`STANDARD_DESCRIPTOR.steps` の先頭に `[STEP_NAMES.REQUEST_REVIEW, RequestReviewStep]` を追加する
- [x] `STANDARD_DESCRIPTOR.startStep = STEP_NAMES.REQUEST_REVIEW` に変更する
- [x] `STANDARD_DESCRIPTOR.roles` に `[STEP_NAMES.REQUEST_REVIEW]: { role: "gate", phase: "spec" }` を追加する
- [x] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に 4 行追加する: `approve→design` / `needs-discussion→escalate` / `reject→escalate` / `error→escalate`
- [x] `src/core/command/pipeline-run.ts`: `prepare()` の `startStep` を `STEP_NAMES.REQUEST_REVIEW` に変更する
- [x] `loopNames` / `loopFixerPairs` / `summaryStep`（= spec-review）は変更しない

**Acceptance Criteria**:
- `STANDARD_DESCRIPTOR` の最初の step が `request-review`
- `descriptor.startStep` と `pipeline-run.ts` の `startStep` がともに `request-review`
- 遷移表で `request-review`+`approve` が `design` を返す
- 遷移表で `request-review`+`needs-discussion`/`reject` が `escalate` を返す

## T-09: run path の draft 削除を除去する（copy semantics）

- [x] `src/core/runtime/local.ts`: `setupWorkspace` run path と `setupWorkspaceNoWorktree` run path の「Delete main worktree draft file（move semantics）」ブロックを削除する
- [x] `src/core/runtime/managed.ts`: `setupWorkspace` run path の「Delete draft file from main cwd（move semantics）」ブロックを削除する
- [x] change folder へのコピー・stage・commit・`state.request.path` 更新は維持する

**Acceptance Criteria**:
- run 後に `specrunner/drafts/<slug>/request.md` が main working tree に残る
- change folder の request.md コピーと最初の commit は従来通り行われる

## T-10: resume の draft 再コピーを実装する

- [x] `src/core/artifact/copy-artifacts.ts`: `recopyDraftToChangeFolder(repoRoot, targetCwd, slug, spawnFn)` を追加する（`<repoRoot>/specrunner/drafts/<slug>/request.md` が存在すれば `<targetCwd>/specrunner/changes/<slug>/request.md` へ上書きコピー + `git add`。存在しなければ no-op。symlink 拒否）
- [x] `src/core/runtime/local.ts`: `setupWorkspace` の resume path（既存 worktree 再利用 / worktree 再作成 / `existingWorktreePath === null`）と `setupWorkspaceNoWorktree` resume path で `recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn)` を呼ぶ
- [x] `src/core/runtime/managed.ts`: resume path で同ヘルパを呼ぶ（target = this.cwd）
- [x] 再コピーは pipeline 実行前（setupWorkspace 内）に完了する

**Acceptance Criteria**:
- draft が存在する resume で worktree の change folder request.md が draft 内容で上書きされる
- draft が存在しない resume はエラーにならず skip する
- request-review の agent は再コピー後の request.md を読む

## T-11: archive で draft を削除する

- [x] `src/core/archive/orchestrator.ts`: Phase 1 の `archiveChangeFolder` 後・`git add specrunner/changes/` 前に `specrunner/drafts/<slug>/` を best-effort で削除する（`fs.rm(..., { recursive: true, force: true })`）
- [x] 削除を stage するため `git add specrunner/drafts/` を実行する（tracked なら archive commit に同梱、untracked/不在なら no-op）
- [x] 削除失敗は warning のみで archive を止めない

**Acceptance Criteria**:
- archive 後に `specrunner/drafts/<slug>/` が存在しない
- draft が不在でも archive は exit 0 で完了する

## T-12: `request review` コマンドを廃止する

- [x] `src/cli/command-registry.ts`: `COMMANDS.request.subcommands.review` を削除する
- [x] `src/cli/command-registry.ts`: `USAGE` から `request review <slug|file>` 行を削除する
- [x] `src/cli/command-registry.ts`: `executeReview` の import を削除する
- [x] `src/core/command/request-review.ts` と `src/core/request/reviewer.ts` を削除する（他に消費者がないことを grep で確認した上で。`OneShotQueryClient` 自体は `request generate` が使うため残す）
- [x] 削除に伴い参照が壊れる箇所（usage 型の `"request-review"` コマンド文字列等）を整理する

**Acceptance Criteria**:
- `specrunner request review <slug>` が「Unknown request subcommand: review」で exit 2
- `request generate` は引き続き動作する（`OneShotQueryClient` 残存）
- `typecheck` が green（dangling import なし）

## T-13: managed setup に RequestReviewStep を登録する

- [x] `src/cli/managed.ts`: `RequestReviewStep` を import し、`AgentRegistry.fromSteps([...])` の配列に追加する

**Acceptance Criteria**:
- `runManagedSetup` で構築する registry が role `request-review` の agent を含む

## T-14: テストを更新・追加し品質ゲートを通す

- [x] 旧 request-review コマンドのテスト（`request-review.test.ts` / `request-review-progress.test.ts` / `request-review-model-flag.test.ts` 等）を削除または新仕様へ置換する
- [x] `removed-commands.test.ts` に `request review` → 「Unknown request subcommand: review」exit 2 のケースを追加する
- [x] RequestReviewStep（reads/writes/buildMessage/reportTool）の unit test を追加する
- [x] executor の verdict 導出（approve/needs-discussion/reject/null fallback）の test を追加する
- [x] 遷移表（approve→design、needs-discussion/reject→escalate、startStep=request-review）の test を追加・更新する
- [x] run の copy semantics（draft 残存）/ resume 再コピー / archive draft 削除の test を追加・更新する
- [x] `REQUEST_REVIEW_REPORT_TOOL` parse、`requestReviewResultPath`、`getOutputTemplates("request-review")` の test を追加する
- [x] 既存の draft move-semantics 前提テストを copy-semantics 前提に更新する

**Acceptance Criteria**:
- `bun run typecheck` が green
- `bun run test` が green
- 受け入れ基準（run で request-review 先頭実行 / approve→design / needs-discussion・reject→escalate / draft 修正→resume 再開 / 全 resume で再コピー / `request review` 廃止 / archive で draft 削除）を検証するテストが存在する
