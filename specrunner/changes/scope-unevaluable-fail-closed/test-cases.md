# Test Cases: scope 評価不能 runtime の fail-closed escalation

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 22
- **Manual**: 4
- **Priority**: must: 22, should: 4, could: 0

---

## T-01 領域: RuntimeStrategy optional predicate の追加（port・additive）

### TC-001: predicate 未実装 runtime はフォールスルー

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: RuntimeStrategy は任意の評価可能性 predicate を持ち、absent はフォールスルー（評価可能扱い） > Scenario: predicate 未実装 runtime はフォールスルー

### TC-002: 型は optional として predicate を受け付ける（既存 fake は TS2741 なし）

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: RuntimeStrategy は任意の評価可能性 predicate を持ち、absent はフォールスルー（評価可能扱い） > Scenario: 型は optional として predicate を受け付ける

### TC-003: `RealRuntimeStrategy` 型エイリアスが port から export される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/core/port/runtime-strategy.ts` に `canDeriveChangedFiles?(): boolean` と `RealRuntimeStrategy` の追加が適用された状態
**WHEN** `RealRuntimeStrategy` を port から import して型チェックする
**THEN** `RuntimeStrategy & { canDeriveChangedFiles(): boolean }` の交差型として export されており、`canDeriveChangedFiles` は必須 method になっている

---

## T-02 領域: 実 runtime への predicate 実装（型レベル mechanical 固定）

### TC-004: local は true、managed は false

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 実 runtime は predicate を実装し、mechanical に固定される > Scenario: local は true、managed は false

### TC-005: 実 runtime の predicate 実装漏れがコンパイル時に落ちる

**Category**: manual
**Priority**: should
**Source**: spec.md > Requirement: 実 runtime は predicate を実装し、mechanical に固定される > Scenario: 実 runtime の predicate 実装漏れがコンパイル時に落ちる

### TC-006: `runtimeStrategy: this` の部分型代入が型エラーなく通る

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `LocalRuntime` / `ManagedRuntime` を `implements RealRuntimeStrategy` に変更した状態
**WHEN** `bun run typecheck` を実行する
**THEN** `runtimeStrategy: this`（field 型 `runtimeStrategy?: RuntimeStrategy`）の代入箇所で型エラーが発生しない（`RealRuntimeStrategy` は `RuntimeStrategy` の部分型なので代入可能）

---

## T-03 領域: bare implements 不在の arch test backstop

### TC-007: bare implements の不在を arch test が固定する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 実 runtime は predicate を実装し、mechanical に固定される > Scenario: bare implements の不在を arch test が固定する

### TC-008: arch test の grep pattern が `implements RealRuntimeStrategy` 行を誤検出しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D3

**GIVEN** `src/core/runtime/` 配下の具象クラスが `implements RealRuntimeStrategy` を使っている状態（bare `implements RuntimeStrategy` は存在しない）
**WHEN** bare `implements RuntimeStrategy` の不在を検証する arch test を実行する
**THEN** `implements RealRuntimeStrategy` を含む行がパターンにマッチせず、false positive が出ない（grep パターンが `RealRuntimeStrategy` を正しく除外する）

### TC-009: arch test が `tests/` 配下を scan 対象外とする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `tests/` 配下に `canDeriveChangedFiles` を持たない `implements RuntimeStrategy` の test fake が存在する
**WHEN** bare `implements RuntimeStrategy` の不在を検証する arch test を実行する
**THEN** `tests/` 配下はスキャン対象外とされ、当該 fake が存在してもアサーションが green になる

---

## T-04 領域: `listChangedFiles` 契約の無変更

### TC-010: listChangedFiles の既存挙動が保たれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: listChangedFiles の戻り値型・契約は無変更 > Scenario: listChangedFiles の既存挙動が保たれる

---

## T-05 領域: fail-closed 分岐の配線（scope-check）

### TC-011: 評価不能で scope 宣言ありの checkpoint は UNKNOWN escalation に落ちる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 評価不能 runtime ＋ scope 宣言 ＋ checkpoint で fail-closed escalation する > Scenario: 評価不能で scope 宣言ありの checkpoint は UNKNOWN escalation に落ちる

### TC-012: predicate=false 時に `listChangedFiles` が呼ばれない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `canDeriveChangedFiles: () => false` を明示した fake runtime で、`permissionScope` 宣言ありの checkpoint step を用意し、`listChangedFiles` を spy で監視する
**WHEN** `computeExtraScopeFindings` を呼び出す
**THEN** spy の呼び出し回数が 0 件であり（`listChangedFiles` は一切呼ばれず）、UNKNOWN な `decision-needed` finding が返る

