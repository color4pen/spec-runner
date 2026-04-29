# Test Cases: spec-fixer-iteration-loop

## Summary

- **Total**: 67 cases
- **Automated** (unit/integration/e2e): 64
- **Manual**: 3
- **Priority**: must: 33, should: 27, could: 7

---

## Test Cases

### TC-001: runLoopUntil — iter=1 で approved → 即 exit

**Category**: unit
**Priority**: must
**Source**: pipeline-loop-primitive/spec.md — Scenario "iter=1 で approved"

**GIVEN** `maxIterations=2`、body が iter=1 で `state.steps["spec-review"]` に verdict=`approved` を push して返す、evaluator は配列末尾の verdict を返す
**WHEN** `runLoopUntil` を呼ぶ
**THEN** body が 1 回だけ呼ばれ、state を返して終了する。stdout に `[iter 1/2] spec-review verdict: approved → done` が含まれる

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-002: runLoopUntil — iter=1 で escalation → fixer 起動なしで exit

**Category**: unit
**Priority**: must
**Source**: pipeline-loop-primitive/spec.md — Scenario "iter=1 で escalation"

**GIVEN** `maxIterations=2`、body が iter=1 で evaluator に `escalation` を返させる
**WHEN** `runLoopUntil` を呼ぶ
**THEN** body が 1 回だけ呼ばれ、iter=2 の body は呼ばれない。stdout に `[iter 1/2] spec-review verdict: escalation → halt` が含まれる

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-003: runLoopUntil — needs-fix で iter < maxIterations → iter+1 で body 再実行

**Category**: unit
**Priority**: must
**Source**: pipeline-loop-primitive/spec.md — Scenario "iter=1 needs-fix → iter=2 へ"

**GIVEN** `maxIterations=2`、iter=1 で evaluator が `needs-fix`、iter=2 で evaluator が `approved`
**WHEN** `runLoopUntil` を呼ぶ
**THEN** body が 2 回呼ばれ（iter=1, iter=2）、stdout に `[iter 1/2] spec-review verdict: needs-fix → spawning fixer` が含まれ、最終的に state を返す

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-004: runLoopUntil — maxIterations 到達で onExceeded を呼んで exit

**Category**: unit
**Priority**: must
**Source**: pipeline-loop-primitive/spec.md — Scenario "上限到達"

**GIVEN** `maxIterations=2`、iter=1 も iter=2 も evaluator が `needs-fix`
**WHEN** `runLoopUntil` を呼ぶ
**THEN** `onExceeded(state)` が 1 回呼ばれ、その戻り値 state を返す。stdout に `[iter 2/2] retries exhausted, escalating` が含まれる

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-005: runLoopUntil — writeJobState を呼ばない

**Category**: unit
**Priority**: must
**Source**: pipeline-loop-primitive/spec.md — Scenario "runLoopUntil は writeJobState を呼ばない"

**GIVEN** `writeJobState` をスパイ済み、iter=1 で needs-fix → iter=2 で approved の設定
**WHEN** `runLoopUntil` を呼ぶ
**THEN** loop プリミティブ自体は `writeJobState` を呼ばない（body の呼び出し回数が 2 であっても）

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-006: runLoopUntil — state.history に iter 開始/終了 entry が append される

**Category**: unit
**Priority**: must
**Source**: pipeline-loop-primitive/spec.md — Scenario "history への記録"

**GIVEN** `loopName="spec-review"`、iter=1 で evaluator が `approved`
**WHEN** `runLoopUntil` を呼ぶ
**THEN** state.history の末尾 2 entries が `{ step: "spec-review", status: "started" }` と `{ step: "spec-review", status: "ok" }` である

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-007: runLoopUntil — needs-fix 時の history status は "warning"

**Category**: unit
**Priority**: should
**Source**: pipeline-loop-primitive/spec.md — Requirement "state.history に loop entry を append する"

**GIVEN** iter=1 で needs-fix、iter=2 で approved
**WHEN** `runLoopUntil` を呼ぶ
**THEN** iter=1 終了時の history entry が `{ status: "warning" }`、iter=2 終了時が `{ status: "ok" }` である

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-008: runLoopUntil — escalation 時の history status は "error"

**Category**: unit
**Priority**: should
**Source**: pipeline-loop-primitive/spec.md — Requirement "state.history に loop entry を append する"

**GIVEN** iter=1 で evaluator が `escalation`
**WHEN** `runLoopUntil` を呼ぶ
**THEN** iter=1 終了時の history entry が `{ status: "error" }` である

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-009: runLoopUntil — stdout フォーマット: iter 開始行

**Category**: unit
**Priority**: should
**Source**: pipeline-loop-primitive/spec.md — Scenario "フォーマット文字列の正規定義"

