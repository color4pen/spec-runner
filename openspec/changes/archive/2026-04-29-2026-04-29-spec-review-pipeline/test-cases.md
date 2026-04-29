# Test Cases: 2026-04-29-spec-review-pipeline

## Summary

- **Total**: 55 cases
- **Automated** (unit/integration/e2e): 50
- **Manual**: 5
- **Priority**: must: 36, should: 17, could: 2

## Test Cases

### TC-001: parseSpecReviewVerdict — approved を正常パース

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 4.6

**GIVEN** `"- **verdict**: approved"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `"approved"` を返す

---

### TC-002: parseSpecReviewVerdict — needs-fix を正常パース

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 4.6

**GIVEN** `"- **verdict**: needs-fix"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `"needs-fix"` を返す

---

### TC-003: parseSpecReviewVerdict — escalation を正常パース

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 4.6

**GIVEN** `"- **verdict**: escalation"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `"escalation"` を返す

---

### TC-004: parseSpecReviewVerdict — 複数の verdict 行が存在する場合は最初を採用

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（first-write-wins）, tasks.md 4.6

**GIVEN** `"- **verdict**: needs-fix\n- **verdict**: approved"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `"needs-fix"` を返す（最初の行を採用）

---

### TC-005: parseSpecReviewVerdict — 大文字 "Approved" はマッチしない

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（正規表現はリテラルマッチ）, module-analysis.md 4.3

**GIVEN** `"- **verdict**: Approved"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `null` を返す

---

### TC-006: parseSpecReviewVerdict — "APPROVED" はマッチしない

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, module-analysis.md 4.3

**GIVEN** `"- **verdict**: APPROVED"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `null` を返す

---

### TC-007: parseSpecReviewVerdict — コードブロック内の verdict 行はマッチしない

**Category**: unit
**Priority**: must
**Source**: module-analysis.md 4.3（コードブロック内の偽 verdict）

**GIVEN** `` "`- **verdict**: approved`" `` のようにバッククォートで囲まれた行を含む文字列（行頭が `-` ではない）
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `null` を返す

---

### TC-008: parseSpecReviewVerdict — 末尾スペースは許容される

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（regex の `\s*$`）, module-analysis.md 4.3

**GIVEN** `"- **verdict**: approved   "` を含む文字列（末尾スペースあり）
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `"approved"` を返す

---

### TC-009: parseSpecReviewVerdict — 先頭スペースがある行はマッチしない

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（regex の `^` 行頭マッチ）, module-analysis.md 4.3

**GIVEN** `"  - **verdict**: approved"` を含む文字列（行頭にスペースあり）
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `null` を返す

---

### TC-010: parseSpecReviewVerdict — verdict 値が不正な文字列はマッチしない

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（受け入れ値は approved / needs-fix / escalation のみ）

**GIVEN** `"- **verdict**: unknown-value"` を含む文字列
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `null` を返す

---

### TC-011: parseSpecReviewVerdict — 空文字列は null を返す

**Category**: unit
**Priority**: should
**Source**: design.md Decision 4, tasks.md 4.7

**GIVEN** 空文字列 `""`
**WHEN** `parseSpecReviewVerdict(content)` を呼ぶ
**THEN** `null` を返す

---

### TC-012: fetchSpecReviewResult — 正常取得（200）

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 4.5

**GIVEN** `githubFetch` が 200 でファイル内容を返すようモックされている
**WHEN** `fetchSpecReviewResult(deps, slug, branch)` を呼ぶ
**THEN** ファイル内容の文字列を返す（リトライなし）

---

### TC-013: fetchSpecReviewResult — 404 を受け取った場合に 1 秒待機して再試行する

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（404 リトライ仕様）, tasks.md 4.5

