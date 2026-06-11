# Design: git-transport-auth

## Context

specrunner は GitHub **API** 用のトークンを `resolveGitHubToken`
(src/core/credentials/github.ts:42-127) で `GH_TOKEN` env → `GITHUB_TOKEN` env →
`gh auth token` subprocess → `credentials.json` の優先順位で解決する。一方 git
**transport**（fetch / push）は素の `git` を spawn しているだけで、認証は ambient な
git 設定（`credential.helper` / OS keychain）に委ねられている。

無人実行環境（cron / launchd / 常駐スケジューラ）では keychain に到達できないため、
API トークンが正しく解決できていても transport が

```
fatal: could not read Username for 'https://github.com'
```

で失敗する。具体的には workspace setup の `git fetch origin`
(src/core/runtime/local.ts:424) が落ち、pipeline が立ち上がらない。

現状コードの transport call site は以下の 10 箇所（subcommand 単位）に分布する。

| # | 場所 | 操作 | 性質 |
|---|------|------|------|
| C1 | local.ts:424 | `fetch origin`（workspace setup） | 必須 |
| C2 | managed.ts:357 | `fetch origin <branch>`（validateStepInputs） | best-effort（`.catch`） |
| C3 | managed.ts:154 | `push origin <branch>`（managed setup: branch） | 必須 |
| C4 | managed.ts:215 | `push origin <branch>`（managed setup: request.md commit） | 必須 |
| C5 | commit-push.ts:139 | `push origin <branch>`（pushOnly: 各 step） | 必須 |
| C6 | commit-push.ts:121/124 | `push origin <branch>`（commitFinalState: finalize） | best-effort（warn） |
| C7 | verification/propagate.ts:66 | `push origin <branch>`（verification 結果伝播） | best-effort（warn） |
| C8 | archive/orchestrator.ts:240 | `push origin <baseBranch>`（archive main push） | 必須 |
| C9 | archive/orchestrator.ts:293 | `push origin --delete <branch>`（archive branch 削除） | best-effort（warn） |
| C10 | cancel/runner.ts:184 | `push origin --delete <branch>`（cancel branch 削除） | best-effort（warn） |

transport を呼ぶ subprocess seam は 2 種ある。

- `src/util/spawn.ts` の `SpawnFn`（async・`SpawnResult` 返却）: C1〜C4, C6〜C10 が使用。
- `src/util/git-exec.ts` の `SpawnFn`（`ChildProcess` 返却）: C5（`commit-push` の
  `pushOnly` / `commitAndPush`）が `StepExecutor` 経由で使用。

トークンは既に entrypoint で解決済みで、transport の文脈まで到達している。

- local: `LocalRuntime.githubToken`（bootstrap/run → createRuntime で注入済み）。
  pipeline には `PipelineDeps.githubToken` として既に流れている。
- managed: `ManagedRuntime.githubToken`（同様に注入済み）。
- archive: src/cli/archive.ts:170-186 で resolve 済み（`githubToken`）。
- cancel: src/cli/cancel.ts は現状トークンを resolve していない。

外部制約（GitHub / git）:

- GitHub Actions は credential を永続化せずユーザー git config も変えずに、
  `http.<url>.extraheader` へ `AUTHORIZATION` ヘッダを per-invocation で渡して transport を認証する。
- fine-grained PAT / classic PAT / installation token はいずれも HTTPS で
  username `x-access-token` の basic 認証として使える。
- `git -c key=value` の per-invocation 注入は config ファイルに永続化されないが、
  プロセス引数（`ps` / `/proc`）には実行中だけ現れる。

## Goals / Non-Goals

**Goals**:

- 10 箇所の git transport を解決済み GitHub トークンで自己認証し、ambient な
  `credential.helper` / keychain への依存を断つ。
- ユーザーのグローバル / ローカル git config（`credential.helper` 等）を一切変更しない。
  トークンを永続化しない（per-invocation 注入のみ）。
