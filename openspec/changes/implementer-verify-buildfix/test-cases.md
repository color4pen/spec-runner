# Test Cases: implementer / verification / build-fixer step 追加

## Summary

- **Total**: 53 cases
- **Automated** (unit/integration/e2e): 49
- **Manual**: 4
- **Priority**: must: 28, should: 21, could: 4

---

## Test Cases

### TC-001: VerificationStep の kind discriminator と agent 不在

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: VerificationStep の kind discriminator, specs/step-execution-architecture/spec.md — Scenario: CliStep has no agent field

**GIVEN** `VerificationStep` を import する
**WHEN** `step` オブジェクトを inspect する
**THEN** `step.kind === "cli"` かつ `step.name === "verification"`
**AND** `step.agent` プロパティが存在しない（TypeScript 型レベルで `agent` フィールドがない）
**AND** `step.run` が `(state, deps) => Promise<void>` の型を持つ

---

### TC-002: StepExecutor が CLI step を kind 分岐で実行する（session create スキップ）

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: StepExecutor が CLI 分岐で実行する, specs/step-execution-architecture/spec.md — Scenario: CliStep lifecycle events fire in order

**GIVEN** `VerificationStep`（`kind: "cli"`）と mock の `JobState` を用意する
**WHEN** `StepExecutor.execute(VerificationStep, state)` を呼ぶ
**THEN** `SessionClient.create` は一切呼ばれない
**AND** `VerificationStep.run(state, deps)` が呼ばれる
**AND** イベントは `step:start` → `verdict:parsed` → `step:complete` の順で発火する
**AND** `step:error` は発火しない

---

### TC-003: StepExecutor の dispatch は `step.kind` のみ（step 名 hardcode 禁止）

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: StepExecutor dispatch is on kind only, tasks.md T-8.3

**GIVEN** `src/core/step/executor.ts` と `src/core/step/executor-helpers.ts` のソースコード
**WHEN** `"spec-review"` / `"verification"` / `"build-fixer"` / `"implementer"` の文字列リテラルを grep する
**THEN** どちらのファイルにも step 名のリテラルが 0 件であること
**AND** dispatch は `step.kind === "agent"` または `step.kind === "cli"` の比較のみ存在すること

---

### TC-004: CLI step の verdict null が escalation に正規化される

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — Scenario: CLI step verdict null is normalized to escalation

**GIVEN** `VerificationStep.parseResult` が `{ verdict: null, findingsPath: <path> }` を返すコンテンツ
**WHEN** `StepExecutor.execute(VerificationStep, state)` が `parseResult` 結果を処理する
**THEN** `JobStateStore.appendStepRun` に渡される `StepRun` の `verdict` は `"escalation"` である（`null` ではない）
**AND** pipeline は `verification --escalation→ escalate` の遷移経路に乗る

---

### TC-005: runVerification — 全 phase passed シナリオ

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: 全 phase passed

**GIVEN** `build` / `typecheck` / `test` / `lint` / `security` の 5 phase すべてが exit code 0 で終了する（spawn mock）
**WHEN** `runVerification(slug)` を呼ぶ
**THEN** 戻り値の `verdict` は `"passed"`
**AND** 各 phase の `status` はすべて `"passed"`

---

### TC-006: runVerification — 1 phase failed の fail-fast（typecheck 失敗例）

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: typecheck failed → 後続 skipped

**GIVEN** `build` phase が exit 0、`typecheck` phase が exit 2 で終了する（spawn mock）
**WHEN** `runVerification(slug)` を呼ぶ
**THEN** 戻り値の `verdict` は `"failed"`
**AND** build の `status` は `"passed"`、typecheck の `status` は `"failed"`
**AND** `test` / `lint` / `security` の `status` はすべて `"skipped"`

---

### TC-007: runVerification — 複数 phase failed（最初の失敗でのみ break）

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md T-3.5 — "multiple phases failed"

**GIVEN** `build` phase が exit 1 で終了する（spawn mock）
**WHEN** `runVerification(slug)` を呼ぶ
**THEN** `typecheck` / `test` / `lint` / `security` の spawn は呼ばれない（fail-fast break）
**AND** 戻り値の verdict は `"failed"`
**AND** 後続 4 phase の status は `"skipped"`

