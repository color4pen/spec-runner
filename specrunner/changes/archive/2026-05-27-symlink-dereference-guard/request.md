# fs.cp の symlink dereference 防止

## Meta

- **type**: spec-change
- **slug**: symlink-dereference-guard
- **base-branch**: main
- **adr**: false
- **issue**: #427

## 背景

`fs.cp` のデフォルト動作は symlink を follow するため、draft ディレクトリに symlink を配置すると任意ファイルが change folder にコピーされ PR で push されうる。対象のコピー操作は request.md と usage.json の2種類。

## 対象ファイル

- `src/core/runtime/local.ts:221` — `await fs.cp(opts.requestFilePath, changeFolderRequestPath)` の前に `fs.lstat` で symlink を検出し、symlink なら SpecRunnerError を throw する
- `src/core/runtime/managed.ts:109` — 同上
- `src/util/copy-artifacts.ts:55` — `await fs.cp(draftUsageSrc, changeUsageDst)` の前に同様の symlink チェックを追加する。既存の try/catch ブロックの**外側**に配置すること（try 内だと SpecRunnerError が swallow される）

## 設計判断

- `dereference: false` オプションではなく `fs.lstat` + reject を選択する。理由: symlink 自体をコピーしても意味がなく、symlink の存在自体が異常なので reject が適切
- チェックロジックは共通ユーティリティ関数に切り出す（3箇所で使うため）

## スコープ外

- test ファイル内の `fs.cp` (`tests/unit/core/runtime/draft-move.test.ts:42`) は対象外
- ディレクトリ単位の再帰コピーは現在使われていないため対象外

## 受け入れ基準

- request.md / usage.json のコピー時に symlink が検出された場合、SpecRunnerError が throw されること
- 通常ファイル（非 symlink）のコピーが従来通り動作すること
- symlink チェック関数が共通化されていること
