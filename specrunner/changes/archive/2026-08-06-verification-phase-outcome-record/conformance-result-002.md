# Conformance Result — Iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証コンテキスト

- **前回 (iteration 1)**: F-01 escalation — tasks.md が「変更不可」と宣言した `pipeline.transitions.test.ts` TC-014 hint テストを実装が更新した
- **Operator 判断**: テスト更新は正当。tasks.md T-07 注記の計画が誤りであり、実装はそのまま採用する。
- **今回の観点**: Operator 判断を踏まえ、全 AC / Requirement / Design Decision を再評価する。

---

## 検証した項目

### 1. Tasks.md チェックボックス確認

全タスク T-01〜T-08 が `[x]` でマーク済み。

| タスク | 内容 | 実装との照合 |
|--------|------|-------------|
| T-01 | `VerificationPhaseOutcome` / `StepOutcome.verificationPhases` 型定義 | `src/state/schema/types.ts:127-131, 188` に定義確認済み ✅ |
| T-02 | `pushStepResult` の dynamic cast による `verificationPhases` 格納 | `src/state/helpers.ts:148-153` — `@ts-expect-error` 互換を保ちつつ dynamic read で格納 ✅ |
| T-03 | `event-journal.ts` の serialize / fold 対応 | `stepRunToRecord(:457)` / `fold(:380)` に conditional spread 追加済み ✅ |
| T-04 | `CliStepRunOutcome` interface / `CliStep.run` 戻り型 widen | `src/core/port/step-types.ts:336-356` — `Promise<CliStepRunOutcome | void>` に widen ✅ |
| T-05 | `VerificationStep.run` の phase 投影と返却 | `src/core/step/verification.ts:55-86` — phase/status/exitCode のみ投影して return ✅ |
| T-06 | executor の `verificationPhases` 捕捉と `StepExecutionResult` 付加 | `src/core/step/executor.ts:570-629` — `cliRunResult?.verificationPhases` を捕捉し success 結果に conditional 付加 ✅ |
| T-07 | VERIFICATION hint 修正 | `src/core/pipeline/types.ts:176` — `verification-result.md` + `events.jsonl` 案内に変更済み ✅ |
| T-08 | TC-01〜TC-06 新規追加 green、AC4/AC5/AC7 既存テスト green | 各テストファイル確認済み ✅（詳細は §5） |

**注記**: T-07 と T-08 に残る ⚠️ 注記（「テストファイルは変更不可のため1件が失敗する」「AC7 部分的」）は実態と乖離している。`pipeline.transitions.test.ts` TC-014 の hint テストは更新済みで green であり、Operator 判断によりこの更新は正当と確認された（後述 F-01）。

---

### 2. Spec Requirements 適合確認

#### R1: verification は各 iteration の phase 結果を step-attempt outcome に構造化記録する

| Scenario | Evidence | Status |
|----------|----------|--------|
| 失敗 iteration の phase が step-attempt から取得できる | `event-journal.test.ts` TC-001: `stepRunToRecord → fold` round-trip で `outcome.verificationPhases[{phase:"build", status:"failed", exitCode:1}]` が markdown 不使用で取得できることを確認 | ✅ |
| passed iteration でも実行された全 phase の status が記録される | 同 TC-002: build/typecheck/test=passed, security/test-coverage=skipped の全 5 phase が `verificationPhases` に記録 | ✅ |

SHALL「in-memory の `VerificationResult.phases` から得る（markdown 再パース MUST NOT）」: `verification.ts:55-59` が `runVerification` の戻り値 `verificationResult.phases` を直接投影。markdown ファイルを再読しない。✅

#### R2: 複数 iteration の phase 結果は独立に記録され上書きされない

| Scenario | Evidence | Status |
|----------|----------|--------|
| 失敗 → 修正 → 成功で両 iteration の phase が残る | `event-journal.test.ts` TC-003: iter1={build:failed} と iter2={build/typecheck/test:passed} が `fold()` で独立した `StepRun` として再構築され、iter2 が iter1 を上書きしない | ✅ |

append-only journal（delta-append）により、各 iteration は独立した `step-attempt` レコードとして永続化される。✅

#### R3: verification-result.md の出力・パス・書式は不変

| Scenario | Evidence | Status |
|----------|----------|--------|
| markdown の生成パスと書式が現状のまま | `verification.ts` の `writes()` / `resultFilePath()` / `parseResult()` が無変更。`src/util/paths.ts` の `verificationResultPath(slug)` も無変更。既存 verification-step テスト TC-003 / TC-11 が無改変で green。 | ✅ |
| build-fixer の読み取り経路が不変 | `src/core/step/build-fixer.ts` に diff なし。`reads()` (:66) と `enrichContext` / `buildMessage` の `findingsPath` (:77/:94) がいずれも `verificationResultPath(deps.slug)` を参照したまま。 | ✅ |

#### R4: verdict 判定と routing は不変

| Scenario | Evidence | Status |
|----------|----------|--------|
| verdict 経路が現状と同一 | `parseResult`（`/^## Verdict: (passed\|failed)$/m`）無変更。`deriveStepCompletion` 無変更。`executor.ts` は `verificationPhases` を verdict 導出経路から分離して付加（D4）。遷移テスト TC-012/TC-013/TC-015 等が無改変で green。 | ✅ |

#### R5: VERIFICATION exhaustion hint は実在情報を案内する

