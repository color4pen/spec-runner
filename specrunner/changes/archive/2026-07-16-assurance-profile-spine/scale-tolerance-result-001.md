# Scale-Tolerance Review: assurance-profile-spine (R1)

- **reviewer**: scale-tolerance
- **iteration**: 1
- **verdict**: approved

## Scope

変更対象ファイル（src/ のみ、テスト・変更フォルダ除く）:

| ファイル | 変更内容 |
|---|---|
| `src/util/hash.ts` | 新設：leaf 層への hash util 移設 |
| `src/core/agent/hash.ts` | shim 化：re-export のみ |
| `src/state/schema/types.ts` | `EffectiveProfile` 型・`JobState.profile` 追加 |
| `src/state/profile.ts` | 新設：`STANDARD_PROFILE` / `getProfile` / `computePolicyDigest` |
| `src/store/job-state-store.ts` | `buildInitialJobState` に profile 初期化、`update` patch 型から `profile` 除外 |
| `src/state/lifecycle.ts` | `TransitionContext.patch` 型から `profile` 除外 |
| `src/core/attach/verify-checkpoint.ts` | profile 自己整合検証ブロック追加 |

## Findings

### F-01 — `computePolicyDigest` の呼び出し箇所は attach 1 件あたり 1 回（情報）

`verifyCheckpoint` 内に追加された profile 検証ブロックは `computePolicyDigest(state.profile)` を 1 回呼ぶ。
この関数は `canonicalJson` → SHA-256 の純粋な O(|profile|) 計算であり、job 件数・archive 件数・journal 行数・GitHub API 呼び出し件数とは無関係。
attach は per-job の単一呼び出しのため、単調増加するコレクションを走査しない。

**severity**: informational（スケール問題なし）

---

### F-02 — `STANDARD_PROFILE.policyDigest` はモジュールロード時に 1 回だけ計算（情報）

```typescript
// src/state/profile.ts
const _standardBody = { id: "standard", schemaVersion: 1, budget: {}, assurance: {} };
export const STANDARD_PROFILE = Object.freeze({
  ..._standardBody,
  policyDigest: computePolicyDigest(_standardBody),
});
```

定数はモジュールスコープで 1 回だけ評価される。job 件数に比例するコストは発生しない。

**severity**: informational（スケール問題なし）

---

### F-03 — `canonicalJson` は `budget`/`assurance` を再帰的に処理する（将来リスク、R1 では無問題）

`canonicalJson` は `Object.keys().sort()` を再帰的に適用する。R1 では `budget = {}` / `assurance = {}` なので再帰深度 1・キー数 0 で O(1) に収束する。
ただし `ProfileBudget = Readonly<Record<string, unknown>>` は型上は開放的であり、R2+ で大きな構造が追加された場合、`computePolicyDigest` のコストは O(|profile content|) まで増加しうる。これは job 件数ではなく profile の内容量に依存するため、attach per-job コストが上限付きで増加するに留まる（job 件数に比例しない）。

R1 のスコープ内では実害なし。R2+ で budget/assurance 構造を設計する段階でスナップショット戦略の検討が望ましい。

**severity**: informational（R1 射程外、将来の設計メモ）

---

### 走査対象の列挙と評価

| 対象 | 走査するコードの変更 | 評価 |
|---|---|---|
| archive フォルダ | なし（`JobCatalog` 未変更） | スケール問題なし |
| sidecar / `.specrunner/local/` | なし | スケール問題なし |
| GitHub issue / PR / コメント | なし | スケール問題なし |
| events.jsonl journal | なし（fold・detectCounterReversal は既存） | スケール問題なし |
| state.json per-job サイズ | `profile` フィールド追加（~150 バイト） | 既存 state と同じ線形スケール、新次元なし |

## 総評

本変更が追加するスケール敏感なパスはいずれも attach 1 件あたり O(1) の純粋計算（SHA-256）に収まる。
単調増加するコレクション（archive・sidecar・issue/PR・コメント・journal）への走査・ロード・API 呼び出しは一切追加されていない。
R1 スコープにおいてスケール問題は検出されなかった。