**GIVEN** `loopName="spec-review"`、`maxIterations=3`
**WHEN** iter=1 が開始される
**THEN** stdout に `[iter 1/3] spec-review starting` の文字列が出力される

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-010: runPipeline — iter=1 approved で spec-fixer を起動しない

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario "全 step 正常完了（iter=1 で approved）"

**GIVEN** propose step 成功、iter=1 の spec-review が `approved` を返す、config に `pipeline.maxRetries: 2`
**WHEN** `runPipeline` を呼ぶ
**THEN** state.steps["spec-fixer"] は存在しない。state.steps["spec-review"] は長さ 1 の配列で、末尾要素の verdict が `approved`。state.status が `success`

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-011: runPipeline — iter=1 needs-fix → spec-fixer → iter=2 approved の自動連鎖

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario "iter=1 needs-fix → iter=2 で approved"

**GIVEN** propose step 成功、iter=1 の spec-review が `needs-fix`、spec-fixer が正常完了、iter=2 の spec-review が `approved`
**WHEN** `runPipeline` を呼ぶ
**THEN** state.steps["spec-review"] は長さ 2 の配列、state.steps["spec-fixer"] は長さ 1 の配列、最終 state.status が `success`

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-012: runPipeline — retry 上限到達: escalation verdict + SPEC_REVIEW_RETRIES_EXHAUSTED

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario "上限到達時の state" / job-state-store/spec.md — Scenario "retries exhausted の状態"

