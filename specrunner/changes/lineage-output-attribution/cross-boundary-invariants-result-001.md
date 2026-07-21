# Cross-Boundary Invariants Review — lineage-output-attribution — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した項目

### 1. スコープ確認
- `git diff main...HEAD --stat` — 変更ファイル: `src/core/step/commit-orchestrator.ts` 1 ファイル（+テスト・change folder artifacts）
- diff の全行を精読し、変更の意図（pre-push state での writes/reads 評価）を確認

### 2. `writes()` ↔ `resultFilePath()` 共有不変条件（ステップ別確認）

各 affected step が `writes()` と `resultFilePath()` で同一の `nextIteration(state, stepName)` 計算を使用することを確認。

| Step | writes() 計算式 | resultFilePath() 計算式 | 一致 |
|------|----------------|------------------------|------|
| spec-review | `nextIteration(state, "spec-review")` | `computeSpecReviewIteration(state)` = `(state.steps?.["spec-review"]?.length ?? 0) + 1` | ✓ |
| code-review | `nextIteration(state, "code-review")` | `computeCodeReviewIteration(state)` = 同上 | ✓ |
| conformance | `nextIteration(state, "conformance")` | `computeConformanceIteration(state)` = 同上 | ✓ |
| custom-reviewer | `nextIteration(state, snapshot.name)` | `nextIteration(state, snapshot.name)` | ✓ |
| regression-gate | `nextIteration(state, REGRESSION_GATE_STEP_NAME)` | `nextIteration(state, REGRESSION_GATE_STEP_NAME)` | ✓ |
| request-review | `nextIteration(state, "request-review")` | `nextIteration(state, "request-review")` | ✓ |

`commitSuccess` では `findingsPath = step.resultFilePath(state, deps)` と `preWriteIo = step.writes(state, deps)` が同じ pre-push `state` で評価される。パス計算式が同一であるため、lineage.outputs[0].path と StepRun.findingsPath は一致する。**不変条件は保持されている。**

### 3. `bite-evidence` 改竄検出との相互作用

`src/core/step/bite-evidence/tamper.ts` は `events.jsonl` の lineage records を参照し、`test-case-gen` ステップの `outputs.find(o => o.path.endsWith("test-cases.md"))` の hash を比較する。

- `TestCaseGenStep.writes()` は `writes(_state: JobState, deps)` — `_state` は未使用（非 iteration 依存）。常に `specrunner/changes/{slug}/test-cases.md` を返す。
- 変更前の `applySuccessPostPersistEffects` も `digestArtifacts` を呼んでいた（本修正はパスの正確性を直すものであり、digestArtifacts の呼び出し有無は変わらない）。
- test-case-gen のパスは iteration 依存でないため、変更前後でパスは同一 → hash 計算の有無・結果は同一。

**tamper check への影響なし。bite-evidence の動作不変条件は保持されている。**

### 4. `commitRound` での member 間分離不変条件

parallel round では各 member が異なる step name を持つ（custom reviewer は名前がユニーク）。
`nextIteration(state, stepName)` は `state.steps[stepName]` を参照するため、member A（step-a）の StepRun が accumulating state に追加されても、member B（step-b）の `nextIteration(state, "step-b")` は `base.steps["step-b"]` と同値になる（step-a は異なるキー）。

コード上の実装:
```typescript
// member A:
const preWriteIo_A = step_a.writes(state, deps);   // state = base
state = projectSuccess(state, step_a, ...);         // steps["step-a"] 追加

// member B:
const preWriteIo_B = step_b.writes(state, deps);   // state = base + step_a
// nextIteration(state, "step-b") = (state.steps?.["step-b"]?.length ?? 0) + 1
// = 0 + 1 = 1  ← step-a の追加に影響されない
```

TC-011 がこの不変条件を直接カバーしている（2-member 並列 round でそれぞれ -001 が返ることを確認）。**不変条件は保持されている。**

### 5. B-5 純粋関数不変条件

`step-types.ts` のコメント: `"Pure function — no I/O allowed (invariant B-5)"` — `writes()` / `reads()` は純粋関数。評価タイミングを pre-push に変更しても、同一 `(state, deps)` 入力に対して同一の値を返す。**B-5 不変条件は保持されている。**

### 6. `preWriteIo.length > 0` ガード等価性

変更前: `if (deps.runtimeStrategy && step.writes && deps.cwd) { const writes = step.writes(...); if (writes.length > 0) { ... } }`  
変更後: `if (deps.runtimeStrategy && preWriteIo.length > 0 && deps.cwd) { ... }`

`step.writes` が存在しない場合 `preWriteIo = []`、存在するが空配列を返す場合も `preWriteIo = []`。いずれも `length > 0` が false → lineage 非記録。意味的に等価。**ガード不変条件は保持されている。**

### 7. `preReadIo` の評価タイミング変化（観察）

変更前: `reads()` は `writes().length > 0` の内部でのみ呼ばれていた。  
変更後: `preReadIo = step.reads ? step.reads(state, deps) : []` が `commitSuccess`/`commitRound` で無条件に評価される。`preWriteIo` が空の場合、`preReadIo` は計算されるが使用されない。

全 affected step の `reads()` が `_state`（未使用）または state-independent な計算のみを行うことを確認（spec-review: `_state` 未使用、code-review: `_state` 未使用、custom-reviewer: `state: JobState` パラメータだが本体で state を参照しない、など）。B-5 により副作用なし。

**これは不変条件の違反ではないが、挙動の差異として記録する（observations に記載）。**

### 8. `IoRef` インポートパス

`import type { Step, AgentStep, IoRef } from "./types.js"` — `src/core/step/types.ts` は `export * from "../port/step-types.js"` であり、`IoRef` は `step-types.ts` で定義・export されている。typecheck green（verification-result.md 確認済み）。**型不変条件は保持されている。**

### 9. `commitRound` post-persist ループの `state` 参照

post-persist ループ: `applySuccessPostPersistEffects(store, state, step, result, deps, preWriteIo, preReadIo)` の `state` は fully-folded state（全 members + coordinator patch）。lineage 記録内では `state.branch` のみ参照（`digestArtifacts` の引数）。

両 runtime（local.ts / managed.ts）の `digestArtifacts` は `_branch: string | null` をアンダースコアで受け取り、使用しない。**branch 値の pre/post 差異は影響なし。**

---

## 検証できなかった項目

なし

---

## Findings 詳細

findings なし（observations 1 件）。

---

## 総評

変更は `commit-orchestrator.ts` の `applySuccessPostPersistEffects` 受け口を `IoRef[]` の事前計算値に切り替えるのみで、その評価ポイントが pre-push に移動する。

調査した全ての cross-boundary 相互作用において不変条件は保持されていた:
- `writes()` と `resultFilePath()` は同一 formula で同一 pre-push state を参照 → lineage パスと findingsPath が一致する
- `bite-evidence` tamper 検出は `test-case-gen`（非 iteration）のみを参照 → 変更の影響範囲外
- parallel round の member 間分離は step name が異なるため `nextIteration` で干渉しない
- B-5 純粋関数不変条件により評価タイミング変更は安全

blocking findings なし。