**GIVEN** `githubFetch` が最初の 2 回は 404 を返し、3 回目に 200 で内容を返すようモックされている
**WHEN** `fetchSpecReviewResult(deps, slug, branch)` を呼ぶ
**THEN** ファイル内容を返し、`sleepFn` が 1000ms で 2 回呼ばれた記録がある

---

### TC-014: fetchSpecReviewResult — 3 回リトライしても 404 の場合は null を返す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（3 回リトライ上限）, tasks.md 4.5, spec-review-session/spec.md

**GIVEN** `githubFetch` が 4 回すべて 404 を返すようモックされている
**WHEN** `fetchSpecReviewResult(deps, slug, branch)` を呼ぶ
**THEN** `null` を返し、`sleepFn` がちょうど 3 回（計 3000ms）呼ばれた記録がある

---

### TC-015: fetchSpecReviewResult — 401 は SpecRunnerError を投げる（リトライしない）

**Category**: unit
**Priority**: should
**Source**: design.md Risks（401 は `GITHUB_TOKEN_EXPIRED` で既存ハンドリング再利用）

**GIVEN** `githubFetch` が 401 を返すようモックされている
**WHEN** `fetchSpecReviewResult(deps, slug, branch)` を呼ぶ
**THEN** `GITHUB_TOKEN_EXPIRED` コードを持つ `SpecRunnerError` が投げられる

---

### TC-016: pollUntilComplete 再利用 — spec-review に specReview.timeoutMs を渡す

**Category**: unit
**Priority**: must
**Source**: design.md Decision 3, tasks.md 4.4, spec-review-session/spec.md

**GIVEN** `config.specReview.timeoutMs = 600000` が設定されている
**WHEN** `runSpecReviewStep` がポーリングを開始する
**THEN** `pollUntilComplete` が `{ timeoutMs: 600000, sleepFn: deps.sleepFn }` で呼ばれる

---

### TC-017: pollUntilComplete — status === "idle" で完了と判定する

**Category**: unit
**Priority**: must
**Source**: design.md Decision 3（`isProposeComplete` は `status === "idle"` を使用）, tasks.md 4.4, spec-review-session/spec.md

**GIVEN** `sessions.retrieve()` が `status: "idle"` を返すようモックされている
**WHEN** `runSpecReviewStep` がポーリングを実行する
**THEN** ポーリングが終了し、次フェーズ（verdict ファイル取得）に進む

---

### TC-018: SESSION_TERMINATED — terminated 時に state.status = "failed" / error.code = "SESSION_TERMINATED"

**Category**: unit
**Priority**: must
**Source**: design.md Decision 3, tasks.md 4.9, spec-review-session/spec.md

**GIVEN** `sessions.retrieve()` が `status: "terminated"` を返すようモックされている
**WHEN** `runSpecReviewStep` がポーリングを実行する
**THEN** `state.status` が `"failed"`、`state.error.code` が `"SESSION_TERMINATED"` になる

---

### TC-019: SESSION_TIMEOUT — timeout 超過時に state.status = "failed" / error.code = "SESSION_TIMEOUT"

**Category**: unit
**Priority**: must
**Source**: design.md Decision 3, tasks.md 4.9, spec-review-session/spec.md

**GIVEN** `pollUntilComplete` が `sessionTimeoutError` を投げるようモックされている
**WHEN** `runSpecReviewStep` がポーリングを実行する
**THEN** `state.status` が `"failed"`、`state.error.code` が `"SESSION_TIMEOUT"` になる

---

### TC-020: SPEC_REVIEW_RESULT_NOT_FOUND — fetchSpecReviewResult が null を返した場合

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4, tasks.md 4.9, spec-review-session/spec.md

**GIVEN** `fetchSpecReviewResult` が `null` を返すようモックされている
**WHEN** `runSpecReviewStep` が verdict 取得フェーズを実行する
**THEN** `state.status` が `"failed"`、`state.error.code` が `"SPEC_REVIEW_RESULT_NOT_FOUND"` になる

---

### TC-021: verdict 行なし — escalation フェイルセーフ

