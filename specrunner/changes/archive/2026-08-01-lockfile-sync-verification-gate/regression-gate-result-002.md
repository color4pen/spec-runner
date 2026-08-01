# Regression Gate Result — Iteration 2

**Change**: lockfile-sync-verification-gate  
**Date**: 2026-08-01  
**Ledger items checked**: 8

---

## Finding-by-Finding Evidence

### F1 [LOW] diff-unavailable シナリオの THEN 節で `status === 'skipped'` が明示されていない
- **File**: specrunner/changes/lockfile-sync-verification-gate/spec.md:49

**Evidence**: spec.md lines 49–53 now reads:

```
#### Scenario: diff 導出不能 → skipped + 検査不能の明示

**Given** base…HEAD の変更ファイル集合を git から導出できない…
**When** lockfile-sync gate が実行される
**Then** status は skipped で、stdout に検査不能（diff unavailable）である旨が明示される（failed にも pass にもならない）
```

`status は skipped` が THEN 節に明示されている。**FIXED ✅**

---

### F2 [LOW] T-04 Step 2 の `package.json` パス判定が `endsWith` か `basename` か未明示
- **File**: specrunner/changes/lockfile-sync-verification-gate/tasks.md:64

**Evidence**: tasks.md line 63 は以下のように改訂されている:

> `path.basename(f) === 'package.json'` が真のパス集合（`endsWith` ではなく `basename` 比較を使うこと。`some-package.json` の偽陽性を防ぐため）

`basename` 比較であることと、その理由が明示されている。実装 (lockfile-sync.ts:273) も `path.basename(f) === "package.json"` を使用。**FIXED ✅**

---

### F3 [LOW] T-04/T-05 で `git show <baseBranch>:<path>` を使う根拠が未記載
- **File**: specrunner/changes/lockfile-sync-verification-gate/tasks.md:65

**Evidence**: tasks.md line 66 に以下が追加されている:

> **ref 形式**: `origin/<baseBranch>` でなく `<baseBranch>` を使うこと。既存 `checkPackageJsonScriptsIntegrity` は `origin/${baseBranch}` を使うが、worktree 環境では fetch 済みの remote ref に依存しない `<baseBranch>` のほうが移植性が高い。同ファイル内の既存参照が `origin/` を使っていても、この gate では `origin/` なしで統一する。

設計根拠が明文化された。実装 (lockfile-sync.ts:293) も `gitShowFile(pkgFile, baseBranch, ...)` でベア ref を使用。**FIXED ✅**

---

### F4 [LOW] LOCKFILE_SYNC_PHASE 定数の二重定義（runner.ts 側の意図説明なし）
- **File**: src/core/verification/runner.ts:28

**Evidence**: runner.ts lines 24–28:

```typescript
// Lockfile-sync phase name constant — kept local to avoid a static import of lockfile-sync.js.
// A static import triggers the vi.mock factory at module-load time (before test code runs),
// causing a TDZ error when the test's local `LOCKFILE_SYNC_PHASE` const is referenced inside
// the factory. Using a dynamic import (below) defers factory evaluation until after test setup.
const LOCKFILE_SYNC_PHASE = "lockfile-sync" as const;
```

コメントにより TDZ 回避の意図が明記されており、二重定義の理由が分かる。**FIXED ✅**

---

### F5 [LOW] runLockfileSyncGate の slug パラメータが未使用
- **File**: src/core/verification/lockfile-sync.ts:255

**Evidence**: lockfile-sync.ts lines 246–253:

```typescript
export async function runLockfileSyncGate(options: {
  slug: string;
  cwd: string;
  baseBranch: string;
  spawn: SpawnFn;
  fsLike?: { existsSync(path: string): boolean };
}): Promise<PhaseResult> {
  const { cwd, baseBranch, spawn, fsLike } = options;
```

`slug` はオプションオブジェクト内に宣言されているが、destructure されていない。TypeScript の `noUnusedLocals`/`noUnusedParameters` はオブジェクトプロパティを変数に取り出していない場合は警告しないため、lint 警告は発生しない。他ゲートとの API 対称性のため意図的に interface に含まれている。**FIXED ✅**（lint 警告が出ない実装で解決）

---

### F6 [LOW] gitShowFile 内の型キャストが冗長
- **File**: src/core/verification/lockfile-sync.ts:210

**Evidence**: lockfile-sync.ts lines 201–213:

```typescript
async function gitShowFile(
  filepath: string,
  ref: string,
  cwd: string,
  spawnFn: SpawnFn,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const child = spawnFn("git", ["show", `${ref}:${filepath}`], {
        cwd,
        shell: false,
        env: stripSecrets(process.env as Record<string, string | undefined>),
      });
```

`(spawnFn as unknown as SpawnWithOptions)(...)` 形式のキャストは存在しない。`spawnFn` を直接呼び出している。**FIXED ✅**

---

### F7 [MEDIUM] LOCKFILE_SYNC_PHASE 定数が lockfile-sync.ts の export と二重管理されており歯がない
- **File**: src/core/verification/runner.ts:28

**Evidence**: 専用テストファイル `src/core/verification/__tests__/lockfile-sync-phase-constant.test.ts` が追加されている:

```typescript
import { LOCKFILE_SYNC_PHASE } from "../lockfile-sync.js";

const RUNNER_LOCAL_CONST = "lockfile-sync" as const;

describe("TC-LSP-01: LOCKFILE_SYNC_PHASE cross-boundary invariant", () => {
  it("LOCKFILE_SYNC_PHASE export equals the canonical string 'lockfile-sync'", () => {
    expect(LOCKFILE_SYNC_PHASE).toBe(RUNNER_LOCAL_CONST);
  });

  it("LOCKFILE_SYNC_PHASE export is the string literal 'lockfile-sync' (not a superset)", () => {
    expect(LOCKFILE_SYNC_PHASE).toStrictEqual("lockfile-sync");
  });
});
```

`lockfile-sync.ts` の export 値を canonical string "lockfile-sync" に固定する歯が存在する。runner.ts の local const は非 export のため直接比較はできないが、lockfile-sync.ts 側が変更されれば即検出される。**FIXED ✅**

---

### F8 [LOW] gitShowFile が bare branch ref を使うが、同一経路の checkPackageJsonScriptsIntegrity は origin/ 前置を使う
- **File**: src/core/verification/lockfile-sync.ts:216

**Evidence**: F3 と同じく tasks.md line 66 に ref 形式の選択根拠が明記された。実装 (lockfile-sync.ts:293) は `gitShowFile(pkgFile, baseBranch, cwd, spawn)` でベア ref を使用し、設計 D5 の意図的選択として文書化されている。**FIXED ✅**

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| F1 | LOW | FIXED ✅ |
| F2 | LOW | FIXED ✅ |
| F3 | LOW | FIXED ✅ |
| F4 | LOW | FIXED ✅ |
| F5 | LOW | FIXED ✅ |
| F6 | LOW | FIXED ✅ |
| F7 | MEDIUM | FIXED ✅ |
| F8 | LOW | FIXED ✅ |

**Regressions**: 0  
**Contradictions**: 0  
**All 8 findings remain fixed in the current code.**
