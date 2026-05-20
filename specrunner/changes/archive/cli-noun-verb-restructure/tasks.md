# Tasks: CLI noun-verb restructure

## Task 1: ParentCommandDef に guardedSubcommands を追加し、subcommand dispatch に worktree guard を組み込む

### Files
- `src/cli/command-registry.ts`: `ParentCommandDef` interface に `guardedSubcommands?: Set<string>` を追加
- `bin/specrunner.ts`: subcommand dispatch path (line 36-61) 内、`parseFlags` の前に worktree guard 判定を挿入

### Details
- `ParentCommandDef.guardedSubcommands` は optional。未設定 = guard なし
- subcommand dispatch 内で `entry.guardedSubcommands?.has(sub!)` が true のとき `detectWorktree()` → `worktreeGuardError()` を呼ぶ
- `worktreeGuardError` の command 引数は `"${command} ${sub}"` 形式（例: `"job start"`）
- top-level `WORKTREE_GUARDED_COMMANDS` の `"finish"` と `"resume"` を削除（`"run"` のみ残す）。これらは `job` の `guardedSubcommands` で guard される

### Tests
- `bin/specrunner.ts` の unit test: `job start` を worktree 内で実行 → `WORKTREE_GUARD` error
- `job ls` を worktree 内で実行 → 正常動作（guard 対象外）
- `job resume` / `job finish` を worktree 内で実行 → `WORKTREE_GUARD` error

### AC
- [x] `job start/resume/finish` が linked worktree 内で worktree guard error になる
- [x] `job ls` / `job show` / `job rm` は linked worktree 内でも実行できる
- [x] `run` alias も worktree guard が効く（既存 top-level guard）

---

## Task 2: `request` subcommands を再編する（rename + 新規追加）

### Files
- `src/cli/command-registry.ts`: `request` の subcommands を書き換え
  - `create` → `generate` に key 変更（handler は `executeCreate` のまま）
  - `list` → `ls` に key 変更（handler は `executeList` のまま）
  - `new` subcommand 追加
  - `show` subcommand 追加
  - `rm` subcommand 追加
  - `validate` の positional name を `"file-or-slug"` に変更し、slug 解決ロジック追加
- `src/core/command/request-new.ts`: 新規。`executeNew(slug: string, type: string): Promise<number>`
  - `checkSlugCollision()` でスラッグ重複チェック
  - `generateTemplate(type)` で template 生成（既存 `executeTemplate` 内の生成ロジック抽出）
  - `store.write(cwd, slug, content)` でファイル書き出し
  - stderr に作成メッセージ出力
- `src/core/command/request-show.ts`: 新規。`executeShow(slug: string): Promise<number>`
  - `store.resolve(cwd, slug)` → `fs.readFile` → `stdout.write`
  - 存在しない場合は stderr にエラー + return 1
- `src/core/command/request-rm.ts`: 新規。`executeRm(slug: string): Promise<number>`
  - `specrunner/requests/active/<slug>/` の存在確認
  - `fs.rm(dir, { recursive: true })` で削除
  - 存在しない場合は stderr にエラー + return 1

### Tests
- `request new test-slug` → `specrunner/requests/active/test-slug/request.md` が作成される
- `request new` で既存 slug → `SLUG_COLLISION` error
- `request show <existing-slug>` → stdout に request.md 内容
- `request show <nonexistent>` → exit 1
- `request rm <existing-slug>` → ディレクトリ削除
- `request rm <nonexistent>` → exit 1
- `request validate <slug>` → slug 解決して validate 実行
- `request generate` が旧 `request create` と同じ動作

### AC
- [x] `request new/generate/ls/show/rm/validate/template/review` が全て動く
- [x] `request show <slug>` は active 配下の request.md 本文を stdout に出力する
- [x] `request validate <slug>` が slug 名で active 配下を解決する
- [x] `request review <slug>` が slug 名で active 配下を解決する（既存動作維持）
- [x] `request review --json` フラグが維持されている（regression なし）
- [x] 旧 `request create` は `Unknown request subcommand: create` を返す
- [x] 旧 `request list` は `Unknown request subcommand: list` を返す

---

## Task 3: `job` ParentCommandDef を新設する

