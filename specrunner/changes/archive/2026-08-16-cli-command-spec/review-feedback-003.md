# Code Review Feedback — cli-command-spec — iter 3

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（41 ファイル変更）
- `src/cli/command-registry.ts` — CommandSpec 型・COMMANDS registry 全体・resolveCommand・resolveSpec・listCommandPaths・resolveEffectiveRequiresRepo・generateTopLevelUsage を精読
- `bin/specrunner.ts` — 単一 dispatch flow の全経路を精読（help pre-scan → worktree guard → parseFlags → requiresRepo → handler → catch）
- `src/cli/flag-parser.ts` — integer 型検証・deprecated flag・positionalDef `required` 処理を確認
- `tests/unit/cli/command-spec-api.test.ts` — TC-001〜TC-037 全 146 行を確認（TC-023 dispatch mock 含む）
- `tests/unit/cli/specrunner-worktree-guard.test.ts` — TC-WG-001〜TC-WG-008、stale コメント修正を確認
- `tests/unit/cli/doctor-repair.test.ts` — TC-DR-001〜TC-DR-003 を確認。handler 直呼び方式を確認
- `tests/unit/cli/help-flag-dispatch.test.ts` — TC-HELP-DISPATCH-01〜07 を確認
- `tests/unit/cli/hint-command-references.test.ts` — `listCommandPaths` 利用状況と `buildSubcommandMap` の実装を精読
- `tests/hint-command-existence.test.ts` — `listCommandPaths` 利用状況を確認
- `src/cli/__tests__/detach-output-contract.test.ts` — USAGE pin（--detach / job wait）を確認
- `src/cli/__tests__/login.test.ts`（grep）— TC-001 / TC-002 の --provider 検証を確認
- `tests/unit/cli/removed-commands.test.ts`（grep）— 旧コマンド文言・login --provider 移行メッセージを確認
- 受け入れ基準 10 項目を実装ソースと照合
- test-cases.md の 39 TC とテスト実装の対応を確認
- regression-gate-result-002.md でイテレーション 2 の修正状況を確認

## 検証できなかった項目

- `typecheck && test` の実際の実行（verification-result.md で passed を確認済み）
- TC-007/TC-008 の dispatch 経由 integration パス（null repoRoot での doctor 動作）

## Findings 詳細

### F-001: doctor repair の handler 内 slug ガードが dispatch 経路では dead code（TC-031 dispatch カバレッジ欠落）

`doctor repair` spec は `args: [{ name: "slug", required: true }]` を宣言しており、dispatch 経路では `parseFlags` が `FlagParseError("requires a <slug> argument")` を投げる。これにより handler の内部ガード（"Error: specrunner doctor repair requires a <slug> argument" を書いて `exit(2)` する）は dispatch 経由では**到達不能（dead code）**になる。

`tests/unit/cli/doctor-repair.test.ts` の TC-DR-001（TC-031 の実装）は handler を直接呼び出しており、この dead code を検証している。dispatch 経由での `specrunner doctor repair`（slug なし）の実際の動作は：

1. `FlagParseError("requires a <slug> argument")` を dispatch が捕捉
2. stderr に "requires a <slug> argument" + top-level `USAGE`（`doctor repair` に `help.detail` がないため）
3. `process.exit(2)` — exit code は正しい

TC-031 の要求は「`Usage: specrunner doctor repair <slug>` に相当する案内を出力し exit 2 で終了する」。exit code は正しいが、dispatch が実際に出力するのはジェネリックな top-level USAGE であり、"specrunner doctor repair" という具体的な案内は出ない。handler の内部ガードが意図する具体的な usage 案内は dispatch 経由では表示されない。

`job wait` handler にも同じパターンの到達不能ガードが存在する（`args: [{ name: "slug", required: true }]` + `if (!slug)` 内部ガード）。

**修正方法**: `doctor repair` の `help.detail` にコマンド固有の usage テキスト（`"Usage: specrunner doctor repair <slug>\n"` 等）を設定する。これにより dispatch の catch が `spec.help?.detail ?? USAGE` を選択し、具体的な案内が表示される。TC-DR-001 は dispatch 経由の形式（`runMain(["doctor", "repair"])`) に書き換えるか、dispatch 経路を補完する追加テストを加える。

### F-002: 純粋 parent コマンドの `--help` が spec 由来のサブコマンド列挙を生成せず NO_DETAILED_HELP_USAGE を表示

`emitHelp(undefined)` は `NO_DETAILED_HELP_USAGE`（"No detailed help available.\nRun 'specrunner --help' for the command list.\n"）を出力する。`help.detail` を持たない純粋 parent（`job`, `runtime`, `config`, `request`, `credentials`, `inbox`）の `--help` 呼び出しはこのフォールバックに落ちる。

`bin/specrunner.ts:43-44`:
```typescript
const hasHelp = args.some((a) => a === "--help" || a === "-h" || a.startsWith("--help="));
if (hasHelp && resolved.parent) {
  emitHelp(COMMANDS[resolved.parent]?.help?.detail);
}
```

`tasks.md T-06` は「parent `--help` renderer: parent の help 本文または `Usage: specrunner <cmd> <sub1|sub2>` を生成」と規定する。`rules` / `reviewers` は `help.detail` に `RULES_USAGE` / `REVIEWERS_USAGE` を持つため正しく表示されるが、`job`, `runtime` 等は "No detailed help available" になる。既存の pinned テストにはこれらの parent `--help` 内容を検査するものがなく、テストは green のまま。

`specrunner job --help` → "No detailed help available. Run 'specrunner --help'..."  
`specrunner runtime --help` → 同上  
設計仕様との乖離。

**修正方法**: `emitHelp` の呼び出し側で `usage` が `undefined` の場合に `resolved.availableChildren` から `Usage: specrunner ${resolved.parent} ${children.join("|")}` を生成する。または parent spec に `help.detail` を追加する。

### F-003: hint-command-references.test.ts の `buildSubcommandMap` が COMMANDS.children を直参照（T-07 移行部分残存）

`tests/unit/cli/hint-command-references.test.ts:96-104` の `buildSubcommandMap()` は `Object.entries(COMMANDS)` を直接反復して `entry.children` からサブコマンドマップを構築している。`validTopLevel` は `listCommandPaths({ includeAliases: true })` へ移行済み（iteration 2 で修正）だが、サブコマンドマップは内部構造直参照のまま。

`tasks.md T-07` が規定する 3 集合ビルド戦略（`topLevel` / `fullPaths` / `hasChildren`）は未適用。`T-07 AC`「hint 実在検査が spec 由来列挙 API を正本として使う」に対して部分的にしか準拠していない。機能的には `listCommandPaths` も `COMMANDS` を走査するため等価だが、API 契約上の正本とはなっていない。

**修正方法**: `buildSubcommandMap()` を `listCommandPaths({ includeAliases: true })` ベースの 3 集合アプローチに置換する（tasks.md T-07 の移行戦略を参照）。
