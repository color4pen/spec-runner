# Cross-Boundary Invariants Review — evidence-base (Iteration 2)

**Reviewer**: cross-boundary-invariants
**Purpose**: diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Iteration 1 Findings の解消確認

### F-1: `BiteEvidenceRecord.candidateOid` JSDoc（low, fixable）→ RESOLVED

`src/state/schema/types.ts:384` の JSDoc が "commit OID of the branch HEAD at gate execution time
(green candidate = provenance-approved reachable tree, includes adopted operator commits)" に更新済み。
旧意味論（"implementer step OID"）は完全に除去された。✓

### F-3: `runTestsOnSynthesizedTree` tmp path discriminator なし（low, fixable）→ RESOLVED

`local.ts` の tmp path が `specrunner-bite-evidence-synth-${revDiscriminator}-${Date.now()}` に変更済み。
`revDiscriminator = baseRev.slice(0, 8).replace(/[^a-zA-Z0-9]/g, "")` で revision prefix を付与し、
`runTestsAtCommit` の `specrunner-bite-evidence-${oid.slice(0, 8)}-${Date.now()}` と名前空間が分離。✓

### F-2: `testDerivation` が `synthesizedCommits` 不在時に fail-closed（medium, decision-needed）→ コード修正済み・テスト未追加

`achieved-assurance.ts` の P2.5 ブロックが `if (floorConstrainsBite) { ... return ... }` で条件付けられ、
`testDerivation` のみを floor が要求する場合、`synthesizedCommits` 不在は `testDerivation` をブロックしなくなった。
コードは正しい挙動をする。

**残課題**: `achieved-assurance.test.ts` に追加されたテストは `floor: { biteEvidence: "required" }` で
`synthesizedCommits` 不在 → biteEvidence absent を確認するが、**testDerivation-only + synthesizedCommits 不在
→ testDerivation が依然 achieved できる**ことを検証するテストが存在しない。後退した場合に検出できない。

---

## Iteration 2 Invariant 検査

### I-1〜I-8: 前周確認済み不変条件の維持確認

前周（iteration 1）で確認した 8 つの不変条件（bootstrap commit anchor、git show の cwd、managed runtime
deferral、captureHeadSha null path、D6 ショートサーキット順序、blob freeze と EB 基底の共存、
RealRuntimeStrategy 必須化、detectBaseImplementationContamination 完全削除）を今周も検証した。

コード変更は `achieved-assurance.ts`、`gate.ts`、`types.ts`、`operations.ts`、
`achieved-assurance.test.ts`、`bite-evidence-record-schema.test.ts` に限定されており、
上記 8 不変条件のいずれも再確認した結果、依然成立している。✓

### I-9: gate の `headOid` が overlay source と green candidate の両方に使われる一貫性

`gate.ts` では `headOid = await captureHeadSha(cwd)` の単一スナップショットが:
- 赤側の overlay source: `runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, headOid, ...)` 
- 緑側の candidate: `runTestsAtCommit(headOid, testFiles, ...)`

に使われる。両呼び出しの間に HEAD が変わる可能性はあるが（理論上の race condition）、
gate 実行は job の isolated worktree 内で行われ、他プロセスがその worktree に commit することはない。
同一 `headOid` で red と green を評価するため snapshot 一貫性は保たれる。✓

### I-10: archive floor の `finalHeadOid` が overlay source と green candidate で一貫している

`achieved-assurance.ts` では `finalHeadOid` が:
- `runTestsOnSynthesizedTree(evidenceBaseRev, materializedTestFiles, finalHeadOid, ...)` の overlay source
- `runTestsAtCommit(finalHeadOid, materializedTestFiles, ...)` の green candidate

に使われる。さらに blob freeze（step b）が `baseOid`〜`finalHeadOid` 間の test file 不変性を検証しているため、
overlay content (`finalHeadOid` の test files) = `baseOid` の test files（freeze intact 時）が成立する。✓

### I-11: P3 runtime capability check が testDerivation-only シナリオでも `runTestsOnSynthesizedTree` を要求

`achieved-assurance.ts:252-264` の P3 ブロックは `floorConstrainsBite` の値に関わらず
`typeof runtime.runTestsOnSynthesizedTree !== "function"` を検査する。`testDerivation` は
`runTestsOnSynthesizedTree` を呼ばないにもかかわらず、このメソッドが runtime に存在しない場合、
P3 の early return により `testDerivation` も absent になる。

**実用上の影響**:
- `AssuranceProvenanceRuntime` 型は `runTestsOnSynthesizedTree` を Pick しており TypeScript が明示的に要求する
- `LocalRuntime` / `ManagedRuntime` は両方実装済み
- 全テスト fake も提供済み

よって、正規に型付けされた runtime では P3 は通過する。型システムが暗黙の依存を明示的にしており、
runtime 側の missing method → testDerivation absent という振る舞い変化は観測されない。

ただし、`testDerivation` の達成が `runTestsOnSynthesizedTree` の「存在」に依存するという事実は、
`testDerivation` の責任範囲を超えた依存として残る。

---

## Findings

### F-4: testDerivation-only + `synthesizedCommits` 不在の正しい挙動がピン不足

**File**: `src/core/archive/__tests__/achieved-assurance.test.ts`
**Severity**: low
**Resolution**: fixable

**Rationale**: P2.5 の条件化（`if (floorConstrainsBite)`）により、`testDerivation` のみを floor が
要求する場合は `synthesizedCommits` 不在でも `testDerivation` を達成できるようになった。
しかしこの正しい挙動を検証するテストが存在しない。追加されたテストは逆方向
（`biteEvidence`-only floor + synthesizedCommits 不在 → biteEvidence absent）のみを確認する。

将来の refactoring で P2.5 の guard を誤って削除または条件変更した場合に検出できない。

**推奨修正**: `floor: { testDerivation: "frozen" }` + `synthesizedCommits: undefined` +
他条件はすべて満たす状態で `testDerivation` が achieved されることを確認するテストを追加。

---

## Summary

| Finding | Severity | Resolution | 前周 |
|---------|----------|------------|------|
| F-4: testDerivation-only + synthesizedCommits 不在の正挙動にピン不足 | low | fixable | 新規（F-2 残課題） |

重大な cross-boundary invariant 違反は検出されなかった。

- F-1（candidateOid JSDoc）、F-3（tmp path discriminator）: 解消済み。
- F-2（testDerivation coupling）: コード修正済み、pinning test 追加なし → F-4 として引き継ぎ。
- I-1〜I-8（前周確認済み不変条件）: 継続成立。
- I-9〜I-11（新規検査不変条件）: 成立または型システムで担保済み。