**GIVEN** `maxRetries=2`、iter=1 needs-fix、iter=2 needs-fix
**WHEN** `runPipeline` を呼ぶ
**THEN** state.steps["spec-review"] は長さ 2 の配列で末尾要素の verdict が `escalation`（書き換え）、state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED`、state.status が `success`（pipeline は完走）

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-013: runPipeline — iter=1 escalation で spec-fixer を起動しない

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario "escalation verdict（loop 内で escalation 即停止）"

**GIVEN** propose step 成功、iter=1 の spec-review が `escalation`
**WHEN** `runPipeline` を呼ぶ
**THEN** spec-fixer セッション作成が呼ばれない。state.steps["spec-fixer"] は存在しない。最終 verdict が `escalation`

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-014: runPipeline — propose 失敗時に loop を起動しない

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario "1 つ目の step が失敗"

**GIVEN** propose step が `state.status = "failed"` を返す
**WHEN** `runPipeline` を呼ぶ
**THEN** spec-review セッション作成が呼ばれない。state.status が `failed`

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-015: runPipeline — 各 iteration でセッション ID が異なる (fresh-per-task)

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Scenario "セッション ID が iteration ごとに異なる"

**GIVEN** iter=1 needs-fix → iter=2 approved の経路
**WHEN** `runPipeline` を呼ぶ
**THEN** state.steps["spec-review"][0].session.id ≠ state.steps["spec-review"][1].session.id である

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-016: runPipeline — retries exhausted 時の stdout 出力

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md — Requirement "retry 上限到達時に escalation verdict と SPEC_REVIEW_RETRIES_EXHAUSTED を記録する"

**GIVEN** `maxRetries=2`、iter=1 needs-fix、iter=2 needs-fix
**WHEN** `runPipeline` を呼ぶ
**THEN** stdout に `retries exhausted, escalating` の文字列が含まれる

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-017: runPipeline — Pipeline finished サマリ行の出力

**Category**: integration
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Requirement "runPipeline は iteration progress を stdout に逐次出力する"

**GIVEN** iter=1 needs-fix → iter=2 approved の経路
**WHEN** `runPipeline` が完了する
**THEN** stdout の最後の行に `Pipeline finished: spec-review iterations=2, final verdict=approved` が含まれる

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-018: runPipeline — needs-fix → approved のログ出力順

**Category**: integration
**Priority**: should
**Source**: pipeline-orchestrator/spec.md — Scenario "needs-fix → approved のログ出力"

**GIVEN** iter=1 needs-fix → iter=2 approved の経路、`maxRetries=2`
**WHEN** `runPipeline` を呼ぶ
**THEN** stdout に `[iter 1/2] starting spec-review` → `[iter 1] spec-review verdict: needs-fix → spawning fixer` → `[iter 2/2] starting spec-review` → `[iter 2] spec-review verdict: approved → done` → `Pipeline finished: spec-review iterations=2, final verdict=approved` の 5 行が順に含まれる

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-019: JobState.steps 配列化 — 旧形式オブジェクトを読み込み時に長さ 1 の配列に正規化する

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario "旧形式の状態ファイル（オブジェクト）の読み込み"

**GIVEN** 状態ファイルの `steps["spec-review"]` が `{ session, verdict: "approved", findingsPath, completedAt, error }` のオブジェクト形式で書かれている
**WHEN** `readJobState` (io.ts の read 経路) でそのファイルを読み込む
**THEN** 返される state の `steps["spec-review"]` が長さ 1 の配列で、唯一の要素が `{ ...obj, iteration: 1 }` の形式である

**Affected file(s)**: `tests/state/io.test.ts`

---

### TC-020: pushStepResult — 1 件目の push で iteration=1 が自動採番される

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario "1 件目の push"

**GIVEN** `state.steps["spec-review"]` が未登録（undefined）
**WHEN** `pushStepResult(state, "spec-review", { session, verdict: "approved", findingsPath: null, completedAt, error: null })` を呼ぶ
**THEN** `state.steps["spec-review"]` が長さ 1 の配列で、末尾要素の `iteration === 1`

**Affected file(s)**: `tests/state/helpers.test.ts`

---

### TC-021: pushStepResult — 2 件目の push で iteration=2 が自動採番される

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario "2 件目の push"

**GIVEN** `state.steps["spec-review"]` が長さ 1 の配列（iter=1 分）
**WHEN** `pushStepResult(state, "spec-review", partial)` を再度呼ぶ
**THEN** `state.steps["spec-review"]` が長さ 2 の配列で、末尾要素の `iteration === 2`

**Affected file(s)**: `tests/state/helpers.test.ts`

---

### TC-022: getLatestStepResult — 配列の末尾要素を返す

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario "配列の末尾を返す"

**GIVEN** `state.steps["spec-review"]` が長さ 2 の配列で、末尾要素の verdict が `approved`
**WHEN** `getLatestStepResult(state, "spec-review")` を呼ぶ
**THEN** 末尾要素が返り、`result.verdict === "approved"` である

**Affected file(s)**: `tests/state/helpers.test.ts`

---

### TC-023: getLatestStepResult — 未登録 step に対して undefined を返す

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Scenario "未登録 step"

**GIVEN** `state.steps["implementer"]` が存在しない
**WHEN** `getLatestStepResult(state, "implementer")` を呼ぶ
**THEN** `undefined` が返る

**Affected file(s)**: `tests/state/helpers.test.ts`

---

### TC-024: getAgentId — propose ロールの新形式解決

**Category**: unit
**Priority**: must
**Source**: cli-config-store/spec.md — Scenario "propose ロールの新形式"

**GIVEN** `config.agents.propose.id = "agent_01x"` かつ `config.agent.id = "agent_01x"`
**WHEN** `getAgentId(config, "propose")` を呼ぶ
**THEN** `"agent_01x"` が返る

**Affected file(s)**: `tests/config/getAgentId.test.ts`

---

### TC-025: getAgentId — propose ロールの legacy フォールバック

**Category**: unit
**Priority**: must
**Source**: cli-config-store/spec.md — Scenario "propose ロールの legacy フォールバック"

**GIVEN** `config.agents.propose.id` が未設定で `config.agent.id = "agent_01x"`
**WHEN** `getAgentId(config, "propose")` を呼ぶ
**THEN** `"agent_01x"` が返る

**Affected file(s)**: `tests/config/getAgentId.test.ts`

---

### TC-026: getAgentId — specFixer ロールで legacy fallback は CONFIG_INCOMPLETE

**Category**: unit
**Priority**: must
**Source**: cli-config-store/spec.md — Scenario "spec-fixer ロールで legacy fallback は不可"

**GIVEN** `config.agents.specFixer.id` が未設定で `config.agent.id = "agent_01x"`
**WHEN** `getAgentId(config, "specFixer")` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` エラーが throw される

**Affected file(s)**: `tests/config/getAgentId.test.ts`

---

### TC-027: spec-fixer Agent — custom_tools が空配列で register_branch を含まない

**Category**: unit
**Priority**: must
**Source**: agent-environment-bootstrap/spec.md — Scenario "spec-fixer Agent の custom_tools"

**GIVEN** `createOrReuseSpecFixerAgent` が Anthropic API の `agents.create` をモック
**WHEN** spec-fixer Agent 作成リクエストを構築する
**THEN** `custom_tools` の値が `[]` であり、`register_branch` の文字列を含まない

**Affected file(s)**: `tests/init/agent.test.ts`

---

### TC-028: spec-fixer Agent — system_prompt が buildSpecFixerSystemPrompt 由来のキーワードを含む

**Category**: unit
**Priority**: must
**Source**: spec-fixer-session/spec.md — Scenario "system prompt 内容"

