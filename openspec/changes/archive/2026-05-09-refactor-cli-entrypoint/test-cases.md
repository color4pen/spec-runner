# Test Cases: refactor-cli-entrypoint

## 対象ファイル

- `src/cli/flag-parser.ts` (新規)
- `src/cli/command-registry.ts` (新規)
- `bin/specrunner.ts` (書き換え)

---

## 1. parseFlags() — フラグパース

### 1-1. `--flag=value` 形式（string フラグ）

**priority**: must

```
GIVEN flagDefs に { "pr": { type: "string" } } が定義されている
WHEN parseFlags(["--pr=123"], flagDefs) を呼ぶ
THEN flags.pr === "123" が返る
 AND positional は undefined
```

### 1-2. `--flag value` 形式（スペース区切り、string フラグ）

**priority**: must

```
GIVEN flagDefs に { "type": { type: "string" } } が定義されている
WHEN parseFlags(["--type", "spec-change"], flagDefs) を呼ぶ
THEN flags.type === "spec-change" が返る
 AND 次引数は consume され positional に混入しない
```

### 1-3. boolean フラグ（`--flag` のみ）

**priority**: must

```
GIVEN flagDefs に { "verbose": { type: "boolean" }, "force": { type: "boolean" } } が定義されている
WHEN parseFlags(["--verbose", "--force"], flagDefs) を呼ぶ
THEN flags.verbose === true かつ flags.force === true が返る
```

### 1-4. boolean フラグに `=value` が付いた場合（value 部分を無視）

**priority**: should

```
GIVEN flagDefs に { "dry-run": { type: "boolean" } } が定義されている
WHEN parseFlags(["--dry-run=anything"], flagDefs) を呼ぶ
THEN flags["dry-run"] === true が返る（value 部分は無視される）
```

### 1-5. `-h` → `help: true` マッピング

**priority**: must

```
GIVEN flagDefs に { "help": { type: "boolean" } } が定義されている
WHEN parseFlags(["-h"], flagDefs) を呼ぶ
THEN flags.help === true が返る
```

### 1-6. positional 引数の抽出（フラグなし）

**priority**: must

```
GIVEN flagDefs が空のオブジェクト {}
 AND positionalDef = { name: "slug", required: true }
WHEN parseFlags(["my-slug"], {}, positionalDef) を呼ぶ
THEN positional === "my-slug" が返る
```

### 1-7. positional とフラグが混在する場合

**priority**: must

```
GIVEN flagDefs に { "force": { type: "boolean" }, "from": { type: "string" } } が定義されている
 AND positionalDef = { name: "slug", required: true }
WHEN parseFlags(["my-slug", "--force", "--from", "critic"], flagDefs, positionalDef) を呼ぶ
THEN positional === "my-slug" かつ flags.force === true かつ flags.from === "critic" が返る
```

### 1-8. unknown flag で FlagParseError を throw する

**priority**: must

```
GIVEN flagDefs に { "force": { type: "boolean" } } が定義されている
WHEN parseFlags(["--unknown-flag"], flagDefs) を呼ぶ
THEN FlagParseError が throw される
 AND エラーメッセージに "--unknown-flag" が含まれる
```

### 1-9. enum 制約違反で FlagParseError を throw する

**priority**: must

```
GIVEN flagDefs に { "runtime": { type: "string", values: ["managed", "local"] } } が定義されている
WHEN parseFlags(["--runtime=invalid"], flagDefs) を呼ぶ
THEN FlagParseError が throw される
 AND エラーメッセージに "invalid" と valid values が含まれる
```

### 1-10. enum 制約に合致する値は通過する

**priority**: must

```
GIVEN flagDefs に { "from": { type: "string", values: ["critic", "fixer", "creator"] } } が定義されている
WHEN parseFlags(["--from=fixer"], flagDefs) を呼ぶ
THEN flags.from === "fixer" が返る（FlagParseError は throw されない）
```

### 1-11. required positional が不足したとき FlagParseError を throw する

**priority**: must

```
GIVEN flagDefs が {}
 AND positionalDef = { name: "file", required: true }
WHEN parseFlags([], {}, positionalDef) を呼ぶ
THEN FlagParseError が throw される
 AND エラーメッセージに positional 名 "file" が含まれる
```

### 1-12. optional positional が不足しても throw しない

**priority**: must

```
GIVEN flagDefs が {}
 AND positionalDef = { name: "slug", required: false }
WHEN parseFlags([], {}, positionalDef) を呼ぶ
THEN positional === undefined が返る（FlagParseError は throw されない）
```

### 1-13. string フラグで次引数が存在しない場合

**priority**: should

```
GIVEN flagDefs に { "pr": { type: "string" } } が定義されている
WHEN parseFlags(["--pr"], flagDefs) を呼ぶ（次引数なし）
THEN FlagParseError が throw される
```

