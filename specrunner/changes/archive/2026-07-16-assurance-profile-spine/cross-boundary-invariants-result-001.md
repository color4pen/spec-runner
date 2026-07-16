# Cross-Boundary Invariants Review — assurance-profile-spine — iter 001

- **verdict**: approved
- **iteration**: 001

## 観点と調査経路

diff の周囲を歩き、**変更されていない側のコード**が置いている前提が新経路で崩れていないかを検証した。

調査したファイルと経路:

1. `src/core/attach/verify-checkpoint.ts` — profile 検証の挿入位置と順序、materialize 前の保証
2. `src/core/attach/orchestrator.ts` → `src/cli/attach.ts` — 検証後の materialize フロー
3. `src/state/lifecycle.ts` — `TransitionContext.patch` の `Omit` が profile を除外しているか
4. `src/store/job-state-store.ts` — `update()` の patch 型、`appendStepRun` / `appendHistory` の spread 保持
5. `src/core/agent/registry.ts` — shim 経由の `hashObject` 呼び出し連続性
6. `tests/unit/architecture/core-invariants.test.ts` — B-3（shared-kernel→domain 禁止）、B-4（leaf 外部 import 禁止）の静的境界検査
7. `tests/attach/verify-checkpoint.test.ts` — TC-VC-015/016/017/018 の網羅範囲

## 不変条件の検証結果

### INV-1: B-3 closure model — `state/profile.ts` が `core/` を import しない

`src/state/profile.ts` の import:
- `./schema.js`（同一 shared-kernel 層）
- `../util/hash.js`（leaf 層、B-3 上 ✓）

shared-kernel→domain の新規上向き edge は発生していない。`core-invariants.test.ts` の B-3 テストが green（514 files / 7071 tests passed）であることが verification-result で確認済み。**維持** ✓

### INV-2: B-4 closure model — `util/hash.ts` が他の src/ を import しない

`src/util/hash.ts` は `node:crypto` のみを import。B-4 テストが green。**維持** ✓

### INV-3: profile 検証が materialize より前に走る（fail-closed 前提）

既存の attach 設計の前提は「`verifyCheckpoint` は pure predicate — 失敗時に job state / worktree / sidecar を一切作らない」。

実行経路を追跡:
1. `runAttachVerification`（orchestrator.ts:46）が `verifyCheckpoint` を呼び、`VerifiedCheckpoint` を返す（または throw）
2. CLI `runAttach`（attach.ts:103）は `runAttachVerification` の結果を受けてから `runtime.setupWorkspace`（:137）を呼ぶ

profile 検証ブロック（verify-checkpoint.ts:150-169）は `verifyCheckpoint` 内で実行されるため、materialize に到達する前に throw できる。新経路（profile 検証あり）を通っても、この前提は保たれる。**維持** ✓

### INV-4: `transitionJob` 経由での profile 上書き禁止

`TransitionContext.patch` の型（lifecycle.ts:24）:
```typescript
patch?: Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "status" | "history" | "profile">>
```

`"profile"` が明示的に除外されており、`transitionJob` 内で `ctx.patch` を spread しても profile は上書きされない。**維持** ✓

### INV-5: `JobStateStore.update()` 経由での profile 上書き禁止

`update()` の patch 型（job-state-store.ts:281）:
```typescript
patch: Partial<Omit<JobState, "version" | "jobId" | "createdAt" | "profile">>
```

`"profile"` を除外。`update()` 内の `{ ...state, ...patch, updatedAt: ... }` で state の profile は保持される。**維持** ✓

### INV-6: 全 state 書き換え経路での profile 透過

- `appendStepRun`（:321）: `{ ...state, steps: {...}, updatedAt: ... }` — profile 保持 ✓
- `appendHistory`（schema/operations.ts:14）: `{ ...state, history, updatedAt: ... }` — profile 保持 ✓
- `fail()`（:300）: `transitionJob` 経由（INV-4 で保護済み）✓

いずれの経路でも `profile` フィールドの clobber は発生しない。**維持** ✓

### INV-7: `hashObject` の決定性 — 移設後の連続性

`src/core/agent/hash.ts` が shim に変わり、`registry.ts` が shim 経由で `hashObject` を使う。Module cache により `src/core/agent/hash.ts` 経由と `src/util/hash.ts` 直接の両経路で同一関数インスタンスが返る。

`AgentRegistry.hashOf()` が同一 `AgentDefinition` から生成するハッシュは変更前と同一。`tests/agent-definition.test.ts` が green（verification 確認済み）。**維持** ✓

### INV-8: 後方互換 — profile absent checkpoint の attach 成功

`verifyCheckpoint` は `state.profile !== undefined` の場合のみ検証を実行する（:153）。`makeValidStateJson()` はデフォルトで profile を含まないため、既存の TC-VC-001〜TC-VC-014 は profile 検証を経由しない。TC-VC-018 が profile absent の backward compat を明示的に固定している。**維持** ✓

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | info | maintainability | src/core/attach/verify-checkpoint.ts | JSDoc の `Verification order` コメント（:52-61）に profile チェック step が記載されていない。実装では counter-reversal と quiescence 判定の間に挿入されているが、コメントを読む限り不可視。将来の修正者がこの step を誤って移動するリスク | コメントに `(profile) stored profile self-consistency` の行を追加する | no |
| 2 | info | architecture | src/core/attach/verify-checkpoint.ts | `profile-inconsistent` の判定（:155-161）が `profile-uninterpretable`（:163-168）より前に走る。将来 schemaVersion=2 ランタイムが異なるダイジェストアルゴリズムを使う場合、v1 ランタイムへの attach は `profile-uninterpretable` ではなく `profile-inconsistent` を返す（誤った reason コード）。R1 では schemaVersion=1 のみ存在するため現時点で再現不能 | R2 以降で schemaVersion=2 profile を導入する際に、schemaVersion チェックをダイジェストチェックより先に移動する | no |

## 結論

新経路（profile 検証付きの attach・全遷移経路）をすべて列挙し、各経路で隣接機構の前提が保たれることを確認した。具体的な不変条件違反を引き起こす実行列は構成できない。

INFO 2 件はいずれも R1 の射程外の将来懸念（申し送り事項）であり、修正対象でない。コードレビューが approved 済みであることと合わせて、本レビューも **approved**。