**Category**: unit
**Priority**: must
**Source**: design.md Decision 4（パース失敗は escalation + stderr warning）, tasks.md 4.7, spec-review-session/spec.md

**GIVEN** `fetchSpecReviewResult` が verdict 行を含まないファイル内容を返すようモックされている
**WHEN** `runSpecReviewStep` が verdict パースを実行する
**THEN** `state.steps["spec-review"].verdict` が `"escalation"` となり、stderr に警告メッセージが出力される（state.status は `"success"` のまま）

---

### TC-022: JobState.steps フィールド欠落時の後方互換

**Category**: unit
**Priority**: must
**Source**: design.md Decision 2（`steps` は optional）, tasks.md 1.2, job-state-store/spec.md

**GIVEN** `steps` フィールドを持たない v1 形式の状態ファイル JSON
**WHEN** `validateJobState` でパースする
**THEN** `STATE_FILE_INVALID` は投げられず、`state.steps` が `{}` で補完される

---

### TC-023: JobState.steps — 必須フィールド欠落時は STATE_FILE_INVALID

**Category**: unit
**Priority**: must
**Source**: job-state-store/spec.md（必須フィールド検証）

**GIVEN** `version` フィールドを持たない不正な状態ファイル JSON
**WHEN** `validateJobState` でパースする
**THEN** `STATE_FILE_INVALID` エラーが投げられる

---

### TC-024: appendStepResult — step 情報を state.steps に正しくマージする

**Category**: unit
**Priority**: must
**Source**: tasks.md 1.3, design.md Decision 2

**GIVEN** `state.steps = {}` の JobState
**WHEN** `appendStepResult(state, "spec-review", { session, verdict: "approved", findingsPath, completedAt })` を呼ぶ
**THEN** `state.steps["spec-review"]` に渡したフィールドが全て記録されている

---

### TC-025: runPipeline — propose 正常 + spec-review approved の全ステップ完了

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md, tasks.md 5.6, tasks.md 8.1

**GIVEN** mock client で propose step が正常完了し、spec-review step が verdict `"approved"` で完了するようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** 戻り値の `state.status` が `"success"`、`state.steps["propose"]` と `state.steps["spec-review"]` が両方記録され、各 session.id が異なる

---

### TC-026: runPipeline — propose 失敗時に spec-review をスキップする

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md, tasks.md 5.3, tasks.md 8.5

**GIVEN** mock client で propose step が `state.status = "failed"` を返すようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** spec-review 用 `sessions.create` が一度も呼ばれず、戻り値の `state.status` が `"failed"`

---

### TC-027: runPipeline — spec-review needs-fix 後に以降の step を呼ばない

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md（verdict 分岐）, tasks.md 5.4, tasks.md 8.2

**GIVEN** mock client で propose が正常完了し、spec-review step が verdict `"needs-fix"` で完了するようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** 戻り値の `state.status` が `"success"`、`state.steps["spec-review"].verdict` が `"needs-fix"`（Phase 1 では次 step がないため実質 no-op の確認）

---

### TC-028: runPipeline — spec-review escalation 後に以降の step を呼ばない

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md, tasks.md 8.3

**GIVEN** mock client で propose が正常完了し、spec-review step が verdict `"escalation"` で完了するようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** 戻り値の `state.status` が `"success"`、`state.steps["spec-review"].verdict` が `"escalation"`

---

### TC-029: runPipeline — SPEC_REVIEW_RESULT_NOT_FOUND シナリオ

**Category**: integration
**Priority**: must
**Source**: tasks.md 8.4, spec-review-session/spec.md

**GIVEN** mock client で propose が正常完了し、`fetchSpecReviewResult` がリトライ後も null を返すようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** 戻り値の `state.status` が `"failed"`、`state.error.code` が `"SPEC_REVIEW_RESULT_NOT_FOUND"`

---

