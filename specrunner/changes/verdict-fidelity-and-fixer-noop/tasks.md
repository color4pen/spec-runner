# Tasks: verdict 忠実性の修正（表示/導出/記録の食い違い・code-fixer no-op 空振り）

<!-- 実装対象ファイル一覧（参照用）
- src/core/step/judge-verdict.ts          — D1: deriveRegressionGateVerdict 追加
- src/core/port/step-types.ts             — D1 / D3: AgentStep に judgeVerdictFn / noOpDetect 追加
- src/core/step/regression-gate.ts        — D1: judgeVerdictFn を wire
- src/core/step/executor.ts               — D1 / D3: judgeVerdictFn 適用 / no-op 検出ロジック
- src/core/step/code-fixer.ts             — D3: noOpDetect: true 追加
- src/core/port/report-result.ts          — D2: parseRequestReviewReportInput 変更
- src/core/pipeline/pipeline.ts           — D4: pipeline:iteration:start イベント修正
- src/core/archive/orchestrator.ts        — D5: drafts 存在確認追加
-->

---

## T-01: regression-gate verdict 導出関数の追加（症状1 修正）

regression-gate において fixable finding が LOW/MEDIUM severity であっても `needs-fix` を返すよう、ステップ専用の verdict 導出関数を追加し wire する。

- [x] `src/core/step/judge-verdict.ts` に `deriveRegressionGateVerdict` 関数を追加する
  - シグネチャ: `(findings: Finding[], ok: boolean) => "approved" | "needs-fix" | "escalation"`
  - ロジック: `ok=false` → `"escalation"` / `decision-needed` ≥ 1 → `"escalation"` / `fixable` ≥ 1 → `"needs-fix"` / else → `"approved"`
  - 既存 `deriveJudgeVerdict` は変更しない
  - 関数を `export` し、`src/core/step/judge-verdict.ts` のテストでカバーする
- [x] `src/core/port/step-types.ts` の `AgentStep` インターフェースに以下のオプションフィールドを追加する
  ```typescript
  /**
   * Custom verdict derivation for judge steps.
   * When set, executor uses this instead of deriveJudgeVerdict.
   * Only applies when isJudgeStep is true (step uses JUDGE_REPORT_TOOL or CODE_REVIEW_REPORT_TOOL).
   */
  judgeVerdictFn?: (findings: import("../../kernel/report-result.js").Finding[], ok: boolean) => "approved" | "needs-fix" | "escalation";
  ```
- [x] `src/core/step/regression-gate.ts` の `createRegressionGateStep()` 戻り値に `judgeVerdictFn: deriveRegressionGateVerdict` を追加する
  - `deriveRegressionGateVerdict` を `judge-verdict.ts` からインポートする
- [x] `src/core/step/executor.ts` の `finalizeStep` で judge step の verdict 導出箇所を更新する
  - 現在: `verdict = deriveJudgeVerdict(undecidedFindings, tr.ok);`
  - 変更後: `const verdictFn = ("judgeVerdictFn" in step && step.judgeVerdictFn) ? step.judgeVerdictFn : deriveJudgeVerdict;` → `verdict = verdictFn(undecidedFindings, tr.ok);`
  - `isConformanceStep` と `isRequestReviewStep` の分岐は変更しない（それぞれ専用関数を使い続ける）

**Acceptance Criteria**:
- `deriveRegressionGateVerdict([], true)` → `"approved"`
- `deriveRegressionGateVerdict([{severity:"medium", resolution:"fixable", ...}], true)` → `"needs-fix"`
- `deriveRegressionGateVerdict([{severity:"low", resolution:"fixable", ...}], true)` → `"needs-fix"`
- `deriveRegressionGateVerdict([{severity:"high", resolution:"fixable", ...}], true)` → `"needs-fix"`（従来どおり）
- `deriveRegressionGateVerdict([{severity:"low", resolution:"decision-needed", ...}], true)` → `"escalation"`
- `deriveJudgeVerdict([{severity:"medium", resolution:"fixable", ...}], true)` → `"approved"`（変化なし）
- `createRegressionGateStep().judgeVerdictFn` が `deriveRegressionGateVerdict` と同一参照
- executor が regression-gate step で `deriveRegressionGateVerdict` を使い、他の judge step では `deriveJudgeVerdict` を使う
- 既存の `judge-verdict.test.ts` が緑のまま

---

## T-02: `parseRequestReviewReportInput` で findings 省略を許容する（症状2 修正）

request-review agent が `{ ok: true, verdict: "approve" }` のように findings なしで `report_result` を呼んだ場合、parse 成功として扱い空の findings 配列と同等に処理する。

