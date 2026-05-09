## Context

`bin/specrunner.ts` は 338 行の switch/case でコマンドをディスパッチしている。各 case ブロック内にフラグパース（`--flag=value` 分解、boolean フラグ、unknown flag 検出、enum バリデーション）が重複している。

現在のコマンド一覧と引数パターン:

| Command | Positional | Boolean Flags | Value Flags (=形式) | Enum Constraint |
|---------|-----------|--------------|-------------------|----------------|
| init | — | — | api-key, runtime | runtime: managed\|local |
| login | — | — | — | — |
| run | `<request.md>` (必須) | verbose | — | — |
| request template | — | — | type (=形式 + スペース形式) | — |
| request validate | `<file>` (必須) | — | — | — |
| ps | — | active, all | — | — |
| doctor | — | json | — | — |
| finish | `<slug>` (任意) | dry-run, force, help | pr, job | — |
| rm | `<jobId>` (任意) | force, all-terminated, yes | — | — |
| resume | `<slug>` (必須) | force, verbose | from | from: critic\|fixer\|creator |

各コマンドハンドラは `src/cli/*.ts` に既に分離されており、エントリポイントの責務はフラグパース + ディスパッチのみ。

## Goals / Non-Goals

**Goals:**

- フラグ定義をデータとして宣言する型 (`FlagDef`) とコマンドレジストリを導入する
- `--flag=value` / `--flag value` 分解、unknown flag 検出、enum バリデーションを `parseFlags()` 1 関数に集約する
- `bin/specrunner.ts` を 100 行以下に縮小する
- 外部ライブラリを使わない（自前軽量パーサー）
- 全既存コマンドの引数パースが同一の動作を維持する

**Non-Goals:**

- 新コマンドの追加
- コマンドハンドラ (`src/cli/*.ts`) の内部ロジック変更
- ヘルプメッセージの改善
- USAGE 文字列の自動生成

## Decisions

### D1: ファイル構成

3 ファイルに分割する:

| File | 責務 |
|------|------|
| `src/cli/flag-parser.ts` | `FlagDef`, `ParsedArgs`, `FlagParseError`, `parseFlags()` — 純粋なパースロジック |
| `src/cli/command-registry.ts` | `CommandDef`, `COMMANDS` レジストリ — 各コマンドのフラグ定義 + handler 関数 |
| `bin/specrunner.ts` | USAGE 定数 + `main()` — レジストリ lookup とディスパッチのみ |

**理由**: パーサーとレジストリを分離することで、パーサー単体のユニットテストが容易になる。レジストリは各コマンドハンドラを import するため、bin/ ではなく src/ に配置する。

### D2: FlagDef 型

```typescript
export interface FlagDef {
  type: "boolean" | "string";
  values?: readonly string[];  // string 型の enum 制約
}
```

**理由**: 現在の全コマンドのフラグは boolean か string のどちらか。`values` で enum バリデーションを宣言的に表現する。alias (`-h`) は `help` flag として boolean で定義し、パーサーで `-h` → `help` のマッピングを行う（現状 `-h` を使うのは top-level と finish のみ）。

### D3: parseFlags の振る舞い

```typescript
export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional?: string;
}

export function parseFlags(
  rawArgs: string[],
  flagDefs: Record<string, FlagDef>,
  positionalDef?: { name: string; required: boolean },
): ParsedArgs;
```

パースルール:
1. `--flag=value` → flagDefs で lookup、string 型なら value を格納、boolean 型なら value 部分を無視して `true`
2. `--flag` (= なし) → boolean 型なら `true`、string 型なら次の引数を consume
3. `-h` → `help: true` にマッピング（ハードコード。唯一の短縮形）
4. それ以外 → positional（最初の 1 つのみ採用）
5. unknown flag → `FlagParseError` を throw
6. enum 制約違反 → `FlagParseError` を throw
7. required positional 不足 → `FlagParseError` を throw

`FlagParseError` は `Error` のサブクラス。呼び出し側が catch してエラーメッセージ + usage を stderr に出力し、`process.exit(2)` する。

**理由**: 現在のコマンド群の全パターン（boolean, string=value, string space, enum, positional, unknown detection）を 1 関数で処理できる。`-h` のみ短縮形のハードコードで十分（他の短縮形は存在しない）。

