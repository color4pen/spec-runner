# Test Cases: pr-create step 追加（self-host pipeline 完成形）

## Summary

- **Total**: 31 cases
- **Automated** (unit/integration/e2e): 28
- **Manual**: 3
- **Priority**: must: 17, should: 10, could: 4

## Test Cases

---

### TC-001: runner — 既存 OPEN PR を検出して新規作成しない

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-runner/spec.md — Scenario "Existing OPEN PR is detected and returned without re-creation"

**GIVEN** branch `feat/foo` に対して `gh pr list` が `[{ "url": "...", "number": 12, "state": "OPEN" }]` を返す
**WHEN** `runPrCreate({ branch: "feat/foo", baseBranch: "main", ... })` を呼ぶ
**THEN** 戻り値は `{ status: "existing-open", url: "...", number: 12 }`
**AND** `gh pr create` は呼ばれない

---

### TC-002: runner — PR が存在しない場合に新規 PR を作成する

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-runner/spec.md — Scenario "New PR is created when none exists"

**GIVEN** branch `feat/bar` に対して `gh pr list` が `[]` を返す
**WHEN** `runPrCreate({ branch: "feat/bar", baseBranch: "main", title: "Add bar", body: "...", cwd: "/repo" })` を呼ぶ
**THEN** `gh pr create --title "Add bar" --body-file <tempfile> --base main --head feat/bar` が spawn される
**AND** 戻り値は `{ status: "created", url: <new url>, number: <new number> }`
**AND** 一時ファイルはコマンド完了後に削除される

---

### TC-003: runner — 既存 MERGED PR の場合に error を返す

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-runner/spec.md — Scenario "MERGED existing PR returns error"

**GIVEN** branch `feat/baz` に対して `gh pr list` が `[{ "state": "MERGED" }]` を返す
**WHEN** `runPrCreate({ branch: "feat/baz", ... })` を呼ぶ
**THEN** 戻り値は `{ status: "error", reason: "merged", message: <descriptive> }`
**AND** `gh pr create` は呼ばれない

---

### TC-004: runner — gh CLI 失敗時に error を返す

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-runner/spec.md — Scenario "gh CLI failure returns error with stderr"

**GIVEN** gh CLI が認証失敗などで非ゼロ終了する
**WHEN** `runPrCreate({ ... })` を呼ぶ
**THEN** 戻り値は `{ status: "error", reason: "gh-failure", message: <stderr> }`
**AND** message に `specrunner login` または `gh auth login` への再認証ヒントが含まれる

---

### TC-005: runner — 既存 CLOSED PR の場合に error を返す

**Category**: unit
**Priority**: should
**Source**: design.md — D2「CLOSED PR があれば escalation」

**GIVEN** branch に対して `gh pr list` が `[{ "state": "CLOSED" }]` を返す
**WHEN** `runPrCreate({ ... })` を呼ぶ
**THEN** 戻り値は `{ status: "error", reason: "closed", message: <descriptive> }`
**AND** `gh pr create` は呼ばれない

---

### TC-006: runner — `--body` フラグを使用しない（tempfile 経由）

**Category**: unit
**Priority**: should
**Source**: tasks.md T-3.4 "The `--body` flag SHALL NOT be used"

**GIVEN** PR body が与えられる
**WHEN** `runPrCreate` が `gh pr create` を spawn する
**THEN** spawn される引数に `--body` フラグが含まれない
**AND** `--body-file <tempfile>` が含まれる

---

### TC-007: runner — stderr 文言依存で PR 不在を判定しない

**Category**: unit
**Priority**: should
**Source**: specs/pr-create-runner/spec.md — "PR absence MUST be determined solely by the JSON array length"

**GIVEN** `gh pr list` が空配列 `[]` を返す
**WHEN** `runPrCreate` が PR 検出を行う
**THEN** PR 不在の判定は JSON 配列の長さ（0）のみで行われる
**AND** stderr の文言マッチングは行われない

---

### TC-008: PrCreateStep — CliStep shape の適合性

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "PrCreateStep exposes CliStep shape"

**GIVEN** `src/core/step/pr-create.ts` からエクスポートされた `PrCreateStep` インスタンス
**WHEN** インスタンスを inspect する
**THEN** `step.kind === "cli"`
**AND** `step.name === "pr-create"`
**AND** `step.agent` プロパティが存在しない
**AND** `step.run` が `Promise<void>` を返す関数である

---

### TC-009: PrCreateStep.resultFilePath — slug から正しいパスを生成する

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "PrCreateStep.resultFilePath uses change slug"

**GIVEN** slug が `"pr-create-step"` の `JobState`
**WHEN** `PrCreateStep.resultFilePath(state)` を呼ぶ
**THEN** 返り値は `"openspec/changes/pr-create-step/pr-create-result.md"`

