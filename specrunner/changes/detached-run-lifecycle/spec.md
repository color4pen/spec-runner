# Spec: run の detach 内蔵と `job wait`

本 spec は「何をするか」の振る舞い（コマンドの新設・出力契約・生存 gate の判定）を定義する。層・型・FSM が
自動で強制しない Layer-1 の選択を対象とする。

## Requirements

### Requirement: `--detach` は CLI を切り離して再 spawn し親は即 exit 0 する

`run` / `job start` / `job resume` は `--detach` flag を受理する MUST。`--detach` 指定かつ内部マーカー
（`SPECRUNNER_DETACHED`）非設定のとき、CLI は自分自身を `detached: true` + `unref()` + stdio の log redirect で
再 spawn し、親プロセスは pipeline を一切実行せずに slug・監視コマンド（`specrunner job wait <slug>`）・
log 参照方法（`specrunner job show <slug>`）を出力して exit 0 で即座に終了する MUST。子の起動引数は元の生 args
から `--detach` トークンのみを除去し、他の flag / positional を verbatim に引き継ぐ MUST。子には内部マーカー
env が設定される MUST。既定（`--detach` なし）の foreground 挙動・出力・終了コードは一切変えない MUST。

#### Scenario: `--detach` 指定で detached spawn が正しい形で行われる

**Given** `run <slug> --detach` を注入された spawn 境界付きで実行する（マーカー env 未設定）
**When** detach 経路が子を spawn する
**Then** spawn は `detached: true`・stdio の log redirect・`unref()`・内部マーカー env 付き・生 args から
`--detach` を除去した引数で 1 回呼ばれる

#### Scenario: detach 親は pipeline を実行せず案内して exit 0 する

**Given** `--detach` 指定の run（マーカー env 未設定）
**When** 親が detach を実行する
**Then** 親は pipeline（preflight / job 発行 / worktree 作成）を行わず、slug と `job wait <slug>` /
`job show <slug>` の案内を出力し、exit code 0 で終了する

#### Scenario: 破壊確認 — detached / マーカーを外すとテストが落ちる

**Given** detach spawn の検証テスト
**When** 実装から `detached: true` またはマーカー env 付与を除去する
**Then** 当該テストが失敗する（歯が効いていることの確認）

### Requirement: 内部マーカー付きで起動された子は再 spawn しない

内部マーカー env（`SPECRUNNER_DETACHED`）が設定された状態で起動されたプロセスは、`--detach` が引数に
残っていても detach 分岐を skip して foreground 実行する MUST。マーカーが再帰防止の正典 gate である MUST。

#### Scenario: マーカー付き子は foreground を実行し spawn しない

**Given** 内部マーカー env が設定され、かつ引数に `--detach` を含む run 起動
**When** detach 判定が評価される
**Then** 子 spawn は行われず、foreground の pipeline 実行経路に入る

### Requirement: detach 子の出力は slug-keyed log へ保全され `job show` から辿れる

detach 子の stdout / stderr は捨てず、session 非依存の slug-keyed log ファイル（`.specrunner/logs/<slug>` を
キーとする detach log）へ redirect される MUST。jobId は spawn 時点で未確定のため slug をキーにする MUST。
`job show <jobId|slug>` は当該 detach log が存在するとき、その所在を出力に含める MUST。

#### Scenario: detach log の path が logs ディレクトリ配下で slug から解決される

**Given** slug `foo` と repo root
**When** detach log path helper を呼ぶ
**Then** 返る path は `.specrunner/logs/` 配下で slug `foo` から一意に決まり、既存の `<jobId>.log` と衝突しない

#### Scenario: job show が detach log の所在を表示する

**Given** slug に対応する detach log ファイルが存在する job
**When** `job show` を実行する
**Then** 出力に detach log の所在（相対 path）が含まれる

### Requirement: `spawnBackground` は detach 用途に拡張され既存呼び出し元は無変更である

`spawnBackground` は任意で `detached: true`・stdio の log redirect・full-env（credential を含む）passthrough を
受け取れる MUST。これらのオプションが未指定のとき、`spawnBackground` は現状の挙動（非 detached・
`stdio: "ignore"`・`stripSecrets` 適用の env）を保つ MUST。detach 子は specrunner 自身であり preflight で
credential を env から読むため、detach 経路では `stripSecrets` を経由しない full env（+ マーカー）を渡す MUST。

#### Scenario: 新オプション未指定で既存挙動が保たれる

**Given** 新オプションを一切渡さない `spawnBackground` 呼び出し（既存呼び出し元と同じ形）
**When** プロセスを spawn する
**Then** `detached` は渡されず、stdio は `"ignore"`、env は `stripSecrets` 適用済みである

#### Scenario: detach 経路の子 env に credential とマーカーが含まれる

