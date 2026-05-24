## Requirements

### Requirement: draft はディレクトリ構造で保存する

`specrunner request new <slug>` は `specrunner/drafts/<slug>/request.md` を生成しなければならない (MUST)。ディレクトリは自動作成しなければならない (MUST)。

#### Scenario: new コマンドでディレクトリ構造が作成される

`specrunner request new my-change` を実行したとき、`specrunner/drafts/my-change/request.md` が作成される。

### Requirement: list はディレクトリベースで slug を列挙する

`specrunner request ls` は `specrunner/drafts/` 配下のディレクトリのうち `request.md` を含むものを slug として列挙しなければならない (MUST)。

#### Scenario: ディレクトリ形式の slug が列挙される

`specrunner/drafts/my-change/request.md` が存在するとき、`specrunner request ls` の出力に `my-change` が含まれる。

### Requirement: read / validate / review はフォールバック付きで request.md を読む

`store.resolveWithFallback()` は新形式 `<slug>/request.md` を優先し、存在しなければ旧形式 `<slug>.md` にフォールバックしなければならない (MUST)。どちらも存在しない場合は新形式のパスを返さなければならない (MUST)。

#### Scenario: 新形式が優先される

`specrunner/drafts/my-change/request.md` が存在するとき、`resolveWithFallback` は新形式のパスを返す。

### Requirement: 後方互換を維持する

既存の flat ファイル (`specrunner/drafts/<slug>.md`) が存在する場合、`resolve` 系の関数はそのファイルを読み込めるようにしなければならない (MUST)。新規作成は常にディレクトリ構造を使用しなければならない (MUST)。

#### Scenario: 旧形式フラットファイルがフォールバックで読める

新形式が存在せず `specrunner/drafts/my-change.md` が存在するとき、`resolveWithFallback` は旧形式のパスを返す。

### Requirement: pipeline-run の slug 抽出を新形式に対応させる

`specrunner run <slug>` は `specrunner/drafts/<slug>/request.md` から slug を抽出できなければならない (MUST)。旧形式 `specrunner/drafts/<slug>.md` にもフォールバックしなければならない (MUST)。

#### Scenario: 新形式パスから slug が抽出される

`specrunner/drafts/my-change/request.md` を引数に渡したとき、pipeline-run は slug として `my-change` を取得する。

### Requirement: change folder 構造は変更しない

`specrunner/changes/<slug>/request.md` (pipeline 実行時のコピー先) の構造は変更してはならない (MUST)。

#### Scenario: pipeline 実行後の change folder が従来通りの構造を持つ

`specrunner run my-change` を実行したとき、コピー先は `specrunner/changes/my-change/request.md` のままである。
