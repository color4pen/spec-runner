# Cross-Boundary Invariants Review — test-coverage-violation-detail — iter 1

## Reviewer

cross-boundary-invariants

## Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Invariants Examined

以下の 8 境界を走査した。

### INV-1: executor 最終ゲートの halt 条件

**対象 (unchanged)**: `src/core/step/executor.ts:406-422`

```ts
const { followUp, halt: haltViolations } = partitionByPolicy(checkResult);
if (haltViolations.length > 0 || followUp.length > 0) {
  const allViolations = [...haltViolations, ...followUp];
  const halt = makeOutputGateHalt(allViolations, ...);
  return { kind: "halt", halt };
}
```

**変化前**: test-coverage 違反 → `haltViolations = [v]`, `followUp = []` → halt
**変化後**: test-coverage 違反 → `haltViolations = []`, `followUp = [v]` → halt

条件式は `||` で結合されているため、follow-up 側に移っても halt 経路は変わらない。
`allViolations = [...haltViolations, ...followUp]` は同じ violation を持ち、`makeOutputGateHalt` に渡る。

**判定**: 不変条件維持 ✓

---

### INV-2: agent-runner 修復ループの guard

**対象 (unchanged)**: `src/adapter/claude-code/agent-runner.ts:938-989`

```ts
const outputVerif = ctx.policy?.outputVerification;
if (outputVerif && extractedSessionId) {
  for (let attempt = 1; attempt <= outputVerif.maxAttempts; attempt++) {
    ...
    const followUpViolations = checkResult.violations.filter((v) => v.policy === "follow-up");
    if (followUpViolations.length === 0) break;
    ...
  }
}
```

変更前 test-materialize は follow-up 契約ゼロ → `outputVerif === undefined` → ループ非実行。
変更後 → `outputVerif` が定義される → ループが初めて実行される。

ループ内部は `v.policy === "follow-up"` でフィルタするため、halt 違反が混入してもループには乗らない。
`extractedSessionId` が確立されない（エラーケース）では skip されることも確認。

**判定**: 不変条件維持 ✓

---

### INV-3: step-context-builder の follow-up 契約フィルタ

**対象 (unchanged)**: `src/core/step/step-context-builder.ts:111-121`

```ts
const followUpContracts: OutputContract[] = (step.outputContracts?.(state, deps) ?? [])
  .filter((c) => c.policy === "follow-up");
if (followUpContracts.length > 0) { ... }
```

test-materialize は `writes()` が gitState のみ → `producedContractsFromWrites` は 0 件。
`step.outputContracts` が test-coverage (follow-up) を 1 件返す → `followUpContracts = [test-coverage]`。

`outputVerification.detect` は `strategy.validateStepOutputs(followUpContracts, ...)` にバインドされ、
test-coverage のみを評価する。produced 契約は halt policy のみで、ここには含まれない。

**判定**: 不変条件維持 ✓

---

### INV-4: managed runtime の test-coverage skip 保存

**対象 (unchanged)**: `src/core/runtime/managed.ts:482-487`

```ts
} else if (contract.kind === "test-coverage") {
  // ManagedRuntime does not have access to a local worktree ...
  // Skip without violation
}
```

変更は local runtime の violation 生成のみ。managed runtime の `test-coverage` 分岐は無変更。
TC-012 でも検証済み（managed は violations 0 件を返す）。

**判定**: 不変条件維持 ✓

---

### INV-5: `OutputViolation.detail` 後方互換

**対象 (changed in local.ts, format unchanged)**: `src/core/runtime/local.ts:1331`

```ts
const detail = [...result.missingTcIds, ...result.assertionlessTcIds];
```

`detail` は変更前と同一の `[...missing, ...assertionless]` union を維持する。
`coverage` は**追加**フィールドであり、`detail` の意味を置き換えない。

既存テスト TC-TMB-13 は `detail` の内容を直接検査しており、`coverage` 追加後も無変更で green。
verification-result.md: 9637 passed (全テスト green) で確認。

**判定**: 不変条件維持 ✓

---