- トークンが remote URL・永続 git config・ログに平文（および base64 等の可逆形）で残らないようにする。
- HTTPS origin が前提で、SSH origin など token 認証が無関係な構成では従来挙動を保つ。

**Non-Goals**:

- ユーザーの git config / credential helper の変更・移行。
- host ↔ token のバインディング方針の変更（既存の `resolveGitHubToken` の解決順序に従う）。
- managed runtime のクラウド側 workspace が行う transport の認証（クラウド agent は
  Managed Agents API が注入する自身のトークンで認証する。本 change のスコープはローカル
  プロセスが spawn する `git` のみ）。
- トークンの種別選択・ローテーション・refresh 機構。

## Decisions

### D1: per-invocation の `git -c http.<origin>.extraheader` で basic `x-access-token` 認証する

transport を行う `git` 呼び出しに、解決済みトークンを持つ Authorization ヘッダを
`-c http.<origin-scope>.extraheader=...` として per-invocation で注入する。値は
basic 認証 `AUTHORIZATION: basic <base64("x-access-token:" + token)>` とする。

`git config` を書かず remote URL も書き換えないため、永続 git config・remote URL に
トークンが残らず（要件 3）、ユーザー git config も変わらない（要件 2）。

**Rationale: なぜ extraheader か（remote URL / GIT_ASKPASS / config 書き込みでなく）**:
GitHub Actions が採用する実績ある方式であり、永続化を伴わない唯一の「config も URL も
触らない」経路。`-c` はそのプロセス限りで `.git/config` にも `~/.gitconfig` にも残らない。

**Rationale: なぜ basic `x-access-token` か（bearer でなく）**:
外部制約どおり PAT（classic / fine-grained）・installation token のいずれも
username `x-access-token` の basic 認証として HTTPS で機能する。これは `git` が
`https://x-access-token:TOKEN@host` に対して自然に送るヘッダと等価で、トークン種別を
問わず最も広く成立する。GitHub Actions が用いる bearer も同等に機能するが、basic を
既定とし token 種別非依存性を優先する。

**Alternatives considered**:
- *認証付き remote URL（`https://x-access-token:TOKEN@github.com/...`）に push*:
  remote URL にトークンが平文で乗り、`.git/config` や `git remote -v` に露出する。要件 3 違反。不採用。
- *`git config --local credential.*` でトークンを書き込む*: `.git/config`（worktree が
  共有する config）に永続化され、要件 2/3 に反する。不採用。
- *`GIT_ASKPASS` ヘルパースクリプト*: トークンを引数でなく env 経由でヘルパーに渡せるため
  プロセス引数露出は避けられるが、実行可能な一時スクリプトの生成・権限・後始末・クロス
  プラットフォーム差が増え「最小依存」方針に反する。露出差は D-Risk で許容範囲と判断し不採用。
- *bearer 方式*: 機能はするが basic `x-access-token` の方が token 種別非依存で堅牢。

### D2: ヘッダを origin host にスコープし、ambient credential helper を per-invocation で無効化する

注入する config を以下 2 本とする。

- `http.<origin-scope>.extraheader=...` — `<origin-scope>` は origin remote URL から導いた
  `scheme://host/`（例 `https://github.com/`、GHES なら当該 host）。グローバルな
  `http.extraheader` でなく host スコープにすることで、別 host へのリダイレクト時に
  Authorization ヘッダが漏れない。
- `credential.helper=`（空値） — そのプロセス限りで credential helper チェーンを無効化する。
  per-invocation のため user config は変わらない。extraheader 認証が（誤って）拒否された場合に、
  keychain プロンプトで無人プロセスがハングするのを防ぎ fail-fast にする。

**Rationale**: host スコープはリダイレクト経由のトークン漏洩を塞ぐ防御。`credential.helper=`
無効化は「ambient な認証に依存しない」要件を能動的に保証し、headless でのハングを排除する。
いずれも `-c` 経由で永続化しないため要件 2 を侵さない。