---

### TC-010: PrCreateStep.parseResult — success を verdict "success" にマップする

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "PrCreateStep.parseResult maps Status to verdict"

**GIVEN** `## Status: success` という行を含む result file 内容
**WHEN** `PrCreateStep.parseResult(content)` を呼ぶ
**THEN** `StepOutcome.verdict === "success"`

---

### TC-011: PrCreateStep.parseResult — failed を verdict "error" にマップする

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "PrCreateStep.parseResult maps Status to verdict"

**GIVEN** `## Status: failed` という行を含む result file 内容
**WHEN** `PrCreateStep.parseResult(content)` を呼ぶ
**THEN** `StepOutcome.verdict === "error"`

---

### TC-012: PrCreateStep.parseResult — Status 行なしで verdict null を返す

**Category**: unit
**Priority**: should
**Source**: specs/pr-create-step/spec.md — "neither is detected, parseResult SHALL return { verdict: null }"

**GIVEN** `## Status:` 行を含まない result file 内容
**WHEN** `PrCreateStep.parseResult(content)` を呼ぶ
**THEN** `StepOutcome.verdict === null`

---

### TC-013: PrCreateStep.run — PR 作成成功時に pullRequest を JobState に記録する

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "PR creation persists pullRequest into JobState"

**GIVEN** runner が `{ status: "created", url: "https://github.com/owner/repo/pull/42", number: 42 }` を返す
**WHEN** `PrCreateStep.run(state, deps)` が完了する
**THEN** `state.pullRequest.url === "https://github.com/owner/repo/pull/42"`
**AND** `state.pullRequest.number === 42`
**AND** `state.pullRequest.createdAt` が ISO 8601 タイムスタンプ
**AND** result file に `## Status: success` と URL / number が含まれる

---

### TC-014: PrCreateStep.run — 失敗時に pullRequest を変更しない

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "PR creation failure does not modify pullRequest"

**GIVEN** `state.pullRequest` が undefined の状態で runner が `{ status: "error", reason: "gh-failure" }` を返す
**WHEN** `PrCreateStep.run(state, deps)` が完了する
**THEN** `state.pullRequest` は依然として undefined
**AND** result file に `## Status: failed` と診断メッセージが含まれる

---

### TC-015: PrCreateStep.run — 既存 OPEN PR 検出時に pullRequest を記録して success を返す

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md + specs/job-state-store/spec.md

**GIVEN** runner が `{ status: "existing-open", url: "<u>", number: 12 }` を返す
**WHEN** `PrCreateStep.run(state, deps)` が完了する
**THEN** `state.pullRequest` が設定される（新規作成と同様）
**AND** result file に `## Status: success` が含まれる

---

### TC-016: pr-create-result.md — 成功時のファイル構造

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-runner/spec.md — Scenario "pr-create-result.md is created on success"

**GIVEN** runner が `{ status: "created", url: "<u>", number: 7 }` を返す
**WHEN** `PrCreateStep.run` が完了する
**THEN** `resultFilePath(state)` のファイルに `## Status: success` 行が含まれる
**AND** `## PR` セクションに URL と number が含まれる

---

### TC-017: pr-create-result.md — 失敗時のファイル構造

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-runner/spec.md — Scenario "pr-create-result.md is created on failure"

**GIVEN** runner が `{ status: "error", reason: "gh-failure", message: "auth expired" }` を返す
**WHEN** `PrCreateStep.run` が完了する
**THEN** result file に `## Status: failed` が含まれる
**AND** `## Detail` セクションに `gh-failure` と `auth expired` が含まれる

---

### TC-018: Pipeline transitions — code-review approved が pr-create にルーティングされる

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "code-review approved routes to pr-create"

**GIVEN** 標準 pipeline
**WHEN** `code-review` step が `approved` を返す
**THEN** `Pipeline.run` が `code-review --approved→ pr-create` 行を選択する
**AND** 次に実行される step は `pr-create`

---

### TC-019: Pipeline transitions — pr-create success が end にルーティングされる

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "pr-create success routes to end"

**GIVEN** 標準 pipeline
**WHEN** `pr-create` step が `success` を返す
**THEN** `Pipeline.run` が `pr-create --success→ end` 行を選択する
**AND** run が `end` で終了する

---

### TC-020: Pipeline transitions — pr-create error が escalate にルーティングされる

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "pr-create error routes to escalate"

**GIVEN** 標準 pipeline
**WHEN** `pr-create` step が `error` を返す
**THEN** `Pipeline.run` が `pr-create --error→ escalate` 行を選択する
**AND** run が `escalate` で終了する
**AND** `pipeline:fail` イベントが emit される

---

### TC-021: Pipeline transitions — code-review approved が end にルーティングされない（regression guard）

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "code-review approved does NOT route to end"

