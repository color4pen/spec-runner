# Cross-Boundary-Invariants Review — round-inspection-fail-closed — iter 2

## Reviewer

cross-boundary-invariants  
目的: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

```
src/core/port/runtime-strategy.ts
src/core/runtime/local.ts
src/core/runtime/managed.ts
src/core/pipeline/parallel-review-round.ts
src/core/runtime/__tests__/local-round-git.test.ts
src/core/runtime/__tests__/managed-round-git.test.ts
src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts
```

---

## Methodology

iter 1 で `approved` を与えたが FINDING-1（inspection escalation 後も member statuses が approved に persist されることで resume の all-approved fast-path が inspection を skip する穴）を LOW として報告し、別 issue 扱いとした。

iter 2 では以下の 2 点を中心に検証する:

1. **FINDING-1 の修正確認** — D5（inspection escalation 後に `applyRoundResults` を呼ばない）が実装されているか、かつ resume 経路でも fail-closed が保たれるか。
2. **D5 実装が導入した新たな境界** — `inspectionEscalated` フラグの論理が既存機構（fast-path・member 部分承認・managed runtime）と矛盾しないか。

---

## Findings

### [FIXED] FINDING-1: inspection escalation 後の resume 穴（iter 1 報告）

iter 1 では `applyRoundResults` が inspection より先に呼ばれていたため、inspection escalation で member が approved に persist されていた。

**現在の実装（`parallel-review-round.ts` L226-293）**:

```typescript
let inspectionEscalated = false;
if (deps.runtimeStrategy?.listWorktreeChanges) {
  const inspection = await deps.runtimeStrategy.listWorktreeChanges(cwd);
  if (inspection.kind === "unavailable") {
    aggregateVerdictResult = "escalation";
    inspectionEscalated = true;
    roundError = { code: "ROUND_INSPECTION_UNAVAILABLE", ... };
  } else {
    const { toStage, offending } = partitionRoundChanges(...);
    if (offending.length > 0) {
      aggregateVerdictResult = "escalation";
      inspectionEscalated = true;
      roundError = { code: "ROUND_NONDECLARED_CHANGE", ... };
    } else if (toStage.length > 0) {
      await deps.runtimeStrategy.commitRoundArtifacts?.(...);
    }
  }
}
// --- 7c. Apply member results (fail-closed) ---
if (!inspectionEscalated) {
  statuses = applyRoundResults(statuses, memberVerdicts, headSha);
}
```

- `unavailable` と `ROUND_NONDECLARED_CHANGE` の両経路で `inspectionEscalated = true`。
- `applyRoundResults` は `!inspectionEscalated` の場合のみ呼ばれる。
- inspection escalation 後、`commitRound` には `reviewerStatuses: statuses`（`deriveReviewerStatuses` + `computeInvalidations` 後の値 = 全 member pending）が渡される。
- resume 時に `selectPendingMembers` が全 member を pending と評価し fan-out が再実行される。

**テスト（Scenario 8）**:

- "member statuses stay pending when inspection is unavailable" → `memberStatus(result.state, MEMBER_A) === "pending"` ✓
- "member statuses stay pending when there are undeclared changes" → 同 ✓
- "member statuses ARE approved when inspection succeeds (positive control)" → `memberStatus(result.state, MEMBER_A) === "approved"` ✓

FINDING-1 は D5 により完全に修正されており、resume 経路での fail-closed も保証されている。

---

### [OK] fast-path との境界（`pending.length === 0`）

fast-path（L142-147）は `pending.length === 0` の場合に実行される。`inspectionEscalated` は fast-path 分岐内では宣言されず、git effects ブロック自体が `else` 分岐に閉じている。

fast-path が実行される条件：全 member が approved または skipped として persist されている。D5 により、approved の persist は inspection 成功後のみ可能。よって fast-path が inspection を経ずに実行される場合は、全 member の approval がすでに検査済みの round で確定したことを意味する。

新たな invalidation が `computeInvalidations` によって生じた場合、該当 member が pending に戻り `pending.length > 0` となるため fast-path には入らない。境界に矛盾なし。

---

### [OK] managed runtime の `success:[]` と `inspectionEscalated` の相互作用

`ManagedRuntime.listWorktreeChanges` は `{kind:"success", paths:[]}` を返す。`inspectionEscalated` は false のまま、`partitionRoundChanges` が `toStage=[], offending=[]` を返し `commitRoundArtifacts` も `applyRoundResults` も呼ばれる（変更なし経路）。

managed での parallel custom reviewer は Non-Goal であり、managed member が local worktree に書かないという構造的事実が `success:[]` の根拠。D5 の導入後も managed 経路に変化なし。

---

### [OK] `inspectionEscalated` の初期化位置と論理完全性

`inspectionEscalated` は `else` 分岐（fan-out ブロック）のスコープで `false` に初期化され、inspection の各失敗経路でのみ `true` に設定される。`true` に設定された後、`false` に戻す経路は存在しない。`applyRoundResults` の呼び出し条件は `!inspectionEscalated` で単純かつ一元管理されており、複数の検査経路が競合する余地はない。

---

### [OBSERVATION] `infra` は inspection 前に構築される（iter 1 より継続）

`CommitPushInfra` オブジェクト（L230-234）は inspection の成否にかかわらず構築される。`unavailable` 経路では使われない。実害はないが、`success` 分岐内に移動すれば意図がより明確になる。iter 1 同様、変更は任意。

---

## Acceptance Criteria 確認

| 基準 | 確認結果 |
|------|----------|
| local: git status 非ゼロ終了 → `{kind:"unavailable"}` | ✓ test 固定済み |
| local: spawn 例外 → `{kind:"unavailable"}` | ✓ test 固定済み |
| local: exit 0 → `{kind:"success", paths}` | ✓ test 固定済み |
| managed: `{kind:"success", paths:[]}` | ✓ test 固定済み |
| consumer: `unavailable` → escalation, `roundError.code = "ROUND_INSPECTION_UNAVAILABLE"` | ✓ Scenario 7 固定済み |
| consumer: `unavailable` → `commitRoundArtifacts` 呼ばない | ✓ Scenario 7 固定済み |
| inspection escalation 後、member statuses が pending（resume fail-closed） | ✓ Scenario 8 固定済み（iter 2 新規） |
| inspection 成功時は member statuses が approved（正常経路） | ✓ Scenario 8 正制御固定済み |
| `success` 経路で宣言外変更検出・scoped commit が維持される | ✓ Scenario 1-5 継続 green |
| port doc comment から "Never throws — returns [] on any error" 削除 | ✓ 確認済み |
| `typecheck && test` が green | ✓ verification-result 全フェーズ passed（6707 tests） |

---

## Verdict

- **verdict**: approved

iter 1 で指摘した FINDING-1（inspection escalation 後の resume 穴）は D5 により修正済みであり、`inspectionEscalated` フラグと Scenario 8 テストで両方向（escalation 後 pending 維持・成功後 approved）を確認した。新たな cross-boundary invariant 違反は検出されなかった。