**Alternatives considered**:
- *グローバル `http.extraheader`*: スコープ無しだとリダイレクト先 host にもヘッダ送信。漏洩面を広げるため不採用。
- *credential helper を触らない*: extraheader が効けば helper は呼ばれないが、失敗時に
  headless でハングし得る。無効化を入れて決定的に失敗させる方が無人運用に適する。

### D3: HTTPS origin のときだけ注入し、SSH/その他は従来挙動を保つ

origin remote URL の scheme を判定し、`https`（および `http`）のときのみ extraheader を
注入する。SSH（`git@host:owner/repo.git` / `ssh://`）など token 認証が無関係な remote では
何も注入せず素の `git` をそのまま実行する（トークン解決も要求しない）。

**Rationale**: 失敗事象は HTTPS transport 固有（`could not read Username for 'https://...'`）。
SSH は鍵認証で keychain 非依存問題が起きず、extraheader は無意味。SSH 構成のユーザーに
トークン必須化を強いると既存ワークフローを壊すため、HTTPS に限定する。

**Alternatives considered**:
- *常に注入*: `http.*` config は SSH transport には作用しないので実害は小さいが、SSH ユーザーに
  不要なトークン解決を強い、トークン不在時に無関係な失敗を招く。scheme gate で回避する。

### D4: 共通 SpawnFn デコレータで注入する（call site のコードは変えない）。トークンは entrypoint 解決済みの値を流用する

新モジュール `src/git/transport-auth.ts` を追加する。

- `buildTransportAuthArgs(token, originUrl): string[]` — pure。token 空 or originUrl が
  非 HTTPS なら `[]`。それ以外は D1/D2 の `-c` 引数列を返す。
- transport subcommand 集合 `{ fetch, push, clone, ls-remote, pull }` を持ち、`git <transport> …`
  を `git <authArgs> <transport> …` に書き換える **2 種の wrapper**（`spawn.ts` 用と
  `git-exec.ts` 用）を提供する。非 transport の git（add/commit/diff/branch -D 等）と
  非 git コマンドは素通し。
- `createTransportAuth({ token, … })` — origin URL 解決（`git remote get-url origin` を 1 回）と
  auth 引数生成を **memo 化**した provider を返す。同一リポジトリでは worktree をまたいでも
  origin は同一なので 1 度の解決で足りる。

request-review 指摘 #2 への回答として、auth 注入は **per-site の引数追加ではなく共通 wrapper**
に置く。10 箇所の transport コードを触らず、認証という cross-cutting concern を 1 モジュールに
集約して単体テスト可能にする。

トークンは hot path で再解決しない。entrypoint（bootstrap / run / archive）で既に解決済みの
値を、既存チャネル（`LocalRuntime.githubToken` / `ManagedRuntime.githubToken` /
`ArchiveInput`（新規 field）/ `CancelDeps`（新規 optional field））から provider に渡す。
これにより要件 4「トークン解決失敗時は従来どおり明確なエラー」は entrypoint の
`resolveGitHubToken`（`GITHUB_TOKEN_MISSING` を hint 付きで throw）で満たされ、
`could not read Username` より明確なエラーになる。

wrapper を適用する wiring point（call site 自体は不変）:

| wiring point | カバーする call site |
|--------------|----------------------|
| `LocalRuntime`: `this.spawnFn` を wrap | C1（fetch）, C6（commitFinalState） |
| `LocalRuntime.buildDeps`: `spawn`（現状 `spawnCommand` ハードコード）を wrap | C7（propagate は `deps.spawn`） |
| `LocalRuntime.buildDeps`: git-exec transport spawn を `PipelineDeps` 経由で `StepExecutor` に注入 | C5（commit-push pushOnly） |
| `ManagedRuntime`: `this.spawnFn` を wrap | C2, C3, C4 |
| `archive/orchestrator`: `spawn` を wrap | C8, C9 |
| `cancel/runner`: `spawn` を wrap | C10 |

