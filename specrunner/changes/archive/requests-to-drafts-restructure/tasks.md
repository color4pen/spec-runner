# Tasks: requests-to-drafts-restructure

## Task 1: paths.ts に drafts ヘルパー追加

**File**: `src/util/paths.ts`

- `DRAFTS_DIR = "specrunner/drafts"` 定数追加
- `draftsDir(): string` — `"specrunner/drafts"` を返す
- `draftPath(slug: string): string` — `"specrunner/drafts/<slug>.md"` を返す
- 既存関数は変更なし

**受け入れ基準**: `draftsDir()` が `"specrunner/drafts"` を、`draftPath("foo")` が `"specrunner/drafts/foo.md"` を返す。

---

## Task 2: store.ts の data layer を drafts/ に向ける

**File**: `src/core/request/store.ts`

- `ACTIVE_SUBDIR` を `path.join("specrunner", "drafts")` に変更
- `checkSlugCollision` を 3 経路化:
  1. `specrunner/drafts` (新規起票)
  2. `specrunner/requests/merged` (既存 140 件)
  3. `specrunner/changes/archive` (既存 106 件 + 新規分。`<slug>/` ディレクトリの存在で判定)
- `write()` の `mkdir` 対象を `specrunner/drafts` に変更

**受け入れ基準**: `resolve()` が `specrunner/drafts/<slug>.md` を返す。`checkSlugCollision` が 3 経路すべてで衝突を検出する。

---

## Task 3: request コマンド群の path 更新

### Task 3a: request-new.ts

**File**: `src/core/command/request-new.ts`

- 出力先を `store.resolve()` 経由 (= Task 2 で drafts/ に向く) に統一。直接的な path 構築があれば `draftsDir()` / `draftPath()` に置換。

### Task 3b: request-rm.ts

**File**: `src/core/command/request-rm.ts`

- 対象 path を `store.resolve()` 経由に統一。

### Task 3c: request-show.ts

**File**: `src/core/command/request-show.ts`

- lookup 先を `store.resolve()` 経由 (= `drafts/`) に変更。
- 後方互換: `drafts/` に存在しない場合、旧 `specrunner/requests/active/<slug>.md` を fallback で試行。見つかった場合は stderr に deprecation warning を出力。

### Task 3d: request-migrate-flat.ts

**File**: `src/core/command/request-migrate-flat.ts`

- 対象ディレクトリを `specrunner/drafts` に変更。
- `specrunner/requests/merged` は既存なので、merged 側の migration ロジックは維持。

**受け入れ基準**: 全 4 コマンドが `specrunner/drafts/` を操作する。`request show` は `requests/active/` への fallback を持つ。

---

## Task 4: pipeline-run.ts の CANONICAL_PATTERN 更新

**File**: `src/core/command/pipeline-run.ts`

- `CANONICAL_PATTERN` を `/^.*\/specrunner\/drafts\/([^/]+)\.md$/` に変更。

**受け入れ基準**: `specrunner/drafts/my-feature.md` から `requestSlug = "my-feature"` が抽出される。

---

## Task 5: local.ts の setupWorkspace 変更

**File**: `src/core/runtime/local.ts` (lines 202-251)

変更内容:

1. **canonical path コピーを廃止**: `relativeRequestPath` (= `specrunner/drafts/<slug>.md`) を worktree にコピーする処理を削除。feature branch には `changes/<slug>/request.md` のみをコピーする。
2. **main worktree の draft 削除**: change folder へのコピー後、`fs.rm(opts.requestFilePath)` で main の draft file を削除。
3. **fs.rm 失敗は非致命的**: `try/catch` で wrap し、失敗時は `process.stderr.write` で warning のみ。
4. **git add は change folder の request.md のみ**: canonical path の staging を削除。

変更後のフロー:
```
1. change folder に request.md コピー + git add
2. rules.md コピー + git add
3. main の draft file を fs.rm (warning on failure)
4. git commit
```

**受け入れ基準**: worktree の `specrunner/drafts/<slug>.md` は存在しない。`specrunner/changes/<slug>/request.md` のみ存在。main worktree の `drafts/<slug>.md` が削除されている。

---

## Task 6: managed.ts の setupWorkspace 変更

**File**: `src/core/runtime/managed.ts` (lines 93-155)

Task 5 と同じ方針:

1. canonical path コピー廃止 (managed は main cwd で直接作業するため、draft file はそのまま存在する)
2. change folder へのコピー後、`fs.rm` で draft を削除
3. fs.rm 失敗は非致命的 warning
4. git add は change folder の request.md のみ

