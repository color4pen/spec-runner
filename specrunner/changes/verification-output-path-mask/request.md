# verification result に実行マシンの絶対パスを残さない

## Meta

- **type**: bug-fix
- **slug**: verification-output-path-mask
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

branch に commit される verification-result.md に、build / test コマンドの生出力経由で実行マシンの絶対パス（`$HOME` 配下、OS ユーザー名を含む）が記録される。リポジトリを公開すると、pipeline を 1 回実行するたびに実行者のユーザー名が main に積まれる。secrets の env-filter / 出力の maskSensitive と同じく、「漏洩面を writer の seam 一点で塞ぐ」型で解消する。

## 現状コードの前提

- 現行世代の commit 対象 artifact で絶対パスが残るのは verification-result.md のみ（直近の archive 3 件で確認: build 出力の config パス行、vitest の RUN 行等）。state.json / events.jsonl への混入は過去世代の事象で、現行では発生しない
- verification の実行と結果ファイルの整形は `src/core/verification/runner.ts` が行い、phase 表と各 phase のコマンド出力を markdown に書き出す
- 出力マスクの既存 seam として `logger/stdout` の `maskSensitive`（B-7、token 系の封じ込め）がある。本件はそれと同型の、パス正規化の seam を commit される出力に対して設ける話

## 要件

1. verification result として書き出すコマンド出力から、実行マシンの絶対パスを除去する: 実行 cwd（worktree root）配下のパスは repo 相対に正規化し、それ以外の `$HOME` 配下のパスはプレースホルダ（例: `~`）に置換する
2. 正規化は結果ファイルの writer 側の seam 一点で行う。コマンド実行や verdict 判定のロジックには触れない
3. 対象は CLI が生成して commit する artifact に限る。agent が散文として書くファイルは対象外
4. 既存 archive に残っている過去のパスの遡及修正はスコープ外（履歴書き換えで別途対応する）

## スコープ外

- 既存 archive / git 履歴の書き換え
- agent が生成する markdown（spec.md / design.md 等）の内容検査
- stdout / stderr のリアルタイム出力（commit されないため。既存の maskSensitive の責務）
- state.json / events.jsonl（現行世代で混入なし）

## 受け入れ基準

- [ ] worktree の絶対パスを含む擬似コマンド出力を与えたとき、書き出される verification result に `$HOME` 配下の絶対パスが含まれない（相対化またはプレースホルダ化されている）テストがある
- [ ] verdict 判定・phase 実行の挙動が変わらない（既存テスト無変更で green）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 漏洩の遮断は読み手の注意ではなく writer の seam で行う（env-filter / maskSensitive と同じ封じ込めパターン）。履歴書き換えだけでは次の run で再発するため、発生源の遮断が先行する