### INV-6: tasks-complete / content-format 修復プロンプトの無変更

**対象 (changed: new section added)**: `src/core/step/output-verify.ts: buildOutputFollowUpPrompt`

追加された `if (testCoverageViolations.length > 0) {...}` ブロックは既存の 3 節の**後**に配置。
既存の `tasksViolations` / `producedViolations` / `contentFormatViolations` 節はコードレベルで無変更。

content-format-detection.test.ts の T-07 が示す halt メッセージはこの変更の影響を受けない。
（`makeOutputGateHalt` の content-format 分岐も無変更）

**判定**: 不変条件維持 ✓

---

### INV-7: test-coverage 違反 → halt 経路での `coverage` フィールド生成

**対象**: executor final gate が violation を再生成する経路

executor 最終ゲート（INV-1）は `strategy.validateStepOutputs(allContracts, cwd, branch)` を**新たに呼ぶ**。
この呼び出しが local.ts の test-coverage 分岐を通り、`coverage` フィールドを**その場で生成**する。

agent-runner の follow-up ループが検出した violation の `coverage` を使うのではなく、
executor ゲートは常に最新の評価結果から `coverage` を構築する。二重管理なし。

`makeOutputGateHalt` に渡る違反には最新の `coverage` が含まれる → TC-ID 描画は正確。

**判定**: 不変条件維持 ✓

---

### INV-8: test-cases.md 欠如時の fall-back

**対象**: `src/core/runtime/local.ts:1324-1326` (unchanged path)

```ts
} catch {
  violations.push({ kind: ..., detail: ["test-cases.md not found"] });
  // coverage フィールドなし
  continue;
}
```

`coverage` が undefined の違反に対して:
- `formatTestCoverageViolationPath`: `cov` が falsy → `"see file"` fall-back ✓
- `buildOutputFollowUpPrompt`: `!cov || (both empty)` → `fallbackPaths` に追加 ✓

TC-009, TC-014 がそれぞれこの経路を固定している。

**判定**: 不変条件維持 ✓

---

## Observations（参考情報）

### OBS-1: tasks.md T-07 注記が stale — 実態は全テスト green

`tasks.md` T-07 注記には:

> **注記 — TC-001 / TC-008 の RED（operator 確認要）**
> ...
> - `"// TC-002 placeholder — no expect() here\n"` (TC-001)
> - `"// TC-002 placeholder — no expect() call\n"` (TC-008)
> 修正方法（operator 判断）: ...

と記載されているが、`verification-result.md` は **9637 passed (0 failed)** を示す。

実際のテストファイル（`test-coverage-violation-detail.test.ts`）では:
- TC-001 fixture: `"// TC-002 placeholder — no assertion here\n"` (`expect(` 不在)
- TC-008 fixture: `"// TC-002 placeholder — no assertion call\n"` (`expect(` 不在)

実装者がフィクスチャ文字列を修正済みだが tasks.md 注記を更新しなかった。
後続レビュアーが「未解決の判断事項あり」と誤解するリスクがある。
コード・テストの正確性は毀損されていない。

### OBS-2: ASSERTION_RE のファイルレベルスコープ（既存動作）

`evaluateTestCoverage` の assertion チェック:

```ts
const ASSERTION_RE = /expect\(|assert\(|assert\./;
const hasAssertion = filesWithTc.some((text) => ASSERTION_RE.test(text));
```

TC-ID が含まれるファイル全体に対して `expect(` の有無を検索する（TC-ID 付近のみではない）。
関係のない `expect(` が同一ファイルにある場合、そのファイルの TC は "has assertion" と分類される。

この false-negative は follow-up prompt の assertionless 列挙が不完全になる可能性を持つが、
**本変更以前から存在する動作**であり、スコープ外（「coverage 判定ロジックの変更」は Non-Goals）。
新機能は評価済み結果を伝えるだけであり、評価ロジックは無変更。

---

## Verdict Basis

全 8 境界において既存の不変条件が維持されていることを確認した。
Critical / high findings はゼロ。Observations は 2 件（いずれもコード正確性に影響しない）。