**Rationale**: wrapper が transport subcommand のみを書き換えるので、commit/add/rev-parse など
非 transport は影響を受けない。entrypoint 解決済みトークンの流用で `gh auth token` 等の
追加 subprocess を hot path に増やさない。

**Alternatives considered**:
- *per-site で `-c` 引数を手書き追加*: 10 箇所 × 2 seam を個別編集し、origin URL 解決を各所で重複。
  認証ロジックが散らばりテストしづらい。共通 wrapper に集約する方が保守性が高い。
- *wrapper 内でトークンを lazy 再解決*: 各 transport 初回で `resolveGitHubToken` を呼ぶ設計も可能だが、
  entrypoint で既に解決済みなので二重解決になり、best-effort site（cancel 等）で予期せぬ throw を招く。
  解決済み値の流用にする。

### D5: トークンを一切ログに出さない

auth `-c` 引数（base64 トークンを含む）は構築した argv をログ出力する経路に渡さない。
既存の transport エラーメッセージは stderr のみを連結しており（例 local.ts の
`git fetch origin failed (exit …): <stderr>`）、argv を出力していないため現状の経路は安全。
`SPECRUNNER_DEBUG` 系の診断や将来の argv ログが auth 引数を含めないことを実装・テストで担保し、
既存の secret masking 層を defense-in-depth として併用する。

**Rationale**: 受け入れ基準「トークンがログに平文で残らない」を、出力経路に auth 引数を
渡さない設計と、masking の二重防御で満たす。base64 は可逆なので「平文」と同様に扱い遮断する。

## Risks / Trade-offs

- [Risk] `-c http.…extraheader=…basic <base64>` は実行中プロセス引数（`ps` / `/proc`）に
  base64 トークンが一時的に現れる
  → Mitigation: 外部制約どおり per-invocation で永続化されず、受け入れ基準が禁じる
  「remote URL・永続 git config・ログ」には残らない。同一マシン上の他プロセスからの
  `ps` 可視性は本 change が許容するトレードオフ（GIT_ASKPASS による回避は D1 で最小依存方針により不採用）。
  プロセス引数可視性が許容できない環境向けの GIT_ASKPASS 化は将来の上積み余地として Open Questions に残す。

- [Risk] グローバル `http.extraheader` だと別 host へのリダイレクトで Authorization が漏れる
  → Mitigation: D2 で origin host スコープ（`http.<scheme>://<host>/.extraheader`）に限定する。

- [Risk] best-effort site（C9 archive branch 削除 / C10 cancel branch 削除 / C6 finalize /
  C7 propagate）でトークン不在時に wrapper が throw すると、本来 warning で続行すべき後始末が中断する
  → Mitigation: token 空なら `buildTransportAuthArgs` は `[]` を返し素の git を実行（=従来どおり
  非 0 exit → warning）。cancel は entrypoint でトークンを optional 解決（不在は `undefined`）し、
  local 後始末を止めない。

- [Risk] argv をログ出力する将来コードがトークンを漏らす
  → Mitigation: D5。auth 引数を argv ログに含めない方針を実装・テストで固定し、masking を併用。

- [Trade-off] managed runtime のクラウド側 workspace が行う transport は本 change の対象外。
  ローカルプロセスが spawn する `git`（C2/C3/C4）のみ認証する。クラウド側は Managed Agents API が
  自身のトークンを注入する別経路であり、境界を Non-Goals に明示する。

## Open Questions

- なし（basic vs bearer は D1 で basic `x-access-token` に確定。注入方式は D4 で共通 wrapper に確定。
  プロセス引数可視性の許容は Risks に記載のトレードオフとして確定。GIT_ASKPASS 化は将来余地）。
