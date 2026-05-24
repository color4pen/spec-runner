# Spec Review Result: rules-new-command

- **verdict**: needs-fix
- **iteration**: 1
- **reviewer**: spec-reviewer

---

## 概要

全体の設計品質は高い。req → design → tasks → spec の一貫性も保たれている。  
ただし **実装が typecheck を通らない原因になる設計ギャップ** と **境界値バグ** の 2 点を確認したため `needs-fix`。

---

## 指摘 1（blocking）: NaN 伝播バグ — 非数値プレフィックス `.md` ファイルへの対応

### 場所

design.md `RN-1` ステップ 3 / tasks.md `Task 2-3` ステップ 3

### 問題

```
- `.md` ファイルのみ抽出、`parseInt(filename, 10)` で数字 prefix を取得
- `Math.max(...numbers, 0) + 1` で次番号決定
```

`specrunner/rules/<step>/` に `README.md` や `notes.md` などプレフィックスなしのファイルが存在すると:

```
parseInt("README.md", 10) → NaN
Math.max(NaN, 0)          → NaN  ← 仕様と実装のどちらで守るか明示がない
NaN + 1                   → NaN
String(NaN).padStart(2, "0") → "NaN"
```

`NaN-my-rule.md` が生成されるか、`String(NaN)` でクラッシュする。  
rules ディレクトリはユーザーが手動でファイルを追加できるため現実的なシナリオ。

### 修正案

tasks.md `Task 2-3 ステップ 3` に以下を追記する:

```typescript
const numbers = entries
  .filter(e => e.endsWith(".md"))
  .map(e => parseInt(e, 10))
  .filter(n => !isNaN(n));   // ← 追加: 数値プレフィックスなしファイルを除外
const next = Math.max(...numbers, 0) + 1;
```

またテストケースとして以下を追加する:

> TC-RULES-011: rules ディレクトリに `README.md` (プレフィックスなし) が存在する場合、採番が NaN にならず正しく `01-` または次番号から開始する。

---

## 指摘 2（blocking）: `CommandDef.positional` の型更新が tasks に記載されていない

### 場所

tasks.md `Task 3-3` / design.md `CR-1`

### 問題

CR-1 に示されているレジストリエントリ:

```typescript
positional: { name: "step-name rule-slug", required: true, count: 2 },
```

`command-registry.ts` の現在の `CommandDef` 定義:

```typescript
export interface CommandDef {
  positional?: { name: string; required: boolean };
  ...
```

`count: 2` は `CommandDef.positional` の型に存在しないため、TypeScript の excess property check でエラーになる。  
`bun run typecheck` が通らない。

Task 1-3 は `parseFlags` の `positionalDef` パラメーターに `count?: number` を追加するが、`CommandDef.positional` は別の型定義であり、tasks に明示的な更新手順がない。

### 修正案

tasks.md `Task 3-3` 冒頭に以下のステップを追加する:

> **3-0. `CommandDef.positional` の型に `count?: number` を追加**
>
> ```typescript
> export interface CommandDef {
>   positional?: { name: string; required: boolean; count?: number };
>   ...
> ```

---

## 確認済み: 問題なし

| 観点 | 評価 |
|---|---|
| セキュリティ: slug の path traversal | SLUG_REGEX `/^[a-z0-9][a-z0-9-]{0,63}$/` で防護済み |
| セキュリティ: step 名インジェクション | `AGENT_STEP_NAMES` allowlist で検証。`stepRulesDirRel` は pure string concat |
| セキュリティ: ファイル上書き | 衝突チェック (exit 1) で防護済み |
| stdout/stderr の使い分け | 成功パスは stdout (req で明示)、エラーは stderr — 正しい |
| `paths.ts` 制約 (TC-034) | `stepRulesDirRel` は既存関数を再利用。新規 import なし |
| `AGENT_STEP_NAMES` single source | `AGENT_STEP_NAMES` を import して使う。ハードコードなし |
| D4: 連番採番 | `Math.max(...numbers, 0) + 1` + 2 桁ゼロパディング — 正しい (NaN 指摘除く) |
| 後方互換 | `positional?: string` は `positionals[0]` エイリアスとして残す設計 — 破壊的変更なし |
| テストカバレッジ | TC-RULES-001〜010 で全要件を網羅 (TC-RULES-011 追加要) |
| delta-spec-validation | approved 済み |

---

## 修正優先度

1. **指摘 1** (NaN バグ): tasks.md に filter(isNaN) の追記 + TC-RULES-011 の追加
2. **指摘 2** (型ギャップ): tasks.md Task 3 に `CommandDef.positional` 型更新ステップの追加
