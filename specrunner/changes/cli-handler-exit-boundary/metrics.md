# Metrics — cli-handler-exit-boundary

before = base `de88d1b5`（main, R3a 取り込み後）/ after = 本 PR head。
すべて同一の AST 集計スクリプト（§A）または同一コマンドで採取した。

## 1. 実測値

| 項目 | before | after | 採取方法 |
|---|---|---|---|
| `CommandHandler` return type | `Promise<void>` | `Promise<number>` | `src/cli/command-handler.ts` / ratchet Check 8 |
| 移行済み handler 数 / 全 handler 数 | 0 / 30 | 30 / 30 | §B（`COMMANDS` tree 走査）＋ ratchet Check 8（`Promise<void>` の `handle*` export = 0） |
| production `src/cli` 内の `process.exit` call 数 / 対象ファイル数（AST） | 70 / 23 | 0 / 0 | §A `cliExit` / `cliExitFiles`、ratchet Check 7 |
| （参考）同 text grep `process.exit(` 行数 / ファイル数 | 74 / 24 | 0 / 0 | §C。JSDoc の `process.exit()` 言及も新契約の文言へ書き換え済み |
| `bin/specrunner.ts` 内の `process.exit` call 数（AST） | 15 | 16 | §A `binExit`。+1 は dispatch 後の `process.exit(code)` |
| handler 内で共通 error-to-exit 変換だけを行う catch 数 | 5 | 0 | §A `catchSre` 差分（26 → 21）。削除 5 件は §D に列挙 |
| （参考）handler 内で `process.exit` を呼ぶ catch 数 | 11 | 0 | §A `catchExit` |
| migration shim / adapter 数 | 3 | 0 | §E（`runRun` / `runResume` / `runReopen` の `Promise<void>` ラッパー） |
| CLI 終了契約の base / candidate 比較ケース数 | — | 23 | `src/cli/__tests__/exit-contract-cases.ts`、fixture は `de88d1b5` から採取（provenance 参照） |
| value-import SCC 数（`src/cli`） | 0 | 0 | ratchet Check 5 |

## A. AST 集計スクリプト

