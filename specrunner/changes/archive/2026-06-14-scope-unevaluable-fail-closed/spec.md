# Spec: scope 評価不能 runtime の fail-closed escalation（RuntimeStrategy 評価可能性 predicate）

## Requirements

### Requirement: RuntimeStrategy は任意の評価可能性 predicate を持ち、absent はフォールスルー（評価可能扱い）

`RuntimeStrategy` SHALL expose an optional predicate `canDeriveChangedFiles?(): boolean` indicating whether the runtime can mechanically derive changed files, and a runtime that does NOT implement the predicate MUST fall through to the existing `listChangedFiles` path (current behavior — no fail-closed evaluation).

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）は任意 method `canDeriveChangedFiles?(): boolean` を持つ。`true` = 導出可能、`false` = 導出不能、absent = `listChangedFiles` 経路へフォールスルー（現行挙動）。この predicate は seam のメタ情報であり、`listChangedFiles` の戻り値型・契約には影響しない。

#### Scenario: predicate 未実装 runtime はフォールスルー

**Given** `canDeriveChangedFiles` を実装しない runtime（既存 test fake 相当）
**When** scope-check がその runtime で評価を行う
**Then** fail-closed 分岐は発火せず `listChangedFiles` 経路（#689 挙動）へフォールスルーする

#### Scenario: 型は optional として predicate を受け付ける

**Given** `RuntimeStrategy` を full object で構成する既存 test fake（`canDeriveChangedFiles` 無し）
**When** `bun run typecheck` を実行する
**Then** TS2741 などのコンパイルエラーは発生せず green である

### Requirement: 実 runtime は predicate を実装し、mechanical に固定される

The concrete runtimes in `src/core/runtime/` SHALL implement `canDeriveChangedFiles` returning `true` for local and `false` for managed, and that every concrete runtime implements the predicate MUST be enforced mechanically (compile-time type pin plus an arch-test backstop), while `tests/` fakes remain exempt.

`LocalRuntime` は `canDeriveChangedFiles()` で `true`、`ManagedRuntime` は `false` を返す。両具象クラスは必須版の型 `RealRuntimeStrategy`（`RuntimeStrategy & { canDeriveChangedFiles(): boolean }`）を implements し、predicate を実装し忘れるとコンパイル時に落ちる。加えて `src/core/runtime/` 配下に bare `implements RuntimeStrategy` が現れないことを arch test が検証する。`tests/` 配下の fake は対象外。

#### Scenario: local は true、managed は false

**Given** `LocalRuntime` と `ManagedRuntime` のインスタンス
**When** それぞれ `canDeriveChangedFiles()` を呼ぶ
**Then** local は `true`、managed は `false` を返す

#### Scenario: 実 runtime の predicate 実装漏れがコンパイル時に落ちる

**Given** `RealRuntimeStrategy` を implements する具象 runtime クラスから `canDeriveChangedFiles` を取り除いた状態
**When** `bun run typecheck` を実行する
**Then** コンパイルエラーになる（実装漏れが mechanical に検出される）

#### Scenario: bare implements の不在を arch test が固定する

**Given** `src/core/runtime/` 配下の具象 runtime 実装
**When** アーキテクチャ不変条件テストを実行する
**Then** bare `implements RuntimeStrategy`（`RealRuntimeStrategy` ではない形）が存在しないことが検証され green になる

### Requirement: listChangedFiles の戻り値型・契約は無変更

The `listChangedFiles` seam contract (`string[]` return, Never throws, `[]` on any error) MUST remain unchanged; the new predicate SHALL be orthogonal metadata that does not alter it.

`listChangedFiles` の戻り値型（`Promise<string[]>`）と契約（Never throws、あらゆるエラーで `[]`）は本 request で変更しない。predicate は直交するメタ情報として追加される。

#### Scenario: listChangedFiles の既存挙動が保たれる

**Given** local runtime に対する `listChangedFiles` の既存 unit test（成功/非ゼロ終了/spawn 例外）
**When** 本 request 適用後にそれらを実行する
**Then** 無変更で green である（戻り値型・`[]` on error が保たれる）

### Requirement: 評価不能 runtime ＋ scope 宣言 ＋ checkpoint で fail-closed escalation する

When a profile declares `permissionScope`, the current step is the declared checkpoint, and `runtimeStrategy.canDeriveChangedFiles?.()` returns `false`, scope-check SHALL synthesize an UNKNOWN `decision-needed` finding (`origin:"scope"`) WITHOUT calling `listChangedFiles`, and the verdict MUST become `escalation` so the job transitions to `awaiting-resume`.

`computeExtraScopeFindings`（`src/core/step/scope-check.ts`）は、early guard（`permissionScope` 在り・`stepName === checkpoint`・`runtimeStrategy` 在り）を満たした後、`canDeriveChangedFiles?.() === false` のとき `listChangedFiles` を呼ばず、`synthesizeScopeUnverifiableFinding`（`src/core/pipeline/scope.ts` の純関数）で UNKNOWN な `decision-needed`（`origin:"scope"`、`severity:"high"`、決定的 anchor `request.md`、≥2 options）を合成して返す。合成 finding は #689 と同じ `deriveJudgeVerdict` → `escalation` → `awaiting-resume` 経路に乗り、`getOpenDecisionFindings` で拾われる。

