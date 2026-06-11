# ADR-20260611: git transport を解決済みトークンで per-invocation 認証する

## ステータス

accepted

## コンテキスト

specrunner は GitHub API 用トークンを `resolveGitHubToken`（`GH_TOKEN` env → `GITHUB_TOKEN` env → `gh auth token` → `credentials.json`）で解決していたが、git transport（fetch / push）は ambient な `credential.helper` / OS keychain に依存していた。無人実行環境（cron / launchd）では keychain に到達できないため、API トークンが正しく解決できていても workspace setup の `git fetch origin` が `fatal: could not read Username for 'https://github.com'` で失敗し、pipeline が立ち上がらない問題が発生した。

transport を行うローカルプロセスの call site は 10 箇所に分布する。

| # | 場所 | 操作 | 性質 |
|---|------|------|------|
| C1 | local.ts | `fetch origin`（workspace setup） | 必須 |
| C2 | managed.ts | `fetch origin <branch>`（validateStepInputs） | best-effort |
| C3 | managed.ts | `push origin <branch>`（managed setup: branch） | 必須 |
| C4 | managed.ts | `push origin <branch>`（managed setup: request.md commit） | 必須 |
| C5 | commit-push.ts | `push origin <branch>`（pushOnly: 各 step） | 必須 |
| C6 | commit-push.ts | `push origin <branch>`（commitFinalState: finalize） | best-effort |
| C7 | verification/propagate.ts | `push origin <branch>`（verification 結果伝播） | best-effort |
| C8 | archive/orchestrator.ts | `push origin <baseBranch>`（archive main push） | 必須 |
| C9 | archive/orchestrator.ts | `push origin --delete <branch>`（archive branch 削除） | best-effort |
| C10 | cancel/runner.ts | `push origin --delete <branch>`（cancel branch 削除） | best-effort |

transport を呼ぶ subprocess seam は 2 種ある: `src/util/spawn.ts`（C1〜C4, C6〜C10）と `src/util/git-exec.ts`（C5: `StepExecutor` 経由）。

## 決定

### D1: per-invocation の `git -c http.<origin>.extraheader` で basic `x-access-token` 認証する

transport を行う `git` 呼び出しに、解決済みトークンを持つ Authorization ヘッダを `-c http.<origin-scope>.extraheader=...` として per-invocation で注入する。値は basic 認証 `AUTHORIZATION: basic <base64("x-access-token:" + token)>` とする。

`git config` を書かず remote URL も書き換えないため、永続 git config・remote URL にトークンが残らず、ユーザー git config も変わらない。

**採用理由**: GitHub Actions が採用する実績ある方式であり、永続化を伴わない唯一の「config も URL も触らない」経路。`-c` はそのプロセス限りで `.git/config` にも `~/.gitconfig` にも残らない。basic `x-access-token` は PAT（classic / fine-grained）・installation token のいずれも HTTPS で機能し、token 種別非依存性が高い。

**却下案**:
- *認証付き remote URL*: remote URL にトークンが平文で乗り、`.git/config` や `git remote -v` に露出。不採用。
- *`git config --local credential.*` 書き込み*: `.git/config` に永続化。不採用。
- *`GIT_ASKPASS` ヘルパースクリプト*: 実行可能な一時スクリプトの生成・権限・後始末・クロスプラットフォーム差が増え minimal-deps 方針に反する。不採用。
- *bearer 方式*: 機能はするが basic `x-access-token` の方が token 種別非依存で堅牢。

### D2: ヘッダを origin host にスコープし、credential helper を per-invocation で無効化する

注入する config を以下 2 本とする。

- `http.<origin-scope>.extraheader=...` — `<origin-scope>` は origin remote URL から導いた `scheme://host:port/`（`url.host` で導出、非標準ポートを含む）。グローバルな `http.extraheader` でなく host スコープにすることで、別 host へのリダイレクト時に Authorization ヘッダが漏れない。
- `credential.helper=`（空値） — そのプロセス限りで credential helper チェーンを無効化する。extraheader 認証が拒否された場合に keychain プロンプトで無人プロセスがハングするのを防ぎ fail-fast にする。