### D4: CommandDef 型とレジストリ

```typescript
export interface CommandDef {
  flags: Record<string, FlagDef>;
  positional?: { name: string; required: boolean };
  usage?: string;  // コマンド固有のヘルプ文字列
  handler: (parsed: ParsedArgs) => Promise<void>;
}

export interface ParentCommandDef {
  subcommands: Record<string, CommandDef>;
  usage?: string;
}

export type CommandEntry = CommandDef | ParentCommandDef;

export const COMMANDS: Record<string, CommandEntry> = { ... };
```

`request` はサブコマンドを持つので `ParentCommandDef` として定義する。dispatcher は `CommandEntry` が `subcommands` を持つかで分岐する。

各 `handler` はレジストリ内で定義し、`ParsedArgs` から既存ハンドラの引数形式への変換を行う:

```typescript
// 例: finish
finish: {
  flags: {
    "pr": { type: "string" },
    "job": { type: "string" },
    "dry-run": { type: "boolean" },
    "force": { type: "boolean" },
    "help": { type: "boolean" },
  },
  positional: { name: "slug", required: false },
  usage: FINISH_USAGE,
  handler: async (parsed) => {
    if (parsed.flags.help) {
      process.stdout.write(FINISH_USAGE);
      process.exit(0);
    }
    const prNumber = parsed.flags.pr ? parseInt(parsed.flags.pr as string, 10) : undefined;
    process.exit(await runFinish({
      slug: parsed.positional,
      prNumber,
      jobId: parsed.flags.job as string | undefined,
      dryRun: !!parsed.flags["dry-run"],
      force: !!parsed.flags.force,
      cwd: process.cwd(),
    }));
  },
},
```

**理由**: handler をレジストリに書くことで、`ParsedArgs` → 既存ハンドラ引数への変換ロジックがコマンド定義と同居し、bin/specrunner.ts からは完全に消える。既存ハンドラの引数型は変更不要。

### D5: bin/specrunner.ts の縮小後構造

```typescript
// USAGE, FINISH_USAGE 定数（変更なし）
// import { COMMANDS } from "../src/cli/command-registry.js"
// import { parseFlags, FlagParseError } from "../src/cli/flag-parser.js"

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // top-level --help / -h
  if (command === "--help" || command === "-h") { ... }
  if (!command) { ... }

  const entry = COMMANDS[command];
  if (!entry) {
    process.stderr.write(`Unknown command: ${command}\n\n`);
    process.stderr.write(USAGE);
    process.exit(2);
  }

  // subcommand dispatch (request)
  if ("subcommands" in entry) {
    const sub = args[1];
    const subDef = sub ? entry.subcommands[sub] : undefined;
    if (!subDef) {
      // error message + usage
      process.exit(2);
    }
    try {
      const parsed = parseFlags(args.slice(2), subDef.flags, subDef.positional);
      await subDef.handler(parsed);
    } catch (e) {
      if (e instanceof FlagParseError) { ... process.exit(2); }
      throw e;
    }
    return;
  }

  // normal command dispatch
  try {
    const parsed = parseFlags(args.slice(1), entry.flags, entry.positional);
    await entry.handler(parsed);
  } catch (e) {
    if (e instanceof FlagParseError) {
      process.stderr.write(e.message + "\n");
      if (entry.usage) process.stderr.write(entry.usage);
      else process.stderr.write(USAGE);
      process.exit(2);
    }
    throw e;
  }
}
```

**理由**: 全コマンドのパースロジックが消え、ディスパッチのみになる。USAGE / FINISH_USAGE は bin/specrunner.ts に残す（既存テストが `import { USAGE } from "..."` している可能性がある）。

### D6: エラーメッセージの互換性

`FlagParseError` のメッセージは現在の出力と完全一致を目指さない。exit code 2 と stderr 出力（unknown flag 名の表示 + usage テキスト）を維持する。

**理由**: テストは exit code とフラグパース結果（handler への引数）を検証しており、エラーメッセージの文言を exact match で検証するテストは `specrunner-resume-dispatch.test.ts` にあるため、そのテストが pass する範囲で調整する。