**Given** detach 用途で full-env passthrough を指定した spawn
**When** 子 env を検査する
**Then** 親の credential 系 env が保持され、かつ内部マーカーが設定されている

### Requirement: `job wait <slug>` はプロセス生存を gate にして settle まで block する

`job wait <slug>` は job が settle するまで block する MUST。判定は on-disk status を先に見ず、**プロセス生存を
gate** にする MUST。`state.pid`、無ければ liveness sidecar から解決した pid が生存している間は、on-disk status が
`awaiting-resume` / `awaiting-archive` であっても待ち続ける MUST（resume 中の disk-lag 誤報の吸収）。
プロセス死亡後に初めて on-disk status を確定値として読む MUST。pid をどこからも解決できない後方互換 state では
`isStaleRunning` の fallback（status が `running` かつ updatedAt 15 分超で settled）に従う MUST。

#### Scenario: pid 生存中は awaiting-resume でも待ち続ける（disk-lag 吸収の歯）

**Given** 解決した pid が生存中で、on-disk status が `awaiting-resume`（または `awaiting-archive`）である state
**When** `job wait` の 1 tick 判定を評価する
**Then** settled と判定せず待機を継続する

#### Scenario: 破壊確認 — status 先行で settle するとテストが落ちる

**Given** pid 生存中 + disk status `awaiting-resume` の wait テスト
**When** 実装を「pid を見ず on-disk status で settle 判定」に改変する
**Then** 当該テストが失敗する（process-death gate が効いていることの確認）

#### Scenario: プロセス死亡後に確定 status を読む

**Given** 解決した pid が死亡していて on-disk status が確定している state
**When** `job wait` の 1 tick 判定を評価する
**Then** settled と判定し、当該 on-disk status を報告値として採用する

#### Scenario: pid 不在の後方互換 state は isStaleRunning fallback に従う

**Given** `state.pid` も sidecar pid も存在しない state
**When** `job wait` の判定を評価する
**Then** status が `running` でなければ settled、`running` なら updatedAt 15 分閾値（`isStaleRunning`）に従う

### Requirement: `job wait` は settle 時に 1 行報告し規約通りの終了コードを返す

`job wait` は settle 時に `slug` / `status` / 次アクションを 1 行で出力する MUST。終了コードは
awaiting-archive / archived → 0、awaiting-resume / failed / terminated / canceled → 1、
引数エラー（slug 欠落）・slug 不在 → 2 とする MUST。次アクションは status に応じて awaiting-resume なら
resume コマンド、awaiting-archive なら archive コマンド等を案内する MUST。

#### Scenario: awaiting-archive は 0 で archive アクションを案内する

**Given** プロセス死亡後 status `awaiting-archive` の job
**When** `job wait` が settle する
**Then** 1 行に slug / `awaiting-archive` / `job archive <slug>` を含めて出力し exit 0 を返す

#### Scenario: awaiting-resume は 1 で resume アクションを案内する

**Given** プロセス死亡後 status `awaiting-resume` の job
**When** `job wait` が settle する
**Then** 1 行に slug / `awaiting-resume` / `job resume <slug>` を含めて出力し exit 1 を返す

#### Scenario: failed / terminated / canceled は 1 を返す

**Given** プロセス死亡後 status が `failed` / `terminated` / `canceled` のいずれかの job
**When** `job wait` が settle する
**Then** exit 1 を返す

#### Scenario: slug 不在は exit 2 を返す

**Given** どの job にも一致しない slug
**When** `job wait <slug>` を実行する
**Then** exit code 2 を返す

### Requirement: 運用知識をコマンド出力面に注入する

foreground の run / resume 起動時（内部マーカー非設定のとき）に、pipeline が長時間走ること・agent session
からは `--detach` + `job wait` を使うことを案内する MUST。この案内は stderr（informational）に出し、`--quiet`
で抑制され、stdout（`--json` 契約を含む）と終了コードを変えない MUST。detach 子（マーカー設定時）ではこの案内を
出さない MUST。案内文言（foreground notice / detach 親 guidance）は 1 箇所に定義される MUST。help（USAGE の
Job commands ブロック）は `job wait <slug>` を含み、`job start` / `job resume` / `run` に `--detach` を明記する MUST。

#### Scenario: foreground 起動時案内・detach 親出力・help の文言が存在する

**Given** 案内文言の定義モジュールと USAGE 文字列
**When** テストがそれぞれの文字列を検査する
**Then** foreground notice は `--detach` と `job wait` を、detach guidance は slug と `job wait` / `job show` を、
USAGE は `job wait` と `--detach` を、それぞれ部分文字列として含む

#### Scenario: `--detach` なしの foreground 挙動が無変更である

**Given** `--detach` を付けない run / resume
**When** foreground pipeline を実行する
**Then** stdout 出力と終了コードは本 change 導入前と同一で、既存テストを無変更のまま green に保つ