### Files
- `src/cli/command-registry.ts`: `COMMANDS` に `job` エントリを追加
  - `start`: positional `"slug|file"` required、flags `{ verbose: { type: "boolean" } }`。handler は `runRun()` を呼ぶ
  - `ls`: flags `{ active, all, status }`。handler は `runPs()` を呼ぶ（既存 `ps` handler のロジックをそのまま移植）
  - `show`: positional `"jobId|slug"` required。handler は新規 `runJobShow()` を呼ぶ
  - `rm`: positional `"jobId"` optional、flags `{ force, "all-terminated", yes }`。handler は `runRm()` を呼ぶ
  - `resume`: positional `"slug"` required、flags `{ from, force, verbose }`。handler は `runResume()` を呼ぶ
  - `finish`: positional `"slug"` optional、flags `{ pr, job, "dry-run", force, help }`。handler は `runFinish()` を呼ぶ
  - `guardedSubcommands: new Set(["start", "resume", "finish"])`
- `src/cli/job-show.ts`: 新規。`runJobShow(input: string): Promise<void>`
  - input を jobId（UUID prefix 8+ chars）か slug かで判定
  - jobId → `loadJobState(jobId)` 直接
  - slug → `listJobStates()` + `getJobSlug()` filter（最新 `updatedAt` 優先）
  - 出力: `Job ID` / `Status` / `Branch` / `Step` / `Created` / `Updated` の 6 フィールド

### Tests
- `job start <slug>` → pipeline 開始（= 旧 `run` と同等）
- `job ls` → 既存 `ps` と同等の出力
- `job show <jobId>` → state フィールド表示
- `job show <slug>` → slug で job 解決し state 表示
- `job rm <jobId>` → 既存 `rm` と同等
- `job resume <slug>` → 既存 `resume` と同等
- `job finish <slug>` → 既存 `finish` と同等
- `job unknown` → `Unknown job subcommand: unknown` メッセージ

### AC
- [x] `job start/ls/show/rm/resume/finish` が全て動く
- [x] `job show <jobId|slug>` は主要フィールドを stdout に出力する
- [x] `job unknown` が `Unknown job subcommand: unknown` のようなメッセージを返す
- [x] `job rm` は linked worktree 内でも実行できる（worktree guard 対象外）
- [x] `job show` は linked worktree 内でも実行できる（worktree guard 対象外）

---

## Task 4: 旧 top-level コマンドを削除し `run` alias を維持する

### Files
- `src/cli/command-registry.ts`:
  - `COMMANDS` から `ps` / `rm` / `resume` / `finish` エントリを削除
  - `run` は残す。handler は `job start` と同じ `runRun()` を呼ぶ（実体共有）
  - top-level `WORKTREE_GUARDED_COMMANDS` から `"finish"` / `"resume"` を削除、`"run"` のみ

### Tests
- `specrunner ps` → `Unknown command: ps`（exit 2）
- `specrunner rm` → `Unknown command: rm`（exit 2）
- `specrunner resume` → `Unknown command: resume`（exit 2）
- `specrunner finish` → `Unknown command: finish`（exit 2）
- `specrunner run <slug>` → 正常動作（`job start` と同等）

### AC
- [x] 旧 top-level `ps` / `rm` / `resume` / `finish` は `Unknown command` を返す
- [x] `run <slug>` が `job start <slug>` の alias として動く

---

## Task 5: `managed` → `runtime` rename

### Files
- `src/cli/command-registry.ts`:
  - `COMMANDS["managed"]` → `COMMANDS["runtime"]` に key 変更
  - handler は `runManagedSetup` / `runManagedStatus` / `runManagedReset` をそのまま参照
  - `MANAGED_RESET_USAGE` 内の文言を `specrunner runtime reset` に更新
- `src/cli/managed.ts`: ファイル名は変更しない（内部実装は rename しない方針）。ログ出力中の `managed` → `runtime` 表記変更が必要な箇所があれば最小限で修正

### Tests
- `specrunner runtime setup` → 既存 `managed setup` と同等の動作
- `specrunner runtime status` → 既存 `managed status` と同等の動作
- `specrunner runtime reset --force` → 既存 `managed reset --force` と同等の動作
- `specrunner managed setup` → `Unknown command: managed`（exit 2）