---

### TC-008: runVerification — 全 phase skipped → verdict failed

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: 全 phase skipped

**GIVEN** `package.json` に `build` / `typecheck` / `test` / `lint` / `security` のいずれの script も存在しない
**WHEN** `runVerification(slug)` を呼ぶ
**THEN** 全 phase の status は `"skipped"`
**AND** 戻り値の `verdict` は `"failed"`（passed ではない）
**AND** `verification-result.md` に `errorCode: "VERIFICATION_NO_RUNNABLE_PHASES"` が記録される

---

### TC-009: bun:* / Bun.* import 禁止 — grep テスト

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: bun:* / Bun.* の import 禁止, tasks.md T-3.6

**GIVEN** `src/core/verification/runner.ts` のソースコード
**WHEN** `from "bun:` / `from "bun"` / `Bun.spawn` を grep する
**THEN** いずれも 0 件であること
**AND** `from "node:child_process"` が import されていること

---

### TC-010: NULL_PARSE_RESULT 定数の共有 — 4 step 適合性

**Category**: unit
**Priority**: must
**Source**: specs/step-execution-architecture/spec.md — NULL_PARSE_RESULT 定数, tasks.md T-1.4

**GIVEN** `src/core/step/types.ts` が `NULL_PARSE_RESULT` を export している
**WHEN** `propose` / `spec-fixer` / `implementer` / `build-fixer` の各 `parseResult("any content")` を呼ぶ
**THEN** 4 step すべてが `{ verdict: null, findingsPath: null, fileContent: null }` を返す
**AND** 4 step 全件が同一の `NULL_PARSE_RESULT` 定数と参照等値（または deep-equal）である

---

### TC-011: AgentRegistry.fromSteps — CLI step を除外してカウント 5

**Category**: unit
**Priority**: must
**Source**: specs/agent-registry/spec.md — Scenario: fromSteps は CLI step を skip する, design.md D8

**GIVEN** `[propose, specReview, specFixer, implementer, verification, buildFixer]` の 6 step 配列（verification のみ `kind: "cli"`）
**WHEN** `AgentRegistry.fromSteps(steps)` を呼ぶ
**THEN** `registry.list().length === 5`
**AND** `registry.get("verification")` は `undefined`
**AND** `registry.get("implementer")` は `ImplementerStep.agent` を返す

---

### TC-012: Pipeline transition table に 7 新エッジが含まれる

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: Standard pipeline transitions are expressed as table rows

**GIVEN** `STANDARD_TRANSITIONS` の定義
**WHEN** transition table の内容を検査する
**THEN** 以下の 7 新行がすべて存在すること:
- `spec-review --approved→ implementer`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ end`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`

---

### TC-013: LOOP_ERROR_CODES lookup — spec-review cycle

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: ループエラーコードが lookup から導出される, tasks.md T-9.5

**GIVEN** `LOOP_ERROR_CODES` lookup table が `"spec-review"` エントリを持つ
**WHEN** spec-review ↔ spec-fixer cycle が `maxIterations` に達する
**THEN** `Pipeline` は `LOOP_ERROR_CODES["spec-review"]` を参照して error shape を組み立てる
**AND** `error.code === "SPEC_REVIEW_RETRIES_EXHAUSTED"` である
**AND** Pipeline 本体に `"SPEC_REVIEW_RETRIES_EXHAUSTED"` の文字列リテラルは存在しない

---

### TC-014: LOOP_ERROR_CODES lookup — verification cycle

**Category**: unit
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: verification ↔ build-fixer cycle terminates at maxIterations, tasks.md T-9.5

**GIVEN** `LOOP_ERROR_CODES` lookup table が `"verification"` エントリを持つ
**WHEN** verification ↔ build-fixer cycle が `maxIterations` に達する
**THEN** `Pipeline` は `LOOP_ERROR_CODES["verification"]` を参照する
**AND** `error.code === "VERIFICATION_RETRIES_EXHAUSTED"` である
**AND** `error.message` が `"verification did not pass after <N> iterations"` にマッチする
**AND** `error.hint` が `"Review verification-result-<NNN>.md"` で始まる