| Scenario | Evidence | Status |
|----------|----------|--------|
| VERIFICATION hint が実在ファイルを案内する | `types.ts:176`: `hint: (_nnn) => "Review verification-result.md and fix the build errors manually. Phase-level details (which phase failed and exit code) are available in the step-attempt outcome in events.jsonl."` — 連番ファイルを案内しない。TC-007 green。 | ✅ |
| 他 step の hint は無変更 | SPEC_REVIEW / CODE_REVIEW / CONFORMANCE / REGRESSION_GATE エントリは無変更。TC-008 green（各 hint が連番ファイルを案内したまま）。 | ✅ |

---

### 3. Request Acceptance Criteria 適合確認

| AC | Description | Evidence | Status |
|----|-------------|----------|--------|
| AC1 | 失敗 iteration の phase が markdown 再パース不要で step-attempt から取得できる | TC-001 green。`outcome.verificationPhases` から直接取得。markdown ファイルへのアクセスなし。 | ✅ |
| AC2 | passed iteration でも全 phase の status が記録される | TC-002 green。passed / skipped 両方の status が記録される。 | ✅ |
| AC3 | 複数 iteration が独立記録、後の iteration が前の記録を上書きしない | TC-003 green。append-only journal で iter1/iter2 が独立保持。 | ✅ |
| AC4 | `verification-result.md` の生成パスと書式が既存テスト無変更で green | `verificationResultPath(slug)` 無変更。`writes()` / `resultFilePath()` 無変更。既存テスト無改変で green。 | ✅ |
| AC5 | build-fixer の reads 宣言と findingsPath が同一 | `build-fixer.ts` に diff なし。reads() (:66) と findingsPath (:77/:94) が `verificationResultPath(deps.slug)` のまま。 | ✅ |
| AC6 | VERIFICATION hint が実在ファイル / outcome の phase 情報を案内するテストで固定 | `verification-hint.test.ts` TC-007 green（3 テストすべて green）。`pipeline.transitions.test.ts` TC-014 hint テストも新アサーション（`/verification-result\.md/` + `/events\.jsonl/`）で green。 | ✅ |
| AC7 | `parseResult` の verdict と build-fixer 遷移が既存テスト無変更で green | `parseResult` / `deriveStepCompletion` 無変更。verdict routing テスト（TC-012/TC-013/TC-015 等）が無改変で green。hint テスト（TC-014）は Operator 判断により更新が正当と確認された。 | ✅ |

---

### 4. Design Decision 適合確認

| Decision | Evidence | Status |
|----------|----------|--------|
| D1: phase を CliStep.run() 戻り値で thread（markdown 再パースなし） | `verification.ts:86`: `return { verificationPhases }`。`executor.ts:570-572`: `cliRunResult = await step.run(...) ?? undefined`。markdown を再読しない。 | ✅ |
| D2: 専用フィールド `verificationPhases` に格納（toolResult に載せない） | `types.ts:188`: `verificationPhases?: VerificationPhaseOutcome[]` が `StepOutcome` の独立フィールドとして追加。`toolResult` は無変更。 | ✅ |
| D3: PhaseResult を phase/status/exitCode のみに投影 | `verification.ts:55-59`: `stdout` / `stderr` / `durationMs` / `skippedCount` を除外して投影。`verification-step.test.ts` TC-014 が除外を確認。 | ✅ |
| D4: phase を StepExecutionResult に付加し verdict 導出経路に触れない | `executor.ts:619`: `const verificationPhases = cliRunResult?.verificationPhases`。`commit-orchestrator.ts:121`: `projectSuccess` が `result.verificationPhases` を destructure し `pushStepResult` へ渡す。`deriveStepCompletion` / `parseResult` は無変更。 | ✅ |
| D5: VERIFICATION hint を実在ファイル案内に修正（他 step 無変更） | `types.ts:176`: `hint: (_nnn) => "Review verification-result.md ..."` — 引数を無視し実在ファイルを案内。他エントリは無変更。 | ✅ |

---

### 5. テスト確認

新規テストファイル（すべて green）:
- `tests/store/event-journal.test.ts`: TC-001（AC1）/ TC-002（AC2）/ TC-003（AC3）/ TC-011（round-trip）/ TC-012（backward compat）
- `tests/unit/core/pipeline/verification-hint.test.ts`: TC-007（3 件）/ TC-008（5 件）
- `tests/unit/core/step/verification-step.test.ts`: TC-014（phase 投影・2 件）
- `tests/unit/core/step/verification-phase-outcome-executor.test.ts`: TC-013 / TC-016 / TC-017
- `tests/state/helpers.test.ts`: TC-009 / TC-010（verificationPhases conditional 格納）

既存テスト（verdict/遷移系は無改変で green）:
- `pipeline.transitions.test.ts`: TC-012/TC-013 の verdict/遷移テストは無改変で green。TC-014 hint テストはアサーションを新 hint に合わせて更新（Operator 判断：正当）。
- `verification-step.test.ts` TC-003 / TC-11: `reads()` / `parseResult()` / `resultFilePath()` 無変更を確認。

---

## 検証できなかった項目

None

---

## Findings 詳細

### F-01（低）: tasks.md T-07/T-08 の ⚠️ 注記が実態と乖離している

tasks.md の T-07 注記（「テストファイルは変更不可のため、1件の既存テストが失敗する」）と T-08 注記（「AC7 部分的: hint テスト1件が旧挙動を固定しているため失敗」）は、実装後の状態と乖離している。

`pipeline.transitions.test.ts` TC-014 hint テストは更新済みで全件 green であり、「失敗する」という記述は不正確。これは Operator 判断（iteration 1 escalation への応答）により正当と確認された更新であり、機能的影響はない。

tasks.md T-07/T-08 の ⚠️ 注記を、「TC-014 hint テストのアサーションを新 hint に合わせて更新した（Operator 判断により正当）」という実態に合わせて修正することを推奨する。この修正は機能的には不要だが、ドキュメントの正確性のために行う。