### TC-030: runPipeline — 中断耐性: propose 完了後に writeJobState が呼ばれる

**Category**: integration
**Priority**: must
**Source**: pipeline-orchestrator/spec.md（中断後の状態確認）, tasks.md 5.2, tasks.md 8.6

**GIVEN** mock client で propose step が完了し、spec-review step を開始する前のタイミングをフックできるようにセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** propose 完了直後・spec-review 開始前に `writeJobState` が呼ばれており、状態ファイルに `steps["propose"]` が記録されている

---

### TC-031: runPipeline — step 遷移時に state.step が更新される

**Category**: integration
**Priority**: should
**Source**: job-state-store/spec.md（step 遷移シナリオ）, tasks.md 5.5

**GIVEN** mock client で propose と spec-review が両方正常完了するようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** spec-review step 起動前に `state.step` が `"spec-review"` に更新され、history に `step-transition` entry が append されている

---

### TC-032: runPipeline — propose と spec-review の session.id が異なる

**Category**: integration
**Priority**: should
**Source**: pipeline-orchestrator/spec.md（fresh-per-task dispatcher）

**GIVEN** mock client で propose と spec-review が両方正常完了するようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** `state.steps["propose"].session.id` と `state.steps["spec-review"].session.id` が異なる値である

---

### TC-033: CLI — approved verdict で exit code 0、stdout に verdict 出力

**Category**: integration
**Priority**: must
**Source**: cli-commands/spec.md, tasks.md 6.2

**GIVEN** `runPipeline` が `state.steps["spec-review"].verdict = "approved"` で完了するようモックされている
**WHEN** `specrunner run <request.md>` の CLI ハンドラを実行する
**THEN** stdout に `Spec review verdict: approved` を含み、exit code が 0 で終了する

---

### TC-034: CLI — needs-fix verdict で exit code 0、findings サマリを stdout に出力

**Category**: integration
**Priority**: must
**Source**: cli-commands/spec.md, tasks.md 6.2, 6.3

**GIVEN** `runPipeline` が `state.steps["spec-review"].verdict = "needs-fix"` で完了し、findings サマリを含む spec-review-result.md が取得できるようモックされている
**WHEN** `specrunner run <request.md>` の CLI ハンドラを実行する
**THEN** stdout に `Spec review verdict: needs-fix` と findings サマリ（件数と上位 3 件）を含み、exit code が 0 で終了する

---

### TC-035: CLI — escalation verdict で exit code 0、エスカレーション理由を stdout に出力

**Category**: integration
**Priority**: must
**Source**: cli-commands/spec.md, tasks.md 6.2

**GIVEN** `runPipeline` が `state.steps["spec-review"].verdict = "escalation"` で完了するようモックされている
**WHEN** `specrunner run <request.md>` の CLI ハンドラを実行する
**THEN** stdout に `Spec review verdict: escalation` とエスカレーション理由を含み、exit code が 0 で終了する

---

### TC-036: CLI — SPEC_REVIEW_RESULT_NOT_FOUND で exit code 1、stderr にメッセージ

**Category**: integration
**Priority**: must
**Source**: cli-commands/spec.md, tasks.md 6.4

**GIVEN** `runPipeline` が `state.error.code = "SPEC_REVIEW_RESULT_NOT_FOUND"` で終了するようモックされている
**WHEN** `specrunner run <request.md>` の CLI ハンドラを実行する
**THEN** stderr に `Spec-review result file not found on branch '<branch>'.` を含み、exit code が 1 で終了する

---

### TC-037: CLI — propose 失敗で exit code 1（後方互換）

**Category**: integration
**Priority**: must
**Source**: cli-commands/spec.md, tasks.md 6.5

**GIVEN** propose step が `BRANCH_NOT_REGISTERED` で失敗するようモックされている
**WHEN** `specrunner run <request.md>` の CLI ハンドラを実行する
**THEN** stderr にエラーメッセージを含み、exit code が 1 で終了する（spec-review は実行されない）

