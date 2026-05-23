# Test Cases: executor-pipeline-cleanup

## Meta

- **source**: design.md + tasks.md + request.md
- **type**: refactoring (振る舞い不変の構造リファクタ)
- **generated**: 2026-05-23

---

## TC-STRUCT-001

- **Category**: Module Structure
- **Priority**: must
- **Source**: tasks.md Task 1.1, request.md 受け入れ基準

### GIVEN
`src/core/step/commit-push.ts` が新設されている

### WHEN
ファイルのエクスポート一覧を確認する

### THEN
- `findAuthoritySpecViolations` が export されている
- `commitAndPush` が export されている
- `pushOnly` が export されている
- `CommitPushInfra` interface が export されている
- `AUTHORITY_SPEC_PREFIX` 定数が定義されている（内部定数として）

---

## TC-STRUCT-002

- **Category**: Module Structure
- **Priority**: must
- **Source**: tasks.md Task 1.2, request.md 受け入れ基準

### GIVEN
リファクタ後の `src/core/step/executor.ts`

### WHEN
ファイルの内容を確認する

### THEN
- `findAuthoritySpecViolations` の定義が存在しない
- `commitAndPush` の private method 定義が存在しない
- `pushOnly` の private method 定義が存在しない
- `AUTHORITY_SPEC_PREFIX` 定数の定義が存在しない
- `import { commitAndPush, CommitPushInfra } from "./commit-push.js"` が存在する
- `this.commitPushInfra` フィールドが constructor で初期化されている

---

## TC-STRUCT-003

- **Category**: Module Structure
- **Priority**: must
- **Source**: tasks.md Task 2.1, request.md 受け入れ基準

### GIVEN
リファクタ後の `src/core/pipeline/pipeline.ts`

### WHEN
ファイルの内容を確認する

### THEN
- `printPipelineFinished(state: JobState): void` という private method が存在する
- `Pipeline finished: spec-review iterations=` という文字列リテラルが 1 箇所のみに存在する（helper 内）
- 旧来の 6 行ブロック（3 箇所）が `this.printPipelineFinished(state)` の 1 行呼び出しに置き換わっている

---

## TC-STRUCT-004

- **Category**: Module Structure
- **Priority**: should
- **Source**: design.md Decision 1, tasks.md Task 1.2

### GIVEN
`executor.ts` の import 宣言

### WHEN
不要になった import を確認する

### THEN
- `noCommitDetectedError`, `pushFailedError`, `authoritySpecEditViolationError` が executor.ts から import されていない
  （commit-push.ts に移動済みのため）
- ただし `stderrWrite` が executor.ts 内の他の用途で使われている場合は残る

---

## TC-BEHAV-001

- **Category**: commit/push Behavior (regression)
- **Priority**: must
- **Source**: request.md 振る舞い保持で壊しやすい箇所, design.md 振る舞い保持チェックリスト

### GIVEN
`requiresCommit` が false の AgentStep が完了した状態

### WHEN
`runAgentStep` が `commitAndPush` を呼び出す

### THEN
- commit/push 処理を実行せずに silent exit する
- step history にエラーは記録されない
- stdout への余分な出力が発生しない

---

## TC-BEHAV-002

- **Category**: commit/push Behavior (regression)
- **Priority**: must
- **Source**: request.md 振る舞い保持で壊しやすい箇所, design.md 振る舞い保持チェックリスト

### GIVEN
authority spec（`specrunner/specs/` 配下）を直接編集した diff を含む AgentStep が完了した状態

### WHEN
`commitAndPush` が呼び出される

### THEN
- `findAuthoritySpecViolations` が違反ファイルを検出する
- `AUTHORITY_SPEC_EDIT_VIOLATION` エラーが step history に記録される
- escalation として処理される

---

## TC-BEHAV-003

- **Category**: commit/push Behavior (regression)
- **Priority**: must
- **Source**: request.md 振る舞い保持で壊しやすい箇所, design.md 振る舞い保持チェックリスト

### GIVEN
push が 1 回目に失敗し、2 回目に成功する状況

### WHEN
`pushOnly` が呼び出される

### THEN
- 1 回目の失敗後に `sleepFn` が 5000ms で呼び出される
- 2 回目の push が試行され成功する
- `PUSH_FAILED` エラーは記録されない

---

## TC-BEHAV-004

- **Category**: commit/push Behavior (regression)
- **Priority**: must
- **Source**: request.md 振る舞い保持で壊しやすい箇所

### GIVEN
push が 2 回とも失敗する状況

### WHEN
`pushOnly` が呼び出される

### THEN
- `PUSH_FAILED` エラーが step history に記録される
- `sleepFn(5000)` が 1 回呼び出されている（retry 間の sleep）

---

## TC-BEHAV-005

- **Category**: commit/push Behavior (regression)
- **Priority**: must
- **Source**: design.md Decision 4, tasks.md Task 1.3

### GIVEN
`tests/unit/step/executor.commit.test.ts` の全テスト（TC-CAP-NEW-001〜008, TC-AUTH-01〜06）

### WHEN
`bun run test -- tests/unit/step/executor.commit.test.ts` を実行する

### THEN
- 全 14 テストが green（PASS）
- 1 件も失敗・スキップしない

---

## TC-BEHAV-006

- **Category**: commit/push Behavior (regression)
- **Priority**: must
- **Source**: design.md Decision 2, request.md 振る舞い保持で壊しやすい箇所