- [x] `src/core/port/report-result.ts` の `parseRequestReviewReportInput` を変更する
  - 変更前: `ok=true` かつ `findings` が不在/invalid → `{ ok: false, missingFields: ["findings"] }`
  - 変更後:
    ```
    if (result.ok) {
      if ("findings" in obj && obj["findings"] !== undefined) {
        const parsed = parseFindings(obj["findings"], true);
        if (!parsed.ok) {
          return { ok: false, missingFields: ["findings"], rawInput: raw };
        }
        result.findings = parsed.value;
      }
      // findings 省略: result.findings を undefined のまま（= 空配列扱い）
    }
    ```
  - `ok=false` のパスは変更しない
  - findings が存在するが invalid な場合（配列だが要素が不正）は従来通り parse 失敗
- [x] `src/core/port/__tests__/` または `tests/` 内の report-result 関連テストに以下を追加する
  - `parseRequestReviewReportInput({ ok: true })` → `{ ok: true, value: { ok: true } }` （findings なし = parse 成功）
  - `parseRequestReviewReportInput({ ok: true, verdict: "approve" })` → parse 成功、`value.findings` が `undefined`
  - `parseRequestReviewReportInput({ ok: true, findings: [] })` → parse 成功（既存動作）
  - `parseRequestReviewReportInput({ ok: true, findings: [{ severity: "invalid", ... }] })` → parse 失敗（既存動作維持）
  - `parseJudgeReportInput({ ok: true })` → parse 失敗（findings は judge steps では必須のまま）

**Acceptance Criteria**:
- `{ ok: true }` を渡した場合に parse が成功し `value.ok === true`、`value.findings === undefined`
- executor で `tr.findings ?? []` が `[]` になり `deriveRequestReviewVerdict([], true)` → `"approve"` になる
- MEDIUM+LOW findings を持つ request-review 結果ファイルのジョブで、findings なし `report_result` が escalation にルーティングされない
- `parseJudgeReportInput` は変更せず findings なしは引き続き parse 失敗

---

## T-03: code-fixer の no-op 検出（症状3 修正）

code-fixer session 完了後にソースファイルへの変更がゼロの場合、`approved` ではなく `needs-fix` を記録する。

- [x] `src/core/port/step-types.ts` の `AgentStep` インターフェースに以下のオプションフィールドを追加する
  ```typescript
  /**
   * When true, executor detects no-op completions: if no source files changed
   * since headBeforeStep (excluding pipeline artifacts), verdict is overridden
   * from "approved"/"success" to "needs-fix".
   * Only effective when runtimeStrategy is available and headBeforeStep is non-null.
   */
  noOpDetect?: boolean;
  ```
- [x] `src/core/step/code-fixer.ts` の `CodeFixerStep` に `noOpDetect: true` を追加する
- [x] `src/core/step/executor.ts` の `runAgentStep` でコミット/プッシュ後・`finalizeStep` 呼び出し前に no-op 検出を追加する
  - 条件: `step.kind === "agent" && step.noOpDetect === true && deps.runtimeStrategy && headBeforeStep !== null && runResult.completionReason === "success"`
  - 処理:
    1. `deps.runtimeStrategy.listChangedFiles(headBeforeStep, cwd, state.branch ?? null)` で変更ファイル一覧を取得
    2. 成果物ファイルフィルタ: `f.startsWith("specrunner/changes/") || f.startsWith(".specrunner/")` に一致するものを除外
    3. フィルタ後の変更が 0 件かつ `completionVerdict === "approved"` または producer の場合 → `runResult` を改変せず `finalizeStep` に渡す verdictを overrideするため、`noOpDetected: true` フラグを持つ局所変数を立て、`finalizeStep` 内で verdict を `"needs-fix"` に差し替える
    4. 実装の具体的方法: `finalizeStep` のシグネチャを変えずに済む方法として、`agentResult` の `toolResult` を差し替える代わりに、`finalizeStep` の戻り後 verdict を書き換える変数を渡す。または `runResult` に `overrideVerdict?: Verdict` フィールドを追加してそこから引く。実装者はシンプルな方を選ぶ。
  - no-op 検出が発動した場合 stderr に `[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix` を出力する（`stderrWrite` 使用）

  **実装上の注意**: `listChangedFiles` は `headBeforeStep` から現在 HEAD までの差分ファイルを返すことが前提。`finalizeStepArtifacts`（commit/push）はその前に実行済みなので、`headBeforeStep` は step 前の commit SHA、現在 HEAD は step のコミット後の SHA になっている。

- [x] `src/core/step/__tests__/` または `tests/core/step/` に no-op 検出のユニットテストを追加する
  - `noOpDetect: true` の step で変更ゼロ → verdict が `"needs-fix"` になること
  - `noOpDetect: true` の step で変更あり（成果物ファイルのみ） → verdict が `"needs-fix"` になること（成果物のみ = 実質ゼロ）
  - `noOpDetect: true` の step で変更あり（ソースファイル含む） → verdict が `"approved"` のまま
  - `noOpDetect: undefined/false` の step では発動しないこと
  - `runtimeStrategy` が null のときは発動しないこと（管理 runtime 互換）

