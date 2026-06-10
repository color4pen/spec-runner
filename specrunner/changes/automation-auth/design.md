# Design: automation-auth

## Context

GitHub 認証は対話ユーザー向けの device flow (`specrunner login`) を前提にしている。
`resolveGitHubToken` (src/core/credentials/github.ts:42-127) は github.com 向けに
`GH_TOKEN` env → `GITHUB_TOKEN` env → `gh auth token` subprocess → `credentials.json`
の優先順位でトークンを解決し、env が最優先である。

無人で回る文脈（cron / CI / 常駐スケジューラ）は device flow を実行できず、対話セッションの
keychain（`credentials.json`）上のトークンにも依存できない。これらは自前のトークンを env で
持ち込む first-class な経路を必要とするが、現状は次の 3 点が阻害している。

- **文書の欠落**: 推奨される自動化経路（env var + fine-grained PAT）が README に明文化されていない。
  Environment Variables 表に GitHub token の行がなく、Scheduling の GitHub Actions 例も
  `GITHUB_TOKEN` を使っているが「3 つのドア」の区別を説明していない。
- **`login` の無断上書き**: `login` は device flow の access token を `credentials.github.token`
  に無条件で上書き保存する（src/cli/login.ts:51-53）。既存の保存済みトークンを黙って失わせるうえ、
  env トークンが既に有効でそちらが優先され続ける状況でも無警告である。
- **source 可視化の不足**: 解決トークンの source は `github-token-present` check が
  `(source: env|gh|credentials)` として表示する（先行 change github-token-source-visibility で
  導入済み）。ただし env の場合にどの env var かを示さず、gh source の回帰テストも存在しない。

外部制約（GitHub）:
- GitHub App の user-to-server token (`ghu_`) は数時間で失効し refresh なしには無人継続できない。
- classic PAT は repo 単位の粒度を持たず権限が広い。fine-grained PAT は repo + 権限単位に絞れるが
  最長 1 年で失効する。
- GitHub Actions は実行ごとに installation token (`GITHUB_TOKEN`) を注入し、スコープ付与と
  ローテーションを自動で行う。

## Goals / Non-Goals

**Goals**:

- 自動化文脈の推奨認証経路を「env var (`GH_TOKEN`) で fine-grained PAT を渡す」と定義し、対話 `login`
  とは別ドアとして README に文書化する。3 経路（対話 `login` / GitHub Actions の `GITHUB_TOKEN` /
  自前サーバ・cron の `GH_TOKEN` + fine-grained PAT）を token 種別・設定方法とともに提示する。
- `login` が env もしくは `credentials.json` に既に置かれたトークンを黙って失わせないようにする。
- `doctor` で現在解決されるトークンの source を可視化し、対話と無人で経路が分かれている状況を
  診断できるようにする。

**Non-Goals**:

- App private key を保持し installation token を specrunner 自身が発行する機構（request スコープ外）。
- `resolveGitHubToken` の優先順位・トークン格納形式の変更。
- refresh token の保持・トークンローテーション機構。
- `credentials.json` 上の Anthropic API key 側の同等可視化。

## Decisions

### D1: 自動化ドア = `GH_TOKEN` env var が fine-grained PAT を運ぶ。対話 `login` とは別ドアとして README に明示する

無人文脈の推奨経路を `GH_TOKEN`（既存優先順位の最上位 env var）に fine-grained PAT を載せる形に固定する。
README に 3 ドアを表で並べ、各ドアの token 種別・設定方法・失効特性を示す。

| ドア | 文脈 | token 種別 | 設定方法 |
|------|------|-----------|---------|
| 対話 | 開発者が自分で叩く | device flow access token | `specrunner login` |
| GitHub Actions | CI | 注入される installation token | `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` |
| 自前サーバ / cron | 常駐スケジューラ | fine-grained PAT | `GH_TOKEN` env var に設定 |

**Rationale: なぜ `GH_TOKEN` + fine-grained PAT か**:
`resolveGitHubToken` は既に `GH_TOKEN` を最優先で読む。新たな解決経路を足さず、最も狭い権限粒度を
持てる fine-grained PAT を推奨することで、外部制約（classic PAT は粒度が粗い／`ghu_` は数時間で失効）を
回避しつつ既存実装を変えずに自動化ドアを成立させられる。GitHub Actions は実行ごとに `GITHUB_TOKEN` を
注入するため第 2 のドアとして自然に並ぶ。

**Alternatives considered**:
- *classic PAT を推奨*: repo 単位の粒度を持たず権限が広い。無人文脈の最小権限原則に反するため不採用。
- *App installation token を specrunner が発行*: private key 保持が必要で request スコープ外。
- *新しい専用 env var（例 `SPECRUNNER_GITHUB_TOKEN`）を導入*: 既存の `GH_TOKEN` 経路と二重化し、
  解決順序の認知負荷を増やす。`GH_TOKEN` が既に最優先で機能するため不要。

### D2: `login` 上書き保護 — 保存済み credentials トークンは `--force` なしでは上書きしない。env トークンが有効な場合は警告して続行する

