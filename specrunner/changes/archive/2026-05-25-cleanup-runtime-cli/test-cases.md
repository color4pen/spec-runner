# Test Cases: cleanup-runtime-cli

## Coverage Matrix

| Task | 受け入れ基準 | Test IDs |
|------|-------------|----------|
| Task 1: resolveRepoRoot util | export されている / silent・fail-fast 両モード | TC-01〜TC-04, TC-22 |
| Task 3a: local.ts drafts 空 dir 削除 | job start 後 dir 消去 / legacy regression なし | TC-05〜TC-07, TC-21 |
| Task 3b: managed.ts 同上 | 同上 (managed runtime) | TC-08, TC-09 |
| Task 2a: cancel.ts 共通 util 化 | 共通 util 経由 / fail-fast コメント | TC-10〜TC-12, TC-17 |
| Task 2b: job-show.ts 共通 util 化 | 共通 util 経由 / silent fallback コメント | TC-13, TC-14, TC-18 |
| Task 2c: ps.ts 共通 util 化 | 共通 util 経由 / silent fallback コメント | TC-15, TC-16, TC-18 |
| Task 5: typecheck / test | bun run typecheck && bun run test green | TC-19, TC-20 |

---

## Category: resolveRepoRoot util (Unit)

### TC-01
- **Priority**: must
- **Source**: 受け入れ基準「resolveRepoRoot / resolveRepoRootOrFail が export」/ Task 4a

```
GIVEN カレントディレクトリが git リポジトリ内にある
WHEN  resolveRepoRoot() を呼ぶ
THEN  git repo root の絶対パス文字列を返す (null でない)
```

### TC-02
- **Priority**: must
- **Source**: 要件2「git 失敗時 null を返す」/ Task 4a

```
GIVEN git コマンドが失敗する環境 (non-git dir または spawnCommand をエラー返却で mock)
WHEN  resolveRepoRoot() を呼ぶ
THEN  null を返す (throw しない)
```

### TC-03
- **Priority**: must
- **Source**: 受け入れ基準「resolveRepoRoot / resolveRepoRootOrFail が export」/ Task 4a

```
GIVEN カレントディレクトリが git リポジトリ内にある
WHEN  resolveRepoRootOrFail() を呼ぶ
THEN  git repo root の絶対パス文字列を返す
```

### TC-04
- **Priority**: must
- **Source**: 要件2「git 失敗時 throw」/ Task 4a

```
GIVEN git コマンドが失敗する環境 (non-git dir または spawnCommand をエラー返却で mock)
WHEN  resolveRepoRootOrFail() を呼ぶ
THEN  Error を throw する
AND   エラーメッセージに git repo に関する説明が含まれる
```

### TC-22
- **Priority**: should
- **Source**: Task 1 仕様「exit code 非 0 時の null 返却」

```
GIVEN spawnCommand が exitCode: 128 (git が non-git dir で返すコード) を返すよう mock
WHEN  resolveRepoRoot() を呼ぶ
THEN  null を返す (exitCode チェックで null パスを通る)
```

---

## Category: drafts 空 dir 削除 — local.ts (Unit)

### TC-05
- **Priority**: must
- **Source**: 受け入れ基準1「job start 完走後 drafts/<slug>/ directory が完全に削除される」/ Task 4b

```
GIVEN specrunner/drafts/<slug>/request.md が存在する (canonical directory-format)
AND   local runtime を起動するよう opts.requestFilePath を設定
WHEN  local runtime が起動処理を完走する
THEN  specrunner/drafts/<slug>/ ディレクトリが存在しない (file + dir 両方削除)
```

### TC-06
- **Priority**: must
- **Source**: 受け入れ基準2「legacy flat 形式で regression が出ない」/ Task 4b

```
GIVEN specrunner/drafts/<slug>.md が存在する (legacy flat-file format)
AND   opts.requestFilePath が "/request.md" で終わらないパス
WHEN  local runtime が起動処理を完走する
THEN  specrunner/drafts/<slug>.md が削除されている
AND   specrunner/drafts/ ディレクトリ自体は削除されていない
```

### TC-07
- **Priority**: must
- **Source**: 課題A 実害3「同名 slug 再起票が confusing」

```
GIVEN specrunner/drafts/slug-a/request.md と specrunner/drafts/slug-b/request.md が両方存在する
WHEN  slug-a の local runtime が起動処理を完走する
THEN  specrunner/drafts/slug-a/ が存在しない
AND   specrunner/drafts/slug-b/ は変わらず存在する
```

### TC-21
- **Priority**: should
- **Source**: Task 3a の catch ブロック設計「draft 削除エラーは警告のみ」

```
GIVEN specrunner/drafts/<slug>/request.md が存在する
AND   fs.rm が権限エラー等で失敗するよう mock
WHEN  local runtime が起動処理を実行する
THEN  stderr に Warning メッセージが出力される
AND   job 自体は継続 / 失敗しない
```

---

## Category: drafts 空 dir 削除 — managed.ts (Unit)

### TC-08
- **Priority**: must
- **Source**: 受け入れ基準1 / Task 3b「managed.ts に同変更を適用」

