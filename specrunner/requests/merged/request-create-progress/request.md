# request create / review のプログレス表示を追加する

## Meta

- **type**: new-feature
- **slug**: request-create-progress
- **base-branch**: main
- **adr**: false
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #227

## 背景

`specrunner request create "..."` を実行すると、config の Warning だけ出て LLM の応答待ち中に何も表示されない。プロセスが生きているのかハングしているのか判断できない。

`specrunner request review` も同様の沈黙が起きうる (= 同じ one-shot query 呼び出しパターン)。

## 期待

LLM の query() 呼び出し前に「Generating request.md...」「Reviewing request.md...」等のプログレス表示を stderr に出力する。完了時に成功メッセージを表示する。

## 設計判断

### 1. 出力先: stderr

進捗ログは stderr に出す (= stdout は構造化結果 / file path 等のため）。既存 specrunner CLI ログと一貫。

### 2. 表現: 単純な文字列出力

spinner / animation は採用しない。`Generating request.md...` → `✓ Generated <slug>` (or `✗ Failed`) 程度のテキスト。

### 3. timing

- 開始: query() 呼び出し直前
- 完了: query() result 確定後 (= file write 後でも、結果取得後でも自然な時点で OK)

## 要件

### 1. request create に進捗表示を追加

`src/core/command/request-create.ts`:

- LLM query() 呼び出し直前で stderr に `Generating request.md...` を出力
- 成功時に `✓ Generated <slug>` を出力
- 失敗時に `✗ Failed: <error message>` を出力

### 2. request review に進捗表示を追加

`src/core/command/request-review.ts`:

- LLM query() 呼び出し直前で stderr に `Reviewing request.md...` を出力
- 成功時に `✓ Reviewed` (+ verdict 等の既存出力) を維持
- 失敗時に `✗ Failed: <error message>` を出力

### 3. test

`tests/unit/command/request-create.test.ts` (= 新規 file。既存 `tests/unit/command/request-review.test.ts` と同 directory に配置):

- TC-PROG-01: request create 実行時に `Generating request.md...` が stderr に出力される
- TC-PROG-02: 成功時に `✓ Generated <slug>` が stderr に出力される

`tests/unit/command/request-review.test.ts` (= 既存 file への追記):

- TC-PROG-03: request review 実行時に `Reviewing request.md...` が stderr に出力される

### 4. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/cli-commands/spec.md` を作成し、`## MODIFIED Requirements` セクションで「`specrunner request create` / `specrunner request review` コマンドが LLM 呼び出しの開始と完了時に stderr へ進捗を出力する」旨を Requirement に追記する (= finish 時に spec-merge が baseline を更新、本 PR では baseline `specrunner/specs/cli-commands/spec.md` は直接編集しない、`AUTHORITY_SPEC_GUARD_RULE` 準拠):

- request create / review コマンドは LLM query() 呼び出し直前に `Generating request.md...` / `Reviewing request.md...` を stderr に出力する
- 完了時に `✓ Generated <slug>` / `✓ Reviewed` 等の成功メッセージを stderr に出力する
- 失敗時に `✗ Failed: <error message>` を stderr に出力する

= `cli-commands` capability は specrunner CLI のサブコマンド振る舞いを定義する spec authority (= `init` / `login` / `run` / `ps` / `doctor` / `finish` の延長)。既存 `request-management` (= web app の Server Action 仕様) ではない。

## スコープ外

- spinner / animation
- 詳細な phase 分解 (= 「config 解決中」「LLM 応答中」等の細分化はしない)
- request 系以外のコマンド (= run / finish の進捗は別軸)

## 受け入れ基準

- [ ] `specrunner request create` 実行時に `Generating request.md...` が stderr に出力される
- [ ] 成功時に `✓ Generated <slug>` が stderr に出力される
- [ ] `specrunner request review` 実行時に `Reviewing request.md...` が stderr に出力される
- [ ] 既存 test の regression なし
- [ ] 新規 test (= TC-PROG-01〜03) が追加され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec `specrunner/changes/<slug>/specs/cli-commands/spec.md` が `## MODIFIED Requirements` を持つ形で作成されている

## Workflow Options

- enabled: []