**WHEN** `STANDARD_TRANSITIONS` を inspect する
**THEN** `step === "code-review"` AND `on === "approved"` AND `to === "end"` の行が存在しない

---

### TC-022: Pipeline transitions — 全 19→22 行のカウント検証

**Category**: unit
**Priority**: must
**Source**: tasks.md T-6.7 "TC-030 の行数アサーション … toBe(22)"

**WHEN** `STANDARD_TRANSITIONS` を inspect する
**THEN** 配列の長さが 22

---

### TC-023: Pipeline loopNames — pr-create が loopNames に含まれない

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "pr-create は loopNames に含まれない"

**GIVEN** `Pipeline` を `loopNames` 引数なしで構築する
**WHEN** `loopNames` を inspect する
**THEN** `["spec-review", "verification", "code-review"]` を含む
**AND** `"pr-create"` を含まない

---

### TC-024: LOOP_ERROR_CODES — pr-create が含まれない

**Category**: unit
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "LOOP_ERROR_CODES に pr-create は存在しない"

**WHEN** `LOOP_ERROR_CODES` を inspect する
**THEN** keys は `"spec-review"`, `"verification"`, `"code-review"` の 3 つのみ
**AND** `"pr-create"` が含まれない

---

### TC-025: Pipeline steps Map — pr-create が登録されている

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "Pipeline steps Map contains pr-create"

**WHEN** `runPipeline()` 内で `Pipeline` が構築される
**THEN** `steps` Map が 9 エントリを持つ
**AND** キー `"pr-create"` に `PrCreateStep` インスタンスが格納されている

---

### TC-026: AgentRegistry — pr-create が登録されない

**Category**: unit
**Priority**: must
**Source**: specs/pr-create-step/spec.md — Scenario "AgentRegistry does not include pr-create"

**WHEN** `AgentRegistry.fromSteps(hardcodedArray)` が `src/cli/init.ts` から呼ばれる
**THEN** registry に `"pr-create"` の agent エントリが存在しない
**AND** `fromSteps` に渡される配列に `PrCreateStep` が含まれない

---

### TC-027: StepName union — "pr-create" が含まれる

**Category**: unit
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "StepName union accepts 'pr-create'"

**WHEN** `StepName` union を inspect する
**THEN** `"pr-create"` が含まれる
**AND** union は 9 リテラルを持つ（propose / spec-review / spec-fixer / implementer / verification / build-fixer / code-review / code-fixer / pr-create）

---

### TC-028: AgentStepName — "pr-create" が除外される

**Category**: unit
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "AgentStepName does not include 'pr-create'"

**WHEN** `AgentStepName` type を inspect する
**THEN** `"pr-create"` は `AgentStepName` に assignable でない
**AND** `"verification"` も `AgentStepName` に assignable でない
**AND** agent-resident の 7 step はすべて assignable

---

### TC-029: request-md parser — 背景と目的の両方が存在する場合

**Category**: unit
**Priority**: should
**Source**: specs/request-md-parser/spec.md — Scenario "背景 と 目的 の両方が存在する"

**GIVEN** `## 背景` と `## 目的` の両見出しを含む request.md
**WHEN** parser が実行される
**THEN** `sections.背景` が非空文字列で見出し配下の本文を保持する
**AND** `sections.目的` が非空文字列で見出し配下の本文を保持する

---

### TC-030: request-md parser — 目的が存在しない場合

**Category**: unit
**Priority**: should
**Source**: specs/request-md-parser/spec.md — Scenario "目的 が存在しない場合"

**GIVEN** `## 背景` は存在するが `## 目的` が存在しない request.md
**WHEN** parser が実行される
**THEN** `sections.背景` が非空文字列
**AND** `sections.目的` が `undefined`
**AND** エラーが発生しない

---

### TC-031: request-md parser — 外部依存を追加しない

**Category**: unit
**Priority**: should
**Source**: specs/request-md-parser/spec.md — Scenario "既存依存を追加しない"

**WHEN** sections 抽出ロジックを実装する
**THEN** `package.json` に新規 dependency が追加されない

---

### TC-032: renderPrTitle — request.md の H1 見出しをそのまま返す

**Category**: unit
**Priority**: should
**Source**: specs/pr-create-runner/spec.md — Scenario "renderPrTitle returns the request.md heading"

**GIVEN** `parsedRequest.title === "pr-create step 追加（self-host pipeline 完成形）"`
**WHEN** `renderPrTitle(parsedRequest)` を呼ぶ
**THEN** 返り値は `"pr-create step 追加（self-host pipeline 完成形）"` そのまま

---

### TC-033: renderPrBody — Summary / Workflow / Test plan / signature を含む