### 1-14. フラグと positional の順序が入れ替わっても正しくパースされる

**priority**: should

```
GIVEN flagDefs に { "verbose": { type: "boolean" } } が定義されている
 AND positionalDef = { name: "request", required: true }
WHEN parseFlags(["--verbose", "path/to/request.md"], flagDefs, positionalDef) を呼ぶ
THEN positional === "path/to/request.md" かつ flags.verbose === true が返る
```

---

## 2. CommandRegistry — コマンド定義

### 2-1. 全 9 コマンドがレジストリに登録されている

**priority**: must

```
GIVEN COMMANDS レジストリを import する
WHEN Object.keys(COMMANDS) を参照する
THEN ["init", "login", "run", "request", "ps", "doctor", "finish", "rm", "resume"] が全て含まれる
```

### 2-2. `request` が ParentCommandDef として定義されている

**priority**: must

```
GIVEN COMMANDS.request を参照する
WHEN "subcommands" in COMMANDS.request を評価する
THEN true が返る
 AND COMMANDS.request.subcommands に "template" と "validate" が存在する
```

### 2-3. `resume` コマンドの from フラグに enum 制約がある

**priority**: must

```
GIVEN COMMANDS.resume.flags を参照する
WHEN COMMANDS.resume.flags.from を参照する
THEN type === "string" かつ values が ["critic", "fixer", "creator"] を含む
```

### 2-4. `init` コマンドの runtime フラグに enum 制約がある

**priority**: must

```
GIVEN COMMANDS.init.flags を参照する
WHEN COMMANDS.init.flags.runtime を参照する
THEN type === "string" かつ values が ["managed", "local"] を含む
```

### 2-5. `finish` コマンドの handler が --help フラグ時に FINISH_USAGE を出力して exit(0) する

**priority**: must

```
GIVEN process.stdout.write と process.exit をモックする
WHEN COMMANDS.finish.handler({ flags: { help: true }, positional: undefined }) を呼ぶ
THEN process.stdout.write が FINISH_USAGE を含む文字列で呼ばれる
 AND process.exit(0) が呼ばれる
```

### 2-6. `finish` handler が ParsedArgs を既存 runFinish の引数形式に正しく変換する

**priority**: must

```
GIVEN runFinish をモックする
WHEN COMMANDS.finish.handler({
  flags: { pr: "42", "dry-run": true, force: false },
  positional: "my-slug"
}) を呼ぶ
THEN runFinish が { slug: "my-slug", prNumber: 42, dryRun: true, force: false, cwd: process.cwd() } で呼ばれる
```

### 2-7. `run` handler が ParsedArgs を既存 runRun の引数形式に正しく変換する

**priority**: must

```
GIVEN runRun をモックする
WHEN COMMANDS.run.handler({
  flags: { verbose: true },
  positional: "openspec/changes/foo/request.md"
}) を呼ぶ
THEN runRun が { requestFile: "openspec/changes/foo/request.md", verbose: true, cwd: process.cwd() } に相当する形式で呼ばれる
```

### 2-8. `resume` handler が ParsedArgs を既存 runResume の引数形式に正しく変換する

**priority**: must

```
GIVEN runResume をモックする
WHEN COMMANDS.resume.handler({
  flags: { from: "critic", force: true, verbose: false },
  positional: "my-feature"
}) を呼ぶ
THEN runResume が { slug: "my-feature", from: "critic", force: true, verbose: false, cwd: process.cwd() } に相当する形式で呼ばれる
```

### 2-9. `rm` の flags に force / all-terminated / yes が定義されている

**priority**: should

```
GIVEN COMMANDS.rm.flags を参照する
THEN "force", "all-terminated", "yes" が全て boolean 型で定義されている
```

### 2-10. `ps` の flags に active / all が定義されている

**priority**: should

```
GIVEN COMMANDS.ps.flags を参照する
THEN "active", "all" が boolean 型で定義されている
```

---

## 3. bin/specrunner.ts — エントリポイント

### 3-1. ファイル行数が 100 行以下

**priority**: must

```
GIVEN bin/specrunner.ts の実装が完了している
WHEN wc -l bin/specrunner.ts を実行する（またはファイルを読む）
THEN 行数 ≤ 100
```

### 3-2. USAGE と FINISH_USAGE が export されている

**priority**: must

```
GIVEN bin/specrunner.ts を import する
WHEN { USAGE, FINISH_USAGE } を参照する
THEN どちらも string 型で空でない値が返る
```

### 3-3. top-level `--help` でUSAGE を stdout に出力して exit(0)

**priority**: must

```
GIVEN process.argv = ["node", "specrunner", "--help"]
WHEN main() を呼ぶ
THEN USAGE が process.stdout.write で出力される
 AND process.exit(0) が呼ばれる
```