### GIVEN
agent の self-commit（agent 自身が commit していた）が検出された状態

### WHEN
`commitAndPush` が該当経路を処理する

### THEN
- `stderrWrite` で警告が出力される
- `pushOnly` 経由で push が行われる
- step history への記録は従来どおり

---

## TC-PIPELINE-001

- **Category**: pipeline stdout (regression)
- **Priority**: must
- **Source**: request.md 受け入れ基準, design.md Decision 3

### GIVEN
spec-review step が pipeline に含まれており、loop が正常完了した（terminal condition）

### WHEN
pipeline が終了する

### THEN
stdout に `Pipeline finished: spec-review iterations=N, final verdict=V\n` が出力される
（N = 実際の iteration 数、V = 最終 verdict）

---

## TC-PIPELINE-002

- **Category**: pipeline stdout (regression)
- **Priority**: must
- **Source**: request.md 振る舞い保持で壊しやすい箇所, tasks.md Task 2.2

### GIVEN
spec-review step が pipeline に含まれており、iteration 上限に達して exhaustion 終了した

### WHEN
pipeline が終了する

### THEN
stdout に `Pipeline finished: spec-review iterations=N, final verdict=V\n` が出力される
（文言は TC-PIPELINE-001 と完全に同一形式）

---

## TC-PIPELINE-003

- **Category**: pipeline stdout (regression)
- **Priority**: must
- **Source**: request.md 振る舞い保持で壊しやすい箇所, tasks.md Task 2.2

### GIVEN
spec-review step が pipeline に含まれており、fixer exhaustion で終了した

### WHEN
pipeline が終了する

### THEN
stdout に `Pipeline finished: spec-review iterations=N, final verdict=V\n` が出力される
（文言は TC-PIPELINE-001、TC-PIPELINE-002 と完全に同一形式）

---

## TC-PIPELINE-004

- **Category**: pipeline stdout (regression)
- **Priority**: should
- **Source**: design.md Decision 3（`if (!this.steps.has(STEP_NAMES.SPEC_REVIEW)) return` ガード）

### GIVEN
spec-review step が pipeline に含まれていない構成

### WHEN
pipeline が終了する

### THEN
`Pipeline finished: spec-review iterations=...` は stdout に出力されない

---

## TC-PIPELINE-005

- **Category**: pipeline stdout (regression)
- **Priority**: must
- **Source**: tasks.md Task 2.3

### GIVEN
`tests/core/pipeline/pipeline.loop-iter-stdout.test.ts`

### WHEN
`bun run test -- tests/core/pipeline/pipeline.loop-iter-stdout.test.ts` を実行する

### THEN
全テストが green（stdout 文言不変の確認）

---

## TC-SPEC-001

- **Category**: Existing Spec Scenarios (regression)
- **Priority**: must
- **Source**: request.md 受け入れ基準

### GIVEN
既存 spec scenario `step-execution-architecture`

### WHEN
specrunner が当該 scenario を実行する

### THEN
green（PASS）のまま維持されている

---

## TC-SPEC-002

- **Category**: Existing Spec Scenarios (regression)
- **Priority**: must
- **Source**: request.md 受け入れ基準

### GIVEN
既存 spec scenario `pipeline-orchestrator`

### WHEN
specrunner が当該 scenario を実行する

### THEN
green（PASS）のまま維持されている

---

## TC-BUILD-001

- **Category**: Build / Type Check
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 1.3, Task 2.3, Task 3

### GIVEN
リファクタ完了後のコードベース

### WHEN
`bun run typecheck` を実行する

### THEN
型エラーが 0 件で終了する

---

## TC-BUILD-002

- **Category**: Build / Type Check
- **Priority**: must
- **Source**: request.md 受け入れ基準, tasks.md Task 3

### GIVEN
リファクタ完了後のコードベース

### WHEN
`bun run typecheck && bun run test` を実行する

### THEN
全テストが green で終了する（exit code 0）

---

## TC-BUILD-003

- **Category**: Build / Type Check
- **Priority**: must
- **Source**: tasks.md Task 1.3

### GIVEN
リファクタ完了後のコードベース

### WHEN
`bun run test -- tests/unit/step/executor.test.ts` を実行する

### THEN
全テストが green

---

## TC-BUILD-004

- **Category**: Build / Type Check
- **Priority**: must
- **Source**: tasks.md Task 2.3

### GIVEN
リファクタ完了後のコードベース

### WHEN
`bun run test -- tests/core/pipeline/pipeline.test.ts` を実行する

### THEN
全テストが green

---

## TC-SCOPE-001

- **Category**: Scope Guard
- **Priority**: should
- **Source**: request.md スコープ外

### GIVEN
リファクタ後の `AgentRunner` port, `Pipeline.run`, `StepExecutor.execute` の公開 API

### WHEN
シグネチャを変更前と比較する

### THEN
公開 API（引数・戻り値・型）に変更がない

---

## TC-SCOPE-002

- **Category**: Scope Guard
- **Priority**: could
- **Source**: request.md スコープ外（行数は努力目標）

### GIVEN
リファクタ後の `executor.ts`

### WHEN
行数を確認する

### THEN
commit/push ロジック（~100 行）が別ファイルに移動したことで、行数が削減されている
（具体的な目標行数はなし、方向性の確認のみ）
