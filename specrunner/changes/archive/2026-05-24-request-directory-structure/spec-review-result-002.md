# Spec Review Result — request-directory-structure

- **verdict**: approved
- **iteration**: 002
- **reviewed**: request.md, design.md, tasks.md, specs/request-store/spec.md

---

## Summary

前回 (iteration 001) の唯一の blocking 指摘 F-001 が修正されている。tasks.md Task 2-3 の `list()` 内が `await fsAsync.readdir(...)` に変わっており、import 命名と一致している。残存する F-002 (optional) は tasks.md から `draftPathLegacy()` のタスクを削除することで正しく対応されている。1 件の minor 指摘を残すが実装ブロックにはならない。

---

## Findings

### F-003 [Minor] design.md に `draftPathLegacy()` の "新規追加" 記述が残存している

**場所**: design.md — D1: パス解決の変更点 / paths.ts

```
新規追加:
- `draftPathLegacy(slug)` → `specrunner/drafts/<slug>.md` (後方互換フォールバック用)
```

tasks.md Task 1 には `1-1` (`draftPath()` 更新) のみが定義されており、`draftPathLegacy()` を追加するタスクは意図的に削除されている (iteration 001 F-002 の解消)。

しかし design.md の記述が削除されていないため、implementer が design.md とtasks.md の両方を読んだ際に「tasks.md で Task 1-2 が抜けている」と誤認し、dead export を追加するリスクがある。

**修正案 (任意)**: design.md の "新規追加" 欄を削除するか、「tasks.md で採用せず。legacy path は store.ts 内で直接組み立てる」と注記する。実装時に tasks.md を優先すれば問題は生じないため、ブロッカーではない。

---

## F-001 の修正確認

tasks.md Task 2-3 `list()` スニペット:
```typescript
entries = await fsAsync.readdir(draftsDir, { withFileTypes: true });
```
`fsAsync` (= `node:fs/promises`) を正しく使用している。✅

---

## Coverage Check

| 要件 | spec | design | tasks | 判定 |
|------|------|--------|-------|------|
| new → ディレクトリ作成 | ✅ | D1, D7 | T1, T2-5 | OK |
| ls → ディレクトリ列挙 + flat フォールバック | ✅ | D3 | T2-3, T7-1 | OK |
| validate / review → フォールバック付き読み込み | ✅ | D2, D5 | T4, T6 | OK |
| run → CANONICAL_PATTERN 更新 + legacy フォールバック | ✅ | D6 | T3 | OK |
| generate → store.write 経由で自動対応 | ✅ | D8 | (implicit) | OK |
| 後方互換 (flat file fallback) | ✅ | D2 | T2-2 | OK |
| changes/ 構造不変 | ✅ | scope-out | scope-out | OK |

---

## Security Assessment

変更対象は全てローカル FS 操作 (readdir / mkdir / writeFile / existsSync) のみ。

- **パストラバーサル**: `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` による入力検証は変更なし。slug から派生する全 FS パスは安全。
- **新規攻撃面**: なし。ネットワーク・認証・外部 API への変更なし。
- **OWASP Top 10 該当**: なし。

---

## 実装注意事項 (informational)

- `store.ts` に `resolveWithFallback()` を追加する際、`node:fs` (sync) を新たに import する必要がある。既存 import `fs` は `node:fs/promises` のため、`fs` / `fsAsync` の命名規約 (`manager.ts` と同様) を適用すること。
- `draftPathLegacy()` は **paths.ts に追加しない** (tasks.md に含まれていない、dead export 回避のため)。legacy パスは `resolveWithFallback()` 内で直接組み立てる。
