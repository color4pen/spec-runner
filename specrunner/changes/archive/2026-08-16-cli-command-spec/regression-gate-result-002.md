# Regression Gate Result — Iteration 2

## Evidence

**Checked**: 4 findings  
**Method**: `git diff main...HEAD` + targeted file reads + grep verification

---

## Finding 1 — [MEDIUM] handler+children dispatch fallback 挙動が未定義

**Status**: FIXED (carried over from iteration 1)

`specrunner/changes/cli-command-spec/design.md` line 143 に handler+children ノードの dispatch fallback 規則が明記されている（iteration 1 で確認済み、回帰なし）:

> `args[1]` が既知 child にマッチしない（または `args[1]` が存在しない）→ そのノード自体を解決済み spec として返し、`restArgs` に残りの tokens を渡す（`unknown-subcommand` を返さない）。`unknown-subcommand` は「children を持ち handler を持たない純粋な parent」のみに適用する。

---

## Finding 2 — [LOW] T-07 hint 移行：2 段階バリデーション戦略が未定義

**Status**: FIXED (carried over from iteration 1)

`specrunner/changes/cli-command-spec/tasks.md` lines 169–174 に 3 集合ビルド戦略が明記されている（iteration 1 で確認済み、回帰なし）:

1. `topLevel = new Set(paths.map(p => p[0]))` — top-level コマンド集合
2. `fullPaths = new Set(paths.map(p => p.join(" ")))` — 全 canonical / alias パス
3. `hasChildren = new Set(paths.filter(p => p.length > 1).map(p => p[0]))` — 子を持つ top-level

---

## Finding 3 — [MEDIUM] TC-034 未実装: hint 実在検査が listCommandPaths を使っていない

**Status**: FIXED

iteration 1 では `tests/unit/cli/hint-command-references.test.ts` が `listCommandPaths` を import していなかった（grep ゼロヒット）。iteration 2 で修正が完了した:

```
grep result: listCommandPaths
  line 12:  import { COMMANDS, listCommandPaths } from "../../../src/cli/command-registry.js";
  line 161: const validTopLevel = new Set(listCommandPaths({ includeAliases: true }).map((p) => p[0]!));
  line 191: const validTopLevel = new Set(listCommandPaths({ includeAliases: true }).map((p) => p[0]!));
  line 201: const validTopLevel = new Set(listCommandPaths({ includeAliases: true }).map((p) => p[0]!));
  line 211: const validTopLevel = new Set(listCommandPaths({ includeAliases: true }).map((p) => p[0]!));
  line 221: const validTopLevel = new Set(listCommandPaths({ includeAliases: true }).map((p) => p[0]!));
```

`Object.keys(COMMANDS)` で `validTopLevel` を構築していた箇所（iteration 1 で列挙した lines 161, 191, 200, 210, 222）が全て `listCommandPaths({ includeAliases: true })` に置換された。`Object.keys(COMMANDS)` は `validTopLevel` 構築では使われていない（grep ゼロヒット）。

`tests/hint-command-existence.test.ts` も `listCommandPaths({ includeAliases: true })` を line 39 で使用（iteration 1 で確認済み、回帰なし）。

なお `buildSubcommandMap()` 内で `Object.keys(COMMANDS)` が subcommand マップ構築に使われているが、これは finding の特定した「トップレベルキー Set が listCommandPaths 未使用」とは別の箇所であり、finding の原因とされた `validTopLevel` の問題は解消済み。

---

## Finding 4 — [LOW] stale コメント: WORKTREE_GUARDED_COMMANDS への言及が残る

**Status**: FIXED (carried over from iteration 1)

`tests/unit/cli/specrunner-worktree-guard.test.ts` line 147 の it() 説明文（iteration 1 で確認済み、回帰なし）:

> `"exits with code 2 (run resolves as alias → job start spec with worktreeGuard: true → ARG_ERROR)"`

`WORKTREE_GUARDED_COMMANDS` への言及が除去され、現在の仕組みと整合している。

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | MEDIUM | ✅ FIXED |
| 2 | LOW | ✅ FIXED |
| 3 | MEDIUM | ✅ FIXED — `hint-command-references.test.ts` が `listCommandPaths` を import し、全 `validTopLevel` 構築箇所を置換済み |
| 4 | LOW | ✅ FIXED |
