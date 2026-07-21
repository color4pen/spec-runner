# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. archive の events.jsonl 実証

`specrunner/changes/archive/2026-07-20-packaged-smoke-contract/events.jsonl` を読み込み、line 115 を確認。

- line 114（step-attempt）: `findingsPath: specrunner/changes/packaged-smoke-contract/spec-review-result-002.md`、`endedAt: 2026-07-20T13:28:47.719Z`、`commitOid: ca55144f4402cf68e68f172c4d70815c6a6cff39` ✓
- line 115（lineage）: `ts: 2026-07-20T13:28:47.719Z`、`outputs: [{path: ".../spec-review-result-003.md", hash: null}]` ✓
- inputs は `sha256:fff0f45acc...` 等、実ハッシュが記録されており null ではない（詳細は下記「Findings」参照）

### 2. commit-orchestrator.ts の根本原因

`src/core/step/commit-orchestrator.ts` を通読し、`commitSuccess` の処理順序を確認。

```
projectSuccess(state, step, result, findingsPath)
  → pushStepResult() で state.steps[step.name] に結果を追加（iteration カウント +1）
  → 更新後の s を保持

applySuccessPostPersistEffects(store, s, step, result, deps)
  → step.writes(s, deps) を呼び出す  ← s は既に更新済みの state
  → nextIteration(s, stepName) = length + 1 = 「次回」の iteration を返す
```

state 追記後に `writes()` を評価しているため iteration が +1 される。これが archive の 003 記録の原因。✓

### 3. spec-review.ts:89-93

```typescript
writes(state: JobState, deps: StepDeps): IoRef[] {
  return [
    { path: specReviewResultPath(deps.slug, nextIteration(state, STEP_NAMES.SPEC_REVIEW)) },
  ];
},
```

`nextIteration(state, stepName) = (state.steps?.[stepName]?.length ?? 0) + 1` であり、state 追記後に評価されると +1 ずれる。✓

### 4. 全 iteration 依存 step の writes() 確認

以下すべてで `nextIteration(state, stepName)` を使用していることを確認：
- `src/core/step/spec-review.ts:91` ✓
- `src/core/step/code-review.ts:135` ✓
- `src/core/step/conformance.ts:75` ✓
- `src/core/step/request-review.ts:75` ✓
- `src/core/step/custom-reviewer.ts:135` ✓
- `src/core/step/regression-gate.ts:127` ✓

### 5. digestArtifacts の hash 計算実装

`src/core/runtime/local.ts:1158-1171`: ファイルが存在すれば `sha256:{hex}` を返し、存在しなければ `hash: null` を返す実装が確認できた。managed runtime（`managed.ts:530-532`）は常に `hash: null` を返す（filesystem なし）。

### 6. 採用設計判断の妥当性

「state 追記前に writes() を評価して持ち回す」修正は `commitSuccess` の先頭で `step.writes(state, deps)` を呼び、その結果を `applySuccessPostPersistEffects` に渡すことで実現できる。`writes()` シグネチャ変更は不要。✓

`commitRound` でも同一の欠陥がある（全 member 折り畳み後の state で `applySuccessPostPersistEffects` を呼ぶ）。request のスコープは「同一欠陥があれば同修正を適用」と明記されており妥当。

## 検証できなかった項目

None。コード上で特定すべき主要な assertion はすべて確認できた。

## Findings 詳細

### 軽微な背景記述の不正確さ（ブロッカーなし）

request.md 背景欄の「outputs / inputs の hash は計算されず null のまま記録されており」は、local runtime での inputs については不正確。archive 実証（line 115）では inputs の hash は非 null（例：`sha256:fff0f45acc3325e84715cbbf273811a792652e1c2218428641e3be520e6bd502`）であり、hash 計算コードは既に存在・動作している。

outputs の `hash: null` は **パスが間違っているために該当ファイルが存在しないこと**が原因（`digestArtifacts` は存在しないファイルに `hash: null` を返す）。要件 #1（パス修正）を解決すれば要件 #2（hash 非 null）も local runtime では自動的に達成される。

managed runtime では filesystem がなく `digestArtifacts` は常に `hash: null` を返す実装になっている（これは構造的制限として文書化済み）。

この不正確さは修正スコープ・要件・設計判断に影響しないため、ブロッカーではない。