---

### TC-015: loop guard 発動 → VERIFICATION_RETRIES_EXHAUSTED で escalation

**Category**: integration
**Priority**: must
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: verification ↔ build-fixer cycle terminates at maxIterations, tasks.md T-11.3

**GIVEN** `maxIterations = 3`
**AND** mock verification step が 3 回連続で `verdict: "failed"` を返す
**WHEN** Pipeline を実行する
**THEN** `Pipeline.run` が `code: "VERIFICATION_RETRIES_EXHAUSTED"` のエラーで終了する
**AND** `state.error` が `{ code, message, hint }` 形式である
**AND** `state.steps["verification"]` の末尾要素の `verdict` が `"escalation"` に書き換えられる

---

### TC-016: BUILD_FIXER_NO_VERIFICATION_RESULT error shape

**Category**: unit
**Priority**: must
**Source**: specs/build-fixer-session/spec.md — Scenario: verification 結果不在

**GIVEN** `state.steps["verification"]` が空、または末尾要素の `findingsPath` が null
**WHEN** `BuildFixerStep.buildMessage(state, deps)` を呼ぶ
**THEN** `state.status` が `"failed"` になる
**AND** `state.error` が `{ code: "BUILD_FIXER_NO_VERIFICATION_RESULT", message: "build-fixer requires verification result but none found", hint: "Ensure verification step produced openspec/changes/<slug>/verification-result.md before invoking build-fixer." }` になる

---

### TC-017: runPollingStyleStep の step.name 汎用化

**Category**: unit
**Priority**: must
**Source**: tasks.md T-8.5, design.md D7

**GIVEN** `src/core/step/executor-helpers.ts` の `runPollingStyleStep` の実装
**WHEN** ソースコードを検査する
**THEN** `state.steps?.["spec-review"]?.length` のように step 名をハードコードした参照が存在しない
**AND** `state.steps?.[step.name]?.length` の形式（または等価なアクセスパターン）を使用している

---

### TC-018: VerificationStep.parseResult — passed 抽出

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: passed の抽出

**GIVEN** content に `## Verdict: passed` の行が含まれる
**WHEN** `VerificationStep.parseResult(content)` を呼ぶ
**THEN** `{ verdict: "passed", findingsPath: <path> }` を返す

---

### TC-019: VerificationStep.parseResult — failed 抽出

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: failed の抽出

**GIVEN** content に `## Verdict: failed` の行が含まれる
**WHEN** `VerificationStep.parseResult(content)` を呼ぶ
**THEN** `{ verdict: "failed", findingsPath: <path> }` を返す

---

### TC-020: VerificationStep.parseResult — verdict 行不在 → null

**Category**: unit
**Priority**: must
**Source**: specs/verification-runner/spec.md — Scenario: verdict 行 不在

**GIVEN** content に `## Verdict:` の行が存在しない（壊れた verification-result.md）
**WHEN** `VerificationStep.parseResult(content)` を呼ぶ
**THEN** `{ verdict: null, findingsPath: <path> }` を返す

---

### TC-021: ImplementerStep の構造検証

**Category**: unit
**Priority**: must
**Source**: specs/implementer-session/spec.md — Scenario: ImplementerStep の構造

**GIVEN** `ImplementerStep` を import する
**WHEN** `step` オブジェクトを inspect する
**THEN** `step.kind === "agent"` かつ `step.name === "implementer"`
**AND** `step.agent.role === "implementer"` かつ `step.agent.model === "claude-sonnet-4-5"`
**AND** `step.agent.capabilities.gitWrite === true`
**AND** `step.agent.system === IMPLEMENTER_SYSTEM_PROMPT`

---

### TC-022: ImplementerStep.resultFilePath と parseResult

**Category**: unit
**Priority**: must
**Source**: specs/implementer-session/spec.md — Scenario: resultFilePath は null, parseResult は NULL_PARSE_RESULT

**GIVEN** `ImplementerStep`
**WHEN** `ImplementerStep.resultFilePath(state)` を呼ぶ
**THEN** `null` を返す

**WHEN** `ImplementerStep.parseResult("any content")` を呼ぶ
**THEN** `{ verdict: null, findingsPath: null, fileContent: null }` を返す

