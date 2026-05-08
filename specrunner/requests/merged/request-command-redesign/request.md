# create コマンドを廃止し request コマンドに再編する

## Meta

- **type**: spec-change
- **slug**: request-command-redesign

## 背景

`specrunner create` は Claude Agent SDK で対話 REPL を自前実装しているが、以下の問題がある:

1. SDK の `tool_use_summary` が emit されず、ツール使用表示が機能しない
2. スピナー管理が `consumeStream` 内で散在し、状態管理が脆弱
3. `FINAL_DRAFT` / `SLUG_PROPOSAL` マーカー検出が LLM 出力の文字列マッチに依存し、false positive/negative が起こりうる
4. Claude Code が既に提供する対話 UI を約 1,400 行で劣化コピーしている

### 設計上の気づき

- **Local Runtime ユーザーは Claude Code を持っている** — 対話 UI は Claude Code 自体が提供する。specrunner が自前で組む必要がない
- **specrunner create の本質的な責務は「request.md の生成支援」であり「対話 UI の提供」ではない**
- **Managed Runtime は CI/CD バッチ実行が主** — request.md は人間が事前に書いて渡す前提が自然
- **入口を厳しくするより出口で吸収する** — フォーマットをリアルタイム強制するより、バリデーションで対応
- **レビューは Claude Code の会話でやる** — 文脈を踏まえたオーケストレーションはコマンド化できない。architect agent は openspec-workflow プラグインのまま、会話内でサブエージェント起動する方が質が高い

### architect 評価済みの設計判断

- 対話 REPL 廃止は妥当。Claude Code への委譲で 1,400 行の削除と SDK 内部構造依存の排除が可能
- `request` サブコマンドグループは意味的なまとまりがあり CLI 構造として適切
- list/show を持たない判断は正しい。`run` はパスを受け取るだけで request の状態管理は不要
- 既存パイプライン（run / finish / resume）への影響はゼロ

## 要件

### 1. `specrunner request` コマンド新設

2 つのサブコマンドを持つ:

#### `specrunner request template [--type <type>]`

- type に応じた request.md テンプレートを stdout に出力する
- type 省略時はデフォルト（new-feature）のテンプレートを出力
- 対応 type: new-feature, bug-fix, spec-change, refactoring
- テンプレートのマスターは `buildScaffoldTemplate()` を流用する（シングルソース）

#### `specrunner request validate <file>`

- 指定された request.md のフォーマットをチェックする
- 既存の `parseRequestMdContent()` を利用
- エラーがあれば具体的な修正指示を stderr に出力
- 成功時は exit 0、失敗時は exit 1

### 2. `specrunner create` コマンドの廃止

以下のソースファイルを削除する:

- `src/core/command/create-dialog.ts` (677行)
- `src/core/command/create.ts` (166行)
- `src/cli/create.ts` (142行)
- `src/prompts/create-dialog.ts` (193行)
- `src/state/draft-store.ts` (92行)
- `src/cli/spinner.ts` (42行)

以下のテストファイルを削除する:

- `tests/unit/core/command/create-dialog.test.ts`
- `tests/unit/core/command/create.test.ts`
- `tests/unit/core/command/create-polish-and-resume.test.ts`
- `tests/unit/prompts/create-dialog.test.ts`
- `tests/unit/state/draft-store.test.ts`
- `tests/unit/cli/spinner.test.ts`

部分削除:

- `src/adapter/claude-code/message-types.ts` から `isToolUseStart` を削除（他の型ガードは保持）
- `tests/unit/adapter/claude-code/message-types.test.ts` から TC-MT-005 を削除
- `bin/specrunner.ts` から `runCreate` の import と登録を除去

### 3. 再利用のために残すファイル

- `src/context/request-patterns.ts` — 将来のコンテキスト注入機能で再利用する可能性がある
- `src/git/dynamic-context.ts` — 元々 create 以外でも使用されている

### 4. エントリポイント修正

- `bin/specrunner.ts` に `request` コマンドグループを登録
- ヘルプ表示に `request template`, `request validate` を追加

## スコープ外

- request のディレクトリ管理（active/draft/merged の遷移）
- request の list/show コマンド
- request review コマンド（レビューは Claude Code の会話で architect agent を起動して行う）
- `specrunner init` の変更

## 受け入れ基準

- [ ] `specrunner request template` でテンプレートが stdout に出力される
- [ ] `specrunner request template --type bug-fix` で bug-fix 用テンプレートが出力される
- [ ] `specrunner request validate <file>` で正しい request.md が exit 0 を返す
- [ ] `specrunner request validate <file>` でフォーマット不正時に具体的なエラーメッセージが出る
- [ ] `specrunner create` が存在しない（コマンド登録が除去されている）
- [ ] 削除対象のソース・テストファイルが存在しない
- [ ] `specrunner run` / `finish` / `resume` が引き続き正常動作する
- [ ] `bun run typecheck && bun run test` が green