`@typescript-eslint/typescript-estree` で `src/cli/**/*.ts`（`__tests__` と `*.test.ts` を除く）と `bin/specrunner.ts` を parse し、
`process.exit(...)` CallExpression と CatchClause を数える。repo root に置いて `bun <file> <repo-root>` で実行する。

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "@typescript-eslint/typescript-estree";
const root = process.argv[2];
function list(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name === "__tests__") continue; out.push(...list(path.join(dir, e.name))); }
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") && !e.name.endsWith(".test.ts")) out.push(path.join(dir, e.name));
  }
  return out;
}
function walk(n: any, f: (n: any) => void) {
  if (!n || typeof n !== "object") return;
  if (n.type) f(n);
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach((c) => c && typeof c === "object" && c.type && walk(c, f));
    else if (v && typeof v === "object" && (v as any).type) walk(v, f);
  }
}
const isExit = (n: any) => n.type === "CallExpression" && n.callee?.type === "MemberExpression" && n.callee.object?.name === "process" && n.callee.property?.name === "exit";
const files = [...list(path.join(root, "src/cli")), path.join(root, "bin/specrunner.ts")];
let cliExit = 0, binExit = 0, catchExit = 0, catchSre = 0; const cliFiles = new Set<string>(); const catchSreFiles: string[] = [];
for (const f of files) {
  const rel = path.relative(root, f); const isBin = rel.startsWith("bin/");
  const ast = parse(fs.readFileSync(f, "utf-8"), { loc: true });
  walk(ast, (n) => {
    if (isExit(n)) { if (isBin) binExit++; else { cliExit++; cliFiles.add(rel); } }
    if (n.type === "CatchClause" && !isBin) {
      let hasExit = false, hasSre = false;
      walk(n.body, (m) => { if (isExit(m)) hasExit = true; if (m.type === "Identifier" && m.name === "SpecRunnerError") hasSre = true; });
      if (hasExit) catchExit++; if (hasSre) { catchSre++; catchSreFiles.push(`${rel}:${n.loc.start.line}`); }
    }
  });
}
console.log(JSON.stringify({ cliExit, cliExitFiles: cliFiles.size, binExit, catchExit, catchSre, catchSreFiles }, null, 1));
```

結果:

| | before (`de88d1b5`) | after |
|---|---|---|
| `cliExit` / `cliExitFiles` | 70 / 23 | 0 / 0 |
| `binExit` | 15 | 16 |
| `catchExit` | 11 | 0 |
| `catchSre` | 26 | 21 |

## B. handler 数

```ts
import { COMMANDS } from "./src/cli/command-registry.ts";
let n = 0; const names = new Set<string>();
function walkAny(o: any) { if (!o || typeof o !== "object") return; if (typeof o.handler === "function") { n++; names.add(o.handler.name); } for (const v of Object.values(o)) if (v && typeof v === "object") walkAny(v); }
walkAny(COMMANDS);
console.log("handlers:", n, "distinct:", names.size, "anonymous:", [...names].filter((x) => !x).length);
```

before / after ともに `handlers: 30 distinct: 30 anonymous: 0`。
「移行済み」は ratchet Check 8（`src/cli` の exported `handle*` に `Promise<void>` 注釈が無い）で判定し、before は 0 / 30（`CommandHandler` 自体が `Promise<void>`）、after は 30 / 30。

## C. text grep（参考）

```bash
grep -rn "process\.exit(" src/cli --include="*.ts" | grep -v __tests__ | wc -l
grep -rln "process\.exit(" src/cli --include="*.ts" | grep -v __tests__ | wc -l
grep -c "process\.exit(" bin/specrunner.ts
```

before: 74 行 / 24 ファイル / bin 15 行。after: 0 行 / 0 ファイル / bin 17 行（bin の非 call 1 行はコメント、call 16 は §A `binExit` と一致）。
`src/cli` の JSDoc にあった `caller (dispatch boundary) is responsible for process.exit().` 系の記述は `Returns the exit code; process termination is owned by the dispatch boundary.` へ書き換え、text grep でも Goals 2 の「text 基準でも 0 件」と一致させた（AST 基準は ratchet Check 7 が comment を除外して検証する）。

## D. 削除した「共通変換のみ」の catch（5 件、§A `catchSreFiles` の before − after）

| before の位置 | 内容 |
|---|---|
| `src/cli/job-archive-handler.ts:66` | `SpecRunnerError` → `Error:` / `Hint:` → `process.exit(exitCode)`、その他 → `Fatal:` / 1 |
| `src/cli/job-resume-handler.ts:132` | 同上 |
| `src/cli/reopen.ts:100` | 同上 |
| `src/cli/prune.ts:120` | 同上（two-phase の `prune.ts:67` / `:86` はドメイン固有のため維持） |
| `src/cli/attach.ts:200` | 同上（`attach.ts:79` / `:101` / `:121` / `:156` のドメイン固有メッセージは維持） |

`doctor.ts` の flat `Fatal:` catch（`handleDoctor` / `handleDoctorRepair`）は `SpecRunnerError` 分岐を持たず、要件の「domain 上意味のある catch」として維持した。

## E. migration shim

```bash
git show de88d1b5:src/cli/run.ts    | grep -n "export async function runRun("
git show de88d1b5:src/cli/resume.ts | grep -n "export async function runResume("
git show de88d1b5:src/cli/reopen.ts | grep -n "export async function runReopen("
grep -rnE "export (async )?function run(Run|Resume|Reopen)\(" src/cli
```

before: 3 件（いずれも `process.exit(await run*Core(...))` の `Promise<void>` ラッパー）。after: 0 件。

## F. 終了契約 fixture の provenance

`src/cli/__tests__/fixtures/cli-exit-contract.base.provenance.json`:
`baseCommit = de88d1b5cf74bc43a258e9629347da2356a308c3`、`productionDirtyFiles = []`。
`bun run exit-contract:generate` を base commit の worktree で実行して採取し、production 変更を含まない単独 commit で確定した。
`cli-exit-contract.test.ts` は suite 前後で fixture の SHA-256 が一致することを guard する。
