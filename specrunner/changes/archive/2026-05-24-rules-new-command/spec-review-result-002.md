# Spec Review Result: rules-new-command

- **verdict**: needs-fix
- **iteration**: 2
- **reviewer**: spec-reviewer

---

## 概要

review-001 の 2 件の blocking 指摘はいずれも解消された。  
新たに **1 件の blocking ギャップ** を確認したため `needs-fix`。

---

## 確認: review-001 指摘の解消状況

| 指摘 | 解消状況 |
|---|---|
| 指摘 1: NaN 伝播バグ | tasks.md 2-3 に `filter(n => !isNaN(n))` 追加、TC-RULES-011 追加 ✅ |
| 指摘 2: `CommandDef.positional` 型ギャップ | tasks.md 3-0 に `count?: number` 追加ステップ明記 ✅ |

---

## 指摘 1（blocking）: `specrunner rules --help` の表示メカニズムが tasks.md に欠落

### 場所

`bin/specrunner.ts` 親コマンドディスパッチ (line 36–48) / tasks.md Task 3

### 問題

`bin/specrunner.ts` の親コマンドディスパッチは、サブコマンドが見つからない場合に `entry.usage` を参照しない:

```typescript
// bin/specrunner.ts (line 39-48)
if (!subDef) {
  process.stderr.write(
    sub
      ? `Unknown ${command} subcommand: ${sub}\n\n`
      : `Error: specrunner ${command} requires a subcommand.\n\n`,
  );
  const subNames = Object.keys(entry.subcommands).join("|");
  process.stderr.write(`Usage: specrunner ${command} ${subNames}\n`);
  process.exit(2);
}
```

`specrunner rules --help` を実行したとき:

- `sub = "--help"`, `subDef = entry.subcommands["--help"]` → `undefined`
- エラーパス: `"Unknown rules subcommand: --help\n\n"` を stderr 出力
- `"Usage: specrunner rules new\n"` を出力して **exit 2**
- `RULES_USAGE` の内容は一切表示されない

通常コマンドの FlagParseError 時には `entry.usage` が表示される (line 93) が、親コマンドの `--help` パスではこの経路を通らない。  
`usage: RULES_USAGE` を設定しても表示されるパスが存在しない。

### 影響する要件

spec.md:
> `specrunner rules --help` は step 名規約・番号 prefix の自動採番・推奨見出し・順序方針 (末尾優先) を含む usage を表示しなければならない (MUST)

受け入れ基準:
> `specrunner rules --help` で usage と書き方の方針が表示される

どちらも満たせない。

### 修正案

tasks.md Task 3 に以下のステップを追加する:

> **3-X. `bin/specrunner.ts` 親コマンドの `--help` 対応**
>
> 親コマンドディスパッチ (`!subDef` ブロック) を更新し、`sub === "--help"` または `sub === "-h"` かつ `entry.usage` が定義済みの場合は `entry.usage` を **stdout** に出力して exit 0 する。`specrunner rules` (サブコマンドなし) の場合も同様に `entry.usage` を表示する。
>
> ```typescript
> if (!subDef) {
>   if ((sub === "--help" || sub === "-h" || !sub) && entry.usage) {
>     process.stdout.write(entry.usage);
>     process.exit(0);
>   }
>   process.stderr.write(
>     sub
>       ? `Unknown ${command} subcommand: ${sub}\n\n`
>       : `Error: specrunner ${command} requires a subcommand.\n\n`,
>   );
>   const subNames = Object.keys(entry.subcommands).join("|");
>   process.stderr.write(`Usage: specrunner ${command} ${subNames}\n`);
>   process.exit(2);
> }
> ```
>
> 注: この変更は `request` 等の既存親コマンドに影響しないが、将来 `usage` を設定すれば同じ恩恵を受けられる。

---

## 確認済み: 問題なし

| 観点 | 評価 |
|---|---|
| セキュリティ: slug の path traversal | `SLUG_REGEX` `/^[a-z0-9][a-z0-9-]{0,63}$/` で防護済み |
| セキュリティ: step 名インジェクション | `AGENT_STEP_NAMES` allowlist で検証、`stepRulesDirRel` は pure string concat |
| セキュリティ: ファイル上書き | 衝突チェック (exit 1) で防護済み |
| NaN 伝播バグ | tasks.md 2-3 に `filter(n => !isNaN(n))` 明記。TC-RULES-011 追加 |
| `CommandDef.positional` 型 | tasks.md 3-0 に `count?: number` 追加ステップ明記 |
| `parseFlags` の `count` 対応 | tasks.md 1-3 に `positionalDef` 拡張手順あり。`bin/specrunner.ts` line 62 経由で渡る |
| `positionals[0]` 後方互換 | `positional?: string` エイリアスとして残す設計、破壊的変更なし |
| `AGENT_STEP_NAMES` single source | import して使う。ハードコードなし |
| `stepRulesDirRel` 再利用 | `src/util/paths.ts` の既存関数を import |
| stdout/stderr 使い分け | 成功パスは stdout、エラーは stderr |
| D4: 連番採番 | `Math.max(...numbers, 0) + 1` + 2 桁ゼロパディング |
| template embedded const | D2 に従い source code 内 string const として定義 |
| テストカバレッジ | TC-RULES-001〜011 で要件網羅 |
| delta-spec-validation | approved 済み |

---

## 修正優先度

1. **指摘 1** (`--help` 表示): tasks.md Task 3 に `bin/specrunner.ts` 更新ステップを追加する
