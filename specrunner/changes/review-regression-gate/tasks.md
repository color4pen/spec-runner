# Tasks: レビュー収束後の退行ゲート

> 実装の依存順: T-01 → T-02/T-03 → T-04 → T-05 → T-06 → T-07 → T-08 → T-09。
> 既存 judge 契約（`JUDGE_REPORT_TOOL`）・chain 合成（`composeReviewerDescriptor`）・
> per-step 予算（`maxIterationsByStep`）を再利用し、executor / pipeline engine は無改修とする。

## T-01: ゲートの step 名定数と結果ファイルパス解決を用意する

- [ ] `regression-gate` の step 名定数を 1 箇所に定義する（例: `src/core/step/regression-gate.ts` 内に
  `export const REGRESSION_GATE_STEP_NAME = "regression-gate"`）。`STEP_NAMES` オブジェクト・
  `AGENT_STEP_NAMES`・`CLI_STEP_NAMES`・`AgentStepName` union には**追加しない**（design D8）。
- [ ] ゲートの結果ファイルは `resolveReviewerResultPath(slug, "regression-gate", n)`
  （`src/util/paths.ts:194`、非 code-review → `customReviewerResultPath` 経由 =
  `specrunner/changes/<slug>/regression-gate-result-NNN.md`）で解決されることを確認し、
  ゲート step の write 先も同一パスに揃える（新規パスヘルパは不要、既存を再利用）。
- [ ] ゲート固有の最大 iteration 予算定数を定義する（例: `REGRESSION_GATE_MAX_ITERATIONS`、初期値は
  小さい有界値）。

**Acceptance Criteria**:
- `regression-gate` 定数が `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` のいずれにも現れない。
- `resolveReviewerResultPath(slug, "regression-gate", 1)` が `…/regression-gate-result-001.md` を返す。
- `typecheck` が通る。

## T-02: ゲートの system prompt（CLI 所有の台帳照合 frame）を追加する

- [ ] `src/prompts/regression-gate-system.ts` を新設し、`REGRESSION_GATE_SYSTEM_PROMPT` を
  `buildSystemPrompt(base, [PIPELINE_RULES])` で構築する（`conformance-system.ts` /
  `custom-reviewer-system.ts` と同型）。
- [ ] frame に次を明示する: (1) read-only reviewer であること（source 改変不可）、(2) 入力は
  user message に列挙された「累積 findings 台帳」であり、台帳項目の最終コードでの維持のみを照合する
  （台帳に無い新規観点の開放的レビューを禁止）、(3) `git diff main...HEAD` と該当 file の Read で照合する、
  (4) 退行は severity=high / resolution=fixable で報告する、(5) ある台帳項目の修正が別の台帳項目を
  必然的に再発させる矛盾は resolution=decision-needed で報告する（→ escalation）、(6) 台帳が空なら
  即 approved（findings 空）、(7) `report_result` を必ず呼ぶ（findings 形式は判定ルールどおり）。
- [ ] `judge-rules.ts` の `VERDICT_BLOCKING_RULES` / `DECISION_NEEDED_DEFINITION` / severity 定義を
  再利用して findings 形式・verdict 導出ルールを記述する。

**Acceptance Criteria**:
- `REGRESSION_GATE_SYSTEM_PROMPT` が export され、台帳照合に限定する旨と decision-needed=矛盾の criterion を含む。
- prompt が `report_result` 呼び出しと findings 配列形式を要求している。
- `typecheck` が通る。

## T-03: 累積 findings 台帳の純関数を実装する

- [ ] `collectFindingsLedger(state: JobState, reviewerChain: string[]): Finding[]` を純関数として
  実装する（配置例: `src/core/pipeline/findings-ledger.ts`）。reviewerChain の各 step の
  **全 `StepRun`** の `outcome.toolResult.findings` を走査し、`collectFixableFindings`
  （`src/core/step/judge-verdict.ts:53`、`resolution === "fixable"`）でフィルタした集合を集める。
  ゲート自身は reviewerChain に含めない前提とする。
- [ ] `dedupeFindings(findings: Finding[]): Finding[]` を実装し、`file` + `line`(なければ空) + `title` を
  キーに構造的重複を排除する（最初の出現を保持）。
- [ ] `collectFindingsLedger` は `dedupeFindings` を適用した結果を返す。
- [ ] 単体テストを追加する: (a) 途中 iteration の fixable が最終 approved 後も台帳に残る、
  (b) `decision-needed` が除外される、(c) 構造的重複が 1 件に畳まれる、(d) findings/toolResult 不在の
  StepRun を安全に無視する、(e) 空チェーン/空 findings で空配列。

**Acceptance Criteria**:
- 上記 (a)〜(e) の単体テストが green。
- `collectFindingsLedger` / `dedupeFindings` が I/O を持たない純関数である。

## T-04: ゲート step（AgentStep）を実装する

