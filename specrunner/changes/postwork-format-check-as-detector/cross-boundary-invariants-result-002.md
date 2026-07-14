# Cross-Boundary Invariants Review — postwork-format-check-as-detector

- **reviewer**: cross-boundary-invariants
- **verdict**: approved
- **iteration**: 002

## 観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装単体は正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## 前回 F-01 の修正確認

前回（iteration 001）の唯一の `needs-fix` 指摘:

> **F-01**: managed design step（SSE path）の `runDesignStyle` に `outputVerification` ループがなく、
> `policy: "follow-up"` が managed mode で `policy: "halt"` に黙って縮退する。

**確認結果: 修正済み** ✓

`src/adapter/managed-agent/agent-runner.ts` の `runDesignStyle`（L271–297）に
`runPollingStyle`（L534–558）と同構造の `outputVerification` ループが追加されている。

```typescript
// Output verification follow-up loop (D3: step-completion-verification).
// Runs after postWorkPrompts, only when outputVerification is configured.
const outputVerif = ctx.policy?.outputVerification;
if (outputVerif) {
  for (let attempt = 1; attempt <= outputVerif.maxAttempts; attempt++) {
    ...
    const followUpViolations = checkResult.violations.filter((v) => v.policy === "follow-up");
    if (followUpViolations.length === 0) break;
    ...
    await this.executeFollowUpTurn(sessionId, ctx.step, repairPrompt, effectiveTimeoutMs);
    followUpAttempts++;
  }
}
```

両 runner（SSE path / polling path）で `outputVerification` ループの有無が揃い、
`policy: "follow-up"` セマンティクスが local / managed 対称になった。

---

## Findings（iteration 002）

新たな cross-boundary invariant 違反は検出されなかった。以下、主要な不変条件の確認結果を記録する。

### ✓ I-01: `outputVerification.detect()` クロージャの `branch` 捕捉

`step-context-builder.ts` の `outputVerification` 設定（L112–118）は `branch = state.branch ?? null`
を closure でキャプチャする。design step が `setsBranch: true` を持つため「最初の実行で
`state.branch === null` になるのでは？」という懸念を確認した。

**確認結果**: `runner.ts`（L155–160）が `setupWorkspace()` の戻り値 `{ branch }` を
pipeline 実行前に `jobState.branch` へ反映する。managed runtime の `setupWorkspace` も
`git checkout -b` + push 完了後に `{ branch: branchName }` を返す（L255）。
よって `buildStepContext` 呼び出し時点で `state.branch` は常に設定済み。
managed mode での `outputVerification.detect()` は null branch で呼ばれない。

### ✓ I-02: code-review `nextIteration` の一貫性

`outputContracts(state, deps)` と `writes(state, deps)` はいずれも
`nextIteration(state, STEP_NAMES.CODE_REVIEW)` で iteration を計算する。

**確認結果**: `nextIteration` は `(state.steps?.CODE_REVIEW?.length ?? 0) + 1` の純関数。
executor の `runAgentStep` 内で `state` は CommitOrchestrator による外部更新がない（状態変更は
`runAgentStep` 完了後）。`buildStepContext`→runner→`buildAllOutputContracts` の全呼び出しで
同一 `state` を参照するため、iteration 値は一貫。

### ✓ I-03: SPEC_TEMPLATE のマーカーは全て HTML コメント内

`SPEC_TEMPLATE` の `### Requirement:`、`#### Scenario:`、`SHALL` キーワードはすべて
`<!-- SPEC WRITING GUIDANCE ... -->` ブロック内に収まっている（L294–333）。
`stripHtmlComments` 後の残存テキストは `# Spec:\n\n## Requirements\n\n` のみであり、
3 つの presence check はすべて失敗する。

**不変条件の保存確認**:
- scaffold 未書き換え spec.md → `produced`（halt）＋`content-format`（follow-up）双方が違反
- runner 内 `outputVerification` ループは follow-up 違反のみ repair 対象（`filter((v) => v.policy === "follow-up")`）
- `produced`（halt）違反は executor の final gate で捕捉 → scaffold 未書き換えで pipeline が halt するという既存不変は保存

### ✓ I-04: 既存 `tasks-complete` との対称性

`spec-exempt-runtime.test.ts`（T-04 group）が `buildAllOutputContracts` → `validateStepOutputs`
の組み合わせで chore（spec-exempt）と bug-fix（spec-required）の両方をカバー。
`produced` + `content-format` の共存（spec-required の design step）と
SPEC_EXEMPT_NOTE 未違反（chore の design step）が実測確認されている。

### ✓ I-05: executor final gate の二重チェック構造

executor の final gate（L394–408）は `buildAllOutputContracts`（produced + content-format）で
`validateStepOutputs` を呼び直す。runner 内の `outputVerification` ループは `followUpContracts`
（policy: "follow-up" のみ）に限定して detect するため:

| phase | 対象 | 役割 |
|-------|------|------|
| runner 内 outputVerification | follow-up contracts のみ | in-session repair（最大 2 回） |
| executor final gate | 全 contracts（produced + content-format） | 残存違反の最終判定 |

二層構造は `tasks-complete` と同一で既存設計の対称性を保つ。新たな invariant 破れなし。

---

## 残余 Advisory（非ブロッキング、前回 F-02 の継続）

`buildOutputFollowUpPrompt` が content-format 違反の repair prompt に
"After completing the work, commit and push your changes." を付与する（全違反種別共通）。
design step の local mode では CLI が `finalizeStepArtifacts` で commit するため redundant。

ただし `finalizeStepArtifacts` 内の `commitAndPush` は `git diff --cached --quiet` で
staged changes を確認し、変更がなければ no-op で return する（`src/core/step/commit-push.ts` L107–111）。
agent が repair ターンで commit 済みの場合、no staged changes → no-op → 機能的ブレークなし。

前回同様 advisory（functional break なし）として記録するが、needs-fix には分類しない。

---

## 判断根拠

- F-01（iteration 001 の唯一の needs-fix）は修正済み。managed design step の `outputVerification`
  ループが追加され、local / managed 両 path で `policy: "follow-up"` セマンティクスが対称になった。
- I-01〜I-05 の確認で、diff が変更していないコードとの相互作用に新たな invariant 破れは検出されなかった。
- 502 test files / 6892 tests が green であり、既存 pipeline 遷移の観測挙動は不変。
