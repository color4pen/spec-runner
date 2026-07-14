# Tasks: 追加 AI ターンの構造的削減

## T-01: completion directive helper を claude-code adapter に新設し first-turn prompt へ注入する

- [ ] `src/adapter/claude-code/completion-directive.ts` を新規作成し、pure 関数 `buildReportToolCompletionDirective(mcpToolName: string): string` を export する。本文は provider 固有（MCP tool 名を明示）とし、`report_result`（当該 MCP tool）を turn 終了前に呼ぶことを指示する。core prompt 側の `COMPLETION_DIRECTIVE` は変更しない。
- [ ] `src/adapter/claude-code/agent-runner.ts` の `ClaudeCodeRunner.run()` で、`ctx.policy?.reportTool` が set のとき MCP tool 名を `mcp__${REPORT_MCP_SERVER_NAME}__${reportTool.name}`（既存定数 `REPORT_MCP_SERVER_NAME`（`:372`）と `reportTool.name` から合成、`allowedTools` の MCP エントリ（`:428`）と同一ソース）で組み立て、`buildReportToolCompletionDirective(...)` の戻り値を first-turn の `fullPrompt` 末尾に連結する。
- [ ] reportTool 未設定時は directive を注入しない（MCP report tool が存在しないため）。
- [ ] 既存の report_result 再試行 fallback（`agent-runner.ts:701-722`）と `postWorkPrompts` / output-verification loop は変更しない。
- [ ] directive を `buildAdditionalInstructions`（`src/adapter/shared/prompt-builder.ts`）や core prompt fragment に**入れない**（codex / managed への leak 防止）。

**Acceptance Criteria**:
- `completion-directive.ts` が型エラーなしで compile される。
- reportTool 設定時、first-turn `query()` に渡る prompt に `mcp__specrunner_report__report_result` を呼ぶ directive が含まれる（`_queryFn` 注入で first-turn の `params.prompt` を捕捉して断言するテストを追加）。
- reportTool 未設定時、first-turn prompt に MCP report_result directive が含まれない（テストで固定）。
- report_result 再試行 fallback が削除されていない（`agent-runner.ts` 内の再試行 loop と `DEFAULT_TOOL_RETRY` 参照が残存することをテスト or grep で確認）。
- `src/adapter/shared/prompt-builder.ts` に MCP tool 名が現れない。

---

## T-02: `AgentStep.skipWhen` 述語を定義し executor の評価点に並べる

- [ ] `src/core/port/step-types.ts` の `AgentStep` に optional method を追加する:
  ```typescript
  /**
   * 決定論的に結果が確定していて agent 実行が不要な場合に skip 理由を返す。
   * 実行が必要なら null を返す。pure function（I/O 禁止）。
   * 宣言的 activation（paths / requestTypes）とは別軸の state/deps 依存述語。
   */
  skipWhen?(state: JobState, deps: StepDeps): string | null;
  ```
- [ ] `src/core/step/executor.ts` の `runAgentStep` で、既存の activation gate（`:268-284`）の直後に独立した gate を追加する:
  ```typescript
  if (step.skipWhen) {
    const skipReason = step.skipWhen(state, deps);
    if (skipReason !== null) {
      return { kind: "skipped", skipReason };
    }
  }
  ```
  ※ activation gate とは**マージせず並置**する。skipWhen は buildStepContext / prepareStepArtifacts / guard snapshot より前で短絡する（副作用を発生させない）。
- [ ] `deps`（`PipelineDeps`）を `skipWhen(state, deps)` にそのまま渡す（`PipelineDeps` は `StepContext` = `StepDeps` を拡張しているため互換）。

**Acceptance Criteria**:
- `step-types.ts` / `executor.ts` が型エラーなしで compile される。
- `skipWhen` が skip 理由を返す step は agent runner が呼ばれず、最新 StepRun の verdict が "skipped"・`skipReason` が設定される（executor テストで固定。`tests/unit/step/executor-activation.test.ts` のパターンを流用）。
- `skipWhen` が null を返す / 未定義の step は agent runner が呼ばれる（テストで固定）。
- 既存の `activation`（paths / requestTypes）gate の挙動が不変（`executor-activation.test.ts` が無改変で green）。