**受け入れ基準**: managed runtime でも run 後に `drafts/<slug>.md` が main cwd から消えている。

---

## Task 7: move-requests-dir.ts 廃止 + orchestrator 更新

### Task 7a: orchestrator.ts から moveRequestsDir 削除

**File**: `src/core/finish/orchestrator.ts`

- `import { moveRequestsDir } from "./move-requests-dir.js"` を削除
- `runPhase1Archive` 内の `moveRequestsDir` 呼び出し (line 271-273) を削除

### Task 7b: move-requests-dir.ts の削除

**File**: `src/core/finish/move-requests-dir.ts`

- ファイルを削除する。

**受け入れ基準**: `move-requests-dir.ts` が存在しない。orchestrator が compile error なく動作する。

---

## Task 8: resolve-target.ts 更新

**File**: `src/core/finish/resolve-target.ts`

1. `resolveByAutoDetect` を削除 (または、即座にエラーを返す実装に置換):
   ```typescript
   async function resolveByAutoDetect(cwd: string, stdoutWrite: (msg: string) => void): Promise<ResolveTargetResult> {
     return {
       ok: false,
       exitCode: 2,
       message: "No slug specified. Specify <slug>, --pr, or --job.",
     };
   }
   ```
2. `detectSlugFromCwd` 関数を削除。
3. auto-detect 関連の doc comment (TC-131, TC-132, TC-133) を更新。

**受け入れ基準**: `finish` 引数なしで `Specify <slug>, --pr, or --job` エラーが返る。

---

## Task 9: request-patterns.ts を archive 経路に切り替え

**File**: `src/context/request-patterns.ts`

- `mergedDir` を `path.join(cwd, "specrunner", "changes", "archive")` に変更
- `entries` の取得: `isDirectory()` filter は維持 (archive は dir 形式)
- `requestPath` を `path.join(archiveDir, slug, "request.md")` に変更
- 既存の `slug` = ディレクトリ名から取得するロジックはそのまま動作する

**受け入れ基準**: `collectRequestPatterns` が `changes/archive/<slug>/request.md` から examples を収集し、空配列ではなく実際のサンプルが返る。

---

## Task 10: doctor/workflow-structure.ts 更新

**File**: `src/core/doctor/checks/repo/workflow-structure.ts`

- `REQUIRED_REQUEST_DIRS` を廃止、代わりに `drafts/` の存在 check を追加
- `specrunner/requests/active/` が存在する場合は warn (= 廃止予定の周知メッセージ)
- `specrunner/requests/merged/` は read-only として存在を許容 (= check 対象外)
- `specrunner/changes/` の check は維持

**受け入れ基準**: `drafts/` 不在で warn。`requests/active/` 存在で warn (deprecation)。`requests/merged/` は無視。

---

## Task 11: doc / skill 更新

### Task 11a: README.md

**File**: `README.md`

- `specrunner/requests/active/` の言及を `specrunner/drafts/` に更新
- ディレクトリ構造セクションがあれば `drafts/` を追加

### Task 11b: parallel-request-workflow SKILL.md

**File**: `.claude/skills/parallel-request-workflow/SKILL.md`

- 起票 path の `requests/active/` を `drafts/` に更新

### Task 11c: acceptance-and-issue-audit SKILL.md

**File**: `.claude/skills/acceptance-and-issue-audit/SKILL.md`

- archive path の参照を `changes/archive/` に統一

### Task 11d: rebase-finish SKILL.md

**File**: `.claude/skills/rebase-finish/SKILL.md`

- active 残骸 cleanup の記述を削除または `drafts/` への言い換え

**受け入れ基準**: 4 ファイルの path 言及が更新されている。

---

## Task 12: delta spec 作成

### Task 12a: cli-commands delta spec

**File**: `specrunner/changes/requests-to-drafts-restructure/delta-specs/cli-commands.md`

更新内容:
- `request` サブコマンド群の slug 解決先を `specrunner/drafts/<slug>.md` に変更
- `job start <slug>` の解決先を `specrunner/drafts/<slug>.md` に変更
- `job finish` 引数なし呼び出しのエラー仕様を追加

### Task 12b: job-state-store delta spec

**File**: `specrunner/changes/requests-to-drafts-restructure/delta-specs/job-state-store.md`

更新内容:
- `CANONICAL_PATTERN` を `specrunner/drafts/<slug>.md` に変更
- `RequestInfo.slug` の抽出元パス説明を更新

### Task 12c: repository-registration delta spec

**File**: `specrunner/changes/requests-to-drafts-restructure/delta-specs/repository-registration.md`