**却下案**:
- *グローバル `http.extraheader`*: スコープなしだとリダイレクト先 host にもヘッダ送信。不採用。
- *credential helper を触らない*: extraheader 失敗時に headless でハングし得る。不採用。

### D3: HTTPS origin のときだけ注入し、SSH / その他は従来挙動を保つ

origin remote URL の scheme を判定し、`https`（および `http`）のときのみ extraheader を注入する。SSH（`git@host:owner/repo.git` / `ssh://`）など token 認証が無関係な remote では何も注入せず素の `git` を実行する（トークン解決も要求しない）。

**採用理由**: 失敗事象は HTTPS transport 固有。SSH 構成のユーザーに不要なトークン必須化を強いると既存ワークフローを壊す。

### D4: 共通 SpawnFn デコレータで注入する（call site のコードは変えない）

新モジュール `src/git/transport-auth.ts` を追加する。

- `buildTransportAuthArgs(token, originUrl): string[]` — pure 関数。token 空 or originUrl が非 HTTPS なら `[]`、それ以外は D1/D2 の `-c` 引数列を返す。
- transport subcommand 集合（`fetch`, `push`, `clone`, `ls-remote`, `pull`）を持ち、`git <transport> …` を `git <authArgs> <transport> …` に書き換える 2 種の wrapper（`spawn.ts` 用と `git-exec.ts` 用）を提供する。非 transport の git（add/commit/diff/branch -D 等）と非 git コマンドは素通し。
- `createTransportAuth({ token, … })` — origin URL 解決（`git remote get-url origin`）と auth 引数生成を memo 化した provider を返す。

wiring point:

| wiring point | カバーする call site |
|--------------|----------------------|
| `LocalRuntime.spawnFn` を wrap | C1, C6 |
| `LocalRuntime.buildDeps` の `spawn` を wrap | C7 |
| `LocalRuntime.buildDeps` の `gitTransportSpawn` を `PipelineDeps` 経由で `StepExecutor` に注入 | C5 |
| `ManagedRuntime.spawnFn` を wrap | C2, C3, C4 |
| `archive/orchestrator` の `spawn` を wrap | C8, C9 |
| `cancel/runner` の `spawn` を wrap | C10 |

トークンは entrypoint（bootstrap / run / archive）で既に解決済みの値を流用する。`cancel` は entrypoint でトークンを optional 解決し、best-effort 後始末を止めない。

**採用理由**: 10 箇所 × 2 seam を個別編集せず、認証という cross-cutting concern を 1 モジュールに集約して単体テスト可能にする。entrypoint 解決済みトークンの流用で hot path に追加 subprocess を増やさない。

**却下案**:
- *per-site で `-c` 引数を手書き追加*: 10 箇所の個別編集、origin URL 解決の重複、認証ロジックの散在。不採用。
- *wrapper 内でトークンを lazy 再解決*: entrypoint で既に解決済みなので二重解決になり、best-effort site で予期せぬ throw を招く。不採用。

### D5: auth 引数をログ経路に渡さない

auth `-c` 引数（base64 トークンを含む）は構築した argv をログ出力する経路に渡さない。既存の transport エラーメッセージは `stderr` のみを連結しており argv を出力しないため現状の経路は安全。`SPECRUNNER_DEBUG` 系の診断や将来の argv ログが auth 引数を含めないことを実装・テストで担保し、既存の secret masking を defense-in-depth として併用する。

## 検討した代替案

### A1: 認証付き remote URL（`https://x-access-token:TOKEN@github.com/…`）を使う

transport 対象ごとに remote URL をトークン入りに書き換えてから `git push/fetch` を実行する案。

- **Pros**: `-c` 引数なしで標準の git HTTPS 認証として機能する。ツール側の特別な仕組みが不要。
- **Cons**: トークンが remote URL に平文で乗り、`.git/config` や `git remote -v` の出力に露出する。process substitution で一時 remote を使っても diff ログ・reflog に残りうる。
- **Why not**: 「トークンが remote URL・永続 git config・ログに残らないこと」（要件 3）に直接違反する。不採用。

### A2: `git config --local credential.*` でトークンを書き込む

`.git/config` にトークンを `credential.helper` や `credential.username` / `credential.password` として書き込む案。