**GIVEN** `buildSpecFixerSystemPrompt({ slug: "test-slug", branch: "feat/test", findingsPath: "..." })` を呼ぶ
**WHEN** 戻り値の文字列を検査する
**THEN** 文字列に `spec-fixer`、`修正`、`findings`、`commit`、`push` が含まれ、かつレビュー禁止または方針変更禁止の旨を述べる文字列が含まれる

**Affected file(s)**: `tests/prompts/spec-fixer-system.test.ts`

---

### TC-029: runSpecFixerStep — 正常完了で verdict=null, findingsPath=null が記録される

**Category**: unit
**Priority**: must
**Source**: spec-fixer-session/spec.md — Scenario "完了時の状態"

**GIVEN** spec-fixer セッションが `status: "idle"` で完了する、直前の spec-review StepResult が findingsPath を持つ
**WHEN** `runSpecFixerStep(state, deps)` を呼ぶ
**THEN** `state.steps["spec-fixer"]` の末尾要素が `{ verdict: null, findingsPath: null, completedAt: <ISO8601>, error: null }` の形式である

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-030: runSpecFixerStep — セッション作成パラメータに Custom Tool が含まれない

**Category**: unit
**Priority**: must
**Source**: spec-fixer-session/spec.md — Scenario "セッション作成パラメータ"

**GIVEN** `sessions.create` をスパイ、config に `agents.specFixer.id` が設定済み
**WHEN** `runSpecFixerStep(state, deps)` を呼ぶ
**THEN** `sessions.create` の呼び出しパラメータに `tools` プロパティが存在しない（または空）。`resources` に `github_repository` が含まれる

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-031: runSpecFixerStep — findingsPath が null の場合に SPEC_FIXER_NO_FINDINGS で失敗

**Category**: unit
**Priority**: must
**Source**: spec-fixer-session/spec.md — Scenario "findings 不在"

**GIVEN** `state.steps["spec-review"]` が空配列、または末尾要素の findingsPath が null
**WHEN** `runSpecFixerStep(state, deps)` を呼ぶ
**THEN** state.status が `failed`、error.code が `SPEC_FIXER_NO_FINDINGS` になる

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-032: runSpecFixerStep — 初回メッセージに findings ファイルパス・ブランチ・commit/push 指示が含まれる

**Category**: unit
**Priority**: should
**Source**: spec-fixer-session/spec.md — Scenario "初回メッセージ送信"

**GIVEN** 直前の spec-review StepResult の findingsPath が `openspec/changes/test-slug/spec-review-result-001.md`、state.branch が `feat/test`
**WHEN** `runSpecFixerStep` が `events.send` を呼ぶ
**THEN** 送信メッセージに `<user-request>` と `</user-request>` の対、`spec-review-result-001.md`、ブランチ名、`commit` および `push` の文字列が含まれる

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-033: runSpecFixerStep — SESSION_TERMINATED で state.status=failed, error.code=SESSION_TERMINATED

**Category**: unit
**Priority**: should
**Source**: spec-fixer-session/spec.md — Scenario "異常完了の検知"

**GIVEN** ポーリング中に `sessions.retrieve()` が `status: "terminated"` を返す
**WHEN** `runSpecFixerStep` を呼ぶ
**THEN** state.status が `failed`、state.steps["spec-fixer"] 末尾要素の error.code が `SESSION_TERMINATED` になる

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-034: runSpecFixerStep — SESSION_TIMEOUT で state.status=failed, error.code=SESSION_TIMEOUT

**Category**: unit
**Priority**: should
**Source**: spec-fixer-session/spec.md — Scenario "timeout 超過"

**GIVEN** spec-fixer ポーリング開始から timeout を超えてもセッションが完了しない（`timeoutMs=1` でモック）
**WHEN** `runSpecFixerStep` を呼ぶ
**THEN** state.status が `failed`、state.steps["spec-fixer"] 末尾要素の error.code が `SESSION_TIMEOUT`、stderr に timeout メッセージが出力される

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-035: runSpecFixerStep — specFixer ロールで getAgentId を呼び、legacy fallback 不可を検証

**Category**: unit
**Priority**: must
**Source**: spec-fixer-session/spec.md — Requirement "runSpecFixerStep は src/core/steps/spec-fixer.ts に配置される" / cli-config-store/spec.md

**GIVEN** `config.agents.specFixer.id` が未設定、`config.agent.id` のみ存在
**WHEN** `runSpecFixerStep(state, deps)` を呼ぶ
**THEN** `CONFIG_INCOMPLETE` エラーが返る（spec-fixer ロールは legacy fallback 不可）

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-036: config schema — maxRetries 未設定時に既定値 2 が使われる

**Category**: unit
**Priority**: must
**Source**: cli-config-store/spec.md — Scenario "既定値の採用"