---

## T-03: adr-gen に `skipWhen`（adr:false）を実装し skipped 遷移を追加する

- [ ] `src/core/step/adr-gen.ts` の `AdrGenStep` に `skipWhen(_state, deps) => deps.request.adr === false ? "<reason>" : null` を実装する（reason は skipReason として記録される human-readable 文字列）。
- [ ] `buildAdrGenInitialMessage` の adr:false 分岐は防御的に残す（変更しない）。通常経路では skipWhen が短絡するため未到達だが、buildMessage 単体の契約と既存 unit テスト（`tests/unit/core/step/adr-gen.test.ts` の TC-ADR-STEP-01）を保つ。
- [ ] `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` に `{ step: STEP_NAMES.ADR_GEN, on: "skipped", to: STEP_NAMES.PR_CREATE }` を追加する（既存の `ADR_GEN on "success" → PR_CREATE` / `on "error" → escalate` の近傍）。FAST_TRANSITIONS は adr-gen を含まないため変更しない。

**Acceptance Criteria**:
- `request.adr === false` で adr-gen が agent を実行せず verdict "skipped" になる（executor テストで固定）。
- adr-gen "skipped" の遷移先が pr-create であり escalate に落ちない（transition テストで固定。`t.step === "adr-gen" && t.on === "skipped"` の `to` が `"pr-create"`）。
- `request.adr === true` では adr-gen が従来どおり agent を実行する（skipWhen が null を返す）ことをテストで固定。
- `adr-gen.test.ts` の既存 buildMessage テスト（adr:false / adr:true）が無改変で green。

---

## T-04: regression-gate に `skipWhen`（空 ledger）を実装する

- [ ] `src/core/step/regression-gate.ts` の `createRegressionGateStep()` が返す step に `skipWhen(state) => collectFindingsLedger(state, deriveImplReviewerChain(state)).length === 0 ? "<reason>" : null` を実装する。ledger 算出は `buildMessage`（`:122-123`）と同一の `deriveImplReviewerChain(state)` + `collectFindingsLedger(state, ...)` 呼び出しで整合させる（既存 import を再利用）。
- [ ] 遷移は追加しない（`regression-gate on "skipped" → conformance` は `src/core/pipeline/reviewer-chain.ts:460-464` に既存）。

**Acceptance Criteria**:
- findings ledger が空のとき regression-gate が agent を実行せず verdict "skipped" になる（executor テストで固定）。
- ledger が非空のとき regression-gate は agent を実行する（skip されない）ことをテストで固定。
- regression-gate "skipped" の遷移先が conformance であることを確認（既存遷移が機能することを固定）。
- `regression-gate-step.test.ts` の既存 buildMessage テスト（空 / 非空 ledger）が無改変で green（buildMessage は skipWhen とは別 method で不変）。

---

## T-05: 追加ターン計測の種別分離フィールドを型と state plumbing に追加する

- [ ] `src/core/port/agent-runner.ts` の `AgentRunResult` に optional field を追加する:
  ```typescript
  addedTurns?: { reportRetry: number; postWork: number; outputRepair: number };
  ```
- [ ] `src/state/schema/types.ts` の `StepOutcome` に同型の optional `addedTurns` を追加する（コメントで種別と post-work 計上を明記）。
- [ ] `src/state/helpers.ts` の `StepResultInput` に `addedTurns?` を追加し、`pushStepResult` の outcome 組み立てで `...(partial.addedTurns !== undefined ? { addedTurns: partial.addedTurns } : {})` を spread する（既存 `followUpAttempts` と同じパターン）。
- [ ] `src/core/step/commit-orchestrator.ts` の `StepExecutionResult`（kind: "success"）に `addedTurns?` を追加し、`projectSuccess` で `result.addedTurns` を `pushStepResult` に渡す。
- [ ] `src/core/step/executor.ts` の `runAgentStep` success 返却（`:468-479`）に `addedTurns: runResult.addedTurns` を追加する。
- [ ] `followUpAttempts` の意味論・型は変更しない（後方互換維持）。

