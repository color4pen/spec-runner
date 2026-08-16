# Regression Gate Result — Iteration 1

## Evidence

**Checked**: 4 findings  
**Method**: `git diff main...HEAD` + targeted file reads

---

## Finding 1 — [MEDIUM] handler+children dispatch fallback 挙動が未定義

**Status**: FIXED

design.md line 143 に明示的な fallback 規則が追記された:

> `args[1]` が既知 child にマッチしない（または `args[1]` が存在しない）→ そのノード自体を解決済み spec として返し、`restArgs` に残りの tokens を渡す（`unknown-subcommand` を返さない）。`unknown-subcommand` は「children を持ち handler を持たない純粋な parent」のみに適用する。

`specrunner doctor foo` が diagnose にフォールバックする挙動が設計文書で明確化済み。

---

## Finding 2 — [LOW] T-07 hint 移行：2 段階バリデーション戦略が未定義

**Status**: FIXED

tasks.md lines 169–174 に 3 集合ビルドによる等価置換戦略が追記された:

1. `topLevel` — top-level コマンド集合  
2. `fullPaths` — 全 canonical / alias パスの結合文字列集合  
3. `hasChildren` — 子を持つ top-level 集合（誤検出防止のため token2 検査の有無を制御）

`specrunner job rm x` の `rm` 削除が検出される等、現行 2 段バリデーションと等価な感度が担保される移行戦略として明文化済み。

---

## Finding 3 — [MEDIUM] TC-034 未実装: hint 実在検査が listCommandPaths を使っていない

**Status**: STILL PRESENT (部分修正)

`tests/hint-command-existence.test.ts:38–40` は修正済み:
```ts
const registeredCommands = new Set(
  listCommandPaths({ includeAliases: true }).map((p) => p[0]!),
);
```

しかし **`tests/unit/cli/hint-command-references.test.ts`** は `listCommandPaths` を import していない（`listCommandPaths` で grep するとゼロヒット）。同ファイルは以下の箇所で `Object.keys(COMMANDS)` を継続使用:

- line 161: `const validTopLevel = new Set(Object.keys(COMMANDS));`（TC-003 本体）
- line 191: `const validTopLevel = new Set(Object.keys(COMMANDS));`（TC-004 破壊確認1）
- line 200, 210, 222: 同様

TC-034 の GIVEN 条件「`hint-command-references.test.ts` が `listCommandPaths({ includeAliases: true })` を正本とし検査する」が未達。`run` が現状 `COMMANDS` の直接エントリとして残っているため実害は出ていないが、将来 `run` を `COMMANDS` から取り除いた際に hint 参照が誤って「未登録」扱いされるリスクは残存。

---

## Finding 4 — [LOW] stale コメント: WORKTREE_GUARDED_COMMANDS への言及が残る

**Status**: FIXED

`tests/unit/cli/specrunner-worktree-guard.test.ts:147` の it() 説明文が以下に更新された:

> 修正前: `"exits with code 2 via top-level WORKTREE_GUARDED_COMMANDS (WORKTREE_GUARD → ARG_ERROR)"`  
> 修正後: `"exits with code 2 (run resolves as alias → job start spec with worktreeGuard: true → ARG_ERROR)"`

`WORKTREE_GUARDED_COMMANDS` への言及が除去され、現在の仕組み（alias 解決 → `worktreeGuard: true` spec 導出）と整合している。

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | MEDIUM | ✅ FIXED |
| 2 | LOW | ✅ FIXED |
| 3 | MEDIUM | ❌ STILL PRESENT — `hint-command-references.test.ts` が `listCommandPaths` 未使用 |
| 4 | LOW | ✅ FIXED |
