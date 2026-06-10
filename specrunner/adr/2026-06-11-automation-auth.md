# 自動化文脈の GitHub 認証経路を対話ログインと分離する

**Date**: 2026-06-11
**Status**: accepted
**Related**: `specrunner/changes/automation-auth/design.md`

## Context

GitHub 認証は対話ユーザー向けの device flow（`specrunner login`）を前提に設計されていた。
無人で動く文脈（cron / CI / 常駐スケジューラ）は device flow を実行できず、対話セッションの
`credentials.json` 上のトークンにも依存できない。

`resolveGitHubToken`（`src/core/credentials/github.ts`）は `GH_TOKEN` env →
`GITHUB_TOKEN` env → `gh auth token` subprocess → `credentials.json` の順でトークンを
解決しており、env が最優先である。この優先順位は変えない。

変更前に以下の 3 点が阻害要因として存在した。

| 問題 | 詳細 |
|------|------|
| 文書の欠落 | 推奨される自動化経路（env var + fine-grained PAT）が README に明文化されていなかった |
| `login` の無断上書き | `credentials.github.token` が既に存在しても無条件で上書きしていた |
| source 可視化の不足 | env source 時に使われた具体的な env var 名（`GH_TOKEN` / `GITHUB_TOKEN`）が表示されなかった |

外部制約（GitHub）:
- GitHub App の user-to-server token（`ghu_`）は数時間で失効し refresh なしには無人継続できない。
- classic PAT は repo 単位の粒度を持たず権限が広い。fine-grained PAT は repo + 権限単位に絞れるが最長 1 年で失効する。
- GitHub Actions は実行ごとに installation token（`GITHUB_TOKEN`）を注入し、スコープとローテーションを自動で行う。

## Decision

### D1: 自動化ドア = `GH_TOKEN` env var が fine-grained PAT を運ぶ。対話 `login` とは別ドアとして README に明示する

無人文脈の推奨経路を `GH_TOKEN`（既存優先順位の最上位 env var）に fine-grained PAT を載せる形に固定する。
README に 3 ドアを表で並べ、各ドアの token 種別・設定方法・失効特性を示す。

| ドア | 文脈 | token 種別 | 設定方法 |
|------|------|-----------|---------|
| 対話 | 開発者が自分で叩く | device flow access token | `specrunner login` |
| GitHub Actions | CI | 注入される installation token | `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` |
| 自前サーバ / cron | 常駐スケジューラ | fine-grained PAT | `GH_TOKEN` env var に設定 |

`resolveGitHubToken` は既に `GH_TOKEN` を最優先で読む。新たな解決経路を足さず、最も狭い権限粒度を
持てる fine-grained PAT を推奨することで、外部制約を回避しつつ既存実装を変えずに自動化ドアを成立させる。

### D2: `login` 上書き保護 — 保存済み credentials トークンは `--force` なしでは上書きしない。env トークンが有効な場合は警告して続行する

`runLogin` に上書き検知を追加する。判断は 2 系統に分ける。

- **保存済み credentials トークン（データ喪失リスクあり）**: `credentials.github.token` が既に存在し
  `--force` が無い場合、device flow を実行せず警告して no-op で終了する（exit 0）。既存トークンは保持される。
  `--force` 指定時のみ従来どおり上書きする。
- **env トークンが有効（データ喪失リスクなし／優先順位の混乱）**: `GH_TOKEN` または `GITHUB_TOKEN` が
  設定されている場合、env トークンが credentials より優先され続ける旨を警告して続行する。
  env トークンは env に存在し credentials 保存では失われないため、阻止ではなく情報提示とする。

確認プロンプトでなく `--force` フラグを採用した理由: codebase に readline ベースの対話プロンプトは存在せず、
TTY/非 TTY をまたぐ y/n プロンプトは脆い。`--force` はスクリプト可能で非対話文脈でも一貫し、
「最小依存」方針に整合する。

### D3: source 可視化 — 既存 `github-token-present` の source ラベルを再利用し、回帰テストと env var 名で強化する

先行 change（github-token-source-visibility）により `doctor` は既に `(source: env|gh|credentials)` を
表示している。本 change はこれを重複実装せず、次の上積みのみ行う。

- env / gh / credentials の 3 source すべてが表示されることを回帰テストで固定する。
- source が `env` の場合に、解決に使われた具体的な env var 名（`GH_TOKEN` / `GITHUB_TOKEN`）を
  `details` 行として補足する。既存 message 形式 `GitHub token is available (source: env)` は後方互換に保つ。

## Alternatives Considered

### Alternative 1: D1 — 専用 env var（`SPECRUNNER_GITHUB_TOKEN`）を新設する

- **Pros**: specrunner 固有の名前空間を持てる
- **Cons**: 既存の `GH_TOKEN` 経路と二重化し、解決順序の認知負荷を増やす。`GH_TOKEN` が既に最優先で機能するため不要
- **Why not**: 依存極小・install してすぐ使える方針に反する。却下

### Alternative 2: D1 — classic PAT を推奨する

- **Pros**: 設定が簡単
- **Cons**: repo 単位の粒度を持たず権限が広い。無人文脈の最小権限原則に反する
- **Why not**: 権限過剰なため却下

### Alternative 3: D1 — App installation token を specrunner 自身が発行する

- **Pros**: 短命トークンを自動ローテーションできる
- **Cons**: private key の保持・管理が必要で request スコープ外
- **Why not**: 複雑性が増大する。スコープ外として将来の変更に委ねる。却下

### Alternative 4: D2 — 警告のみで上書き続行する

- **Pros**: 後方互換を保てる
- **Cons**: 「無断で失われない」を文面上は満たすが保存済みトークンは実際に失われる。confirm の機会がない
- **Why not**: データ喪失を防ぐ保護として不十分。却下

### Alternative 5: D2 — 対話 y/n プロンプトを採用する

- **Pros**: ユーザーにとって直感的
- **Cons**: 新規の TTY 取り扱いが必要で非対話文脈で破綻する。最小依存方針に反する
- **Why not**: codebase の一貫性と最小依存方針を優先。却下

### Alternative 6: D3 — `resolveGitHubToken` の戻り値に env var 名を追加する

- **Pros**: 解決元情報が型として明示される
- **Cons**: 多数の caller に波及し、source 列挙型の拡張も招く
- **Why not**: doctor check 側で `ctx.env` を見れば足りる。過剰な変更のため却下

## Consequences

### Positive

- 自動化文脈の推奨認証経路が文書で明示され、オペレーターが迷わない
- `login --force` なしでは既存トークンが決して失われない。誤操作による認証情報の消失を防ぐ
- doctor で env var 名（`GH_TOKEN` / `GITHUB_TOKEN`）まで可視化され、対話ドアと自動化ドアの切り替え診断が可能になる
- `resolveGitHubToken` の優先順位・実装は変更なし。既存の自動化設定はそのまま動作する

### Negative / Known Debt

- 既存トークンを持つ環境で再ログインするには `--force` が必要になる（破壊的変更）
- env トークン有効時は login しても resolved token が変わらない場合がある（env 優先の正しい帰結だが直感に反することがある）

## References

- Request: `specrunner/changes/automation-auth/request.md`
- Design: `specrunner/changes/automation-auth/design.md`
