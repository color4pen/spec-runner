# Design: CLI noun-verb restructure

## Overview

CLI の混成構造（9 サブコマンド + 5 トップレベル動詞）を `request` / `job` / `runtime` の noun-verb 体系に再編する。`bin/specrunner.ts` の dispatch flow を一箇所で書き換え、command-registry のエントリを noun 別 ParentCommandDef に再配置し、worktree guard を subcommand dispatch path にも適用する。

## Architecture Decisions

### AD-1: noun-verb dispatch は既存の ParentCommandDef パターンを再利用する

現行 `command-registry.ts` の `ParentCommandDef` / `CommandDef` 型はそのまま。`request` / `managed` が既にこのパターンなので、`job` / `runtime` も同型で追加するだけ。dispatch ロジック（`bin/specrunner.ts:36-61`）は変更不要。

### AD-2: worktree guard を subcommand dispatch path にも適用する

**問題**: 現行 `WORKTREE_GUARDED_COMMANDS` は top-level command 用。subcommand dispatch path（line 36-61）は guard を通らない。`job start/resume/finish` を ParentCommandDef 配下にすると guard 対象外になる。

**方針**: `ParentCommandDef` に `guardedSubcommands: Set<string>` を追加。subcommand dispatch 内で `entry.guardedSubcommands?.has(sub)` を判定し、`detectWorktree()` + `worktreeGuardError()` を呼ぶ。

```typescript
export interface ParentCommandDef {
  subcommands: Record<string, CommandDef>;
  usage?: string;
  guardedSubcommands?: Set<string>;  // NEW
}
```

dispatch 変更（`bin/specrunner.ts` subcommand path 内）:

```typescript
if ("subcommands" in entry) {
  const sub = args[1];
  const subDef = sub ? entry.subcommands[sub] : undefined;
  if (!subDef) { /* existing error handling */ }

  // NEW: subcommand-level worktree guard
  if (entry.guardedSubcommands?.has(sub!)) {
    const detection = await detectWorktree(process.cwd());
    if (detection.isWorktree) {
      throw worktreeGuardError(`${command} ${sub}`, detection.mainWorktreePath ?? process.cwd());
    }
  }

  // existing: parseFlags + handler
}
```

`job` 定義:
```typescript
job: {
  guardedSubcommands: new Set(["start", "resume", "finish"]),
  subcommands: { start: {...}, ls: {...}, show: {...}, rm: {...}, resume: {...}, finish: {...} }
}
```

メリット: top-level guard (`WORKTREE_GUARDED_COMMANDS`) との並存が最小変更。`run` alias は top-level command なので既存 guard のまま。

### AD-3: 旧 top-level 動詞の削除と `run` alias 維持

- `ps` / `rm` / `resume` / `finish` を `COMMANDS` から削除
- `run` のみ残し、handler 内で `job start` と同じ handler を呼ぶ（= 実体共有、alias ではなく同一関数参照）

```typescript
// run は job.subcommands.start と同じ handler を参照
run: {
  flags: { verbose: { type: "boolean" } },
  positional: { name: "request.md|slug", required: true },
  handler: async (parsed) => { /* same as job start handler */ },
}
```

### AD-4: `managed` → `runtime` rename は key 変更のみ

`COMMANDS["managed"]` → `COMMANDS["runtime"]` に key を変更。handler 関数（`runManagedSetup` / `runManagedStatus` / `runManagedReset`）は rename せず import alias で対応。内部実装の変更は最小化する。

### AD-5: 新規コマンド `request new` / `request show` / `job show` の設計

#### `request new <slug>`

- `specrunner/requests/active/<slug>/request.md` に template を書き出す
- 既存 `executeTemplate()` が stdout に出すのを、ファイル書き出しに変えた別関数として実装
- slug 重複チェック: `checkSlugCollision()` を再利用