更新内容:
- bootstrap status detection の `requests/active/` check を `drafts/` に変更

**受け入れ基準**: 3 capability の delta spec が存在する。

---

## Task 13: 既存テストの更新

影響する test ファイルを新しい path に合わせて更新する。主な変更パターン:

- `specrunner/requests/active/<slug>.md` → `specrunner/drafts/<slug>.md`
- `specrunner/requests/merged/<slug>.md` への git mv テスト → 削除
- `move-requests-dir` の import / mock → 削除
- `resolveByAutoDetect` の成功テスト → エラー返却テストに変更

### 対象ファイル一覧

| ファイル | 主な変更 |
|---|---|
| `tests/finish-adversarial.test.ts` | moveRequestsDir mock 削除、path 更新 |
| `tests/finish-orchestrator.test.ts` | moveRequestsDir mock 削除、Phase 1 期待値更新 |
| `tests/finish-ps-integration.test.ts` | path 更新 |
| `tests/finish-resolve-target.test.ts` | auto-detect テスト → エラーテスト、detectSlugFromCwd テスト削除 |
| `tests/unit/core/command/request-new.test.ts` | path を `drafts/` に更新 |
| `tests/unit/core/command/request-rm.test.ts` | path を `drafts/` に更新 |
| `tests/unit/core/command/request-show.test.ts` | path を `drafts/` に更新、fallback テスト追加 |
| `tests/unit/core/command/request-migrate-flat.test.ts` | path を `drafts/` に更新 |
| `tests/unit/core/command/pipeline-run-canonical.test.ts` | CANONICAL_PATTERN テスト更新 |
| `tests/unit/core/command/validation-tc.test.ts` | path 更新 |
| `tests/unit/core/request/store.test.ts` | path 更新、collision 3 経路テスト追加 |
| `tests/unit/core/request/generator.test.ts` | path 更新 |
| `tests/unit/context/request-patterns.test.ts` | archive 経路に切り替え |
| `tests/unit/core/resume/resolve-job.test.ts` | path 更新 |
| `tests/state/job-slug.test.ts` | CANONICAL_PATTERN 更新 |
| `tests/unit/cli/job-show.test.ts` | path 更新 |
| `tests/unit/cli/resume.test.ts` | path 更新 |
| `tests/unit/util/slugify.test.ts` | path 更新 (if any) |
| `tests/unit/core/pr-create/body-template.test.ts` | path 更新 (if any) |

**受け入れ基準**: 全テストが green。

---

## Task 14: 再現テスト追加

**Files**: 新規テストファイル (例: `tests/unit/core/runtime/draft-move.test.ts`, `tests/unit/core/finish/archive-one-path.test.ts`)

### Test 14a: run 後に main worktree の draft が消える

- setup: `specrunner/drafts/<slug>.md` を作成
- act: local runtime の setupWorkspace を呼び出し
- assert: main cwd の `specrunner/drafts/<slug>.md` が存在しない
- assert: worktree の `specrunner/changes/<slug>/request.md` が存在する

### Test 14b: finish 後に archive path のみに request.md が存在する

- setup: finish orchestrator の Phase 1 を実行
- assert: `specrunner/changes/archive/<slug>/request.md` が存在
- assert: `specrunner/requests/active/` と `specrunner/requests/merged/` に新規ファイルが生成されていない

### Test 14c: move-requests-dir.ts が import されていない

- 静的テスト: `src/core/finish/orchestrator.ts` の内容を文字列として読み、`move-requests-dir` を含まないことを assert

**受け入れ基準**: 3 テストが green。

---

## Task 15: typecheck + test green 確認

- `bun run typecheck` が green
- `bun run test` が green

**受け入れ基準**: CI 相当のチェックが通る。

---

## 実行順序

```
Task 1 (paths.ts)
  ↓
Task 2 (store.ts) — Task 1 に依存
  ↓
Task 3 (request コマンド群) — Task 2 に依存
Task 4 (pipeline-run.ts) — Task 1 に依存
Task 5 (local.ts) — Task 1 に依存
Task 6 (managed.ts) — Task 1 に依存
Task 7 (move-requests-dir 廃止) — 独立
Task 8 (resolve-target.ts) — 独立
Task 9 (request-patterns.ts) — 独立
Task 10 (workflow-structure.ts) — Task 1 に依存
  ↓
Task 11 (doc/skill) — 独立
Task 12 (delta spec) — 独立
  ↓
Task 13 (テスト更新) — Task 1-10 に依存
Task 14 (再現テスト) — Task 5, 7 に依存
  ↓
Task 15 (green 確認) — 全 Task に依存
```