---

### TC-023: BuildFixerStep の構造検証

**Category**: unit
**Priority**: must
**Source**: specs/build-fixer-session/spec.md — Scenario: BuildFixerStep の構造

**GIVEN** `BuildFixerStep` を import する
**WHEN** `step` オブジェクトを inspect する
**THEN** `step.kind === "agent"` かつ `step.name === "build-fixer"`
**AND** `step.agent.role === "build-fixer"` かつ `step.agent.model === "claude-sonnet-4-5"`
**AND** `step.agent.capabilities.gitWrite === true`
**AND** `step.agent.system === BUILD_FIXER_SYSTEM_PROMPT`

---

### TC-024: BuildFixerStep.resultFilePath と parseResult

**Category**: unit
**Priority**: must
**Source**: specs/build-fixer-session/spec.md — Scenario: resultFilePath は null, parseResult は NULL_PARSE_RESULT

**GIVEN** `BuildFixerStep`
**WHEN** `BuildFixerStep.resultFilePath(state)` を呼ぶ
**THEN** `null` を返す

**WHEN** `BuildFixerStep.parseResult("any content")` を呼ぶ
**THEN** `{ verdict: null, findingsPath: null, fileContent: null }` を返す

---

### TC-025: integration — spec-review approved → implementer → verification passed → end

**Category**: integration
**Priority**: must
**Source**: tasks.md T-11.1, specs/pipeline-orchestrator/spec.md — transition table

**GIVEN** mock SessionClient と mock verification runner を用意する
**AND** mock spec-review が `verdict: "approved"` を返す
**AND** mock implementer が session 完了（`verdict: "success"` に導出）
**AND** mock verification が `verdict: "passed"` を返す
**WHEN** Pipeline を `propose` から実行する
**THEN** 実行経路が `propose → spec-review → implementer → verification → end` の順になる
**AND** Pipeline 最終状態が `"end"` である

---

### TC-026: integration — verification failed → build-fixer → verification passed → end

**Category**: integration
**Priority**: must
**Source**: tasks.md T-11.2

**GIVEN** mock で verification が 1 回目 `verdict: "failed"` を返す
**AND** mock build-fixer が session 完了（`verdict: "success"` に導出）
**AND** mock verification が 2 回目 `verdict: "passed"` を返す
**WHEN** Pipeline を `verification` から実行する
**THEN** 実行経路が `verification → build-fixer → verification → end` の順になる
**AND** Pipeline 最終状態が `"end"` である

---

### TC-027: ImplementerStep.buildMessage の内容検証

**Category**: unit
**Priority**: should
**Source**: specs/implementer-session/spec.md — Scenario: buildMessage の内容

**GIVEN** `state.slug = "my-change"` かつ `state.branch = "feat/my-change"`
**WHEN** `ImplementerStep.buildMessage(state, deps)` を呼ぶ
**THEN** 戻り値に `openspec/changes/my-change/`、`tasks.md`、`specs/`、`feat/my-change`、`commit`、`push` が含まれる
**AND** `<user-request>` と `</user-request>` の対が含まれる

---

### TC-028: ImplementerStep.buildMessage — branch 名が含まれ新 branch 作成指示が存在しない

**Category**: unit
**Priority**: should
**Source**: specs/implementer-session/spec.md — Scenario: branch 名が user message に含まれる

**GIVEN** `state.branch = "feat/example"`
**WHEN** `ImplementerStep.buildMessage(state, deps)` を呼ぶ
**THEN** 戻り値に `feat/example` が含まれる
**AND** 「new branch」「新しいブランチ」「branch -b」等の新 branch 作成指示が含まれない

---

### TC-029: BuildFixerStep.buildMessage の内容検証

**Category**: unit
**Priority**: should
**Source**: specs/build-fixer-session/spec.md — Scenario: buildMessage の内容

**GIVEN** `state.slug = "my-change"` かつ `state.branch = "feat/my-change"` かつ verification の findingsPath が `openspec/changes/my-change/verification-result.md`
**WHEN** `BuildFixerStep.buildMessage(state, deps)` を呼ぶ
**THEN** 戻り値に `openspec/changes/my-change/`、`verification-result.md`、`feat/my-change`、`commit`、`push` が含まれる
**AND** 仕様変更や設計判断を行わない旨の禁止条項を含む
**AND** `<user-request>` と `</user-request>` の対が含まれる

