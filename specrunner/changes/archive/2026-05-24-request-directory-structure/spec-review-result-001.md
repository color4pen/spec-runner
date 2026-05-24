# Spec Review Result — request-directory-structure

- **verdict**: needs-fix
- **iteration**: 001
- **reviewed**: request.md, design.md, tasks.md, specs/request-store/spec.md

---

## Summary

設計方針・要件・受け入れ基準はすべて整合しており、実装タスクの粒度も適切。ただし tasks.md の `fs` import 命名に矛盾があり、そのまま実装するとコンパイルエラーになる。

---

## Findings

### F-001 [Medium / needs-fix] tasks.md — `list()` 内の `fs.readdir` と `fs.existsSync` の import 命名が矛盾

**場所**: tasks.md — Task 2-2 (`resolveWithFallback`) と Task 2-3 (`list()`)

Task 2-2 の注記:
> 注意: `fs` は `node:fs` (sync) を新たに import する必要がある。既存は `node:fs/promises` のみ。

この注記は `fs = node:fs` (sync) / `fsAsync = node:fs/promises` (async) という命名規約を意図している（`manager.ts` と同じ慣習）。

しかし Task 2-3 の `list()` コードスニペットには:
```typescript
entries = await fs.readdir(draftsDir, { withFileTypes: true });
```
が含まれており、`fs` を async (`node:fs/promises`) として使っている。`fs = node:fs` (sync) なら `fs.readdir` は callback-based であり `await` できず、TypeScript も型エラーになる。

同スニペット内で `await fsAsync.access(...)` も使われているため、意図は `fsAsync = node:fs/promises` のはず。

**修正**: tasks.md の `list()` スニペット中の `await fs.readdir(...)` を `await fsAsync.readdir(...)` に変更する。

---

### F-002 [Minor] tasks.md — `draftPathLegacy()` が dead export になる

**場所**: tasks.md — Task 1-2 / paths.ts

`draftPathLegacy(slug)` を `paths.ts` に追加するが、`store.ts` の `resolveWithFallback()` は legacy パスを `path.join(cwd, DRAFTS_SUBDIR, slug + ".md")` で直接組み立てており、`draftPathLegacy()` を呼ばない。エクスポートされるが呼ばれない dead code になる。

legacy パスの組み立てロジックが `paths.ts` と `store.ts` の 2 箇所に分散する。

**修正案（任意）**: `resolveWithFallback()` 内で `draftPathLegacy()` を使うか、`draftPathLegacy()` のエクスポートを削除して `store.ts` のロジックに一本化する。どちらでもよいが、揃っていることが望ましい。

---

## Coverage Check

| 要件 | spec | design | tasks | 判定 |
|------|------|--------|-------|------|
| new → ディレクトリ作成 | ✅ | D1, D7 | T1, T2-5 | OK |
| ls → ディレクトリ列挙 + フォールバック | ✅ | D3 | T2-3, T7-1 | OK |
| validate / review → フォールバック | ✅ | D2, D5 | T4, T6 | OK |
| run → CANONICAL_PATTERN 更新 | ✅ | D6 | T3 | OK |
| generate → 自動対応 (store.write 経由) | ✅ | D8 | (implicit) | OK |
| 後方互換 (flat file fallback) | ✅ | D2 | T2-2 | OK |
| changes/ 構造不変 | ✅ | (scope-out) | (scope-out) | OK |

---

## Security Assessment

変更対象は全てローカル FS 操作（readdir / mkdir / writeFile / existsSync）のみ。

- **パストラバーサル**: `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` による入力検証は変更なし。slug から派生する全 FS パスは安全。
- **新規攻撃面**: なし。ネットワーク・認証・外部 API への変更なし。
- **OWASP Top 10 該当**: なし。

---

## Required Fix Before Implement

F-001 のみ必須。F-002 は任意対応。

**F-001 修正箇所**: tasks.md — Task 2-3 の `list()` スニペット:
```typescript
// 変更前
entries = await fs.readdir(draftsDir, { withFileTypes: true });

// 変更後
entries = await fsAsync.readdir(draftsDir, { withFileTypes: true });
```

また同 Task の先頭コメントまたは Task 2-2 の注記に、import 命名規約を明示することを推奨:
```typescript
import * as fs from "node:fs";           // sync (existsSync 用)
import * as fsAsync from "node:fs/promises"; // async ops 用 (既存 import をリネーム)
```
