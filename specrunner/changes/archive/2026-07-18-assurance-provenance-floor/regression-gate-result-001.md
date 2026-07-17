# Regression Gate Result — assurance-provenance-floor — Iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

### Finding 1: core/archive → core/step/bite-evidence クロスモジュール import（LOW）

**File**: `src/core/archive/achieved-assurance.ts:20`

**Verification**: `achieved-assurance.ts` lines 19–20 にある import は現在のコードでも変わらず存在する。

```typescript
import { resolveBaseCandidateOids } from "../step/bite-evidence/oids.js";
import { isExcludedPath } from "../step/bite-evidence/gate.js";
```

`cross-boundary-invariants-result-001.md` Finding 1 で `Fix: no` とされ、design.md L129 に既知リスクとして明記・ミティゲーション計画（Phase 2 前に中立モジュールへ move）が記載済み。コードの状態はレビュー承認時と同一。**退行なし。**

---

### Finding 2: protectedPaths と minimumAssurance.protectedPaths 重複時の Step 3.6 サイレント無効化（LOW）

**File**: `src/core/archive/merge-then-archive.ts:295`

**Verification**: Step 3.5（`protectedPaths` guard、L295–354）は Step 3.6（`minimumAssurance` floor gate、L359–443）より前に実行される sequential 順序は変わらず存在する。両者に同一パターンを設定すると Step 3.5 が先に `exitCode:1` で return し Step 3.6 に到達しない挙動は維持されている。

`cross-boundary-invariants-result-001.md` Finding 2 で `Fix: no`（sequential guard chain の設計上の帰結として承認済み）。**退行なし。**

---

## Verdict

両 finding はいずれも `Fix: no` として承認済みで、現在のコードはレビュー承認時の状態と同一。退行・矛盾ともに検出されなかった。