**GIVEN** `config.pipeline` が未設定
**WHEN** config を読み込み、`pipeline.maxRetries` を参照する
**THEN** 値が `2` になる（既定値）

**Affected file(s)**: `tests/config/schema.test.ts`

---

### TC-037: config schema — maxRetries=0 で CONFIG_INVALID エラー

**Category**: unit
**Priority**: must
**Source**: cli-config-store/spec.md — Scenario "範囲外の値"

**GIVEN** `config.pipeline.maxRetries = 0`
**WHEN** config 読み込み時に範囲検証を実行する
**THEN** `CONFIG_INVALID` エラーで `pipeline.maxRetries must be between 1 and 10.` が返る

**Affected file(s)**: `tests/config/schema.test.ts`

---

### TC-038: config schema — maxRetries=11 で CONFIG_INVALID エラー

**Category**: unit
**Priority**: should
**Source**: cli-config-store/spec.md — Requirement "pipeline.maxRetries は iteration loop の上限値"

**GIVEN** `config.pipeline.maxRetries = 11`
**WHEN** config 読み込み時に範囲検証を実行する
**THEN** `CONFIG_INVALID` エラーが返る

**Affected file(s)**: `tests/config/schema.test.ts`

---

### TC-039: specrunner init — propose Agent と specFixer Agent の両方が config に記録される

**Category**: integration
**Priority**: must
**Source**: agent-environment-bootstrap/spec.md — Scenario "post-init 検証"

**GIVEN** Anthropic API の `agents.create` をモックして 2 回目に別 ID を返す
**WHEN** `specrunner init` を実行する
**THEN** 書き込まれた config に `agents.propose.id` と `agents.specFixer.id` の両方が存在する。`config.agent.id === config.agents.propose.id` が成立する

**Affected file(s)**: `tests/init/agent.test.ts`

---

### TC-040: specrunner init — 既存 propose Agent の再利用（hash 一致時）

**Category**: unit
**Priority**: should
**Source**: agent-environment-bootstrap/spec.md — Scenario "ハッシュ一致"

**GIVEN** `config.agents.propose.definitionHash` が CLI 側と一致する
**WHEN** `createOrReuseProposeAgent` を呼ぶ
**THEN** `agents.create` が呼ばれず、既存 Agent が再利用される

**Affected file(s)**: `tests/init/agent.test.ts`

---

### TC-041: specrunner init — specFixer Agent が 404 の場合に新規作成される

**Category**: unit
**Priority**: should
**Source**: agent-environment-bootstrap/spec.md — Scenario "既存の spec-fixer Agent が 404"

**GIVEN** `agents.retrieve(config.agents.specFixer.id)` が 404 を返す
**WHEN** `createOrReuseSpecFixerAgent` を呼ぶ
**THEN** `agents.create` が 1 回呼ばれ、新 ID が `config.agents.specFixer.id` に保存される

**Affected file(s)**: `tests/init/agent.test.ts`

---

### TC-042: specrunner init — specFixer Agent のハッシュ不一致時に update が呼ばれる

**Category**: unit
**Priority**: should
**Source**: agent-environment-bootstrap/spec.md — Scenario "ハッシュ不一致"

**GIVEN** spec-fixer ロールの CLI 側 definition ハッシュと `config.agents.specFixer.definitionHash` が異なる
**WHEN** `createOrReuseSpecFixerAgent` を呼ぶ
**THEN** `agents.update(id, { system_prompt, custom_tools })` が 1 回呼ばれ、新ハッシュが config に保存される

**Affected file(s)**: `tests/init/agent.test.ts`

---

### TC-043: specrunner init — legacy agent.id のみの config で propose Agent を retrieve + specFixer を新規作成

**Category**: unit
**Priority**: should
**Source**: agent-environment-bootstrap/spec.md — Scenario "legacy agent.id のみ存在"

**GIVEN** 旧形式 config で `agent.id = "agent_01x"` のみが設定され、`agents.propose.id` が未設定
**WHEN** `specrunner init` を実行する
**THEN** `agent.id` が propose Agent として retrieve され、結果が `agents.propose.id` にも書き込まれる。specFixer Agent は新規作成される

**Affected file(s)**: `tests/init/agent.test.ts`

---

### TC-044: spec-review step — iter=1 と iter=2 で別の findingsPath (spec-review-result-001.md / 002.md) が記録される

**Category**: unit
**Priority**: must
**Source**: spec-review-session/spec.md — Scenario "iteration ごとに別ファイル"