**Acceptance Criteria**:
- fixable findings を持つ入力に対し code-fixer がソースファイルを変更しなかった場合、state に `verdict: "needs-fix"` が記録される
- ソースファイルを変更した code-fixer 実行は `verdict: "approved"` のまま（後退なし）
- no-op 検出時に stderr に診断メッセージが出る
- `specrunner/changes/<slug>/events.jsonl`、`state.json`、`usage.json` の変更はソース変更としてカウントされない

---

## T-04: iteration 表示の整合（`iter 3/2` バグ修正）

`pipeline:iteration:start` イベントに step 別 `maxIterations` を使用することで、regression-gate など step 別上書きがある step でも正確な `/M` が表示される。

- [x] `src/core/pipeline/pipeline.ts` の `runInternal` 内、`pipeline:iteration:start` 発火箇所を修正する
  - 現在: `maxIterations: this.maxIterations`
  - 変更後: `maxIterations: this.resolveMaxIterations(currentStep)`
  - `resolveMaxIterations` は同クラスの既存プライベートメソッド（変更不要）
- [x] `pipeline:iteration:exhausted` イベントも同様に確認し、必要なら修正する
  - `tryExhaust` 内の `events.emit("pipeline:iteration:exhausted", { ..., maxIterations: effectiveMax })` は既に `effectiveMax`（= step 別値）を使っているので変更不要であることを確認する
- [x] `src/core/pipeline/__tests__/` または `tests/` にテストを追加する
  - `maxIterationsByStep: { "regression-gate": 3 }` かつ `maxIterations: 2` の pipeline で regression-gate が実行されるとき `pipeline:iteration:start` の `maxIterations` が `3` になること

**Acceptance Criteria**:
- regression-gate（または任意の step 別 maxIterations が設定された loop step）の `pipeline:iteration:start` イベントペイロードの `maxIterations` が step 別値と一致する
- `[iter N/M]` 表示の `/M` が exhaust 判定と同じ値になる
- 既存のグローバル `maxIterations` のみを持つ step（spec-review 等）は表示変化なし

---

## T-05: archive orchestrator の drafts warning 解消（症状4 修正）

`specrunner/drafts/` が存在しない worktree で `job archive` を実行しても warning が出ないようにする。

- [x] `src/core/archive/orchestrator.ts` の Phase 1 draft 削除・staging セクションを修正する
  - 現在（line ~272）: `spawn("git", ["add", draftsDir()], { cwd: recordDir })` を無条件実行
  - 変更後: `git add draftsDir()` の前に `fs.exists(path.join(recordDir, draftsDir()))` でディレクトリ存在確認
    - `true` の場合のみ `git add` を実行（警告ロジックは変更せずそのまま残す）
    - `false` の場合はスキップ（warning なし）
  - `fs` は `input.fs`（injected `FinishFs`）であることを確認。`runArchiveOrchestrator` の先頭で `const { slug, cwd, fs } = input;` として destructure されているので `fs.exists` が使える
- [x] `src/core/archive/__tests__/orchestrator.test.ts` にテストを追加する
  - `fs.exists` が `false` を返す（drafts ディレクトリなし）場合に `spawn("git", ["add", "specrunner/drafts"])` が呼ばれないこと
  - `fs.exists` が `true` を返す場合は従来通り呼ばれること（後退なし）

**Acceptance Criteria**:
- worktree に `specrunner/drafts/` が存在しない場合に `job archive` を実行しても `Warning: git add specrunner/drafts/ failed` が表示されない
- `specrunner/drafts/` が存在する場合は従来通り `git add` が実行される
- `fs.exists` 呼び出し結果に基づいて分岐するユニットテストが通る

---

## T-06: 受け入れ基準の結合テスト（最終確認）

上記 T-01〜T-05 の実装後、パイプライン全体の動作に後退がないことを確認する。

- [x] `bun run build` が成功すること（型エラーゼロ）
- [x] `bun run typecheck` が成功すること
- [x] `bun run lint` が成功すること（ESLint エラーゼロ）
- [x] `bun run test` で既存テストが緑のまま（5766 tests all passed）
- [x] `tests/pipeline-integration.test.ts` を含む integration テスト群が後退なし
- [x] `tests/custom-reviewers-e2e.test.ts` を含む e2e テスト群が後退なし

**Acceptance Criteria**:
- build / typecheck / lint / test がすべて成功する
- 新規追加したユニットテスト（T-01〜T-05 各タスクの acceptance criteria）がすべて緑