#### Scenario: 評価不能で scope 宣言ありの checkpoint は UNKNOWN escalation に落ちる

**Given** `permissionScope` を宣言した checkpoint step を、`canDeriveChangedFiles()` が `false` を返す runtime で実行する
**When** その step の verdict を導出する
**Then** `listChangedFiles` は呼ばれず、UNKNOWN な `decision-needed`（`origin:"scope"`）が合成され、verdict は `escalation`、job は `awaiting-resume` に遷移する

#### Scenario: UNKNOWN finding は ≥2 options を持つ

**Given** 評価不能による UNKNOWN finding
**When** 合成された finding の options を数える
**Then** 「導出できる runtime で再実行」「permissionScope 宣言を外す」「リスク受容で進める」を含む 3 択（≥2）が存在する

### Requirement: 評価可能（true / absent）のときは #689 の挙動と完全一致

When `canDeriveChangedFiles?.()` returns `true` or is absent, scope-check MUST behave identically to #689 (breach → escalation, no breach → pass), invoking the existing `listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings` path.

predicate が `true` または absent のとき、scope-check は #689 の現行経路を完全に維持する。禁止面に抵触する changed-files があれば breach finding を合成して `escalation`、無ければ `[]` を返して通過する。

#### Scenario: 評価可能 ＋ breach あり → escalation（#689 と一致）

**Given** `canDeriveChangedFiles()` が `true` を返す runtime で、禁止面に抵触する changed-files がある checkpoint
**When** その step の verdict を導出する
**Then** breach finding が合成され verdict は `escalation`（#689 と完全一致）

#### Scenario: 評価可能 ＋ breach なし → 通過（#689 と一致）

**Given** `canDeriveChangedFiles()` が `true` を返す runtime で、禁止面に抵触する changed-files が無い checkpoint
**When** その step の verdict を導出する
**Then** scope finding は合成されず verdict は `approved`（#689 と完全一致）

#### Scenario: predicate absent → #689 挙動

**Given** `canDeriveChangedFiles` を実装しない runtime で scope を宣言した checkpoint
**When** その step を実行する
**Then** `listChangedFiles` 経路で breach 判定が行われ、#689 と挙動が一致する

### Requirement: UNKNOWN finding は決定的で、人間解決済みは再 escalate しない

The synthesized UNKNOWN finding MUST be deterministic so the same runtime condition yields the same `computeFindingKey`, and once a human resolves it via the decision-ledger the same-key finding SHALL be excluded from subsequent verdict derivation (no re-escalation). Its key MUST be distinct from the #689 breach finding's key.

`synthesizeScopeUnverifiableFinding` は固定文言・決定的 anchor で UNKNOWN finding を作る。同一 runtime 条件なら `computeFindingKey` が一致し、一致する `DecisionRecord` が state にあれば `filterUndecidedFindings` で除外され再 escalate しない。breach finding とは title / rationale が異なるため key が衝突しない。

#### Scenario: 同一条件なら同一 key

**Given** 同一 slug の UNKNOWN finding を 2 回合成する
**When** それぞれに `computeFindingKey(checkpoint, finding)` を適用する
**Then** 2 つの key は一致する

#### Scenario: 解決済み UNKNOWN は再 escalate しない

**Given** UNKNOWN finding と一致する key の `DecisionRecord`（`step = checkpoint`）が state に存在する
**When** 同一条件から再び UNKNOWN finding が合成される
**Then** その finding は未決 finding から除外され、verdict は `escalation` にならない

#### Scenario: UNKNOWN finding と breach finding は別 key

**Given** 同一 slug の UNKNOWN finding と #689 の breach finding
**When** それぞれに `computeFindingKey` を適用する
**Then** 2 つの key は異なる（互いの decision が他方を抑止しない）

### Requirement: activation 不変・FindingResolution 不変・既定挙動不変

The reviewer activation consumer (`executor.ts:204`) MUST remain unchanged, the `FindingResolution` union SHALL stay exactly `fixable | decision-needed`, and a profile that does not declare `permissionScope` MUST behave identically to current behavior (early-guard `[]`).

reviewer activation は `listChangedFiles` の戻り値・契約に触れないため無改変（過少起動の fail-safe を維持）。`FindingResolution` の union は `fixable | decision-needed` の 2 値のまま。`permissionScope` 未宣言 profile では scope-check は early guard で `[]` を返し、既定挙動は完全一致する。

#### Scenario: activation の挙動・テストが無変更

**Given** reviewer activation の既存テスト（`executor-activation.test.ts` 等）
**When** 本 request 適用後にそれらを実行する
**Then** 無変更で green である

#### Scenario: FindingResolution union は 2 値のまま

**Given** finding の resolution 妥当値集合
**When** 妥当値を列挙する
**Then** 値は `fixable` と `decision-needed` の 2 つだけである（新 resolution 値なし）

#### Scenario: scope 未宣言 profile は現行と一致

**Given** `permissionScope` を宣言しない profile（`standard` / `design-only`）
**When** その profile で job を実行する
**Then** scope-check は early guard で `[]` を返し、verdict 導出・遷移は現行と完全一致する（既存テストが無変更で green）