`runLogin` に上書き検知を追加する。判断は 2 系統に分ける。

- **保存済み credentials トークン（データ喪失リスクあり）**: `credentials.github.token` が既に存在し
  `--force` が無い場合、device flow を**実行せず**警告して no-op で終了する（exit 0）。既存トークンは保持される。
  `--force` 指定時のみ従来どおり上書きする。
- **env トークンが有効（データ喪失リスクなし／優先順位の混乱）**: `GH_TOKEN` または `GITHUB_TOKEN` が
  設定されている場合、env トークンが credentials より優先され続ける旨を警告して**続行**する。
  env トークンは env に存在し credentials 保存では失われないため、阻止ではなく情報提示とする。

**Rationale: なぜ「保存済みは `--force` 阻止」「env は警告続行」の二分か**:
受け入れ基準「env にトークンがある状態で `login` を実行しても既存トークンが無断で失われない」は、
env トークンが credentials に書かれない以上「失われない」ことは構造的に保証される。残る問題は
*優先順位の混乱*（login したのに env が勝ち続ける）であり、これは警告で解消できる。一方
credentials の上書きは実データ喪失なので、明示的 confirm を要求する強い保護が要る。

**Rationale: なぜ確認プロンプトでなく `--force` フラグか**:
device flow 自体は対話的（コード入力待ち）だが、codebase に readline ベースの対話プロンプトは存在せず、
TTY/非 TTY をまたぐ y/n プロンプトは脆い。`--force` はスクリプト可能で非対話文脈でも一貫し、
「最小依存」方針に整合する。`--force` 無しでは保存済みトークンは決して失われないため、
受け入れ基準を強く満たす。

**Alternatives considered**:
- *警告のみで上書き続行*: 「無断で失われない」を文面上は満たす（警告＝告知）が、保存済みトークンは
  失われる。confirm の機会がないため弱い。不採用。
- *対話 y/n プロンプト*: 新規の TTY 取り扱いが必要で非対話文脈で破綻する。最小依存方針に反する。
- *常に上書き拒否（force フラグなし）*: 正当な再ログイン手段を奪う。逃げ道として `--force` を用意する。

### D3: source 可視化 — 既存 `github-token-present` の source ラベルを再利用し、回帰テストと env var 名で強化する

受け入れ基準「`doctor` が解決トークンの source を表示する」は先行 change により実質充足済みである
（`github-token-present` が `(source: env|gh|credentials)` を表示）。本 change は重複実装を避け、
診断意図（対話と無人で経路が分かれている状況の判別）に焦点を絞って次を行う。

- env / gh / credentials の 3 source すべてが表示されることを回帰テストで固定する（gh source は未テスト）。
- source が env の場合に、解決に使われた具体的な env var 名（`GH_TOKEN` / `GITHUB_TOKEN`）を
  `details` 行として補足する。既存 message 形式 `GitHub token is available (source: env)` は後方互換に保つ。

**Rationale**:
「対話 vs 無人でドアが分かれている」診断の核心は env か credentials かの区別であり、これは既存の
source ラベルが既に答えている。env var 名の補足は、env source 内で自動化ドア（`GH_TOKEN`）かどうかを
さらに判別可能にする小さな上積みである。message 本体を変えないことで既存テスト（`(source: env)` の
substring 検証）を壊さない。

**Alternatives considered**:
- *`resolveGitHubToken` の戻り値に env var 名を足す*: 多数の caller に波及し、source 列挙型の拡張も招く。
  doctor check 側で `ctx.env` を見れば足りるため不採用。
- *要件 3 を no-op とする*: 受け入れ基準は満たすが、診断意図への上積みと gh source 回帰テストの欠落を
  放置する。最小の上積みで両者を埋める。

## Risks / Trade-offs

- [Risk] `runLogin` が env を読むようになると、既存の login テストが実環境の `GH_TOKEN`/`GITHUB_TOKEN` に
  影響され env 警告が混入し flaky になりうる
  → Mitigation: `runLogin` の env を注入可能な引数（既定 `process.env`）にし、既存・新規テストは
  制御された env を明示注入する。

- [Risk] `--force` 阻止により、CI 等が誤って `login` を回した際に「何も起きない」ように見える
  → Mitigation: 阻止時に「既存トークンを保持した／上書きには `--force`」と明確に警告し exit 0 を返す。

- [Risk] README の自動化ドア記述が `resolveGitHubToken` の実優先順位とずれると誤誘導になる
  → Mitigation: README の記述を実装の優先順位（`GH_TOKEN` 最優先）に合わせ、doctor の source 表示で
  実際の解決元を検証できる導線を併記する。

- [Trade-off] env トークン有効時は警告して続行するため、login しても resolved token が変わらない場合がある。
  これは「env が優先」という設計の正しい帰結であり、警告でその事実を可視化することを優先する。

## Open Questions

- なし（UX は D2 で `--force` に確定。source 可視化は D3 で既存ラベル再利用に確定）。
