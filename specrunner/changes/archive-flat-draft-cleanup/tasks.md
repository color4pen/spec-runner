# Tasks: archive の draft 削除を repo 本体側・両形式に直す

## T-01: orchestrator.ts の draft 削除を repo 本体・両形式対応に書き直す

対象ファイル: `src/core/archive/orchestrator.ts`

- [ ] lines 260–265 (worktree-side `fs.rm` for draft directory) を削除する
- [ ] lines 272–284 (worktree-side `git add specrunner/drafts/` + `archivePathspecs.push`) を削除する
  - `archivePathspecs` への `draftsDir()` push も削除する
  - `draftsAbsPath`・`draftsPresent` 変数も削除する
- [ ] 削除した箇所の直前 (markJobArchived の後、archivePathspecs 宣言の前) に以下のロジックを追加する:
  - フラットパス: `nodePath.join(cwd, draftsDir(), slug + ".md")`
  - ディレクトリパス: `nodePath.join(cwd, draftsDir(), slug)`
  - 各パスについて (relPath・absPath の定義):
    - フラット: `relPath = nodePath.join(draftsDir(), slug + ".md")`, `absPath = nodePath.join(cwd, relPath)`
    - ディレクトリ: `relPath = nodePath.join(draftsDir(), slug)`, `absPath = nodePath.join(cwd, relPath)`
    1. `await fs.exists(absPath)` が false なら skip
    2. `await spawn("git", ["ls-files", "--", relPath], { cwd })` を実行し `stdout.trim()` が非空なら tracked と判定:
       - `stderrWrite` で警告を出す (例: `Warning: draft 'specrunner/drafts/<slug>.md' is tracked by git; delete manually with 'git rm <relPath>' and commit.`)
       - `continue`
    3. `try { await fs.rm(absPath, { recursive: true, force: true }) } catch { stderrWrite(Warning: ...) }`
  - フラット → ディレクトリの順に処理する

**Acceptance Criteria**:
- `runArchiveOrchestrator` が `cwd` 基準の `specrunner/drafts/<slug>.md` を `fs.rm` で削除する
- `runArchiveOrchestrator` が `cwd` 基準の `specrunner/drafts/<slug>/` を `fs.rm` で削除する
- どちらも存在しない場合に `fs.rm` が呼ばれず `stderrWrite` も呼ばれない
- tracked なパスに対して `fs.rm` が呼ばれず `stderrWrite` で警告が出る
- worktree-side `fs.rm` と `git add specrunner/drafts/` の呼び出しが削除されている
- TypeScript typecheck (tsc) が通る

---

## T-02: 既存テスト T-01・T-08・T-09 を新しい挙動に更新する

対象ファイル: `src/core/archive/__tests__/orchestrator.test.ts`

- [ ] **T-01 テストを更新する**
  - 現在: `fs.rm` が `nodePath.join(FAKE_WORKTREE, draftsDir(), FAKE_SLUG)` で呼ばれることを確認
  - 変更後: `fs.rm` が以下の 2 つのパスで呼ばれることを確認する
    - `nodePath.join(FAKE_CWD, draftsDir(), FAKE_SLUG + ".md")` (フラット)
    - `nodePath.join(FAKE_CWD, draftsDir(), FAKE_SLUG)` (ディレクトリ)
  - デフォルト `makeFs().exists = true` / `makeSpawn().stdout = ""` で ls-files=untracked が成立するので追加モックは不要
  - テストタイトルを "flat and directory draft deleted from repo root on archive" に変更する
- [ ] **T-08 テストを更新する**
  - 現在: drafts dir 不在時 git add NOT called / no warning の確認
  - 変更後: `fs.exists` が drafts パスで false を返す場合に `fs.rm` が呼ばれず `stderrWrite` も draft 警告を出さないことを確認
  - `fs.exists` のモックを "フラット・ディレクトリ両方のパスで false" になるように設定する
    - 例: `vi.mocked(mockFs.exists).mockImplementation(async (p) => !p.includes("specrunner/drafts"))`
  - テストタイトルを "no draft at repo root → no rm and no warning" に変更する