**GIVEN** iter=1 と iter=2 それぞれで `runSpecReviewStep` を呼ぶ（state を引き継ぐ）
**WHEN** 両方の呼び出しが完了する
**THEN** `state.steps["spec-review"][0].findingsPath` が `openspec/changes/<slug>/spec-review-result-001.md`、`state.steps["spec-review"][1].findingsPath` が `openspec/changes/<slug>/spec-review-result-002.md` である

**Affected file(s)**: `tests/core/steps/spec-review.test.ts`

---

### TC-045: spec-review step — iter=2 の初回メッセージに spec-review-result-002.md が含まれる

**Category**: unit
**Priority**: should
**Source**: spec-review-session/spec.md — Scenario "初回メッセージ送信（iteration ごとのファイル名）"

**GIVEN** `state.steps["spec-review"]` が長さ 1 の配列（iter=1 分が既存）
**WHEN** `runSpecReviewStep(state, deps)` を iter=2 用として呼ぶ
**THEN** `events.send` に渡されるメッセージ本文に `spec-review-result-002.md` の文字列が含まれる

**Affected file(s)**: `tests/core/steps/spec-review.test.ts`

---

### TC-046: spec-review step — pushStepResult 経由で配列に append される

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md — Requirement "StepResult への push は iteration 番号を自動採番する" / spec-review-session delta

**GIVEN** `appendStepResult` が削除済み、`pushStepResult` スパイを設置
**WHEN** `runSpecReviewStep(state, deps)` が完了する
**THEN** `pushStepResult(state, "spec-review", ...)` が 1 回呼ばれ、state.steps["spec-review"] が配列形式で更新される

**Affected file(s)**: `tests/core/steps/spec-review.test.ts`

---

### TC-047: state.steps["spec-review"] — verdict が iteration ごとに独立して保存される

**Category**: unit
**Priority**: should
**Source**: job-state-store/spec.md — Scenario "steps フィールドの記録（新形式・配列）"

**GIVEN** iter=1 が `needs-fix`、iter=2 が `approved` で pushStepResult が 2 回呼ばれた state
**WHEN** `state.steps["spec-review"]` を参照する
**THEN** インデックス 0 の verdict が `needs-fix`、インデックス 1 の verdict が `approved` で、過去 iteration の verdict が上書きされていない

**Affected file(s)**: `tests/state/helpers.test.ts`

---

### TC-048: state.steps 欠落フィールド — STATE_FILE_INVALID を出さずに空オブジェクトで補う

**Category**: unit
**Priority**: should
**Source**: job-state-store/spec.md — Scenario "必須フィールド検証"

**GIVEN** 状態ファイルに `steps` フィールドが存在しない（旧 version:1 の state file）
**WHEN** `readJobState` でそのファイルを読み込む
**THEN** `STATE_FILE_INVALID` エラーが発生せず、`state.steps` が空オブジェクト `{}` で補われる

**Affected file(s)**: `tests/state/io.test.ts`

---

### TC-049: specrunner ps — 旧形式ファイルを in-memory で正規化し、stderr に警告を出力する

**Category**: unit
**Priority**: should
**Source**: job-state-store/spec.md — Scenario "specrunner ps 経由での旧形式読み込み（書き込みなし経路）"

**GIVEN** `steps["spec-review"]` がオブジェクト形式の状態ファイルが存在する
**WHEN** `specrunner ps`（読み込みのみの経路）でそのファイルを読み込む
**THEN** in-memory で配列に正規化される（state.steps["spec-review"] が長さ 1 の配列）。ファイル自体は書き換えられない。stderr に `Warning: state file uses legacy format; run 'specrunner run' to migrate.` が出力される

**Affected file(s)**: `tests/state/io.test.ts`

---

### TC-050: state.step フィールド — loop 内での spec-fixer → spec-review 切り替えで state.step が更新される

**Category**: unit
**Priority**: should
**Source**: job-state-store/spec.md — Scenario "step 遷移（loop 内含む）"

**GIVEN** iter=1 の spec-review が `needs-fix` で完了し、iter=2 の spec-fixer 起動直前
**WHEN** state.step を参照する
**THEN** state.step が `"spec-fixer"` に更新されており、history に `step-transition` entry が append されている

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-051: runManagedAgentSession — session 作成 → events.send → pollUntilComplete → idle 完了

**Category**: unit
**Priority**: should
**Source**: design.md — Session Lifecycle Helper Extraction

**GIVEN** `sessions.create` が session ID を返し、`retrieve` が `idle` を返す
**WHEN** `runManagedAgentSession(deps, input)` を呼ぶ
**THEN** 戻り値が `{ sessionId, status: "idle" }` であり、`events.send` が 1 回呼ばれている

**Affected file(s)**: `tests/core/session-runner.test.ts`

---

