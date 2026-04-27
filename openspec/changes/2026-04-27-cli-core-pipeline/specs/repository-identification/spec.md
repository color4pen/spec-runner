## ADDED Requirements

### Requirement: cwd の git remote から owner/name を解決する

CLI は MUST `git remote get-url origin` を実行し、出力 URL から `owner` と `name` を抽出する。SSH 形式（`git@github.com:owner/name.git`）と HTTPS 形式（`https://github.com/owner/name.git`、`.git` suffix の有無を問わない）の SHALL 両方をサポートする。

#### Scenario: HTTPS URL

- **WHEN** `git remote get-url origin` が `https://github.com/color4pen/spec-runner.git` を返す
- **THEN** parser は `{ owner: "color4pen", name: "spec-runner" }` を返す

#### Scenario: HTTPS URL（.git なし）

- **WHEN** 出力が `https://github.com/color4pen/spec-runner` を返す
- **THEN** `{ owner: "color4pen", name: "spec-runner" }` を返す

#### Scenario: SSH URL

- **WHEN** 出力が `git@github.com:color4pen/spec-runner.git` を返す
- **THEN** `{ owner: "color4pen", name: "spec-runner" }` を返す

#### Scenario: HTTPS URL with credentials

- **WHEN** 出力が `https://x-access-token:abc@github.com/o/r.git` を返す
- **THEN** credentials 部分を除去した上で `{ owner: "o", name: "r" }` を返す

### Requirement: GitHub 以外の remote はエラーとなる

origin が GitHub 以外（gitlab.com、bitbucket、自前ホスト等）を指す場合、CLI は MUST `REMOTE_NOT_GITHUB` エラーで `'origin' must point to github.com.` を返す。CLI は SHALL GitHub 以外のホストに対して propose セッションを起動しない。

#### Scenario: GitLab remote

- **WHEN** 出力が `https://gitlab.com/u/r.git` を返す
- **THEN** `REMOTE_NOT_GITHUB` エラーを発生させる

### Requirement: cwd が git repo でない場合はエラーとなる

`git remote get-url origin` がエラー終了する、または cwd の上位に `.git` ディレクトリが存在しない場合、CLI は MUST `NOT_GIT_REPO` エラーで `Not a git repository.` を返す。CLI は SHALL git 未初期化ディレクトリで処理を継続しない。

#### Scenario: git 未初期化ディレクトリ

- **WHEN** cwd またはその親に `.git` が無い
- **THEN** `NOT_GIT_REPO` エラーを返す

#### Scenario: origin remote が無い

- **WHEN** git repo だが origin remote が未設定
- **THEN** `Origin remote not configured. Run 'git remote add origin <url>' first.` を返す

### Requirement: 解析は外部 npm 依存なしで行う

URL のパースは MUST Node 標準の `URL` クラスと正規表現で実装され、`git`、`url-parse`、`@octokit/url` 等の追加依存を導入しない。`git` コマンドの呼び出しは SHALL `node:child_process` の `execFile` を使う（shell injection 回避のため `exec` ではなく `execFile`）。

#### Scenario: child_process 利用

- **WHEN** git remote を取得する
- **THEN** `child_process.execFile("git", ["remote", "get-url", "origin"])` で取得し、shell injection を避ける（`exec` ではなく `execFile`）