```typescript
// src/core/command/request-new.ts
export async function executeNew(slug: string, type: string): Promise<number> {
  await checkSlugCollision(process.cwd(), slug);
  const content = generateTemplate(type);
  await write(process.cwd(), slug, content);
  process.stderr.write(`Created: specrunner/requests/active/${slug}/request.md\n`);
  return 0;
}
```

#### `request show <slug>`

- slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` でバリデーションする（path traversal 防止）。マッチしない場合は exit 2
- `resolve(cwd, slug)` → `fs.readFile` → `stdout.write`
- 存在しない場合は `Request not found: <slug>` + exit 1

```typescript
// src/core/command/request-show.ts
export async function executeShow(slug: string): Promise<number> {
  const filePath = resolve(process.cwd(), slug);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    process.stdout.write(content);
    return 0;
  } catch {
    process.stderr.write(`Request not found: ${slug}\n`);
    return 1;
  }
}
```

#### `job show <jobId|slug>`

- jobId（UUID prefix）→ `loadJobState(jobId)` で直接解決
- slug → `listJobStates()` + `getJobSlug()` filter（`resume` と同じパターン）
- 出力フィールド: `jobId` / `status` / `branch` / `step` / `createdAt` / `updatedAt`

```typescript
// src/cli/job-show.ts
export async function runJobShow(input: string): Promise<void> {
  const state = await resolveJobByIdOrSlug(input);
  const fields = [
    `Job ID:     ${state.jobId}`,
    `Status:     ${state.status}`,
    `Branch:     ${state.branch ?? "(none)"}`,
    `Step:       ${state.step ?? "(none)"}`,
    `Created:    ${state.createdAt}`,
    `Updated:    ${state.updatedAt}`,
  ];
  process.stdout.write(fields.join("\n") + "\n");
}
```

### AD-6: `request generate` は `request create` の rename

`COMMANDS.request.subcommands.create` → `COMMANDS.request.subcommands.generate` に key 変更。handler は `executeCreate()` をそのまま使う。

### AD-7: `request ls` は `request list` の rename

`COMMANDS.request.subcommands.list` → `COMMANDS.request.subcommands.ls` に key 変更。handler は `executeList()` をそのまま使う。

### AD-8: `request validate` / `request review` の slug 解決統一

両コマンドとも slug / file path 両受けにする。`request review` は既に実装済み（command-registry.ts:211-221）。`request validate` に同じ resolve パターンを追加。

```typescript
validate: {
  flags: {},
  positional: { name: "file-or-slug", required: true },
  handler: async (parsed) => {
    const input = parsed.positional!;
    let filePath = path.resolve(process.cwd(), input);
    if (!fs.existsSync(filePath)) {
      const slugResolved = storeResolve(process.cwd(), input);
      if (!fs.existsSync(slugResolved)) {
        process.stderr.write(`Error: '${input}' is neither a file path nor an active request slug.\n`);
        process.exit(1);
      }
      filePath = slugResolved;
    }
    process.exit(await executeValidate(filePath));
  },
}
```

### AD-9: `request rm <slug>` の設計

- slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` でバリデーションする（`../../` 等の path traversal による再帰削除を防ぐ）。マッチしない場合は exit 2
- `specrunner/requests/active/<slug>/` ディレクトリを再帰削除
- 存在しない場合は `Request not found: <slug>` + exit 1
- 確認 prompt なし（ファイル削除のみ、undo は `git checkout` で可能）

同じ slug validation（`/^[a-z0-9][a-z0-9-]{0,63}$/`）を `request new` / `request show` / `request rm` / `request validate` / `request review` の全コマンドに適用する。バリデーション失敗は exit code 2。

`job rm` の `jobId` は `~/.local/share/specrunner/jobs/<jobId>.json` に展開される。jobId は UUID 形式であることが期待されるが、明示的な文字ホワイトリスト（`/^[a-f0-9-]{36}$/` 等）で検証することを推奨する。

### AD-10: USAGE テキストの主語別グルーピング