---

### TC-030: IMPLEMENTER_SYSTEM_PROMPT のキーワード検証

**Category**: unit
**Priority**: should
**Source**: specs/implementer-session/spec.md — Scenario: system prompt 内容

**GIVEN** `IMPLEMENTER_SYSTEM_PROMPT` の文字列
**WHEN** キーワードを検査する
**THEN** `implementer`、`tasks.md`、`commit`、`push` を含む
**AND** レビューや verdict 判定を行わない旨の文字列を含む

---

### TC-031: BUILD_FIXER_SYSTEM_PROMPT のキーワード検証

**Category**: unit
**Priority**: should
**Source**: specs/build-fixer-session/spec.md — Scenario: system prompt 内容

**GIVEN** `BUILD_FIXER_SYSTEM_PROMPT` の文字列
**WHEN** キーワードを検査する
**THEN** `build-fixer`、`修正`、`commit`、`push` を含む
**AND** 仕様変更や設計判断を行わない旨の文字列を含む

---

### TC-032: agent_toolset_20260401 が ImplementerStep に含まれる

**Category**: unit
**Priority**: should
**Source**: specs/implementer-session/spec.md — Scenario: agent_toolset_20260401 の包含

**WHEN** `ImplementerStep.agent.tools` を inspect する
**THEN** `agent_toolset_20260401` が含まれる

---

### TC-033: agent_toolset_20260401 が BuildFixerStep に含まれる

**Category**: unit
**Priority**: should
**Source**: specs/build-fixer-session/spec.md — BuildFixerStep の構造

**WHEN** `BuildFixerStep.agent.tools` を inspect する
**THEN** `agent_toolset_20260401` が含まれる

---

### TC-034: AgentRegistry — 重複 role で例外が throw される

**Category**: unit
**Priority**: should
**Source**: specs/agent-registry/spec.md — Scenario: 重複 role は構築時例外になる

**GIVEN** 2 つの agent step が同じ `agent.role = "propose"` を持つ
**WHEN** `AgentRegistry.fromSteps([stepA, stepB])` を呼ぶ
**THEN** `"Duplicate agent role: propose"` を含むメッセージで例外が throw される
**AND** registry インスタンスは構築されない

---

### TC-035: AgentRegistry — 未登録 role の get は undefined を返す

**Category**: unit
**Priority**: should
**Source**: specs/agent-registry/spec.md — Scenario: 未登録 role の get は undefined を返す

**GIVEN** registry に `"propose"` のみ登録されている
**WHEN** `registry.get("implementer")` を呼ぶ
**THEN** `undefined` を返す（例外を throw しない）

---

### TC-036: Pipeline — unknown transition で escalation

**Category**: unit
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: Unknown transition triggers escalation

**GIVEN** step が transition table に存在しない verdict を返す
**WHEN** `Pipeline.run` がルーティングを評価する
**THEN** 実行が `escalate` で終了する
**AND** `pipeline:fail` イベントに診断ペイロードが含まれる

---

### TC-037: loop guard — spec-review ↔ spec-fixer が maxIterations で SPEC_REVIEW_RETRIES_EXHAUSTED

**Category**: integration
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: spec-review ↔ spec-fixer cycle terminates at maxIterations, tasks.md T-9.4

**GIVEN** `maxIterations = 3`
**AND** mock spec-review が 3 回連続で `verdict: "needs-fix"` を返す
**WHEN** Pipeline を実行する
**THEN** `error.code === "SPEC_REVIEW_RETRIES_EXHAUSTED"`
**AND** `state.error` が `{ code, message, hint }` 形式である
**AND** `state.steps["spec-review"]` 末尾要素の verdict が `"escalation"` に書き換えられる

---

### TC-038: Verdict union が 7 リテラルを網羅している

**Category**: unit
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: Verdict union accepts new literals

