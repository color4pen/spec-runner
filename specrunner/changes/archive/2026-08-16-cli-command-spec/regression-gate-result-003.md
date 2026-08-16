# Regression Gate Result — Iteration 3

## Summary

7 findings checked. All 7 have been fixed in the current code.

---

## Finding 1 — [MEDIUM] `handler+children` ノードの dispatch fallback 挙動が未定義

**Status**: FIXED

`design.md` 行 143 に明示された規則が追加されている:
「`args[1]` が既知 child にマッチしない（または存在しない）→ そのノード自体を解決済み spec として返し、`restArgs` に残りの tokens を渡す（`unknown-subcommand` を返さない）」。
`unknown-subcommand` は「children を持ち handler を持たない純粋な parent」のみに適用するという限定も記述されており、設計が明確化された。

---

## Finding 2 — [LOW] T-07 hint 移行：2 段階バリデーション戦略が未定義

**Status**: FIXED

`tasks.md` 行 169–174 に 3 集合ビルド戦略（`topLevel` / `fullPaths` / `hasChildren`）と検証ロジックが明文化された。
`hasChildren` 判定を省略すると handler+children ノードで誤検出が生じることの注意書きも追加されており、実装者が弱い実装を選ぶリスクが排除されている。

---

## Finding 3 — [MEDIUM] TC-034 未実装: hint 実在検査が listCommandPaths を使っていない

**Status**: FIXED

- `hint-command-references.test.ts`:
  - `validTopLevel`（行 163）: `listCommandPaths({ includeAliases: true })` を使用 ✓
  - `buildSubcommandMap()`（行 96–106）: `listCommandPaths({ includeAliases: false })` を使用 ✓
  - `Object.entries(COMMANDS)` / `entry.children` の直参照が消えた ✓

- `hint-command-existence.test.ts`:
  - `registeredCommands`（行 38–40）: `listCommandPaths({ includeAliases: true })` を使用 ✓
  - サブコマンドレベルの検査（行 87, 94, 171, 173）は依然 `COMMANDS[verb]` / `entry.children` を直参照しているが、TC-034 の GIVEN は明示的に `hint-command-references.test.ts` のみを対象とするため、TC-034 の要件は満たされている。

---

## Finding 4 — [LOW] stale コメント: WORKTREE_GUARDED_COMMANDS への言及が残る

**Status**: FIXED

`specrunner-worktree-guard.test.ts` に `WORKTREE_GUARDED_COMMANDS` / `top-level WORKTREE_GUARDED_COMMANDS` の文字列が一切存在しないことを確認。
TC-WG-006 の `it()` 説明文は「run resolves as alias → job start spec with worktreeGuard: true → ARG_ERROR」と正確な新メカニズムを記述している。

---

## Finding 5 — [MEDIUM] TC-031 dispatch カバレッジ欠落 — handler 内 slug ガードが dispatch 経由では dead code

**Status**: FIXED

2 つの修正が両方実施されている:

1. `command-registry.ts` 行 1439: `doctor repair` に `help.detail` を追加。dispatch 経由で missing arg エラーが発生した際に `doctor repair` 固有の Usage が表示される。
2. `doctor-repair.test.ts` の TC-DR-001（行 155–167）: `callRepairHandler` ではなく `runMain(["doctor", "repair"])` で dispatch 経由のテストに変更。stderr に `"specrunner doctor repair"` が含まれることを検証している。

---

## Finding 6 — [MEDIUM] 純粋 parent の `--help` が spec 由来サブコマンド列挙でなく NO_DETAILED_HELP_USAGE を表示

**Status**: FIXED

`bin/specrunner.ts` 行 42–50 にフォールバック生成が追加された:
```ts
if (hasHelp && resolved.parent) {
  const detail = COMMANDS[resolved.parent]?.help?.detail;
  if (detail) {
    emitHelp(detail);
  } else {
    const subNames = resolved.availableChildren?.join("|") ?? "";
    emitHelp(`Usage: specrunner ${resolved.parent} <${subNames}>\n`);
  }
}
```
`help.detail` が未設定の parent（`job` / `runtime` / `config` 等）でも `Usage: specrunner <cmd> <sub1|sub2>` が表示される。

---

## Finding 7 — [LOW] buildSubcommandMap が COMMANDS.children を直参照 — T-07 移行部分残存

**Status**: FIXED

`hint-command-references.test.ts` の `buildSubcommandMap()`（行 96–106）は `Object.entries(COMMANDS)` を廃し、`listCommandPaths({ includeAliases: false })` を走査してサブコマンドマップを構築している。検証ロジック（`subcommandMap.has(token1)` で hasChildren 判定、`subs.has(token2)` でフルパス確認）は tasks.md T-07 の 3 集合戦略と等価な感度を実現している。

---

## Evidence

| # | Finding | File | Verified |
|---|---------|------|---------|
| 1 | handler+children fallback 未定義 | design.md:143 | ✓ 修正済み |
| 2 | T-07 戦略未定義 | tasks.md:169-174 | ✓ 修正済み |
| 3 | TC-034 listCommandPaths 未使用 | hint-command-references.test.ts / hint-command-existence.test.ts | ✓ 修正済み |
| 4 | stale コメント | specrunner-worktree-guard.test.ts | ✓ 修正済み |
| 5 | TC-031 dead code | doctor-repair.test.ts / command-registry.ts:1439 | ✓ 修正済み |
| 6 | parent --help NO_DETAILED_HELP_USAGE | bin/specrunner.ts:42-50 | ✓ 修正済み |
| 7 | buildSubcommandMap COMMANDS 直参照 | hint-command-references.test.ts:96-106 | ✓ 修正済み |
