# specrunner job resume に追加 prompt 注入オプションを追加する

## Meta

- **type**: new-feature
- **slug**: resume-prompt-injection
- **base-branch**: main
- **adr**: false
- **close-issues**: 384

## 背景

`specrunner job resume <slug>` で halt した job を再開する際、agent に追加コンテキストを渡す手段がない。例えば:

- halt 後に手動で行った修正内容を伝えたい
- 前回の review feedback を強調して同じミスを防ぎたい
- 一時的な制約（「この関数は触るな」等）を追加したい

現状は agent が前回と同じコンテキストで再実行するため、手動修正を認識できず同じ問題を繰り返す。

## 要件

### 1. `--prompt` オプションで inline テキストを注入

```
specrunner job resume <slug> --prompt "手動で foo.ts の import を修正済み"
```

### 2. `--prompt-file` オプションでファイルからテキストを注入

```
specrunner job resume <slug> --prompt-file ./fix-notes.md
```

### 3. 注入先

resume 起動時に実行される最初の agent ステップのみに適用する。後続ステップには引き継がない。既存の resume context（step 情報、前回の outcome 等）を壊さない。

### 4. 両方指定時の挙動

`--prompt` と `--prompt-file` を同時に指定した場合はエラーとする。

## スコープ外

- **run 時の prompt 注入** — resume 専用、run は既存の request.md で十分
- **prompt の永続化** — 注入は 1 回限り、state に保存しない
- **agent session の resume（SDK level）** — CLI level の initial message 注入のみ

## 受け入れ基準

- [ ] `--prompt <text>` で inline テキストが agent に渡される
- [ ] `--prompt-file <path>` でファイル内容が agent に渡される
- [ ] 両方指定時にエラーメッセージが出る
- [ ] オプションなしの場合は現行動作と同一（後方互換）
- [ ] `bun run typecheck && bun run test` が green
