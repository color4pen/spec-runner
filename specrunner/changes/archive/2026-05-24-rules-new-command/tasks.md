# Tasks: `specrunner rules new` コマンド

## Task 1: flag-parser の多 positional 対応

**対象ファイル**: `src/cli/flag-parser.ts`

### 1-1. `ParsedArgs` に `positionals: string[]` を追加

```typescript
export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional?: string;     // 後方互換: positionals[0]
  positionals: string[];   // 全 non-flag トークン
}
```

### 1-2. `parseFlags` の non-flag トークン収集を変更

現在:
```typescript
} else {
  // positional: take only the first one
  if (positional === undefined) {
    positional = arg;
  }
}
```

変更後: `positionals` 配列に全 non-flag トークンを push する。`positional` は `positionals[0]` として返す。

```typescript
const positionals: string[] = [];
// ... (ループ内)
} else {
  positionals.push(arg);
}
// ... (return 前)
return { flags, positional: positionals[0], positionals };
```

### 1-3. positionalDef に `count?: number` を追加

```typescript
positionalDef?: { name: string; required: boolean; count?: number };
```

- `count` 省略 or `count: 1` → 従来通り `positionals[0]` の存在チェック
- `count: N` → `positionals.length < N` で `FlagParseError("requires <name> arguments")`

### 1-4. テスト追加 (flag-parser.test.ts)

既存テストファイル `tests/unit/cli/flag-parser.test.ts` に追加:

- 複数 positional を `positionals` 配列で取得できること
- `positional` が `positionals[0]` と一致すること (後方互換)
- `count: 2` で positional が 1 つしかない場合に `FlagParseError`
- 既存テストが全て pass すること (回帰なし)

**検証**: `bun run test -- tests/unit/cli/flag-parser.test.ts`

- [x] 1-1: `positionals: string[]` を `ParsedArgs` に追加
- [x] 1-2: `parseFlags` の non-flag トークン収集を `positionals` 配列に変更
- [x] 1-3: `positionalDef` に `count?: number` を追加
- [x] 1-4: テスト追加 (flag-parser.test.ts)

---

## Task 2: `executeRulesNew()` コアロジック

**対象ファイル**: `src/core/command/rules-new.ts` (新規作成)

### 2-1. モジュール構造

```typescript
import { AGENT_STEP_NAMES } from "../step/step-names.js";
import { stepRulesDirRel } from "../../util/paths.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
```

### 2-2. RULE_TEMPLATE const

design.md の RN-2 に記載の template を string const として定義する。

### 2-3. `executeRulesNew(stepName, ruleSlug, cwd): Promise<number>`

処理フロー:

1. **step-name 検証**: `AGENT_STEP_NAMES` に含まれるか確認。不一致 → stderr にエラーメッセージ + `AGENT_STEP_NAMES` 全件を候補として表示、return 2
2. **rule-slug sanitize**:
   - `_` → `-` に置換、1 つ以上置換したら stderr に warning
   - 空白 (` `) → `-` に置換、1 つ以上置換したら stderr に warning
   - 置換後に `SLUG_REGEX` (`/^[a-z0-9][a-z0-9-]{0,63}$/`) で検証。不一致 → stderr にエラー、return 2
3. **ディレクトリ scan + 採番**:
   - `path.join(cwd, stepRulesDirRel(stepName))` を `readdir`。ENOENT は空配列扱い
   - `.md` ファイルのみ抽出、`parseInt(filename, 10)` で数字 prefix を取得
   - `NaN` を除外してから `Math.max` に渡す:
     ```typescript
     const numbers = entries
       .filter(e => e.endsWith(".md"))
       .map(e => parseInt(e, 10))
       .filter(n => !isNaN(n));   // 数値プレフィックスなしファイル (README.md 等) を除外
     const next = Math.max(...numbers, 0) + 1;
     ```
   - 2 桁ゼロパディング (`String(next).padStart(2, "0")`)
4. **ファイル名生成**: `${nn}-${ruleSlug}.md`
5. **衝突チェック**: 同一 slug のファイルが既存エントリに含まれるか確認。含まれる → stderr にエラー、return 1
6. **ディレクトリ作成**: `fs.mkdir(dir, { recursive: true })`
7. **ファイル書き込み**: `fs.writeFile(filePath, RULE_TEMPLATE, "utf-8")`
8. **stdout に作成パス出力**: `process.stdout.write(relativePath + "\n")`。return 0

### 2-4. テスト追加 (rules-new.test.ts)

**対象ファイル**: `tests/unit/core/command/rules-new.test.ts` (新規作成)

テストケース:

- TC-RULES-001: 有効な step-name + rule-slug → ファイル作成、exit 0、stdout にパス出力
- TC-RULES-002: 無効な step-name → exit 2、stderr に候補一覧
- TC-RULES-003: CLI step name (`verification`) → exit 2 (agent step のみ受け付け)
- TC-RULES-004: 既存ファイルあり → 次番号で採番 (01 → 02)
- TC-RULES-005: slug に `_` → warning + `-` 変換後にファイル作成
- TC-RULES-006: slug に空白 → warning + `-` 変換後にファイル作成
- TC-RULES-007: 無効な slug (path traversal) → exit 2
- TC-RULES-008: 同名 slug 衝突 → exit 1
- TC-RULES-009: 空ディレクトリ → `01-` から開始
- TC-RULES-010: template 内容に推奨見出し 3 セクションと冒頭コメントが含まれること
- TC-RULES-011: rules ディレクトリに `README.md` (プレフィックスなし) が存在する場合、採番が NaN にならず正しく `01-` または次番号から開始する

**検証**: `bun run test -- tests/unit/core/command/rules-new.test.ts`

- [x] 2-1: モジュール構造 (import 宣言)
- [x] 2-2: RULE_TEMPLATE const
- [x] 2-3: `executeRulesNew()` 実装
- [x] 2-4: テスト追加 (rules-new.test.ts)

---

## Task 3: command-registry 登録

**対象ファイル**: `src/cli/command-registry.ts`

### 3-0. `CommandDef.positional` の型に `count?: number` を追加

```typescript
export interface CommandDef {
  positional?: { name: string; required: boolean; count?: number };
  ...
```

TypeScript の excess property check で `count: 2` がエラーにならないよう、`CommandDef` の `positional` 型を更新する。

### 3-1. import 追加

```typescript
import { executeRulesNew } from "../core/command/rules-new.js";
```

### 3-2. RULES_USAGE const 追加

`specrunner rules --help` / `specrunner rules` (subcommand なし) で表示する help テキスト。
含める内容:
- Usage 行: `specrunner rules new <step-name> <rule-slug>`
- 説明: step 用の rules ファイルを scaffold
- 有効な step 名一覧: `AGENT_STEP_NAMES` から動的生成 (ハードコード回避)
- 番号 prefix の自動採番の説明
- 推奨見出しの説明
- 順序方針 (末尾優先 = recency bias 活用) の説明

### 3-3. COMMANDS に `rules` parent command を追加

```typescript
rules: {
  subcommands: {
    new: {
      flags: {},
      positional: { name: "step-name rule-slug", required: true, count: 2 },
      handler: async (parsed) => {
        const stepName = parsed.positionals[0]!;
        const ruleSlug = parsed.positionals[1]!;
        process.exit(await executeRulesNew(stepName, ruleSlug, process.cwd()));
      },
    },
  },
  usage: RULES_USAGE,
},
```

### 3-4. USAGE 文字列に Rules セクション追加

`Environment commands:` の前に挿入:

```
Rules commands:
  rules new <step> <slug>         step 用の rules ファイルを scaffold
```

### 3-5. `bin/specrunner.ts` 親コマンドの `--help` 対応

**対象ファイル**: `bin/specrunner.ts`

親コマンドディスパッチの `!subDef` ブロックを更新し、`sub === "--help"` または `sub === "-h"` またはサブコマンドなし (`!sub`) かつ `entry.usage` が定義済みの場合は `entry.usage` を **stdout** に出力して exit 0 する:

```typescript
if (!subDef) {
  if ((sub === "--help" || sub === "-h" || !sub) && entry.usage) {
    process.stdout.write(entry.usage);
    process.exit(0);
  }
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

注: `entry.usage` が未設定の既存親コマンド (`request` 等) の挙動は変わらない。

### 3-6. テスト追加

既存の CLI integration テストがあればそこに追加。なければ `rules-new.test.ts` 内で command registry 経由のテストは不要 (コアロジックのテストで十分)。

**検証**: `bun run typecheck && bun run test`

- [x] 3-0: `CommandDef.positional` に `count?: number` 追加
- [x] 3-1: `executeRulesNew` import 追加
- [x] 3-2: `RULES_USAGE` const 追加
- [x] 3-3: COMMANDS に `rules` parent command 追加
- [x] 3-4: USAGE 文字列に Rules セクション追加
- [x] 3-5: `bin/specrunner.ts` の --help 対応

---

## 実行順序

Task 1 → Task 2 → Task 3 (各 Task 内は上から順)

Task 1 (flag-parser) は Task 3 (registry 登録) の前提。Task 2 (コアロジック) は独立して実装可能だが、registry 登録でインテグレーションする Task 3 が最後。

## 最終検証

```bash
bun run typecheck && bun run test
```

✅ typecheck: 0 errors  
✅ test: 2747 passed (245 test files)
