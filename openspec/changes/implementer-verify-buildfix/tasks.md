## 1. Module Architecture Analysis

- [x] 1.1 module-architect で 3 step 間の helper 共通化候補を分析し、`openspec/changes/implementer-verify-buildfix/module-analysis.md` に出力する
- [x] 1.2 共通 helper 候補の抽出粒度を確定（過抽出を避ける、Step 単位の独立性を保つ）
- [x] 1.3 `src/prompts/git-push-instruction.ts` に `buildGitPushInstruction(branch: string): string` を新設し、spec-fixer / implementer / build-fixer の 3 step から参照（重複排除、reusability）
- [x] 1.4 `src/core/step/types.ts` に `NULL_PARSE_RESULT: ParsedStepResult` const を追加し、agent-less verdict step 4 箇所（propose / spec-fixer / implementer / build-fixer）の `parseResult` で共有（boilerplate 削減）
- [x] 1.5 `src/state/schema.ts` に `AgentStepName = Exclude<StepName, "verification">` を追加（design D8 の型レベル強制）

## 2. Type System: discriminator + verdict / step name 拡張

- [x] 2.1 `src/state/schema.ts` の `StepName` union に `"implementer" | "verification" | "build-fixer"` を追加
- [x] 2.2 `src/state/schema.ts` の `Verdict` union に `"passed" | "failed" | "success" | "error"` を追加
- [x] 2.3 `src/core/step/types.ts` の `Step` interface を `kind: "agent" | "cli"` discriminated union に変更（`AgentStep | CliStep`）
- [x] 2.4 既存 3 Step（`ProposeStep`, `SpecReviewStep`, `SpecFixerStep`）に `kind: "agent"` を追加（mechanical migration）
- [x] 2.5 `Verdict` を扱う既存 switch 文を exhaustive に修正（コンパイルエラーを潰す）

## 3. Verification CLI Runner

- [x] 3.1 `src/core/verification/phases.ts` を新設し、phase 名と script 名のマッピングを config 化（`build` / `typecheck` / `test` / `lint` / `security`、全 phase を `bun run <script>` 形式で統一。`PHASE_SCRIPTS: Record<PhaseName, string>` = `{ build: "build", typecheck: "typecheck", test: "test", lint: "lint", security: "security" }` として保持）
- [x] 3.2 `src/core/verification/runner.ts` を新設し、`runVerification(slug: string): Promise<VerificationResult>` を `node:child_process.spawn` で実装（fail-fast 順次実行、5 phase）
- [x] 3.3 phase script が package.json に存在しない場合は `status: "skipped"` で記録するロジック
- [x] 3.4 `verification-result.md` 書き出しロジック（spec-review-result と類似の `## Verdict` + `## Phase Results` 構造）
- [x] 3.5 `tests/unit/core/verification/runner.test.ts` で 5 phase passed / 1 phase failed / multiple phases failed / script 不在 の各シナリオをカバー
- [x] 3.6 `bun:* / Bun.*` の import が一切ないことを grep で検証する CI test を追加

## 4. Implementer Step

- [x] 4.1 `src/prompts/implementer-system.ts` に `IMPLEMENTER_SYSTEM_PROMPT` を export（実装 + commit + push、レビュー禁止、verdict 判定禁止を明示）
- [x] 4.2 `src/core/step/implementer.ts` に `ImplementerStep` を実装（`kind: "agent"`, role/model/tools/capabilities）
- [x] 4.3 `buildMessage` 実装（change folder / tasks.md / specs/ / branch / `<user-request>` 包囲）
- [x] 4.4 `resultFilePath` は `null`、`parseResult` は `NULL_PARSE_RESULT`（= `{ verdict: null, findingsPath: null, fileContent: null }`）を返す
- [x] 4.5 `tests/unit/step/implementer.test.ts` で Step interface 適合性、buildMessage 内容、prompt キーワードを検証

## 5. Build-Fixer Step

- [x] 5.1 `src/prompts/build-fixer-system.ts` に `BUILD_FIXER_SYSTEM_PROMPT` を export（mechanical 修正のみ、仕様変更禁止、commit + push を明示）
- [x] 5.2 `src/core/step/build-fixer.ts` に `BuildFixerStep` を実装（`kind: "agent"`, role/model/tools/capabilities）
- [x] 5.3 `buildMessage` 実装（直前の verification の findingsPath を `getLatestStepResult` で取得、`<user-request>` 包囲、verification 結果不在時は `BUILD_FIXER_NO_VERIFICATION_RESULT`）
- [x] 5.4 `resultFilePath` は `null`、`parseResult` は `NULL_PARSE_RESULT`（= `{ verdict: null, findingsPath: null, fileContent: null }`）を返す
- [x] 5.5 `tests/unit/step/build-fixer.test.ts` で Step interface 適合性、buildMessage 内容、prompt キーワード、verification 不在時のエラーを検証

## 6. Verification Step (CLI-resident)