### 3-4. top-level `-h` でも同様に exit(0)

**priority**: must

```
GIVEN process.argv = ["node", "specrunner", "-h"]
WHEN main() を呼ぶ
THEN USAGE が出力される
 AND process.exit(0) が呼ばれる
```

### 3-5. 引数なしで USAGE を stderr に出力して exit(2)

**priority**: must

```
GIVEN process.argv = ["node", "specrunner"]
WHEN main() を呼ぶ
THEN USAGE が process.stderr.write で出力される
 AND process.exit(2) が呼ばれる
```

### 3-6. 未知のコマンドで stderr にエラー + exit(2)

**priority**: must

```
GIVEN process.argv = ["node", "specrunner", "nonexistent"]
WHEN main() を呼ぶ
THEN process.stderr.write が "Unknown command: nonexistent" を含む文字列で呼ばれる
 AND process.exit(2) が呼ばれる
```

### 3-7. FlagParseError が catch されて stderr + exit(2)（コマンドレベル）

**priority**: must

```
GIVEN process.argv = ["node", "specrunner", "run", "--invalid-flag"]
WHEN main() を呼ぶ
THEN FlagParseError メッセージが process.stderr.write で出力される
 AND process.exit(2) が呼ばれる
 AND process.exit(1) は呼ばれない
```

### 3-8. handler の非 FlagParseError は "Fatal:" プレフィックスで stderr + exit(1)

**priority**: must

```
GIVEN COMMANDS.run.handler が Error("something went wrong") を throw するようにモックされている
 AND process.argv = ["node", "specrunner", "run", "request.md"]
WHEN main() を呼ぶ
THEN process.stderr.write が "Fatal:" を含む文字列で呼ばれる
 AND process.exit(1) が呼ばれる
```

### 3-9. `request template` サブコマンドが正しくディスパッチされる

**priority**: must

```
GIVEN request.template.handler をモックする
 AND process.argv = ["node", "specrunner", "request", "template"]
WHEN main() を呼ぶ
THEN モックされた template handler が呼ばれる
```

### 3-10. `request validate` サブコマンドが正しくディスパッチされる

**priority**: must

```
GIVEN request.validate.handler をモックする
 AND process.argv = ["node", "specrunner", "request", "validate", "openspec/changes/foo/request.md"]
WHEN main() を呼ぶ
THEN モックされた validate handler が positional === "openspec/changes/foo/request.md" で呼ばれる
```

### 3-11. `request` にサブコマンドが指定されない場合は exit(2)

**priority**: must

```
GIVEN process.argv = ["node", "specrunner", "request"]
WHEN main() を呼ぶ
THEN process.stderr.write でエラーメッセージが出力される
 AND process.exit(2) が呼ばれる
```

### 3-12. `request` に不明なサブコマンドが指定された場合は exit(2)

**priority**: should

```
GIVEN process.argv = ["node", "specrunner", "request", "unknown-sub"]
WHEN main() を呼ぶ
THEN process.stderr.write でエラーメッセージが出力される
 AND process.exit(2) が呼ばれる
```

---

## 4. 既存テストとの互換性

### 4-1. specrunner-resume-dispatch.test.ts が pass する

**priority**: must

```
GIVEN tests/unit/cli/specrunner-resume-dispatch.test.ts が存在する
WHEN bun run test を実行する
THEN specrunner-resume-dispatch.test.ts の全テストが pass する
```

### 4-2. bun run typecheck が green

**priority**: must

```
GIVEN 全実装ファイル（flag-parser.ts, command-registry.ts, bin/specrunner.ts）が揃っている
WHEN bun run typecheck を実行する
THEN 型エラーが 0 件
```

### 4-3. bun run test が green

**priority**: must

```
GIVEN 全実装とテストが揃っている
WHEN bun run test を実行する
THEN テストスイート全体が pass する（失敗 0 件）
```

---

## 5. 非機能・構造

### 5-1. flag-parser.ts がコマンドレジストリ・ハンドラに依存しない

**priority**: should

```
GIVEN src/cli/flag-parser.ts の import 文を確認する
THEN command-registry.ts / src/cli/handlers への import が存在しない
 AND 純粋なパースロジックのみで構成されている
```

### 5-2. bin/specrunner.ts に switch/case が残存しない

**priority**: must

```
GIVEN bin/specrunner.ts の実装が完了している
WHEN ファイル内の "switch" キーワードを検索する
THEN 0 件（switch/case ブロックが存在しない）
```

### 5-3. 外部ライブラリへの依存がない

**priority**: must

```
GIVEN flag-parser.ts と command-registry.ts の import 文を確認する
WHEN node_modules 配下のパッケージへの import を検索する
THEN args parser 系の外部パッケージ（yargs, commander, minimist 等）への import が 0 件
```