**Acceptance Criteria**:
- 全ファイルが型エラーなしで compile される。
- managed / codex adapter が `addedTurns` を undefined のまま返しても型・実行が壊れない（optional）。
- sequential 経路（`commitSuccess`→`projectSuccess`）と parallel round 経路（`commitRound`→`projectSuccess`）の両方で `addedTurns` が StepOutcome に流れる。

---

## T-06: local claude-code adapter で addedTurns を種別計測し post-work を計上する

- [ ] `src/adapter/claude-code/agent-runner.ts` の `run()` で 3 種のカウンタ（reportRetry / postWork / outputRepair）を持つ。
  - report_result 再試行 loop（`:701-722`）: 各再試行で reportRetry をインクリメント（既存 `followUpAttempts++` と対応）。
  - postWorkPrompts loop（`:726-777`）: 各 follow turn で postWork をインクリメント（**現状は未計上 → 新規計上**）。
  - output-verification loop（`:779-832`）: 各 repair turn で outputRepair をインクリメント（既存 `followUpAttempts++` と対応）。
- [ ] success 返却の `baseResult`（`:871-879`）に `addedTurns: { reportRetry, postWork, outputRepair }` を含める。`mergeFollowUpResult` は spread で保持するため変更不要。
- [ ] `followUpAttempts` は従来どおり reportRetry + outputRepair の合算のまま維持する（不変条件: `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`）。post-work は `followUpAttempts` に含めない。

**Acceptance Criteria**:
- postWorkPrompts を持つ step で post-work turn が `addedTurns.postWork` に計上されることをテストで固定（`_queryFn` 注入で follow turn を発生させ、返却 or 記録された StepOutcome の `addedTurns.postWork` を断言）。
- report_result 再試行 turn と output-repair turn が `addedTurns.reportRetry` / `addedTurns.outputRepair` に分離計測されることをテストで固定。
- `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts` が成り立つことをテストで固定。

---

## T-07: 影響を受ける既存テストの更新と typecheck / test green 確認

- [ ] `tests/pipeline-integration.test.ts` の adr:false full-run テスト（TC-010, `:256-260` の session 数 8 の断言）を更新する: adr-gen が agent を実行しなくなるため createSession 数を 7 に、adr-gen の最新 verdict を "skipped" に、最終 status を awaiting-archive（pr-create まで到達）に修正する。managed 経路でも skip は発火する点に留意。
- [ ] 他の full-run / e2e テスト（`tests/multi-layer-defense.test.ts` / `tests/reviewer-activation-e2e.test.ts` / `tests/custom-reviewers-e2e.test.ts` / `tests/error-path-integration.test.ts` 等）で adr:false の adr-gen が agent 実行を前提に session 数 / verdict を断言している箇所があれば、skipped 前提へ更新する。空 ledger の regression-gate を「approved で実行」と断言している箇所があれば skipped 前提へ更新する。
- [ ] skip 対象以外の verdict 導出・pipeline 遷移を断言する既存テストは**無改変で green** であることを確認する（変更が必要になった場合は skip 導入の副作用が漏れていないか再検討する）。
- [ ] `bun run typecheck` が 0 エラーで通ることを確認する。
- [ ] `bun run test` が全 pass することを確認する。

**Acceptance Criteria**:
- `bun run typecheck` exit code 0。
- `bun run test` exit code 0（全テスト pass）。
- 期待が変わったテストは adr:false の adr-gen（success→skipped）と空 ledger の regression-gate（approved→skipped）に起因するものだけであり、それ以外の既存テストは無改変で green。
- 受け入れ基準の各項目（completion directive 固定 / adr:false skip / 空 ledger skip / 非空 ledger 実行 / addedTurns の post-work 計上 / report_result 再試行 fallback 維持）がテストで固定されている。