```
Usage: specrunner <command> [options]

Request commands (static document operations):
  request new <slug> [--type <type>]     Create request.md from template
  request generate "<text>" [--stdin]    Generate request.md with LLM
  request ls                             List active requests
  request show <slug>                    Show request.md content
  request rm <slug>                      Remove a request
  request validate <file|slug>           Validate a request.md file
  request template [--type <type>]       Print scaffold template to stdout
  request review <file|slug> [--json]    Architect review of request.md

Job commands (stateful pipeline operations):
  job start <slug|file> [--verbose]      Start design pipeline (jobId issued)
  job ls [--active|--all|--status=<s>]   List all jobs
  job show <jobId|slug>                  Show job state details
  job rm <jobId> [--force|--all-terminated]  Remove job state
  job resume <slug> [--from=<step>]      Resume halted job
  job finish [<slug>] [--dry-run]        Squash-merge PR and archive

Environment:
  init [--runtime <managed|local>]       Initialize config scaffold
  login                                  Authenticate with GitHub
  doctor [--json]                        Diagnose environment
  runtime setup|status|reset             Manage Anthropic runtime resources

Aliases:
  run <slug|file> [--verbose]            Alias for 'job start'
```

## File Change Map

### Modified files

| File | Change |
|------|--------|
| `src/cli/command-registry.ts` | COMMANDS 再配置: `job` ParentCommandDef 新設、`request` subcommands 追加/rename、`runtime` 追加、旧 top-level 削除。USAGE 書き換え。ParentCommandDef に `guardedSubcommands` 追加 |
| `bin/specrunner.ts` | subcommand dispatch path に worktree guard 追加。`WORKTREE_GUARDED_COMMANDS` は `run` のみ残す |
| `src/cli/rm.ts` | `runRm` の CLI wrapper は `job rm` handler から呼ばれるよう移動 |
| `src/cli/ps.ts` | `runPs` の CLI wrapper は `job ls` handler から呼ばれるよう移動 |
| `src/cli/finish.ts` | `runFinish` は `job finish` handler から呼ばれる |
| `src/cli/resume.ts` | `runResume` は `job resume` handler から呼ばれる |
| `src/cli/run.ts` | `runRun` は `job start` + `run` alias の両方から呼ばれる |
| `README.md` | 新体系の最短フロー + alias 説明に書き換え |

### New files

| File | Purpose |
|------|---------|
| `src/core/command/request-new.ts` | `request new` handler: template → file 書き出し |
| `src/core/command/request-show.ts` | `request show` handler: slug → stdout |
| `src/core/command/request-rm.ts` | `request rm` handler: active 配下削除 |
| `src/cli/job-show.ts` | `job show` handler: state → stdout |

### Deleted registrations (not files)

旧 top-level `ps` / `rm` / `resume` / `finish` の `COMMANDS` エントリを削除。handler 関数ファイル自体は存続（`job` subcommand から参照されるため）。

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| 旧コマンドを使う自動化スクリプト | 配布前 (`"private": true`) なので外部破壊なし。dogfood スクリプト内の `specrunner ps` → `specrunner job ls` 等を grep で置換 |
| worktree guard の subcommand path 漏れ | guardedSubcommands で明示的に guard。unit test で `job start` in worktree → error を検証 |
| `request new` と `request template` の機能重複 | `new` = ファイル書き出し、`template` = stdout 出力。目的が異なるため共存 |
| slug path traversal（`request rm` 等の再帰削除） | `/^[a-z0-9][a-z0-9-]{0,63}$/` で全 slug 引数をバリデーション。マッチしない場合 exit 2 |
| `job rm` の jobId に不正文字 | jobId は UUID 形式（`/^[a-f0-9-]{36}$/`）で検証を推奨。`~/.local/share/specrunner` 配下のみへのアクセスのため risk は限定的 |

ADR path: `docs/adr/002-cli-noun-verb-restructure.md`（Task 10 で作成）
