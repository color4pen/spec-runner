# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ yes | 全チェックボックス [x]。T-01〜T-07 の実装と Acceptance Criteria を確認 |
| design.md | ✅ yes | D1〜D4 の設計判断を実装が遵守している |
| spec.md | ✅ yes | 全 Requirement（SHALL/MUST）が実装で充足され、Scenario がテストで固定されている |
| request.md | ✅ yes | 全受け入れ基準が実装・テストで満たされ、typecheck && test が green |

---

## 詳細

### tasks.md — 全タスク完了確認

全チェックボックス [x] を確認済み。各タスクの実装:

- **T-01**: `src/adapter/claude-code/completion-directive.ts` 新規作成、`agent-runner.ts:347-355` で first-turn `fullPrompt` 末尾への注入を実装
- **T-02**: `step-types.ts:260` に `skipWhen?` 追加、`executor.ts:286-297` で activation gate の直後に独立 gate として配置
- **T-03**: `adr-gen.ts:197-202` に `skipWhen`、`types.ts:267` に `ADR_GEN on "skipped" → PR_CREATE` 遷移追加
- **T-04**: `regression-gate.ts:110-117` に `skipWhen`（空 ledger 判定）実装。既存の `skipped → conformance` 遷移を再利用
- **T-05**: `agent-runner.ts port`・`StepOutcome`・`StepResultInput`・`StepExecutionResult`・executor 返却に `addedTurns?` を追加し plumbing を完成
- **T-06**: `agent-runner.ts:722-858` で 3 カウンタ（reportRetry / postWork / outputRepair）を独立計測し `baseResult.addedTurns` に包含。`followUpAttempts = reportRetry + outputRepair` の不変条件を維持
- **T-07**: `pipeline-integration.test.ts`（TC-010）の session 数 7・adr-gen verdict "skipped" へ更新、`custom-reviewers-e2e.test.ts` も更新。全テスト 6755 pass、typecheck 0 errors

### design.md — 設計判断の遵守

**D1（completion directive を adapter 層に閉じる）**: `completion-directive.ts` は `src/adapter/claude-code/` 配下に閉じ、`buildAdditionalInstructions`（`src/adapter/shared/prompt-builder.ts`）には MCP tool 名が存在しないことを grep で確認。core prompt の provider-neutral 方針を維持している。

**D2（skipWhen を executor 評価点に並べる）**: `step-types.ts:260` と `executor.ts:286-297` の実装が設計仕様のコードスニペットと一致。activation gate と`skipWhen` gate は独立しており、`buildStepContext` より前に短絡して副作用なし。

**D3（adr-gen / regression-gate の skipWhen + adr-gen 遷移追加）**: `adr-gen.ts` の `buildAdrGenInitialMessage` adr:false 分岐は防御的に残存。`regression-gate.ts` の `skipWhen` が `buildMessage`（`:140`）と同一の `deriveImplReviewerChain` + `collectFindingsLedger` 呼び出しで整合している。STANDARD_TRANSITIONS への 1 行追加で adr-gen の forward progress を確保。

**D4（followUpAttempts 互換維持 + addedTurns additive 追加）**: `followUpAttempts` の意味論（report_result 再試行 + output-repair の合算）は不変。`postWork` は `followUpAttempts` に含めない設計が実装で守られている。optional フィールドのため managed / codex adapter は undefined のまま動作可能。

### spec.md — Requirements の充足

全 5 Requirements の MUST/SHALL が実装で満たされている:

1. **first-turn completion directive 注入**: `reportTool` set 時に `mcp__specrunner_report__report_result` を指示する directive が first-turn `fullPrompt` 末尾に連結される
2. **report_result 再試行 fallback 維持**: `agent-runner.ts:725-744` の再試行 loop と `DEFAULT_TOOL_RETRY` 参照が残存
3. **adr:false で adr-gen skip**: `skipWhen` が commitSkipped 経路（skipped verdict + `{step}-skipped` history）に載る
4. **空 ledger で regression-gate skip / 非空 ledger で実行**: `collectFindingsLedger(state, deriveImplReviewerChain(state)).length === 0` で判定
5. **addedTurns 種別分離 + followUpAttempts 互換**: optional フィールドとして additive に追加

各 Scenario がユニットテスト（`executor-skip-when.test.ts`, `regression-gate-skip-when.test.ts`, `agent-runner.test.ts`, `completion-directive.test.ts`）で固定されている。

### request.md — 受け入れ基準の充足

| 受け入れ基準 | 充足 |
|---|---|
| first-turn prompt に completion directive がテストで固定 | `completion-directive.test.ts` + `agent-runner.test.ts` ✅ |
| adr:false で adr-gen が skipped になることをテストで固定 | `executor-skip-when.test.ts` ✅ |
| 空 ledger で regression-gate が skipped になることをテストで固定 | `regression-gate-skip-when.test.ts` ✅ |
| 非空 ledger で regression-gate が実行されることをテストで固定 | `regression-gate-skip-when.test.ts` ✅ |
| addedTurns の post-work 計上をテストで固定 | `agent-runner.test.ts` ✅ |
| report_result 再試行 fallback が維持されることをテストで確認 | `agent-runner.test.ts` + grep 確認 ✅ |
| skip 対象以外の既存テストは無改変で green | 全 6755 テスト pass ✅ |
| `typecheck && test` が green | typecheck: 0 errors / test: 6755 passed ✅ |

### スコープ外の変更なし

managed adapter・codex adapter・core prompts・`buildAdditionalInstructions` への変更なし。post-work detector 化・code-review post-work 変更・model routing はいずれも実施されていない。