### TC-052: runManagedAgentSession — terminated で error.code=SESSION_TERMINATED

**Category**: unit
**Priority**: should
**Source**: design.md — Session Lifecycle Helper Extraction

**GIVEN** `retrieve` が `status: "terminated"` を返す
**WHEN** `runManagedAgentSession(deps, input)` を呼ぶ
**THEN** 戻り値が `{ status: "terminated", error: { code: "SESSION_TERMINATED" } }` である

**Affected file(s)**: `tests/core/session-runner.test.ts`

---

### TC-053: PipelineDeps — loop.ts が pipeline.ts から import していない（循環 import 排除）

**Category**: unit
**Priority**: could
**Source**: pipeline-orchestrator/spec.md — Scenario "循環 import の排除"

**GIVEN** `src/core/loop.ts` のソースコードを検査する
**WHEN** import 文を確認する
**THEN** `from "../pipeline.js"` または `from "./pipeline.js"` の import が存在しない。`PipelineDeps` は `from "../types.js"` 経由で参照される

**Affected file(s)**: `tests/core/loop.test.ts` (import graph assertion)

---

### TC-054: specrunner init — post-init 後に Anthropic API retrieve で spec-fixer Agent が custom_tools=[] で返る

**Category**: manual
**Priority**: must
**Source**: agent-environment-bootstrap/spec.md — Scenario "post-init 検証" (e)

**GIVEN** `specrunner init` が実際の Anthropic API を呼ぶ環境で実行済み
**WHEN** `client.beta.agents.retrieve(config.agents.specFixer.id)` を実行する
**THEN** Anthropic API が返す `custom_tools` が `[]`、`null`、`undefined` のいずれかであり、`register_branch` の文字列を含まない

**Affected file(s)**: manual verification / `tests/e2e/init.e2e.ts`

---

### TC-055: E2E — iter=1 needs-fix → spec-fixer → iter=2 approved の完全フロー

**Category**: e2e
**Priority**: should
**Source**: tasks.md — 9.1

**GIVEN** spec-review が iter=1 で needs-fix を返すフィクスチャ設定
**WHEN** `specrunner run` を実行する
**THEN** spec-fixer が起動し、再 spec-review が approved を返すまでループが回る。最終 state.status が `success`、state.steps["spec-review"] が長さ 2

**Affected file(s)**: `tests/e2e/pipeline.e2e.ts`

---

### TC-056: E2E — retries exhausted → state.error.code=SPEC_REVIEW_RETRIES_EXHAUSTED

**Category**: e2e
**Priority**: should
**Source**: tasks.md — 9.2

**GIVEN** spec-review が iter=1 も iter=2 も needs-fix を返すフィクスチャ設定、maxRetries=2
**WHEN** `specrunner run` を実行する
**THEN** state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED`、state.steps["spec-review"][1].verdict が `escalation`

**Affected file(s)**: `tests/e2e/pipeline.e2e.ts`

---

### TC-057: E2E — iter=1 escalation で spec-fixer が起動しない

**Category**: e2e
**Priority**: could
**Source**: tasks.md — 9.3

**GIVEN** spec-review が iter=1 で escalation を返すフィクスチャ設定
**WHEN** `specrunner run` を実行する
**THEN** spec-fixer セッションが作成されず、最終 verdict が `escalation`

**Affected file(s)**: `tests/e2e/pipeline.e2e.ts`

---

### TC-058: E2E — specrunner init 後に config に agents.propose.id と agents.specFixer.id が記録される

**Category**: manual
**Priority**: should
**Source**: tasks.md — 9.4

**GIVEN** 実際の Anthropic API に接続できる環境
**WHEN** `specrunner init` を実行する
**THEN** `~/.config/specrunner/config.json` に `agents.propose.id` と `agents.specFixer.id` の両方が JSON オブジェクトとして存在する

**Affected file(s)**: manual verification

---

### TC-059: E2E — stdout に iteration 進捗ログが表示される

**Category**: e2e
**Priority**: could
**Source**: tasks.md — 9.6

**GIVEN** iter=1 needs-fix → iter=2 approved の経路
**WHEN** `specrunner run` を実行する
**THEN** stdout に `[iter 1/2]` 形式の進捗ログが含まれる

**Affected file(s)**: `tests/e2e/pipeline.e2e.ts`

---

### TC-060: buildSpecFixerSystemPrompt — Author-Bias Elimination キーワードが含まれる

**Category**: unit
**Priority**: could
**Source**: spec-fixer-session/spec.md — Requirement "spec-fixer の system prompt は「修正のみ」を明記する"

**GIVEN** `buildSpecFixerSystemPrompt({ slug, branch, findingsPath })` を呼ぶ
**WHEN** 戻り値を検査する
**THEN** `Author-Bias Elimination` または `前回の文脈を持ちません` のいずれかが含まれる

**Affected file(s)**: `tests/prompts/spec-fixer-system.test.ts`

---

### TC-061: spec-fixer deferred メモ — session 正常完了として扱われる

**Category**: unit
**Priority**: could
**Source**: spec-fixer-session/spec.md — Scenario "spec-fixer が deferred メモを残した場合"

**GIVEN** spec-fixer セッションが `status: "idle"` で完了した（push は成功、deferred メモが design.md 末尾に追記されているが CLI は直接検知できない）
**WHEN** `runSpecFixerStep` の戻り値を確認する
**THEN** state.status が `failed` にならない。state.steps["spec-fixer"] 末尾要素の error が `null`。deferred finding の扱いは次 iter の spec-review に委ねられる

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-062: spec-fixer push 失敗 — session が idle 完了でも正常扱いとなり次 iter spec-review が検出

**Category**: unit
**Priority**: could
**Source**: spec-fixer-session/spec.md — Scenario "push 未完了で session が idle 終了"

**GIVEN** spec-fixer セッションが `status: "idle"` で完了したが push が実際には失敗していたシナリオをモックで再現
**WHEN** `runSpecFixerStep` の戻り値を確認する
**THEN** CLI は session 完了を正常扱いとし、state.steps["spec-fixer"] 末尾要素が `{ verdict: null, findingsPath: null, error: null }` で記録される

**Affected file(s)**: `tests/core/steps/spec-fixer.test.ts`

---

### TC-063: CLI — SPEC_REVIEW_RETRIES_EXHAUSTED の場合に escalation 扱いの出力をする

**Category**: unit
**Priority**: should
**Source**: design.md — D4 / pipeline-orchestrator/spec.md

**GIVEN** state.error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` で state.steps["spec-review"] 末尾の verdict が `escalation` の finalState
**WHEN** CLI の verdict 出力ロジックを実行する
**THEN** stdout に escalation 相当のメッセージが出力される（spec-review requires human judgment 等）