- **Pros**: 一度書けば以降の全 transport で自動的に使われる。per-invocation 引数が不要。
- **Cons**: `.git/config`（worktree が共有する config）に永続化され、コマンド完了後も残る。ユーザーの git 設定に副作用を与える。
- **Why not**: ユーザーの git config 変更禁止（要件 2）とトークン非永続化（要件 3）の両方に違反する。不採用。

### A3: `GIT_ASKPASS` ヘルパースクリプトでトークンを提供する

トークンを環境変数経由でヘルパースクリプトに渡し、git の credential プロトコルに応答させる案。プロセス引数にトークンが現れない点では D1 より安全。

- **Pros**: トークンがプロセス引数（`ps` / `/proc`）に露出しない。git の標準 credential 機構を使う。
- **Cons**: 実行可能な一時スクリプトの生成・パーミッション設定・後始末が必要。Windows/macOS/Linux の差異（スクリプト実行方法・一時ディレクトリ・権限）に対応するクロスプラットフォームコードが増える。minimal-deps 方針（依存極小・install してすぐ使える）に反する。
- **Why not**: 複雑性の増加が minimal-deps North Star に反するため不採用。プロセス引数可視性の許容は Risks に記載のトレードオフとして確定し、GIT_ASKPASS 化は将来の上積み余地として Open のままにする。

### A4: 10 箇所の transport call site それぞれに `-c` 引数を手書き追加する

共通 wrapper を作らず、C1〜C10 の各 call site で直接 `['-c', 'http.…extraheader=…']` を引数に追加する案。

- **Pros**: 追加ファイルがなく、各 call site を読めば認証意図がその場でわかる。
- **Cons**: 10 箇所 × 2 seam（spawn.ts / git-exec.ts）を個別編集し、origin URL の解決ロジックが各所で重複する。認証という cross-cutting concern がコードベース全体に散らばり、将来の変更（スコープ変更・鍵方式変更等）でも同じ 10 箇所を追跡修正する必要がある。テストも分散する。
- **Why not**: 保守コスト・テスト可能性の観点から共通 wrapper（D4）に劣る。不採用。

### A5: グローバル `http.extraheader` を使う（host スコープなし）

`http.extraheader`（host スコープなし）で全 HTTPS transport に認証ヘッダを付ける案。

- **Pros**: origin host の導出が不要でシンプル。
- **Cons**: リダイレクト先の別 host（CDN 等）にも Authorization ヘッダが送信される。意図しない host へのトークン漏洩リスクがある。
- **Why not**: host スコープ（D2）の方がリダイレクト経由の漏洩面を最小化できる。不採用。

## リスク / トレードオフ

- `-c http.…extraheader=…basic <base64>` は実行中プロセス引数（`ps` / `/proc`）に base64 トークンが一時的に現れる。per-invocation で永続化されず「remote URL・永続 git config・ログ」には残らない。同一マシン上の他プロセスからの `ps` 可視性は本変更が許容するトレードオフ（GIT_ASKPASS 化は将来の余地として Open として残す）。
- best-effort site（C9 / C10 / C6 / C7）でトークン不在時に wrapper が throw すると後始末が中断する。`buildTransportAuthArgs` は token 空なら `[]` を返し素の git を実行することで従来挙動（非 0 exit → warning）に倒す。

## 影響

### Positive

- 無人実行環境（cron / launchd）で ambient な git 認証なしに job の fetch と push が成功する。
- ユーザーの `~/.gitconfig` / `credential.helper` を変更しない。
- トークンが remote URL・永続 git config・ログに残らない。
- HTTPS 以外の origin（SSH 等）は従来挙動を完全保持。

### Negative

- プロセス引数（`ps` / `/proc`）に実行中だけ base64 トークンが現れる（許容済みトレードオフ）。

### Known Debt

- GIT_ASKPASS 方式によるプロセス引数可視性の回避は将来の上積み余地（現状は minimal-deps 方針により不採用）。
- managed runtime のクラウド側 workspace が行う transport は本変更のスコープ外（クラウド agent は Managed Agents API が注入するトークンで認証する）。

## 参照

- Request: `specrunner/changes/git-transport-auth/request.md`
- Design: `specrunner/changes/git-transport-auth/design.md`
- Implementation: `src/git/transport-auth.ts`