---

### TC-038: buildSpecReviewSystemPrompt — 必須キーワードの存在確認

**Category**: unit
**Priority**: should
**Source**: tasks.md 3.4, spec-review-session/spec.md

**GIVEN** `{ slug: "test-slug", repository: "owner/repo", requestType: "feature" }` の input
**WHEN** `buildSpecReviewSystemPrompt(input)` を呼ぶ
**THEN** 戻り値の文字列に `"architect"`、`"spec-reviewer"`、`"verdict"`、`"approved"`、`"needs-fix"`、`"escalation"`、`"Findings"` のキーワードが全て含まれる

---

### TC-039: buildSpecReviewSystemPrompt — XML タグで user-request を囲む

**Category**: unit
**Priority**: should
**Source**: tasks.md 3.3, spec-review-session/spec.md

**GIVEN** `buildInitialMessage` を呼ぶ（または `runSpecReviewStep` 内の初回メッセージ生成）
**WHEN** 初回メッセージ本文を生成する
**THEN** メッセージ本文に `<user-request>` と `</user-request>` の対が含まれる

---

### TC-040: config schema — specReview.pollIntervalMs と specReview.timeoutMs のデフォルト値

**Category**: unit
**Priority**: should
**Source**: tasks.md 7.1, 7.2, 7.3

**GIVEN** config ファイルに `specReview` セクションが存在しない
**WHEN** config を読み込む
**THEN** `config.specReview.pollIntervalMs` が `10000`、`config.specReview.timeoutMs` が `600000` となる

---

### TC-041: runSpecReviewStep — state.steps["spec-review"] に session / verdict / findingsPath / completedAt が記録される

**Category**: unit
**Priority**: should
**Source**: tasks.md 4.8, job-state-store/spec.md

**GIVEN** mock client と mock fetch で spec-review step が verdict `"approved"` で正常完了するようセットアップされている
**WHEN** `runSpecReviewStep(state, deps)` を呼ぶ
**THEN** `state.steps["spec-review"]` に `session.id`、`verdict: "approved"`、`findingsPath`、`completedAt` が全て記録されている

---

### TC-042: spec-review セッション作成パラメータ — custom tool を含まない

**Category**: unit
**Priority**: should
**Source**: spec-review-session/spec.md

**GIVEN** `runSpecReviewStep` が実行される
**WHEN** `sessions.create` の呼び出し引数を検証する
**THEN** `tools` プロパティに custom tool が含まれず、`resources` に GitHub リポジトリが `authorization_token` 付きで含まれる

---

### TC-043: spec-review-result.md パース — findings 件数と上位 3 件の best-effort パース

**Category**: unit
**Priority**: should
**Source**: tasks.md 6.3, design.md Decision 4（best-effort で失敗してもパイプライン全体は失敗しない）

**GIVEN** `spec-review-result.md` の内容が Findings テーブルを含む文字列
**WHEN** findings サマリをパースする
**THEN** 件数と上位 3 件のタイトルが取得され、失敗した場合でも例外が伝播しない

---

### TC-044: spec-review-result.md パース — Findings テーブルが存在しない場合もパイプライン継続

**Category**: unit
**Priority**: should
**Source**: design.md Decision 4（summary は best-effort、失敗してもパイプライン全体は失敗させない）

**GIVEN** `spec-review-result.md` の内容に Findings テーブルが存在しない
**WHEN** findings サマリをパースする
**THEN** 例外が投げられず、stdout への findings サマリ出力が省略またはデフォルト値で補完される

---

### TC-045: CLI — 引数なし実行で exit code 2 と usage メッセージ

**Category**: integration
**Priority**: should
**Source**: cli-commands/spec.md

**GIVEN** `specrunner run` が引数なしで実行される
**WHEN** CLI ハンドラが実行される
**THEN** stderr に `Usage: specrunner run <request.md>` を出力し、exit code 2 で終了する