**GIVEN** `src/state/schema.ts` の `Verdict` union 定義
**WHEN** union の値を列挙する
**THEN** `approved` / `needs-fix` / `escalation` / `passed` / `failed` / `success` / `error` の 7 値が含まれる
**AND** exhaustive switch で 7 値を全て handle した場合はコンパイル成功
**AND** いずれか 1 値を省いた場合はコンパイルエラー

---

### TC-039: StepName union が 6 リテラルを網羅している

**Category**: unit
**Priority**: should
**Source**: specs/pipeline-orchestrator/spec.md — Scenario: StepName union accepts new literals

**GIVEN** `src/state/schema.ts` の `StepName` union 定義
**WHEN** union の値を列挙する
**THEN** `propose` / `spec-review` / `spec-fixer` / `implementer` / `verification` / `build-fixer` の 6 値が含まれる

---

### TC-040: AgentStepName = Exclude<StepName, "verification"> 型定義

**Category**: unit
**Priority**: should
**Source**: tasks.md T-1.5, design.md D8

**GIVEN** `src/state/schema.ts` の `AgentStepName` 型定義
**WHEN** `AgentStepName` に `"verification"` を代入しようとする
**THEN** TypeScript コンパイルエラーになる
**AND** `"implementer"` / `"build-fixer"` / `"propose"` / `"spec-review"` / `"spec-fixer"` の代入は成功する

---

### TC-041: verification-result.md の構造検証

**Category**: unit
**Priority**: should
**Source**: specs/verification-runner/spec.md — Scenario: verification-result.md の構造

**GIVEN** `runVerification("my-change")` が完了する（spawn mock）
**WHEN** `openspec/changes/my-change/verification-result.md` の内容を検査する
**THEN** 1 行目が `# Verification Result — my-change — iter ` で始まる
**AND** `## Verdict: passed` または `## Verdict: failed` の行を 1 つ含む
**AND** `## Phase Results` の表ヘッダー `| # | Phase | Status | Duration | Exit Code |` を含む
**AND** 5 phase 分の `## Phase: <phase-name>` セクションが存在する

---

### TC-042: lint script 不在 → skipped で verdict 影響なし

**Category**: unit
**Priority**: should
**Source**: specs/verification-runner/spec.md — Scenario: lint script 不在

**GIVEN** `package.json` に `lint` script が存在しない（他 4 phase は成功）
**WHEN** `runVerification(slug)` を呼ぶ
**THEN** lint phase の status は `"skipped"`
**AND** 他 4 phase が passed なら verdict は `"passed"`（lint skipped は failed 算入されない）

---

### TC-043: git-push-instruction 共通化 — 3 step から参照

**Category**: unit
**Priority**: should
**Source**: tasks.md T-1.3, design.md D11

**GIVEN** `src/prompts/git-push-instruction.ts` が `buildGitPushInstruction(branch: string): string` を export する
**WHEN** spec-fixer / implementer / build-fixer の buildMessage 実装を検査する
**THEN** 3 step すべてが `buildGitPushInstruction` を呼び出している
**AND** git commit / push 指示の文字列が各 step で重複定義されていない

---

### TC-044: implementer session 完了 → verdict: "success" が導出される

**Category**: unit
**Priority**: should
**Source**: specs/implementer-session/spec.md — Scenario: 完了時の verdict は success

**GIVEN** mock SessionClient で implementer session が `status: "idle"` で正常完了する
**WHEN** `StepExecutor.execute(ImplementerStep, state)` が処理する
**THEN** `state.steps["implementer"]` 末尾要素の `verdict === "success"`

---

### TC-045: build-fixer session 完了 → verdict: "success" が導出される

**Category**: unit
**Priority**: should
**Source**: specs/build-fixer-session/spec.md — Scenario: 完了時の verdict は success

**GIVEN** mock SessionClient で build-fixer session が `status: "idle"` で正常完了する
**WHEN** `StepExecutor.execute(BuildFixerStep, state)` が処理する
**THEN** `state.steps["build-fixer"]` 末尾要素の `verdict === "success"`

---

### TC-046: 新 agent step 追加で他モジュールが無編集（extensibility）

**Category**: unit
**Priority**: could
**Source**: specs/agent-registry/spec.md — Scenario: 新しい agent step 追加で他モジュールが無編集