### AC
- [x] `runtime setup/status/reset` が動く
- [x] 旧 `managed` は `Unknown command: managed` を返す

---

## Task 6: USAGE テキストを主語別グルーピングに書き換える

### Files
- `src/cli/command-registry.ts`: `USAGE` 定数を design.md AD-10 の形式に書き換え
  - Request commands / Job commands / Environment の 3 ブロック
  - Aliases セクション（`run` のみ）
  - 各 subcommand のオプションセクション
- `MANAGED_RESET_USAGE` → `RUNTIME_RESET_USAGE` に rename（export 名変更）
- `FINISH_USAGE` は `specrunner job finish` 形式に更新
- `bin/specrunner.ts`: `MANAGED_RESET_USAGE` → `RUNTIME_RESET_USAGE` の import 更新

### Tests
- `specrunner --help` が主語別グルーピングで表示される
- `specrunner` (引数なし) → stderr に新 USAGE が出る

### Stale string updates (must do in this task)
- `src/cli/run.ts` 内の Hint 文 `Use 'specrunner request list' to see available slugs.` → `Use 'specrunner request ls' to see available slugs.` に更新する
- `MANAGED_RESET_USAGE` / `RUNTIME_RESET_USAGE` 等の usage 文字列内に `managed` 参照が残っていれば `runtime` に更新する

### AC
- [x] `specrunner --help` が request / job / Environment の 3 ブロックで表示される
- [x] Aliases セクションに `run` が記載されている
- [x] `src/cli/run.ts` の Hint 文が `request ls` を参照している（`request list` 参照なし）

---

## Task 7: README を新体系で書き直す

### Files
- `README.md`: Quick Start / コマンドリファレンスセクションを新体系に書き換え
  - 最短フロー: `init → login → request new → job start → job ls → job finish`
  - 失敗時フロー: `job ls → job resume`
  - alias 一覧（`run` のみ）
  - local / managed runtime 差分説明

### AC
- [x] README が新体系の最短フローで書き直されている

---

## Task 8: delta spec を作成し 4 capability の Requirement を更新する

Delta spec は `specs/<cap>/spec.md` の canonical パスに配置済み（`delta-specs/` は削除済み）。

### Files（編集対象は実装フェーズで `specs/` を参照すること）
- `specrunner/changes/cli-noun-verb-restructure/specs/cli-commands/spec.md`
- `specrunner/changes/cli-noun-verb-restructure/specs/cli-finish-command/spec.md`
- `specrunner/changes/cli-noun-verb-restructure/specs/cli-resume-command/spec.md`
- `specrunner/changes/cli-noun-verb-restructure/specs/managed-cli-commands/spec.md`

### `## Renamed` の body 継承挙動について（実装者注意）

`## Renamed` エントリはベースラインの Requirement **ヘッダーのみ**を書き換える。body は変更しない。
ただし、delta の `## Requirements` セクションに同名（rename 後の名前）の Requirement が存在する場合、その Requirement は **MODIFIED** として分類され、ベースラインの body が delta の body で**上書き**される。

**本 change での影響**:

| Renamed FROM | Renamed TO | delta に MODIFIED あり | body の扱い |
|---|---|---|---|
| `specrunner バイナリは 6 つのサブコマンドを提供する` | `specrunner バイナリは noun-verb 体系のサブコマンド群を提供する` | ✅（delta L3） | delta body で上書き。旧 body 内の `specrunner finish [--pr/--job/--dry-run]` フラグ詳細は意図的に削除。canonical は `cli-finish-command` spec |
| `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する | `specrunner job start <request.md\|slug>` は propose と spec-review セッションを直列で実行する | ❌（delta に同名エントリなし） | ベースラインの body を**そのまま保持**。spec-review-result.md not found Scenario は消失しない |

### AC
- [x] `cli-commands` capability の Requirement が新体系に合わせて delta spec 経由で update されている
- [x] `cli-finish-command` capability の Requirement が `job finish` に合わせて更新されている
- [x] `cli-resume-command` capability の Requirement が `job resume` に合わせて更新されている
- [x] `managed-cli-commands` capability の Requirement が `runtime` に合わせて更新されている

---

## Task 2b: slug / jobId validation を全引数コマンドに追加する

### Files
- `src/core/command/request-new.ts`: slug validation guard を追加（`/^[a-z0-9][a-z0-9-]{0,63}$/`、exit 2）
- `src/core/command/request-show.ts`: slug validation guard を追加
- `src/core/command/request-rm.ts`: slug validation guard を追加（path traversal による再帰削除防止）
- `src/cli/command-registry.ts`: `request validate` / `request review` handler に slug validation guard を追加
- `src/cli/job-show.ts`: jobId の UUID 形式検証を追加（`/^[a-f0-9-]{36}$/`、exit 1）
- `src/cli/rm.ts`: jobId UUID 形式検証を追加（`job rm` 経由）
- `src/cli/resume.ts`: jobId UUID 形式検証を追加（`job resume` 経由）
- `src/cli/finish.ts`: jobId UUID 形式検証を追加（`job finish --job <jobId>` 経由）

### Tests
- `request new "../../evil"` → exit 2（slug validation error）
- `request rm "../../etc/passwd"` → exit 2（path traversal 防止）
- `request show "invalid slug"` → exit 2
- 正常 slug `"my-feature-123"` → validation 通過
- `job rm "../../../etc/passwd"` → exit 1（jobId validation error、`Error: invalid jobId format`）
- `job show "invalid-not-uuid"` → exit 1
- 正常 UUID jobId → validation 通過

### AC
- [x] `request new/show/rm/validate/review` に不正 slug（`../../` 等）を渡すと exit 2 で拒否される
- [x] 正常 slug（`/^[a-z0-9][a-z0-9-]{0,63}$/`）は通過する
- [x] `job rm/show/resume/finish` に UUID 形式でない jobId を渡すと `Error: invalid jobId format` + exit 1 で拒否される
- [x] 正常 UUID（`/^[a-f0-9-]{36}$/`）は通過する

---

## Task 9: テスト修正と全体検証

### Files
- `tests/unit/cli/` 配下: 既存テストの command 名参照を更新
  - `ps` → `job ls` 参照更新
  - `managed` → `runtime` 参照更新
  - worktree guard テストの更新
- 新規テスト:
  - `tests/unit/core/command/request-new.test.ts`
  - `tests/unit/core/command/request-show.test.ts`
  - `tests/unit/core/command/request-rm.test.ts`
  - `tests/unit/cli/job-show.test.ts`

### AC
- [x] `bun run typecheck && bun run test` が green

---

## Task 10: ADR を記録する

### Files
- `docs/adr/002-cli-noun-verb-restructure.md`: 新規

### Content
- noun-verb 体系の採用理由（`gh` / `docker` / `aws` 慣用）
- `request` / `job` 責務境界の判断軸（static file vs stateful execution）
- `run` alias のみ維持の判断（`python run` / `npm run` の慣性）
- `managed` → `runtime` rename 判断（配布前の破壊コストゼロ）
- worktree guard 修正方針（`guardedSubcommands` 採用）

### AC
- [x] ADR に 5 つの判断が記録されている

---

## Dependency Order

> **IMPORTANT**: Task 4 MUST run before (or atomically with) Task 1.
> Task 1 removes `"finish"` / `"resume"` from `WORKTREE_GUARDED_COMMANDS`.
> If Task 1 runs first, there is a transient window where `specrunner finish` / `specrunner resume` exist
> as top-level commands without worktree guard protection. Delete the old commands first (Task 4),
> then add the new guard mechanism (Task 1).

```
Task 4 (旧 top-level 削除 + run alias)  ← MUST run before Task 1
  ↓
Task 1 (guardedSubcommands 基盤)
  ↓
Task 2 (request subcommands)  ──┐
Task 2b (slug/jobId validation)─┤← Task 1,2,3 完了後、Task 2 と並列可
Task 3 (job ParentCommandDef) ──┤── 並列可
Task 5 (managed → runtime)   ──┘
  ↓
Task 6 (USAGE 書き換え + stale string 修正)  ← Task 2-5 全完了後
  ↓
Task 7 (README)           ← Task 6 完了後
Task 8 (delta spec)       ← 並列可（他 task と独立、specs/ パス参照）
  ↓
Task 9 (テスト修正)       ← Task 1-2b-8 全完了後
Task 10 (ADR)             ← 並列可（他 task と独立）
```