**Category**: unit
**Priority**: should
**Source**: specs/pr-create-runner/spec.md — Scenario "renderPrBody includes Summary, Workflow, Test plan, and signature"

**GIVEN** `## 背景` と `## 目的` を含む `parsedRequest`、および `spec-review` / `verification` / `code-review` の step runs を持つ `jobState`
**WHEN** `renderPrBody({ parsedRequest, jobState })` を呼ぶ
**THEN** 返り値に `## Summary` 見出しと `## 背景` / `## 目的` の本文が含まれる
**AND** `## Workflow` テーブルに `spec-review` / `verification` / `code-review` の行が含まれる
**AND** `## Test plan` セクションに少なくとも 1 つの checkbox が含まれる
**AND** 末尾が `🤖 Generated with SpecRunner` で終わる

---

### TC-034: renderPrBody — 実行されなかった phase を Workflow テーブルから除外する

**Category**: unit
**Priority**: could
**Source**: specs/pr-create-runner/spec.md — Scenario "renderPrBody omits phases that did not run"

**GIVEN** `jobState` で `code-review` の step runs が 0 件
**WHEN** `renderPrBody({ ... })` を呼ぶ
**THEN** `## Workflow` テーブルに `code-review` 行が含まれない

---

### TC-035: JobState.pullRequest — 後方互換性（legacy state ファイル）

**Category**: integration
**Priority**: should
**Source**: specs/job-state-store/spec.md — Scenario "Legacy state files load with pullRequest undefined"

**GIVEN** `pullRequest` field が存在しない旧形式の state ファイル
**WHEN** `JobStateStore.load()` を呼ぶ
**THEN** `state.pullRequest === undefined`
**AND** エラーが発生しない

---

### TC-036: JobStateStore.appendStepRun — pr-create の StepRun を記録できる

**Category**: integration
**Priority**: could
**Source**: specs/job-state-store/spec.md — Scenario "appendStepRun records pr-create attempts"

**GIVEN** `state.steps["pr-create"]` が空の JobState
**WHEN** `JobStateStore.appendStepRun(state, "pr-create", { attempt: 1, ... })` を呼ぶ
**THEN** `state.steps["pr-create"]` が 1 エントリの配列になる
**AND** ディスク上のファイルがアトミックに更新される

---

### TC-037: pipeline loopNames — pr-create step 実行時に iteration ログが出力されない

**Category**: unit
**Priority**: could
**Source**: specs/pipeline-orchestrator/spec.md — Scenario "pr-create 入場時に iteration 進捗は出力されない"

**GIVEN** loopNames 既定値で構築された pipeline
**WHEN** `pr-create` step が実行される
**THEN** stdout に `[iter <N>] pr-create starting` という行が出力されない

---

### TC-038: CLI snapshot — pipeline transition 図が正しい状態で PASS する

**Category**: manual
**Priority**: must
**Source**: request.md 受け入れ基準「CLI snapshot test が --update-snapshot なしで PASS する」

**GIVEN** pr-create step を含む pipeline が wired された状態
**WHEN** CLI snapshot test を `--update-snapshot` なしで実行する
**THEN** snapshot が PASS する（pipeline 図が期待値と一致）

---

### TC-039: Integration — code-review approved → pr-create → end の state machine 遷移

**Category**: integration
**Priority**: must
**Source**: request.md 受け入れ基準「specrunner run で code-review approved → pr-create → end の遷移が動く」

**GIVEN** code-review が approved を返す pipeline state
**WHEN** `Pipeline.run` が続きを実行する（runner はスタブ化）
**THEN** pr-create step が呼ばれる
**AND** runner が success を返した後、pipeline が `end` に遷移する

---

### TC-040: manual — 実機 gh CLI による PR 作成 E2E

**Category**: manual
**Priority**: could
**Source**: design.md Non-Goals「E2E 実機検証は本 request スコープ外」

**GIVEN** gh CLI がインストール・認証済み、branch が origin に push 済み
**WHEN** `specrunner run` を実行して code-review が approved に至る
**THEN** GitHub 上に PR が作成される
**AND** PR title が request.md の H1 から導出されている
**AND** PR body に `## Summary` / `## Workflow` / `## Test plan` / signature が含まれる
**AND** `state.pullRequest` に url / number / createdAt が記録されている

---

### TC-041: manual — 既存 OPEN PR がある状態で再 run したとき新規作成しない

**Category**: manual
**Priority**: could
**Source**: request.md 受け入れ基準「既存 OPEN PR を検出した場合、新規作成せず success を返す」

**GIVEN** 同 branch に OPEN PR が既に存在する状態で pipeline を再 run する
**WHEN** pr-create step が実行される
**THEN** 新しい PR が作成されない
**AND** 既存 PR の URL が state に記録される
**AND** pipeline が `end` に至る