**GIVEN** 既存 5 agent step が動く registry
**WHEN** 6 つ目の agent step を `steps` 配列に push して `AgentRegistry.fromSteps(steps)` で再構築する
**THEN** registry は 6 つの AgentDefinition を保持する
**AND** `AgentRegistry` クラス自体のソースコードは無編集である
**AND** `AgentSyncer.syncAll()` は無編集で 6 role を sync する

---

### TC-047: 新 CLI step 追加で他モジュールが無編集（extensibility）

**Category**: unit
**Priority**: could
**Source**: specs/agent-registry/spec.md — Scenario: 新しい CLI step 追加で他モジュールが無編集

**GIVEN** 既存 5 agent step + 1 CLI step（verification）が動く registry
**WHEN** 2 つ目の CLI step（例: PR 作成 step）を `steps` 配列に push する
**THEN** registry は依然として 5 つの AgentDefinition のみを保持する
**AND** `AgentSyncer.syncAll()` は 5 role のみを sync する

---

### TC-048: specrunner init が 2 Agent を Anthropic に作成する

**Category**: manual
**Priority**: should
**Source**: specs/implementer-session/spec.md — Scenario: specrunner init が Anthropic に Agent を作成する, specs/build-fixer-session/spec.md

**GIVEN** Anthropic API 接続可能な環境で `specrunner init` を実行する
**WHEN** init 処理が完了する
**THEN** Anthropic 側に `name: "specrunner-implementer"` の Agent が作成される
**AND** Anthropic 側に `name: "specrunner-build-fixer"` の Agent が作成される

---

### TC-049: verification-result.md が実機で正しく生成される

**Category**: manual
**Priority**: should
**Source**: tasks.md T-13.3, design.md D4

**GIVEN** 対象リポジトリに `build` / `typecheck` / `test` / `lint` / `security` の script が存在する環境
**WHEN** `VerificationStep.run(state, deps)` を実行する
**THEN** `openspec/changes/<slug>/verification-result.md` が生成される
**AND** 5 phase の Phase Results 表が出力されている

---

### TC-050: 既存テストの regression 0 件確認

**Category**: manual
**Priority**: must
**Source**: tasks.md T-13.1, proposal.md Backward compatibility

**GIVEN** 変更を含むコードベースで既存テストスイートを実行する
**WHEN** `bun test` を実行する
**THEN** 既存テストが全て PASS する
**AND** 新規追加テストも全て PASS する

---

### TC-051: phases.ts の PHASE_SCRIPTS config 確認

**Category**: unit
**Priority**: could
**Source**: tasks.md T-3.1, design.md D2

**GIVEN** `src/core/verification/phases.ts` の `PHASE_SCRIPTS` 定数
**WHEN** 内容を検査する
**THEN** `{ build: "build", typecheck: "typecheck", test: "test", lint: "lint", security: "security" }` の 5 エントリが存在する
**AND** `"bun test"` のようなコマンド文字列（runner 固定）ではなく script 名のみを保持している

---

### TC-052: Step interface の stateless 性

**Category**: unit
**Priority**: could
**Source**: specs/step-execution-architecture/spec.md — Scenario: Step implementation is stateless

**GIVEN** 同一の `Step` インスタンスと同一の入力
**WHEN** `buildMessage` / `run` / `resultFilePath` / `parseResult` を 2 回呼ぶ
**THEN** 1 回目と 2 回目の出力が同一である
**AND** Step インスタンスに副作用（internal mutable state の変化）が存在しない

---

### TC-053: init.ts の AgentRegistry 期待値が 5 Agent に更新される

**Category**: manual
**Priority**: must
**Source**: tasks.md T-10.3, T-10.1

**GIVEN** `src/cli/init.ts` の `AgentRegistry.fromSteps([...])` 引数
**WHEN** ソースコードを検査する
**THEN** `ImplementerStep` と `BuildFixerStep` が引数に含まれる
**AND** `VerificationStep` は引数から除外されている
**AND** `tests/unit/cli/init.test.ts` の期待値が 5 Agent（propose / spec-review / spec-fixer / implementer / build-fixer）に更新されている