- [ ] `src/core/step/regression-gate.ts` に `createRegressionGateStep(): AgentStep` を実装する
  （`createCustomReviewerStep` / `ConformanceStep` を参考）。
  - `agent`: `name: "specrunner-regression-gate"`、`role: "regression-gate" as AgentStepName`、
    `model`: 既定レビューモデル、`system: REGRESSION_GATE_SYSTEM_PROMPT`、
    `tools: [{ type: AGENT_TOOLSET_TYPE }, toCustomToolSpec(JUDGE_REPORT_TOOL)]`、
    `capabilities: { gitWrite: true }`。
  - `reportTool: JUDGE_REPORT_TOOL`（singleton 参照 — executor の `isJudgeStep` identity 判定のため）。
  - `needsProjectContext: true`、`maxTurns`: 台帳照合に十分な値（custom reviewer と同程度）。
  - `reads()`: gitState（`{ path: ".", artifact: "gitState" }`）のみ。reviewer 結果ファイルは
    required input にしない（台帳は state から prompt に埋め込むため）。
  - `writes()` / `resultFilePath()`: `resolveReviewerResultPath(slug, "regression-gate", nextIteration)`。
  - `buildMessage()`: `collectFindingsLedger(state, deriveImplReviewerChain(state))` で台帳を構築し、
    `buildFindingsBlock` 相当の整形で prompt に埋め込む（台帳が空ならその旨を明示）。結果ファイルパスと
    照合手順を記す。
  - `parseResult()`: `{ verdict: null, findingsPath: null }`（verdict は toolResult から導出）。
- [ ] 単体テスト: ゲート step が `JUDGE_REPORT_TOOL` を参照し、`reads()` が required な reviewer 結果
  ファイルを要求しないこと、`buildMessage` が台帳項目を埋め込むこと（空台帳/非空台帳）を検証する。

**Acceptance Criteria**:
- `createRegressionGateStep().reportTool === JUDGE_REPORT_TOOL`。
- `writes()` / `resultFilePath()` が `…/regression-gate-result-NNN.md` を返す。
- `buildMessage` が非空台帳のとき台帳 finding の title/file を含み、空台帳のとき空である旨を含む。
- 単体テストが green、`typecheck` が通る。

## T-05: code-fixer の findings 取得チェーンにゲートを含める

- [ ] `src/core/pipeline/reviewer-chain.ts` に
  `deriveImplFixerChain(state: JobState): string[]` を追加する。
  `deriveImplReviewerChain(state)` の結果に、`state.reviewers?.length > 0` のときのみ
  `REGRESSION_GATE_STEP_NAME` を末尾追加して返す（reviewer ゼロでは追加しない）。
- [ ] `src/core/step/code-fixer.ts` の `reads()` と `buildMessage()` で使う
  `deriveImplReviewerChain(state)` を `deriveImplFixerChain(state)` に置き換える
  （`resolveActiveReviewer` / `resolveReviewerResultPath` / `getLatestJudgeFindings` の呼び出しはそのまま）。
- [ ] 単体テスト: `deriveImplFixerChain` が (a) reviewer ゼロで `["code-review"]`、
  (b) reviewer 非空で `["code-review", ...names, "regression-gate"]` を返す。
- [ ] 単体テスト: ゲートが最新 `startedAt` を持つ state で code-fixer の `reads()` が
  `…/regression-gate-result-NNN.md` を要求し、`getLatestJudgeFindings(state, "regression-gate")` で
  ゲートの退行 findings を読むことを検証する。非ゲート reviewer 収束中は従来どおり当該 reviewer の
  findings を読むこと（回帰なし）を検証する。

**Acceptance Criteria**:
- 上記 (a)(b) のチェーン導出テストが green。
- ゲート active 時に code-fixer がゲートの findings/結果パスを解決する。
- reviewer ゼロでは `deriveImplFixerChain` の結果にゲートが現れない。

## T-06: composeReviewerDescriptor にゲートの合成を追加する

- [ ] `src/core/pipeline/compose-reviewers.ts` で、`snapshots` 非空時のみ次を行う（空時の参照同一 return は不変）:
  - `fixableChain = [...deriveImplReviewerChain(snapshots), REGRESSION_GATE_STEP_NAME]` を作る。
  - steps: custom reviewer step 群の直後・conformance の直前にゲート step
    （`createRegressionGateStep()`）を挿入する。
  - transitions: 既存の filter（code-review / code-fixer / 各 reviewer 名の行を除去）に
    `regression-gate` 行の除去も加え、`buildReviewerChainTransitions(fixableChain)` の出力で置換する
    （末尾要素ゆえ `regression-gate` approved → conformance が生成される）。
  - `loopNames`: custom reviewer 名に加えて `regression-gate` を含める。
  - `loopFixerPairs`: `regression-gate → code-fixer` を加える。
  - `roles`: `regression-gate → { role: "gate", phase: "impl" }` を加える。
  - `maxIterationsByStep`: `regression-gate → REGRESSION_GATE_MAX_ITERATIONS` を加える。