```
GIVEN specrunner/drafts/<slug>/request.md が存在する (canonical directory-format)
AND   managed runtime を起動するよう opts.requestFilePath を設定
WHEN  managed runtime が起動処理を完走する
THEN  specrunner/drafts/<slug>/ ディレクトリが存在しない (file + dir 両方削除)
```

### TC-09
- **Priority**: must
- **Source**: 受け入れ基準2 / Task 3b

```
GIVEN specrunner/drafts/<slug>.md が存在する (legacy flat-file format)
AND   managed runtime を使用
WHEN  managed runtime が起動処理を完走する
THEN  specrunner/drafts/ ディレクトリ自体は削除されていない
```

---

## Category: CLI — cancel.ts (Unit / Static)

### TC-10
- **Priority**: must
- **Source**: 要件3「cancel.ts: resolveRepoRootOrFail() を使う」/ 課題B fail-fast

```
GIVEN git コマンドが失敗する環境 (non-git dir)
WHEN  cancel コマンドを実行する
THEN  エラーメッセージを stderr に出力する
AND   exit code 1 で終了する (処理を中断する)
```

### TC-11
- **Priority**: should
- **Source**: 要件3「cancel.ts が共通 util 経由で動作する」

```
GIVEN git リポジトリ内のディレクトリで cancel コマンドを実行
WHEN  resolveRepoRootOrFail() が repo root を返す
THEN  以降の cancel 処理が repo root を使って正常に進む
```

### TC-12
- **Priority**: must
- **Source**: 受け入れ基準「cancel.ts が共通 util 経由になっている」

```
GIVEN src/cli/cancel.ts のソースコード
WHEN  import 文を確認する
THEN  "../util/repo-root.js" から resolveRepoRootOrFail を import している
AND   inline の spawnCommand("git", ["rev-parse", ...]) ブロックが存在しない
```

### TC-17
- **Priority**: must
- **Source**: 受け入れ基準「なぜ fail-fast か の 1 行コメント」

```
GIVEN src/cli/cancel.ts のソースコード
WHEN  repo root 解決箇所のコメントを確認する
THEN  state-modifying であることを説明するコメントが存在する
```

---

## Category: CLI — job-show.ts (Unit / Static)

### TC-13
- **Priority**: must
- **Source**: 要件3「job-show.ts: null 時の process.cwd() fallback を維持」/ 課題B silent fallback

```
GIVEN git コマンドが失敗する環境 (resolveRepoRoot が null を返す状態に mock)
WHEN  job-show コマンドを実行する
THEN  process.cwd() を使って処理を継続する
AND   exit 1 しない
```

### TC-14
- **Priority**: must
- **Source**: 受け入れ基準「job-show.ts が共通 util 経由になっている」

```
GIVEN src/cli/job-show.ts のソースコード
WHEN  import 文を確認する
THEN  "../util/repo-root.js" から resolveRepoRoot を import している
AND   private な resolveRepoRoot() 関数定義が存在しない
```

### TC-18a
- **Priority**: must
- **Source**: 受け入れ基準「なぜ silent fallback か の 1 行コメント」

```
GIVEN src/cli/job-show.ts のソースコード
WHEN  repo root 解決箇所のコメントを確認する
THEN  read-only であることを説明するコメントが存在する
```

---

## Category: CLI — ps.ts (Unit / Static)

### TC-15
- **Priority**: must
- **Source**: 要件3「ps.ts: null 時の process.cwd() fallback を維持」/ 課題B silent fallback

```
GIVEN git コマンドが失敗する環境 (resolveRepoRoot が null を返す状態に mock)
WHEN  ps コマンドを実行する
THEN  process.cwd() を使って処理を継続する
AND   exit 1 しない
```

### TC-16
- **Priority**: must
- **Source**: 受け入れ基準「ps.ts が共通 util 経由になっている」

```
GIVEN src/cli/ps.ts のソースコード
WHEN  import 文を確認する
THEN  "../util/repo-root.js" から resolveRepoRoot を import している
AND   private な resolveRepoRoot() 関数定義が存在しない
```

### TC-18b
- **Priority**: must
- **Source**: 受け入れ基準「なぜ silent fallback か の 1 行コメント」

```
GIVEN src/cli/ps.ts のソースコード
WHEN  repo root 解決箇所のコメントを確認する
THEN  read-only であることを説明するコメントが存在する
```

---

## Category: request ls 意味論 (Integration)

### TC-23
- **Priority**: should
- **Source**: 課題A 実害2「request ls 出力が意味論を汚す」

```
GIVEN specrunner/drafts/<slug>/request.md が存在する
AND   job start が完走して slug dir が削除された状態
WHEN  request ls を実行する
THEN  その slug が drafts 一覧に表示されない
```

---

## Category: ビルド・型検査 (CI)

### TC-19
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck green」

```
GIVEN 全変更 (Task 1〜4) を適用した状態
WHEN  bun run typecheck を実行する
THEN  型エラーなしで完了する (exit code 0)
```

### TC-20
- **Priority**: must
- **Source**: 受け入れ基準「bun run test green」

```
GIVEN 全変更 (Task 1〜4) を適用した状態
WHEN  bun run test を実行する
THEN  全テストが pass する (新規追加テスト含む)
```
