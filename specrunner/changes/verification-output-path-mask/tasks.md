# Tasks: verification result の絶対パス正規化

## T-01: パス正規化 util `maskAbsolutePaths` を追加する

- [x] 新規ファイル `src/util/path-mask.ts` を作成する。他の `src/` モジュールに依存しない純粋関数とする（`paths.ts` の方針 D2 に倣う。`node:os` / `node:path` の標準モジュールのみ可）
- [x] 関数シグネチャ: `maskAbsolutePaths(text: string, opts: { cwd: string; homeDir?: string }): string` を export する。`homeDir` 省略時は `os.homedir()` を使う
- [x] 置換ロジックを以下の順序・方式で実装する（design.md D3）:
  1. `cwd + "/"` で始まる出現をリテラル全置換で除去する（`<cwd>/src/a.ts` → `src/a.ts`）
  2. `cwd` 単体の出現を `.` に置換する
  3. 残った `homeDir + "/"` で始まる出現を `~/` に置換する（`<home>/.cache/x` → `~/.cache/x`）
  4. 残った `homeDir` 単体の出現を `~` に置換する
- [x] 正規表現ではなくリテラル文字列置換（`split(target).join(replacement)` 相当）で全置換する。`cwd` / `homeDir` が空文字列の場合は該当置換をスキップする（過剰置換ガード）

**Acceptance Criteria**:
- `src/util/path-mask.ts` が存在し、`maskAbsolutePaths` を export している
- 当該ファイルは `src/` 配下の他モジュールを import していない
- cwd 配下のパスは repo 相対化、cwd 外の `$HOME` 配下のパスは `~` 化される
- `typecheck` が green

## T-02: writer seam `writeVerificationResult` で最終 markdown に正規化を適用する

- [x] `src/core/verification/runner.ts` の `writeVerificationResult()` に `cwd` を渡せるようシグネチャを拡張する（例: `writeVerificationResult(result, outputPath, cwd)`）
- [x] `lines.join("\n")` で組み立てた最終本文を `fs.writeFile` する直前に `maskAbsolutePaths(content, { cwd })` へ 1 回通してから書き出す（design.md D2）
- [x] 3 つの呼び出し箇所すべてに `cwd` を渡す: commands path（`runVerificationCommands` 内）、phase fallback path の package-json-integrity 早期 return、phase fallback path の通常 return
- [x] `PhaseResult` / `VerificationResult` のフィールド値（`stdout` / `stderr` / `verdict` / `exitCode` 等）は正規化しない。返却オブジェクトは生のまま保つ（コマンド実行・verdict 判定に触れない）

**Acceptance Criteria**:
- verification-result.md に書き出される本文のみが正規化され、返却される `VerificationResult` オブジェクトは未変更
- 既存の `tests/unit/core/verification/runner.test.ts` 等が無変更で green（verdict / phase / 構造の検証が不変）
- `typecheck` が green

## T-03: テストを追加する

- [x] `maskAbsolutePaths` の単体テスト `tests/unit/util/path-mask.test.ts` を追加する。最低限カバーする観点:
  - cwd 配下の絶対パス → repo 相対化
  - cwd 外の `$HOME` 配下パス → `~/` 化
  - cwd と homeDir が重なる場合に cwd 相対化が優先される（適用順序）
  - パスを含まないテキストは不変
- [x] writer seam の結合テストを追加する（既存 `runner.test.ts` を変更せず、新規 describe ブロックまたは新規ファイル `tests/unit/core/verification/runner-path-mask.test.ts`）。worktree（cwd）配下の絶対パスを含む擬似コマンド出力を spawn mock 経由で与え、書き出された `verification-result.md` を読み、`$HOME` 配下の絶対パスが含まれない（相対化 / プレースホルダ化されている）ことを assert する
- [x] テストは決定的にする。util テストでは `homeDir` を明示注入し、writer テストでは cwd 配下のパスを使う（`os.homedir()` 非依存にする）

**Acceptance Criteria**:
- worktree の絶対パスを含む擬似コマンド出力を与えたとき、書き出される verification result に `$HOME` 配下の絶対パスが含まれないテストがある
- 追加テストを含め `test` が green
- verdict 判定・phase 実行の挙動が変わらない（既存テスト無変更で green）

## T-04: 検証

- [x] `typecheck && test` を実行し green を確認する

**Acceptance Criteria**:
- `typecheck` が green
- `test`（既存 + 追加）が green