- [x] 6.1 `src/core/step/verification.ts` に `VerificationStep` を実装（`kind: "cli"`, `name: "verification"`, `agent` フィールドなし）
- [x] 6.2 `run(state, deps)` 内で `runVerification(state.slug)` を呼び `verification-result.md` を書き出す
- [x] 6.3 `resultFilePath` は `openspec/changes/<slug>/verification-result.md`
- [x] 6.4 `parseResult` は `^## Verdict: (passed|failed)$` を regex 抽出して `{ verdict, findingsPath }` を返す（マッチ不在時は verdict null）
- [x] 6.5 `tests/unit/step/verification.test.ts` で kind discriminator、agent 不在、resultFilePath / parseResult の挙動を検証

## 7. AgentRegistry: agent-less Step skip

- [x] 7.1 `src/core/agents/registry.ts` の `AgentRegistry.fromSteps` を `step.kind === "agent"` filter に変更
- [x] 7.2 `tests/unit/core/agents/registry.test.ts` に「CLI step は集約から除外される」「`registry.get("verification")` は undefined」のシナリオを追加
- [x] 7.3 既存テスト（`fromSteps が全 Step の AgentDefinition を集約する`）を 5 agent step 期待値に更新

## 8. StepExecutor: kind 分岐

- [x] 8.1 `src/core/step/executor.ts` の `execute(step, state)` に `step.kind === "cli"` 分岐を追加（session create スキップ、`step.run()` 呼出し）
- [x] 8.2 `kind === "agent"` で `resultFilePath === null` の場合は session 完了 = `verdict: "success"` を導出
- [x] 8.3 step 名 hardcode 分岐がないことを grep で検証する CI test を追加（`executor.ts` および `executor-helpers.ts` の両方が対象。`"spec-review"` / `"verification"` 等の step 名リテラルが出現しないことを assert）
- [x] 8.4 `tests/unit/core/step/executor.test.ts` に CLI step lifecycle のシナリオを追加
- [x] 8.5 `runPollingStyleStep` 内の `state.steps?.["spec-review"]?.length` hardcode 参照を `state.steps?.[step.name]?.length` に汎用化（既存 spec-review 挙動は不変）

## 9. Pipeline: transition table 拡張 + loop guard 汎用化

- [x] 9.1 `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS` を拡張（`spec-review --approved→ implementer`、`implementer/verification/build-fixer` の 7 行を追加）
- [x] 9.2 `Pipeline.runInternal` の loop guard を汎用化（loop name を transition table から導出、`spec-review` hardcode 削除）
- [x] 9.3 `verification ↔ build-fixer` cycle の `VERIFICATION_RETRIES_EXHAUSTED` error code を追加
- [x] 9.4 `tests/unit/core/pipeline/pipeline.transitions.test.ts` に新 transition と loop guard のシナリオを追加（`SPEC_REVIEW_RETRIES_EXHAUSTED` と `VERIFICATION_RETRIES_EXHAUSTED` の両方）
- [x] 9.5 `Pipeline.handleExhausted` の loop name → error code mapping を `LOOP_ERROR_CODES: Record<string, { code, message, hint }>` lookup に汎用化（hardcode 排除、後続 cycle 追加が容易になる。pipeline-orchestrator spec の Requirement 参照）

## 10. CLI 配線

- [x] 10.1 `src/cli/init.ts:52` の `AgentRegistry.fromSteps([...])` 引数に `ImplementerStep`, `BuildFixerStep` を追加（VerificationStep は除外）
- [x] 10.2 `src/cli/run.ts` の `Pipeline` constructor に渡す `steps` Map に `implementer`, `verification`, `build-fixer` を追加
- [x] 10.3 `tests/unit/cli/init.test.ts` の AgentRegistry 期待値を 5 Agent に更新

## 11. Integration Test

- [x] 11.1 mock SessionClient + mock verification runner を使い、spec-review approved → implementer → verification (passed) → end の遷移を検証
- [x] 11.2 mock で verification → failed → build-fixer → verification → passed → end の遷移を検証
- [x] 11.3 mock で verification → failed × 3 で `VERIFICATION_RETRIES_EXHAUSTED` で escalate される loop guard を検証
- [x] 11.4 既存テスト全 PASS を確認（regression 0 件）

## 12. ADR 作成

- [ ] 12.1 ADR `openspec-workflow/adr/ADR-<date>-verification-cli-resident-step.md` を作成（D1: kind discriminator の選択根拠、null agent / executor 分岐の reject 理由）
- [ ] 12.2 ADR `openspec-workflow/adr/ADR-<date>-implementer-build-fixer-separation.md` を作成（D5: implementer / build-fixer を独立 Agent として分離する根拠、PR #22 の anti-pattern 構造的回避）

## 13. 受け入れ基準確認

- [x] 13.1 既存テストが全 PASS する（regression 0 件）
- [ ] 13.2 `specrunner init` が implementer / build-fixer の 2 Agent を Anthropic に作成することを確認
- [ ] 13.3 `verification-result.md` が 5 phase の結果を含む形式で生成されることを確認
- [x] 13.4 module-architect の analysis が `module-analysis.md` に出力され、共通化タスクが tasks.md 冒頭に下りていることを確認
- [ ] 13.5 ADR 2 本が `openspec-workflow/adr/` に出力されていることを確認
- [ ] 13.6 `openspec validate implementer-verify-buildfix --strict` が pass する