- [ ] 単体テスト（compose-reviewers）: reviewer 非空で (a) steps に `regression-gate` が conformance の
  直前に入る、(b) 末尾 reviewer approved → `regression-gate`、(c) `regression-gate` approved →
  `conformance`、(d) `regression-gate` needs-fix → `code-fixer`、(e) `loopNames` /
  `loopFixerPairs` / `roles` / `maxIterationsByStep` にゲートが入る、を検証する。
- [ ] 単体テスト: reviewer ゼロで `composeReviewerDescriptor(base, [])` が base と参照同一であり
  ゲートが現れない（既存の reference-identity テストを維持）。

**Acceptance Criteria**:
- reviewer 非空のとき pipeline 順が `… code-review → [custom reviewers] → regression-gate → conformance`。
- reviewer ゼロのとき合成結果が base と参照同一。
- 上記 compose-reviewers 単体テストが green。

## T-07: ゲートの exhaustion エラー形を登録する

- [ ] `src/core/pipeline/types.ts` の `LOOP_ERROR_CODES` に `regression-gate` のエントリを追加する:
  `code: "REGRESSION_GATE_RETRIES_EXHAUSTED"`、`message`/`hint` は
  `regression-gate-result-NNN.md` を指す文言。
- [ ] 単体テスト: ゲート予算超過の state を与え、`handleExhausted` 相当の経路で
  `REGRESSION_GATE_RETRIES_EXHAUSTED` が記録され `awaiting-resume`（resumeStep = `code-fixer`）に
  遷移することを検証する（既存 pipeline exhaustion テストの構成を参考）。

**Acceptance Criteria**:
- ゲート exhaustion で `REGRESSION_GATE_RETRIES_EXHAUSTED` が error code に記録される。
- exhaustion 後の status が `awaiting-resume`。

## T-08: reviewer 非空の既存テストをゲート挿入に合わせて更新し、ゲートの E2E シナリオを追加する

- [ ] `src/core/pipeline/__tests__/compose-reviewers.test.ts`: 「末尾 reviewer → conformance」を
  「末尾 reviewer → regression-gate」「regression-gate → conformance」に更新する。
- [ ] `tests/custom-reviewers-e2e.test.ts`:
  - `buildConfig` の agents に `"regression-gate": { agentId: "regression-gate-agent-id", … }` を加える。
  - mock client の `listEvents` に `agentId === "regression-gate-agent-id"` 分岐を追加する
    （既定: approved / findings 空）。退行検出シナリオ用に findings を返す制御を加える。
  - 既存シナリオ（security 単独 / security+perf / needs-fix→fixer）が
    `regression-gate` を経て `conformance` に到達することを反映する（必要なら assertion 更新）。
  - 新規シナリオ: (1) ゲートが退行（high/fixable）を 1 回報告し code-fixer 後に approved → conformance 到達、
    (2) ゲートが `decision-needed` を報告 → escalation（`awaiting-resume`）、
    (3) ゲートが needs-fix を予算回数返し続ける → `REGRESSION_GATE_RETRIES_EXHAUSTED` で `awaiting-resume`。
- [ ] reviewer 非空を前提にする他のテスト（例: `tests/core/step/fixer-reviewer.test.ts`、
  `src/core/step/__tests__/custom-reviewer-step.test.ts`、`pipeline.episode-reset.test.ts` 等）を
  実行し、ゲート挿入で壊れる assertion があれば「ゲートを経て conformance に至る」前提に更新する。

**Acceptance Criteria**:
- 退行検出 → code-fixer → 再ゲート → approved → conformance の E2E が green。
- 矛盾（decision-needed）→ escalation の E2E が green。
- exhaustion → `awaiting-resume` の E2E が green。
- reviewer 非空の既存テストが更新後 green。

## T-09: zero-reviewer 回帰ゼロと全体検証

- [ ] `STANDARD_DESCRIPTOR`（reviewer ゼロ）由来のテスト
  （`pipeline.transitions.test.ts` / `pipeline-roles.test.ts` / `step-names.test.ts` /
  `reviewer-chain.test.ts` の既存ケース / standard pipeline の integration）が**無変更で** green である
  ことを確認する。
- [ ] `regression-gate` が `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` に追加されておらず、
  `step-names.test.ts` の TC-2（union ≡ STEP_NAMES 値集合）が無変更で green であることを確認する。
- [ ] `bun run typecheck && bun run test`（または `verification.commands` 既定の build/typecheck/test/lint）が
  全て green であることを確認する。

**Acceptance Criteria**:
- zero-reviewer のテストファイルに差分がなく全て green。
- `typecheck && test` が green。
- 受け入れ基準（request.md）の全項目が満たされる。
