# Tasks: resume の再開 step 検証を実 descriptor 由来にする

## T-01: resolve-step.ts に buildAllowedStepSet を追加し resolveResumeStep を拡張する

対象: `src/core/resume/resolve-step.ts`

- [x] `REGRESSION_GATE_STEP_NAME` を `../step/regression-gate.js` から import する
- [x] `buildAllowedStepSet(reviewers?: ReadonlyArray<{ name: string }>): ReadonlySet<string>` を export 関数として追加する
  - 常に `AGENT_STEP_NAMES` + `CLI_STEP_NAMES` を含む
  - `reviewers` が truthy かつ length > 0 の場合のみ `REGRESSION_GATE_STEP_NAME` と各 `r.name` を追加する
- [x] `resolveResumeStep` の第 4 引数 `allowedSteps?: ReadonlySet<string>` を追加する
- [x] 関数内で `const allowed = allowedSteps ?? ALL_STEP_NAMES_SET;` とし、以降の全 `.has()` 呼び出しを `allowed` に統一する
- [x] `--from` 不正時のエラーメッセージの step 名列挙を `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` から `[...allowed]` に変更する
- [x] `ALL_STEP_NAMES_SET` のモジュールスコープ定数はそのまま残す（フォールバック用）

**Acceptance Criteria**:
- `buildAllowedStepSet(undefined)` の返却集合に `"regression-gate"` が含まれない
- `buildAllowedStepSet([{ name: "scale-tolerance" }])` の返却集合に `"regression-gate"` と `"scale-tolerance"` が含まれる
- `resolveResumeStep("design", null)` （第 4 引数なし）が `"design"` を返す（後退なし）
- `resolveResumeStep("regression-gate", null, undefined, new Set([...staticSteps, "regression-gate"]))` が `"regression-gate"` を返す
- typecheck が通る

---

## T-02: ResumeCommand.prepare() で buildAllowedStepSet を呼び出す

対象: `src/core/command/resume.ts`

- [x] `buildAllowedStepSet` を `../resume/resolve-step.js` から import する（`resolveResumeStep` と同一 import 文に追加）
- [x] `resolveResumeStep` 呼び出し直前（`resume.ts:164` 付近）に `const allowedSteps = buildAllowedStepSet(state.reviewers);` を追加する
- [x] `resolveResumeStep(this.options.from, resumePoint, state.step)` を `resolveResumeStep(this.options.from, resumePoint, state.step, allowedSteps)` に変更する

**Acceptance Criteria**:
- `state.reviewers` が `undefined` の job で既存の resume 動作が変わらない
- `state.reviewers = [{ name: "scale-tolerance", ... }]` を持つ job で `state.step = "scale-tolerance"` の hard-crash から resume が throw しない（integrationレベルでは後述テストで確認）
- typecheck が通る

---

## T-03: resolve-step.test.ts に動的 step 検証テストを追加する

対象: `tests/unit/core/resume/resolve-step.test.ts`

既存テストスイートはそのまま維持し、以下のスイートを末尾に追加する。

**Suite A — `buildAllowedStepSet`**:
- [x] reviewers なし（`undefined`）→ 返却集合に `"regression-gate"` が含まれない
- [x] reviewers 空配列 → 返却集合に `"regression-gate"` が含まれない
- [x] reviewers 非 empty → 返却集合に `"regression-gate"` が含まれる
- [x] reviewers 非 empty → 各 reviewer.name（`"scale-tolerance"`, `"cross-boundary-invariants"` など）が含まれる
- [x] reviewers なしでも static step 名（`"design"`, `"verification"`, etc.）は含まれる

**Suite B — resolveResumeStep / stateStep フォールバック（hard-crash 経路）**:
- [x] `stateStep = "regression-gate"` + reviewers あり allowedSteps → `"regression-gate"` を返す
- [x] `stateStep = "scale-tolerance"` + reviewer "scale-tolerance" を含む allowedSteps → `"scale-tolerance"` を返す
- [x] `stateStep = "regression-gate"` + static-only allowedSteps（reviewers なし）→ throw する
- [x] `stateStep = "unknown-reviewer"` + reviewer "scale-tolerance" だけの allowedSteps → throw する

**Suite C — resolveResumeStep / --from 経路**:
- [x] `from = "regression-gate"` + reviewers あり allowedSteps → `"regression-gate"` を返す
- [x] `from = "scale-tolerance"` + reviewer "scale-tolerance" を含む allowedSteps → `"scale-tolerance"` を返す
- [x] `from = "typo-reviewer"` + reviewers あり allowedSteps → throw し、エラーに `"typo-reviewer"` が含まれる
- [x] `from = "typo-reviewer"` のエラーメッセージに dynamic reviewer 名（`"scale-tolerance"`）が列挙される

**Suite D — resumePoint 経路の後退なし確認**:
- [x] resumePoint あり + カスタム allowedSteps → `resumePoint.step` を verbatim 返す（集合の内容に依存しない）

**Acceptance Criteria**:
- 追加スイートが全 pass する
- 既存スイート（`resolveResumeStep - resumePoint.step returned verbatim` / `--from with registered step name` / `--from invalid value throws` / `null resumePoint + no from → throws`）が後退なし pass する
- `bun run typecheck && bun run test` が green

---

## T-04: 最終検証

- [x] `bun run typecheck` が pass する
- [x] `bun run test` が pass する（既存テスト後退なし）
- [x] `tests/unit/core/resume/resolve-step.test.ts` の新規スイートが全 pass する

**Acceptance Criteria**:
- `typecheck && test` が両方 green
