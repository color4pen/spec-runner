# Cross-Boundary Invariants Review — pipeline-selection-capability-gate — iter 2

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## 再調査の焦点

iter 1 は INV-8（`pipeline: design-only` ＋ custom reviewers → orphaned reviewer snapshots）を `decision-needed` として toolResult に含め、system ルール（`decision-needed ≥ 1 → escalation`）により escalation に流れた。iter 2 では、INV-8 を破る具体的な実行列をコードから構成できるかを精査し、確定判定を下す。

---

## INV-8 詳細精査（iter 2 新規調査）

### 対象シナリオ

リポジトリに `specrunner/reviewers/*.md` が存在する状態で、request.md Meta に `pipeline: design-only` を指定して `specrunner run` を実行する。

### 具体的実行列

```
Step 1: loadReviewerDefinitions() → [{name: "cross-boundary-invariants", ...}] (非空)
Step 2: pipelineId = "design-only"
Step 3: descriptor = getPipelineDescriptor("design-only") → DESIGN_ONLY_DESCRIPTOR
Step 4: assertRuntimeSupportsScope(DESIGN_ONLY_DESCRIPTOR, ...) → pass
         (DESIGN_ONLY_DESCRIPTOR.permissionScope === undefined → gate は通過)
Step 5: bootstrapJob(...) → jobState.pipelineId = "design-only"
Step 6: reviewers.length > 0 → jobState.reviewers = [{name: "cross-boundary-invariants"}]
Step 7: (state 永続化後) buildPipelineForJob(jobState, deps) が呼ばれる
Step 8: base = DESIGN_ONLY_DESCRIPTOR
         descriptor = composeReviewerDescriptor(DESIGN_ONLY_DESCRIPTOR, reviewers)
```

`composeReviewerDescriptor` の挙動（DESIGN_ONLY を base とした場合）:

```
- conformanceIdx = baseSteps.findIndex(CONFORMANCE) → -1
  → insertIdx = baseSteps.length (末尾追加、defensive 対応済み)
- newSteps = [["design", DesignStep], ["cross-boundary-invariants", customStep], ["regression-gate", gateStep]]
- conformanceTransIdx = -1 → insertTransIdx = baseTransitions.length
- newTransitions = [
    {step:"design", on:"success", to:"end"},
    {step:"design", on:"error",   to:"escalate"},
    ...(reviewer chain transitions: code-fixer / conformance を参照するが、
        これらは design-only の steps map に存在しない)
  ]
- loopNames = ["design", "cross-boundary-invariants", "regression-gate"]
- loopFixerPairs = {"cross-boundary-invariants": "code-fixer", "regression-gate": "code-fixer"}
```

```
Step 9: Pipeline.run("design", jobState, deps) 開始
Step 10: design step 実行 → outcome = "success"
Step 11: transitions.find(step="design", on="success") → {to: "end"} ← 最初にマッチ
Step 12: nextStep = "end" → terminal → break
         zombie steps (cross-boundary-invariants, regression-gate) は一度も参照されない
Step 13: pipeline 正常終了 (awaiting-archive)
```

### 隣接コードの前提チェック

| コード | `state.reviewers` を読む条件 | design-only で実行されるか |
|--------|------------------------------|---------------------------|
| `deriveImplReviewerChain(state)` in `regression-gate.buildMessage` | regression-gate step が実行されたとき | ❌ (design-only では不到達) |
| `deriveImplFixerChain(state)` in `code-fixer.ts` | code-fixer step が実行されたとき | ❌ (steps map に code-fixer なし) |
| `collectFindingsLedger(state, chain)` | regression-gate 経由 | ❌ 同上 |
| `composeReviewerDescriptor(base, jobState.reviewers)` | `buildPipelineForJob` / `runPipeline` | ✓ 実行される |

`composeReviewerDescriptor` は `conformanceIdx === -1` の場合を明示的に `baseSteps.length` にフォールバックしており（`src/core/pipeline/compose-reviewers.ts:47-48`）、DESIGN_ONLY_DESCRIPTOR を渡した場合も例外にならない。

**zombie steps が steps map に存在するが、zombie step への遷移を発生させる transition が存在しない**（design-only の transition は `design→success→end` と `design→error→escalate` のみ）。`Pipeline.runInternal` は transition を経ずにステップを実行する経路を持たない。

### 破れる不変条件を構成できるか

**構成できない。**

- 既存コードの中に「`state.reviewers` が非空ならば reviewer step は実行済み」という前提を持つコードは存在しない。`reviewers` フィールドは "pipeline 構成の snapshot"（`pipeline-run.ts:106` コメント参照）であり、実行完了の証拠として設計されていない。
- zombie steps を持つ composed descriptor が構築されるが、pipeline の実行列は `design → end` に限定されるため、zombie steps は実行されず、steps map の "Step not found" エラーも発生しない。
- アーカイブ・job-show・ps 等の downstream ツールは `state.reviewers` を読まない（`src/core/archive/orchestrator.ts` 精読、`reviewers` 参照なし）。

### 判定

**不変条件違反なし。** 機能的正しさに影響しない data consistency の非対称性（reviewers in state but not executed）は存在するが、これを読んで誤動作する既存コードは存在しない。LOW の観察事項として記録するが、merge を妨げる finding としない。

---

## 全 INV チェック（iter 1 継続）

iter 1 の INV-1〜INV-7 は変更なし（approved 維持）。

| # | 不変条件 | 判定 |
|---|---------|------|
| INV-1 | parser → pipeline DSM 方向 | ✓ 維持 |
| INV-2 | gate が bootstrapJob 前に介在 | ✓ 維持 |
| INV-3 | canDeriveChangedFiles optional 意味論（#692） | ✓ 維持 |
| INV-4 | gate が profile 名に依存しない | ✓ 維持 |
| INV-5 | PIPELINE_REGISTRY の production 不変性 | ✓ 維持 |
| INV-6 | UnsupportedRuntimeCapabilityError 伝播経路 | ✓ 維持 |
| INV-7 | resume 経路は gate 対象外（設計による） | ✓ 設計通り |
| INV-8 | design-only + custom reviewers: zombie steps が不変条件を破るか | **破らない** ✓ |

---

## サマリー

iter 1 の escalation の原因は INV-8 を `decision-needed` として toolResult に含めたことによる自動 escalation であり、実際の不変条件違反ではなかった。コードを精読し実行列を構成した結果、`pipeline: design-only + custom reviewers` シナリオは:

1. pipeline を正常に実行する（design → end）
2. zombie steps（custom reviewers / regression-gate）を実行しない
3. `state.reviewers` を読んで誤動作する既存コードが存在しない

以上から、全 INV について不変条件が維持されることを確認。**approved**。