---

### TC-046: CLI — 存在しない request.md 指定で exit code 1

**Category**: integration
**Priority**: should
**Source**: cli-commands/spec.md

**GIVEN** `specrunner run /nonexistent.md` が実行される
**WHEN** CLI ハンドラが実行される
**THEN** stderr に `Request file not found: /nonexistent.md` を出力し、exit code 1 で終了する

---

### TC-047: CLI — config 欠落で "Run 'specrunner init' first." と exit code 1

**Category**: integration
**Priority**: should
**Source**: cli-commands/spec.md

**GIVEN** config ファイルが存在しないか apiKey / agent.id が欠けている
**WHEN** `specrunner run <request.md>` を実行する
**THEN** stderr に `Run 'specrunner init' first.` を出力し、exit code 1 で終了する

---

### TC-048: runPipeline — history にステップ由来の entries が順序通り記録される

**Category**: integration
**Priority**: should
**Source**: pipeline-orchestrator/spec.md（全 step 正常完了シナリオ）

**GIVEN** mock client で propose と spec-review が両方正常完了するようセットアップされている
**WHEN** `runPipeline(jobState, deps)` を呼ぶ
**THEN** `state.history` に propose 由来の entries が先に、spec-review 由来の entries が後に記録されている

---

### TC-049: runSpecReviewStep — spec-review 完了後に findingsPath が state.steps["spec-review"] に記録される

**Category**: unit
**Priority**: should
**Source**: job-state-store/spec.md（spec-review verdict の記録シナリオ）

**GIVEN** `fetchSpecReviewResult` が verdict を含むファイル内容を返すようモックされている
**WHEN** `runSpecReviewStep(state, deps)` を呼ぶ
**THEN** `state.steps["spec-review"].findingsPath` が `openspec/changes/<slug>/spec-review-result.md` の形式で記録されている

---

### TC-050: SESSION_TIMEOUT — stderr に timeout メッセージが出力される

**Category**: unit
**Priority**: should
**Source**: spec-review-session/spec.md（timeout 超過シナリオ）

**GIVEN** `pollUntilComplete` が `sessionTimeoutError` を投げるようモックされている
**WHEN** `runSpecReviewStep` がポーリングを実行する
**THEN** stderr に `Spec-review session timed out after 10 minutes.` を含むメッセージが出力される

---

### TC-051: bun test 全 PASS の CI 確認

**Category**: manual
**Priority**: must
**Source**: tasks.md 10.1

**GIVEN** 全実装タスクが完了している
**WHEN** `bun test` を実行する
**THEN** 全テストが PASS し、失敗が 0 件である

---

### TC-052: bun run typecheck PASS

**Category**: manual
**Priority**: must
**Source**: tasks.md 10.2

**GIVEN** 全実装タスクが完了している
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript コンパイルエラーが 0 件である

---

### TC-053: bun run lint PASS

**Category**: manual
**Priority**: could
**Source**: tasks.md 10.3

**GIVEN** 全実装タスクが完了している
**WHEN** `bun run lint` を実行する
**THEN** lint エラーが 0 件である

---

### TC-054: 手動スモークテスト — propose → spec-review が直列で動く

**Category**: manual
**Priority**: must
**Source**: tasks.md 10.4

**GIVEN** ローカル環境に有効な config と GitHub token が設定されている
**WHEN** `specrunner run <request.md>` をローカルで実行する
**THEN** propose セッションが完了した後に spec-review セッションが自動起動され、verdict が stdout に表示される

---

### TC-055: openspec validate PASS

**Category**: manual
**Priority**: could
**Source**: tasks.md 10.5

**GIVEN** 全実装タスクが完了している
**WHEN** `openspec validate spec-review-pipeline --strict` を実行する
**THEN** バリデーションエラーが 0 件である
