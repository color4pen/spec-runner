# Delta Spec: cli-commands (create-polish-and-resume)

## MODIFIED Requirements

### Requirement: `specrunner create` の引数パース

`specrunner create` は MUST 以下の引数を受け付ける:

```
specrunner create ["<description>"] [--type <type>] [--slug <slug>] [--no-llm] [--run] [--resume <slug>]
```

`--resume` が指定されている場合、`<description>` は MUST NOT 必須としない。`--resume` が指定されていない場合、`<description>` は MUST 必須とする。

#### Scenario: --resume 指定時に description なし

- **WHEN** ユーザーが `specrunner create --resume my-feature` を実行する
- **THEN** description なしでもエラーにならず、draft の復帰フローに進む

#### Scenario: --resume なしで description なし

- **WHEN** ユーザーが `specrunner create` を引数なしで実行する
- **THEN** `Error: specrunner create requires a <description> argument.` を stderr に出力し、exit code 2 で終了する

### Requirement: `specrunner create` はデフォルトで対話モードを使用する

`specrunner create` は MUST `--no-llm` が指定されていない場合、対話型 REPL モードで request.md を生成する。`executeCreate()` は `--no-llm` 時にスキャフォールドテンプレートを使用し、それ以外は `executeCreateDialog()` に委譲するファサードとして機能する MUST。

#### Scenario: executeCreate のファサード動作

- **WHEN** `executeCreate()` が `noLlm: false` で呼び出される
- **THEN** `executeCreateDialog()` に委譲し、対話モードで request.md を生成する

## ADDED Requirements

### Requirement: `--resume` による対話セッション再開

`specrunner create --resume <slug>` は MUST 中断した対話セッションを再開する。再開は 2 層構造で行う:

1. **Hot resume**: `draft-state.json` に `sessionId` が記録されている場合、SDK の `resume` オプションで session を復帰する。draft の request.md 内容を再表示してからユーザー入力を待つ
2. **Cold start**: `sessionId` が無効またはない場合、新しい session を開始する。draft の request.md 内容を初回 prompt に含めて再開する

#### Scenario: hot resume の正常動作

- **WHEN** `specrunner create --resume my-feature` を実行する
- **AND** `specrunner/requests/draft/my-feature/draft-state.json` に有効な `sessionId` がある
- **THEN** SDK の `resume` オプションで session が復帰する
- **AND** draft の request.md 内容が stderr に再表示される
- **AND** `> ` プロンプトでユーザー入力を待つ

#### Scenario: hot resume 失敗時の cold start フォールバック

- **WHEN** `specrunner create --resume my-feature` を実行する
- **AND** `draft-state.json` の `sessionId` が無効（SDK が例外を投げる）
- **THEN** stderr に `"セッションを復旧できなかったため新規開始します"` と通知する
- **AND** 新規 session で対話を再開する
- **AND** draft の request.md 内容が初回 prompt に含まれる

#### Scenario: draft が存在しない場合

- **WHEN** `specrunner create --resume nonexistent` を実行する
- **AND** `specrunner/requests/draft/nonexistent/` が存在しない
- **THEN** stderr にエラーメッセージを出力する
- **AND** exit code 1 で終了する

### Requirement: slug の対話生成

`--slug` が指定されていない場合、LLM は MUST `<!-- SLUG_PROPOSAL: <slug> -->` マーカーで slug を提案する。CLI は正規表現 `/<!-- SLUG_PROPOSAL:\s*(\S+)\s*-->/` でマーカーを検出し、ユーザーに確認を求める MUST。

#### Scenario: slug 提案の確認

- **WHEN** LLM が `<!-- SLUG_PROPOSAL: my-feature -->` を含む応答を返す
- **THEN** CLI が `"slug: my-feature で良いですか？ [y/N] "` と確認する
- **AND** ユーザーが `y` を入力すると slug が確定し、draft 永続化が開始される

#### Scenario: slug 提案の拒否

- **WHEN** ユーザーが slug 確認で `n` を入力する
- **THEN** LLM に別の slug 提案を求める

#### Scenario: 複数マーカーの処理

- **WHEN** LLM の応答に `<!-- SLUG_PROPOSAL: first -->` と `<!-- SLUG_PROPOSAL: second -->` が含まれる
- **THEN** 最後のマーカー（`second`）を採用する

#### Scenario: slug マーカー未検出のフォールバック

- **WHEN** 3 assistant ターンを経過してもマーカーが検出されない
- **THEN** `slugify(description)` で slug を自動生成する
- **AND** stderr に `"slug を自動生成しました: <slug>"` と通知する

#### Scenario: --slug 指定時のスキップ

- **WHEN** `specrunner create "description" --slug my-slug` を実行する
- **THEN** slug 提案フェーズはスキップされる
- **AND** `my-slug` がそのまま使用される

#### Scenario: LLM 提案 slug のバリデーション失敗

- **WHEN** LLM が提案した slug が kebab-case でない、または 50 文字を超える、または既存 slug と衝突する
- **THEN** stderr にユーザー通知する
- **AND** CLI が自動的に次のターンで LLM にフィードバックメッセージを送信し、別の slug の再提案を求める（ユーザーの手動入力は不要）

### Requirement: Ctrl+C での draft 保存

SIGINT（Ctrl+C）を MUST `process.on('SIGINT', ...)` で捕捉し、slug 確定済みの場合は現在の draft を保存してから終了する。

#### Scenario: slug 確定後の Ctrl+C

- **WHEN** slug が確定した状態で Ctrl+C が押される
- **THEN** 現在の draft が `specrunner/requests/draft/<slug>/` に保存される
- **AND** stderr に保存先を通知する
- **AND** exit code 130 で終了する

#### Scenario: slug 未確定の Ctrl+C

- **WHEN** slug 未確定の状態で Ctrl+C が押される
- **THEN** draft は保存されない（known limitation）
- **AND** exit code 130 で終了する

### Requirement: `--run` の対話モード対応

対話モードの finalize 後、`--run` フラグに応じて pipeline を起動する MUST。

#### Scenario: --run フラグあり

- **WHEN** `specrunner create "description" --run` で対話が finalize される
- **THEN** 確認なしで `specrunner run` を実行する

#### Scenario: --run フラグなし

- **WHEN** 対話が finalize される
- **THEN** `"specrunner run を実行しますか？ [y/N] "` と確認する
- **AND** `y` で実行、`n` またはその他で実行しない

### Requirement: 1-shot コードの削除

`extractRequestContent()` は MUST 削除される。`buildCreateSystemPrompt()` と `buildCreateUserMessage()`（`src/prompts/create-system.ts`）は MUST ファイルごと削除される。`buildScaffoldTemplate()` は `--no-llm` モード用に MUST 残す。

#### Scenario: 1-shot コード削除後の --no-llm 動作

- **WHEN** `specrunner create "description" --no-llm --slug my-feature` を実行する
- **THEN** `buildScaffoldTemplate()` でテンプレートが生成される
- **AND** `extractRequestContent()` は呼ばれない（削除済み）
