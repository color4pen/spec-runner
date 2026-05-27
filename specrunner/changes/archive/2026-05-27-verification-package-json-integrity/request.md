# verification 前に package.json の改変を検出して escalation する

## Meta

- **type**: spec-change
- **slug**: verification-package-json-integrity
- **base-branch**: main
- **adr**: false
- **issue**: #423

## 背景

verification step はワークツリー内の `package.json` scripts を信頼して `bun run build` / `bun test` 等を実行する（phase fallback path: `src/core/verification/runner.ts:267-381`）。implementer agent がワークツリー内の `package.json` の scripts セクションを書き換えると、verification step で任意コマンドが実行される。

custom commands path（`config.verification.commands`）はユーザーが明示設定するので問題ない。phase fallback path のみが対象。

## 対象ファイル

- `src/core/verification/runner.ts` — `runVerificationPhases()` の冒頭で、ワークツリーの `package.json` と main ブランチの `package.json` の `scripts` セクションを比較する。差分がある場合は verification を実行せず escalation（verdict: failed + 改変検出メッセージ）を返す
- `src/core/verification/runner.ts` — diff チェック用のヘルパー関数を追加する。`git show origin/<baseBranch>:package.json` でベースラインを取得し、`scripts` フィールドを JSON レベルで比較する。baseBranch は job state から取得する

## 設計判断

- 比較対象は `scripts` セクションのみ。`dependencies` / `devDependencies` の変更は implementer agent の正当な操作（パッケージ追加等）なので許容する
- diff チェックは phase fallback path でのみ実行する。custom commands path（`config.verification.commands` 指定時）はユーザーが明示的にコマンドを設定しているためチェック不要
- ベースライン取得は `git show origin/<baseBranch>:package.json` を使う。`baseBranch` は job state から取得する（`origin/main` ハードコードではなく、request.md の `base-branch` 値に従う）
- ベースライン取得失敗（baseBranch に package.json がない等）はスキップして従来通り実行する（新規プロジェクト対応）
- escalation verdict は `failed` とし、verification-result.md に改変された scripts の diff を記載する

## スコープ外

- custom commands path のサンドボックス化
- `bun run` 以外の実行方式への変更
- package.json 以外のファイル（tsconfig.json 等）の改変検出

## 受け入れ基準

- phase fallback path で verification 実行前に `package.json` の `scripts` セクションが main と比較されること
- scripts が改変されている場合、verification が実行されず verdict: failed + 改変内容が verification-result.md に記載されること
- scripts が未改変の場合、従来通り verification が実行されること
- custom commands path では diff チェックが実行されないこと
- baseBranch に package.json が存在しない場合はチェックをスキップすること
