# Regression Gate Result — Iteration 1

Change: lockfile-sync-verification-gate
Checked: 8 findings from review-feedback-001.md

---

## Evidence

### Finding 1 (LOW) — spec.md diff-unavailable THEN 節で `status === 'skipped'` が未明示

**Status: FIXED**

spec.md:53 now reads:
```
**Then** status は skipped で、stdout に検査不能（diff unavailable）である旨が明示される（failed にも pass にもならない）
```
`status は skipped` が明示されている。✓

---

### Finding 2 (LOW) — tasks.md T-04 Step 2 の `package.json` パス判定が未明示

**Status: FIXED**

tasks.md:63 now reads:
```
`path.basename(f) === 'package.json'` が真のパス集合（`endsWith` ではなく `basename` 比較を使うこと。`some-package.json` の偽陽性を防ぐため）
```
`basename` 比較であることと偽陽性防止の理由が明記されている。✓

実装側（lockfile-sync.ts:282）も `path.basename(f) === "package.json"` を使用。✓

---

### Finding 3 (LOW) — tasks.md T-04/T-05 で `git show <baseBranch>:<path>` の根拠が未記載

**Status: FIXED**

tasks.md:66 now reads:
```
**ref 形式**: `origin/<baseBranch>` でなく `<baseBranch>` を使うこと。既存 `checkPackageJsonScriptsIntegrity` は `origin/${baseBranch}` を使うが、worktree 環境では fetch 済みの remote ref に依存しない `<baseBranch>` のほうが移植性が高い。同ファイル内の既存参照が `origin/` を使っていても、この gate では `origin/` なしで統一する。
```
選択根拠が明記されている。✓

実装（lockfile-sync.ts:302）も `baseBranch` を直接使用し `origin/` 前置なし。✓

---

### Finding 4 (LOW) — LOCKFILE_SYNC_PHASE 定数の二重定義

**Status: FIXED**

runner.ts:24-28:
```typescript
// Lockfile-sync phase name constant — kept local to avoid a static import of lockfile-sync.js.
// A static import triggers the vi.mock factory at module-load time (before test code runs),
// causing a TDZ error when the test's local `LOCKFILE_SYNC_PHASE` const is referenced inside
// the factory. Using a dynamic import (below) defers factory evaluation until after test setup.
const LOCKFILE_SYNC_PHASE = "lockfile-sync" as const;
```
TDZ 回避の設計意図がコメントで明記されている。

TC-024（runner-lockfile-gate.test.ts）が runner.ts の fail-fast パスで LOCKFILE_SYNC_PHASE = "lockfile-sync" が使われることを間接的に検証している。✓

---

### Finding 5 (LOW) — runLockfileSyncGate の slug パラメータが未使用

**Status: FIXED**

lockfile-sync.ts:255-262:
```typescript
export async function runLockfileSyncGate(options: {
  slug: string;
  ...
}): Promise<PhaseResult> {
  const { cwd, baseBranch, spawn, fsLike } = options;
```

`slug` はインターフェースに宣言されているが destructure していない。TypeScript は object property で destructure しないものには "unused" 警告を出さないため、lint 問題なし。API 対称性のための宣言として適切。✓

---

### Finding 6 (LOW) — gitShowFile 内の型キャストが冗長

**Status: REGRESSION**

lockfile-sync.ts:210-220 現在:
```typescript
type SpawnWithOptions = (cmd: string, args: string[], opts: object) => {
  stdout: { on(event: string, cb: (chunk: Buffer) => void): void } | null;
  on(event: string, cb: (...args: unknown[]) => void): void;
};
let child: ReturnType<SpawnWithOptions>;
try {
  child = (spawnFn as unknown as SpawnWithOptions)("git", ["show", `${ref}:${filepath}`], {
    cwd,
    shell: false,
    env: stripSecrets(process.env as Record<string, string | undefined>),
  });
```

`(spawnFn as unknown as SpawnWithOptions)` キャストが残存している。changed-lines.ts:68 の `spawnGit` は同じ SpawnFn 型で同一の 3 引数呼び出しをキャストなしで行っている。`ChildProcess` 型を直接使用することで除去可能（`let child: ChildProcess | undefined` に変更し `spawnFn("git", ...) as ChildProcess` か推論任せにする）。

レビュー指摘「このキャストは不要」が未修正のまま残存。**REGRESSION** ✗

---

### Finding 7 (MEDIUM) — LOCKFILE_SYNC_PHASE 定数が lockfile-sync.ts の export と二重管理されており歯がない

**Status: REGRESSION**

現状の保護:
- runner.ts:24-28: TDZ 理由のコメントあり
- TC-024 (runner-lockfile-gate.test.ts): runner.ts の fail-fast パスが `phase: "lockfile-sync"` を返すことを検証（ローカル定数 "lockfile-sync" と照合）

不足:
- lockfile-sync.ts の `LOCKFILE_SYNC_PHASE` export が変更された場合、TC-024 はこれを検知できない（TC-024 はゲートをモックしているため）
- runner-lockfile-gate.test.ts はモック経由で `LOCKFILE_SYNC_PHASE` を inject しており、実 lockfile-sync.ts の export 値を読まない
- lockfile-sync.test.ts はインポートした定数を自己参照的にチェックするため、定数が別値に変わっても通過してしまう

例示シナリオ: lockfile-sync.ts の `LOCKFILE_SYNC_PHASE` が "lockfile-sync-v2" に変更された場合、runner.ts の fail-fast パスは "lockfile-sync"（ローカル定数）を使い続けるが、ゲート実行時は "lockfile-sync-v2" を返す。同一 run 内で phase 名が食い違う verification-result.md が生成されるが、全テストは通過する。

lockfile-sync.ts の export 値と runner.ts ローカル定数の等値性を強制する専用テストが存在しない。**REGRESSION** ✗

---

### Finding 8 (LOW) — gitShowFile が bare branch ref を使うが checkPackageJsonScriptsIntegrity は origin/ 前置

**Status: FIXED**

tasks.md:66 に設計選択の根拠を明記（Finding 3 と同一箇所）。「移植性が高い」という意図的選択として文書化されている。✓

---

## Summary

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | LOW | spec.md diff-unavailable THEN に skipped 明示 | FIXED ✓ |
| 2 | LOW | tasks.md basename vs endsWith 未明示 | FIXED ✓ |
| 3 | LOW | tasks.md git show 根拠未記載 | FIXED ✓ |
| 4 | LOW | LOCKFILE_SYNC_PHASE 二重定義（コメント不足） | FIXED ✓ |
| 5 | LOW | slug パラメータ未使用 | FIXED ✓ |
| 6 | LOW | gitShowFile 型キャスト冗長 | **REGRESSION** ✗ |
| 7 | MEDIUM | LOCKFILE_SYNC_PHASE 歯なし（cross-boundary） | **REGRESSION** ✗ |
| 8 | LOW | bare branch ref vs origin/ 根拠不足 | FIXED ✓ |

checked=8, skipped=0, unverified=0