- [ ] **T-09 テストを更新する**
  - 現在: drafts dir 存在時 git add IS called の確認
  - 変更後: `fs.exists` が両 draft パスで true を返す場合に `fs.rm` が repo 本体パスで呼ばれることを確認
  - テストタイトルを "draft present at repo root → fs.rm called for flat and directory paths" に変更する

- [ ] **T-07 重複の解消**: `orchestrator.test.ts` に `T-07` を冠するテストが 2 件存在する（line 245: EACCES 警告テスト、line 326: archived 状態の short-circuit テスト）。line 326 のテストを `T-10: archived job resolves via includeArchived and returns Already finished` に改名し、ファイル先頭のコメントに T-07〜T-10 の説明を追記する。

**Acceptance Criteria**:
- 既存 T-01・T-08・T-09 が新しい期待値で green になる
- T-02〜T-07 (line 245 の EACCES テスト)・T-DTE-01〜T-DTE-03・TC-009・TC-010 は無変更で green のまま
- line 326 の archived short-circuit テストは T-10 に改名されて green のまま

---

## T-03: 新規テスト — 両形式削除・no-draft・tracked draft を固定する

対象ファイル: `src/core/archive/__tests__/orchestrator.test.ts`

- [ ] **NEW-flat: フラット形式のみ存在する場合のテストを追加する**
  - `fs.exists`: フラットパスのみ true、ディレクトリパスは false
  - `spawn` (git ls-files): stdout `""` (untracked)
  - 確認: `fs.rm` がフラットパスで呼ばれる; ディレクトリパスでは呼ばれない
- [ ] **NEW-dir: ディレクトリ形式のみ存在する場合のテストを追加する**
  - `fs.exists`: ディレクトリパスのみ true、フラットパスは false
  - `spawn` (git ls-files): stdout `""` (untracked)
  - 確認: `fs.rm` がディレクトリパスで呼ばれる; フラットパスでは呼ばれない
- [ ] **NEW-none: 両形式とも存在しない場合のテストを追加する**
  - `fs.exists`: 両 draft パスで false (他パスは true でよい)
  - 確認: `fs.rm` が draft パスで呼ばれない; `stderrWrite` に draft 警告なし; exitCode 0
- [ ] **NEW-tracked: tracked な draft は削除せず警告を出すテストを追加する**
  - `fs.exists`: フラットパスで true
  - `spawn`: git ls-files に対して `{ exitCode: 0, stdout: "specrunner/drafts/<slug>.md\n", stderr: "" }` を返す; それ以外は `{ exitCode: 0, stdout: "", stderr: "" }`
  - 確認: `fs.rm` がフラットパスで呼ばれない; `stderrWrite` に "Warning" を含む draft 関連メッセージが出力される; exitCode 0
  - ヒント: `vi.fn().mockImplementation((cmd, args) => ...)` で ls-files だけ stdout を変える

各テストは既存の `describe("archive orchestrator — side-effect boundaries ...")` ブロック内に追加する。

**Acceptance Criteria**:
- NEW-flat: `fs.rm` がフラットパスのみで呼ばれる
- NEW-dir: `fs.rm` がディレクトリパスのみで呼ばれる
- NEW-none: `fs.rm` が draft パスで呼ばれず警告なし
- NEW-tracked: `fs.rm` が呼ばれず警告あり、exitCode 0
- `bun run typecheck && bun run test` が green

---

## T-04: 最終検証

- [ ] `bun run typecheck` を実行して型エラーがないことを確認する
- [ ] `bun run test` を実行してすべてのテストが green であることを確認する
- [ ] T-01〜T-03 で追加・変更したテスト名を確認し、削除したテスト ID の欠番が意図的なものであることをコメントで示す（任意）

**Acceptance Criteria**:
- typecheck: 0 errors
- test: 全テスト pass（新規追加分を含む）
