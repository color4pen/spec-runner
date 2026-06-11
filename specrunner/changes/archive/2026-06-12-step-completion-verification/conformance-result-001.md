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
| tasks.md | ✓ | 全チェックボックス [x] 確認済み（T-01〜T-09） |
| design.md | ✓ | D1〜D7 すべての設計判断が実装に反映されている |
| spec.md | ✓ | 全 Requirements（R1〜R5）と全 Scenarios が実装で充足されている |
| request.md | ✓ | 全受け入れ基準を充足、typecheck && test green |

## 詳細

### tasks.md
T-01〜T-09 の全チェックボックスが `[x]` 。実装ファイル（`src/core/port/output-contract.ts`, `src/core/step/output-verify.ts`, `src/core/runtime/local.ts`, `src/core/runtime/managed.ts`, `src/core/step/executor.ts`, `src/core/step/implementer.ts`, `src/adapter/claude-code/agent-runner.ts`, `src/adapter/managed-agent/agent-runner.ts`）と対応テスト群（`tests/unit/step/output-verify.test.ts`, `tests/unit/step/executor-output-gate.test.ts`, `tests/unit/runtime/validate-step-outputs.test.ts`, `tests/unit/adapter/*/agent-runner.test.ts`）が存在する。

### design.md

- **D1（3 層構造）**: 検出＝`RuntimeStrategy.validateStepOutputs`（決定論・no-throw）、修復＝agent-runner follow-up loop（同一 session resume）、停止＝executor gate（`STEP_OUTPUT_MISSING`、commit 前）に正しく分離されている。
- **D2（2 クラス・既定ポリシー）**: `produced`（halt）は `producedContractsFromWrites` で `writes()` から自動導出。`tasks-complete`（follow-up）は `implementer.outputContracts()` が明示宣言。
- **D3（scaffold 一致で実体判定）**: `local.ts` / `managed.ts` の produced 判定で `content === contract.scaffold` を比較し、空 scaffold そのままを violation として捉える。#598 の空テンプレート commit を commit 前に検出できる。
- **D4（純関数モジュール）**: `src/core/step/output-verify.ts` に I/O なしの純関数を集約。
- **D5（no-throw seam）**: `validateStepOutputs` は try/catch で例外を吸収し `OutputCheckResult` を返す。halt/follow-up の判断は executor に委ねる設計。
- **D6（agent-runner follow-up loop）**: claude-code adapter は `extractedSessionId` 確立後に loop、managed adapter は `runPollingStyle` 内 `postWorkPrompts` 後に loop。両方で `detect()` → violation あり → `buildPrompt` → repair turn の同型構造。
- **D7（executor gate）**: `buildAllOutputContracts` で全契約（produced + tasks-complete）を組み、`validateStepOutputs` を `runner.run()` 後・`finalizeStepArtifacts` 前に呼ぶ。`halt.length > 0 || followUp.length > 0` で停止し、全充足時は素通り。

### spec.md

- **R1（決定論検証）**: `validateStepOutputs` は LLM を使用せず fs/git 観測のみ。Scenario「全契約充足で挙動不変」「両 runtime で同一宣言 path」を満たす。
- **R2（produced 欠落 → commit 前 halt）**: executor gate の `halt.length > 0` が `finalizeStepArtifacts` 前に `STEP_OUTPUT_MISSING` を発生させる。`MUST NOT follow-up` の制約は produced を halt-only class として定義することで保証。
- **R3（implementer 未完了 → 同一 session follow-up）**: `buildOutputFollowUpPrompt` が violation の `detail`（未完了タスク名）から動的に prompt を生成。`resume: extractedSessionId` で同一 session に送信。
- **R4（予算枯渇後 halt）**: agent-runner の repair loop 完了後、executor gate が再検証して `followUp.length > 0` でも halt する（authoritative gate）。
- **R5（no-throw seam）**: `validateStepOutputs` は throw しない。`runtimeStrategy` 未注入時は検証スキップ（後方互換）。

### request.md

| 受け入れ基準 | 充足 |
|---|---|
| writes() 欠落で commit 前 halt（#598 対策） | executor gate が `finalizeStepArtifacts` 前に停止 ✓ |
| implementer `[ ]` 残で follow-up（残タスク名列挙） | agent-runner 両 adapter で実装、unit test 確認済み ✓ |
| 予算枯渇後も残る場合 halt | executor gate の authoritative gate が保証 ✓ |
| 全契約充足で既存テスト green | `bun run test`: 4363 passed (343 files) ✓ |
| local / managed 両 runtime で機能（mock テスト） | `validate-step-outputs.test.ts` 86 tests で網羅 ✓ |
| typecheck && test green | typecheck: エラーなし、test: 4363 passed ✓ |

### T-07 監査（verify: false の付与）

- `implementer.ts`: `tasks.md` に `verify: false`（tasks-complete 契約で検証するため produced から除外、doc comment あり）
- `adr-gen.ts`: ADR path に `verify: false`（実行時日付 prefix が宣言 path と一致しないため、doc comment あり）

正常経路で欠落し得る根拠が明示されており、T-07 の受け入れ基準を満たす。

### 観察（non-blocking）

managed adapter の follow-up loop に `session 未確立時 skip` の明示 guard がない（claude-code は `extractedSessionId` を guard 条件に使用）。ただし `runPollingStyle` は常に sessionId 確立後に本ループへ到達するため実害はなく、設計の non-issue。