### TC-013: UNKNOWN finding は ≥2 options を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 評価不能 runtime ＋ scope 宣言 ＋ checkpoint で fail-closed escalation する > Scenario: UNKNOWN finding は ≥2 options を持つ

---

## T-06 領域: UNKNOWN finding の合成純関数（scope.ts）

### TC-014: 同一条件なら同一 key

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: UNKNOWN finding は決定的で、人間解決済みは再 escalate しない > Scenario: 同一条件なら同一 key

### TC-015: UNKNOWN finding と breach finding は別 key

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: UNKNOWN finding は決定的で、人間解決済みは再 escalate しない > Scenario: UNKNOWN finding と breach finding は別 key

### TC-016: `synthesizeScopeUnverifiableFinding` の finding 属性が正しい（origin / resolution / severity）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** 任意の `{ slug }` を持つ `SynthesisContext`
**WHEN** `synthesizeScopeUnverifiableFinding(ctx)` を呼び出す
**THEN** 返す finding の `origin` が `"scope"`、`resolution` が `"decision-needed"`、`severity` が `"high"` であり、`file` が `specrunner/changes/${slug}/request.md` に一致する

---

## T-06 領域: 統合 escalation フロー

### TC-017: 評価不能 ＋ scope 宣言 ＋ checkpoint で `awaiting-resume` に遷移し `resumePoint.step` が checkpoint になる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `permissionScope` 宣言あり・`canDeriveChangedFiles: () => false` の fake runtime で checkpoint step を実行する
**WHEN** `StepExecutor` が verdict を導出し job 状態を更新する
**THEN** job が `awaiting-resume` に遷移し、`resumePoint.step` が当該 checkpoint step 名と一致する

### TC-018: 解決済み UNKNOWN は再 escalate しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: UNKNOWN finding は決定的で、人間解決済みは再 escalate しない > Scenario: 解決済み UNKNOWN は再 escalate しない

### TC-019: UNKNOWN finding が escalation コメントで title・rationale・options を描画する

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** UNKNOWN finding（title / rationale / 3 択 options を持つ）が合成された状態
**WHEN** `buildEscalationComment` に渡して escalation コメントを生成する
**THEN** title・rationale・3 択 options（導出可能 runtime での再実行 / permissionScope 宣言を外す / リスク受容）が「Decisions needed」セクションに描画される（issue-notifier 本体は無改変）

---

## T-07 領域: 評価可能経路の #689 parity

### TC-020: 評価可能 ＋ breach あり → escalation（#689 と一致）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 評価可能（true / absent）のときは #689 の挙動と完全一致 > Scenario: 評価可能 ＋ breach あり → escalation（#689 と一致）

### TC-021: 評価可能 ＋ breach なし → 通過（#689 と一致）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 評価可能（true / absent）のときは #689 の挙動と完全一致 > Scenario: 評価可能 ＋ breach なし → 通過（#689 と一致）

### TC-022: predicate absent → #689 挙動

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 評価可能（true / absent）のときは #689 の挙動と完全一致 > Scenario: predicate absent → #689 挙動

---

## T-07 領域: activation 不変・FindingResolution 不変・既定挙動不変

### TC-023: activation の挙動・テストが無変更

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: activation 不変・FindingResolution 不変・既定挙動不変 > Scenario: activation の挙動・テストが無変更

### TC-024: FindingResolution union は 2 値のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: activation 不変・FindingResolution 不変・既定挙動不変 > Scenario: FindingResolution union は 2 値のまま

### TC-025: scope 未宣言 profile は現行と一致

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: activation 不変・FindingResolution 不変・既定挙動不変 > Scenario: scope 未宣言 profile は現行と一致

---

## T-08 領域: 全体検証

### TC-026: DSM closure が green（新純関数は domain、predicate は port）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 / design.md > D4

**GIVEN** `synthesizeScopeUnverifiableFinding` が `src/core/pipeline/scope.ts` に配置され、`scope-check.ts` が runtime 具象クラスを直接 import していない状態
**WHEN** arch 不変条件テスト（B-1〜B-10 ＋ DSM closure）を実行する
**THEN** 新純関数が domain レイヤ（`core/pipeline/`）に存在し、`scope-check.ts` が adapter を import しておらず、DSM 依存方向が green になる

---

## Result

```yaml
result: completed
total: 26
automated: 22
manual: 4
must: 22
should: 4
could: 0
blocked_reasons: []
```