**Affected file(s)**: `tests/cli-run-verdict.test.ts`

---

### TC-064: runLoopUntil — maxIterations=1 で iter=1 needs-fix → onExceeded を即呼ぶ

**Category**: unit
**Priority**: could
**Source**: pipeline-loop-primitive/spec.md — Requirement "maxIterations 到達時は onExceeded を呼んで exit"

**GIVEN** `maxIterations=1`、iter=1 で evaluator が `needs-fix`
**WHEN** `runLoopUntil` を呼ぶ
**THEN** `onExceeded(state)` が 1 回呼ばれる（iter=2 の body は呼ばれない）。stdout に `[iter 1/1] retries exhausted, escalating` が含まれる

**Affected file(s)**: `tests/core/loop.test.ts`

---

### TC-065: specrunner init — 不変条件 (a)-(f) が post-init で満たされる (manual)

**Category**: manual
**Priority**: should
**Source**: agent-environment-bootstrap/spec.md — Requirement "init 完了で Agent が動作するための前提を満たす"

**GIVEN** 実際の Anthropic API に接続できる環境で `specrunner init` を実行
**WHEN** 完了後に各条件を手動で検証する
**THEN** (a) propose Agent が retrieve 可能、(b) specFixer Agent が retrieve 可能、(c) environment が retrieve 可能、(d) propose Agent に register_branch が含まれる、(e) specFixer Agent の custom_tools が空または register_branch を含まない、(f) config.agent.id === config.agents.propose.id が成立する

**Affected file(s)**: manual verification

---

### TC-066: runPipeline — state.step が loop 内で spec-fixer → spec-review へ更新される

**Category**: integration
**Priority**: should
**Source**: job-state-store/spec.md — Scenario "step 遷移（loop 内含む）"

**GIVEN** iter=1 needs-fix → iter=2 approved の経路
**WHEN** `runPipeline` の中断点（spec-fixer 完了直後）をモックで観測する
**THEN** state.step が `"spec-fixer"` → `"spec-review"` と順に更新されている

**Affected file(s)**: `tests/pipeline-integration.test.ts`

---

### TC-067: config 書き込み — specrunner init が agents.propose と agent（legacy）を同期書き込みする

**Category**: unit
**Priority**: should
**Source**: cli-config-store/spec.md — Scenario "新形式と legacy の同期"

**GIVEN** propose Agent 新規作成時に ID `agent_01x` を得る
**WHEN** config 書き込みが完了する
**THEN** `config.agents.propose.id === config.agent.id === "agent_01x"` が成立する

**Affected file(s)**: `tests/config/io.test.ts`

---
