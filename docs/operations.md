# 無人ループの運用

issue を間口に、cron の定期実行（tick）が request の起動・再開・回復を自動で行う運用形態のセットアップと日常運用をまとめる。

## 前提

- `specrunner init` 済み・`specrunner doctor` が green であること
- 対象リポジトリへの push 権限を持つ GitHub トークン

## 認証の3層

無人実行（cron / launchd）は macOS keychain を読めない。対話セッションで動いていた認証が cron で壊れる場合、以下の3層を順に確認する。

### 1. GitHub API

トークン解決の優先順: 環境変数（`GH_TOKEN` / `GITHUB_TOKEN`）→ `gh auth token`（keychain、**cron では利用不可**）→ `~/.config/specrunner/credentials.json`。

無人運用の床は credentials.json に置く fine-grained PAT。トークンを画面に出さずに設定する:

```sh
read -rs "PAT?PAT: "
jq --arg t "$PAT" '.github.token = $t' ~/.config/specrunner/credentials.json > /tmp/cred.json \
  && mv /tmp/cred.json ~/.config/specrunner/credentials.json && chmod 600 ~/.config/specrunner/credentials.json
```

### 2. git transport（fetch / push）

CLI が解決済みトークンを git 呼び出しに自動注入する（HTTPS の origin のみ。http: は拒否、SSH はそのまま通す）。個別設定は不要。

### 3. agent 実行（local runtime）

Claude Code の対話ログインも keychain 依存のため、cron では `claude setup-token` で発行した長期トークンを環境変数で渡す。

## crontab

環境変数の行は **job の行より前** に置く（cron の env は後続行にのみ適用される）:

```cron
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
CLAUDE_CODE_OAUTH_TOKEN=<claude setup-token の出力>
*/5 * * * * cd ~/path/to/repo && bun ./bin/specrunner.ts inbox run >> ~/.specrunner-inbox.log 2>&1
```

蓋を閉じる・スリープする運用なら、job 行を `caffeinate -i` で包むと実行中のスリープを抑止できる。

## issue ジェスチャー

ユーザーの操作面はすべて issue 上にある。

| 操作 | 方法 |
|------|------|
| request の投入 | issue 本文を request.md の構造で書く（`specrunner request template` の形式） |
| 実行の承認 | issue に `specrunner-approved` ラベルを付ける。次の tick が拾う |
| escalation への応答 | escalation 通知コメントへの返信として `/resume <指示>` をコメントする |
| 完了の受領 | 完走時に PR URL つきの通知コメントが入る。merge と archive は人間の判断（`job archive --with-merge <slug>`） |

ラベルを付けない限り issue は何度 tick が回っても実行されない。起票と実行判断は分離されている。

### 並列度

tick 内の起動は逐次（1 つの tick プロセスが pipeline を完走まで実行する）。並列性は tick をまたいで生まれる — 実行中の tick がある間に次の tick が別の未着手 issue を拾う。同一マシンでの同時実行はテストの負荷干渉を避けるため 2 本程度を目安とする。

## 障害への耐性

| 事象 | 挙動 |
|------|------|
| マシン再起動 | cron が次の境界から再開。tick は reconcile（現状から差分を裁く）なので、停止中の操作はまとめて拾われる |
| job 非実行中のスリープ | tick が飛ぶだけ。影響なし |
| セッション実行中のスリープ・回線断 | transient エラーとして上限つき自動リトライ。上限超過で escalation 通知 → `/resume` |
| 実行プロセスの死（kill・クラッシュ） | 次の tick が孤児を検出し自動 resume。進捗のない再起動が続く場合は上限後に escalation |

## スケジューリング例

### launchd (macOS)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yourteam.specrunner-inbox</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npx</string>
    <string>specrunner</string>
    <string>inbox</string>
    <string>run</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/repo</string>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

### GitHub Actions

3 つのトリガーで一般的な自動化パターンをカバーする。`concurrency` グループで実行の重複を防ぐ。

`GITHUB_TOKEN` は GitHub Actions が run ごとに自動注入するため、手動の secret 設定は不要。

```yaml
name: SpecRunner Inbox

on:
  schedule:
    - cron: "*/10 * * * *"         # 10 分ごとに poll
  issues:
    types: [labeled]               # ラベル付与で即時発火
  issue_comment:
    types: [created]               # 新コメントで即時発火

concurrency:
  group: specrunner-inbox
  cancel-in-progress: false        # 実行中の run は完了させ、次を queue

jobs:
  inbox-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run inbox
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx specrunner inbox run
```

`issues.labeled` トリガーに承認ラベルのフィルタを追加する場合:

```yaml
  issues:
    types: [labeled]
# job 側:
    if: github.event.label.name == 'specrunner-approved'
```

## inbox の挙動詳細

### 冪等性

各 `inbox run` は何度呼んでも副作用なく安全に実行できる。

- **issue linkage**: 一度 job が開始された issue は、以降の run では job の状態に関わらずスキップされる
- **resume gating**: escalation マーカー（SpecRunner が escalation 時に投稿するコメント）より**厳密に後**に投稿された `/resume` コメントのみ受理する。それ以前のコメントや bot 生成のコメントは無視される

### `/resume` ワークフロー

job が escalation した場合、SpecRunner はリンクされた issue に escalation コメントを投稿する。再開するには:

1. escalation コメントを読み、どの判断が必要かを理解する
2. `/resume` で始まる新しい issue コメントを投稿する:
   ```
   /resume Use option B. Skip the cache layer and go with the simpler approach.
   ```
3. 次の `inbox run` が job を再開する。コメントの内容が context として agent に渡される

`OWNER`、`MEMBER`、`COLLABORATOR` の association を持つユーザーのコメントのみ受理される。

### 信頼境界

issue body と `/resume` コメントのテキストは agent prompt にそのまま渡される。

- 承認ラベルがゲート: リポジトリメンバーが明示的にラベルを付けた issue のみ処理される
- `/resume` コメントは `OWNER` / `MEMBER` / `COLLABORATOR` に限定される。外部コントリビュータはプロンプトを注入できない

**untrusted な issue content を持つリポジトリでの `inbox run` の実行は推奨しない。** ラベル付与権限を持つリポジトリメンバーが悪意ある issue body を作成する可能性がある。

## 診断

- `specrunner doctor` — 環境・認証・設定の事前診断
- `specrunner job ls` — 実行中 job の状態（`--all` で archived も）
- `~/.specrunner-inbox.log` — tick の実行ログ
- `.specrunner/logs/<jobId>.log` — job ごとの実行ログ
