# Spec: resume の再開 step 検証を実 descriptor 由来にする

## Requirements

### Requirement: buildAllowedStepSet は job の実 step 集合を返す

`buildAllowedStepSet(reviewers?)` は、当該 job に存在しうるすべての step 名を含む `ReadonlySet<string>` を返さなければならない（SHALL）。

- `reviewers` が `undefined` / `null` / 空配列のとき: `AGENT_STEP_NAMES` + `CLI_STEP_NAMES` のみを含む。
- `reviewers` が非 empty のとき: 上記に加え `REGRESSION_GATE_STEP_NAME`（`"regression-gate"`）と各 `reviewer.name` を含む。

#### Scenario: 標準 job（custom reviewer なし）の集合

**Given** `reviewers` が `undefined`
**When** `buildAllowedStepSet(undefined)` を呼ぶ
**Then** 返却集合に `"regression-gate"` は含まれない
**And** `"design"` / `"implementer"` / `"verification"` 等の static step 名は含まれる

#### Scenario: custom reviewer あり job の集合

**Given** `reviewers = [{ name: "scale-tolerance", ... }, { name: "cross-boundary-invariants", ... }]`
**When** `buildAllowedStepSet(reviewers)` を呼ぶ
**Then** 返却集合に `"regression-gate"` が含まれる
**And** `"scale-tolerance"` および `"cross-boundary-invariants"` が含まれる
**And** 静的 step 名もすべて含まれる

---

### Requirement: resolveResumeStep は allowedSteps 引数を優先使用する

`resolveResumeStep(from, resumePoint, stateStep, allowedSteps)` は、`allowedSteps` が与えられた場合にそれを使用して step 名の合否判定を行わなければならない（SHALL）。`allowedSteps` が省略された場合は従来の `ALL_STEP_NAMES_SET` を使用する。

#### Scenario: 第 4 引数なし → 静的集合で判定（後退なし）

**Given** `allowedSteps` が省略される
**When** `resolveResumeStep("design", null)` を呼ぶ
**Then** `"design"` が静的集合に含まれるため `"design"` を返す

#### Scenario: カスタム allowedSteps で動的 step を受理する

**Given** `allowedSteps = new Set(["regression-gate", "scale-tolerance", ...staticSteps])`
**When** `resolveResumeStep("regression-gate", null, undefined, allowedSteps)` を呼ぶ
**Then** `"regression-gate"` を返す

---

### Requirement: hard-crash 時の state.step フォールバックが動的 step 名を受理する

`from` が `undefined` かつ `resumePoint` が `null` のとき（hard-crash 経路）、`stateStep` が `allowedSteps` に含まれれば resume step として使用しなければならない（SHALL）。

#### Scenario: regression-gate 実行中の hard-crash からの resume

**Given** `state.step = "regression-gate"` かつ `state.reviewers` が非 empty
**When** `prepare()` 内で `buildAllowedStepSet(state.reviewers)` を呼び、`resolveResumeStep(undefined, null, "regression-gate", allowedSteps)` を実行する
**Then** `"regression-gate"` が返る（throw しない）

#### Scenario: custom reviewer 実行中の hard-crash からの resume

**Given** `state.step = "scale-tolerance"` かつ `state.reviewers = [{ name: "scale-tolerance", ... }]`
**When** `resolveResumeStep(undefined, null, "scale-tolerance", buildAllowedStepSet(state.reviewers))` を実行する
**Then** `"scale-tolerance"` が返る

#### Scenario: state.step が動的 step でも reviewers なし → 拒否

**Given** `state.step = "regression-gate"` かつ `state.reviewers` が空（standard job）
**When** `resolveResumeStep(undefined, null, "regression-gate", buildAllowedStepSet([]))` を実行する
**Then** throw する（`"regression-gate"` は集合に含まれないため）

---

### Requirement: --from に動的 step 名を指定できる

`allowedSteps` に含まれる動的 step 名を `--from` で指定した場合、`resolveResumeStep` はその名前を返さなければならない（SHALL）。

#### Scenario: --from regression-gate（custom reviewer あり）

**Given** `allowedSteps` に `"regression-gate"` が含まれる
**When** `resolveResumeStep("regression-gate", null, undefined, allowedSteps)` を呼ぶ
**Then** `"regression-gate"` を返す

#### Scenario: --from に実在しない名前 → 拒否

**Given** `allowedSteps` に `"typo-reviewer"` が含まれない
**When** `resolveResumeStep("typo-reviewer", null, undefined, allowedSteps)` を呼ぶ
**Then** throw し、エラーメッセージに `"typo-reviewer"` と実際の許可 step 名が含まれる

---

### Requirement: resumePoint 経路は allowedSteps に依存しない

`resumePoint` が非 `null` の場合、`resolveResumeStep` は `allowedSteps` の内容に関わらず `resumePoint.step` を返さなければならない（SHALL）。

#### Scenario: resumePoint あり → verbatim return（集合無関係）

**Given** `resumePoint = { step: "implementer", reason: "escalation", iterationsExhausted: 2 }`
**And** `allowedSteps` がどのような集合であっても
**When** `resolveResumeStep(undefined, resumePoint, undefined, allowedSteps)` を呼ぶ
**Then** `"implementer"` を返す
