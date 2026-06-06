# Spec: managed runtime の machine-local state を slug キーに移す

## Requirements

### Requirement: managed の machine-local state は slug キーの `.specrunner/local/<slug>/` に置く

managed runtime の JobState（state.json + events.jsonl）は `.specrunner/local/<slug>/` に永続化される MUST。`.specrunner/jobs/<jobId>/` には**書かれてはならない（MUST NOT）**。managed state は machine-local かつ full state として保持され、slug 正本のような portable strip（worktreePath / pid / session / request.slug / request.path の除去）を**行ってはならない（MUST NOT）**。

#### Scenario: managed run 後に state が local/slug に書かれる

**Given** managed runtime で `specrunner run` を実行する
**When** run（bootstrap → setupWorkspace → step persist → 終端）が完了する
**Then** `.specrunner/local/<slug>/state.json` + `events.jsonl` に state が書かれ、`.specrunner/jobs/<jobId>/` は作成・更新されない

#### Scenario: managed resume 後に state が local/slug に書かれる

**Given** managed runtime の awaiting-resume な job を resume する
**When** running への遷移と step persist が走る
**Then** state は `.specrunner/local/<slug>/` に書かれ、`.specrunner/jobs/<jobId>/` は更新されない

#### Scenario: managed state が full state として保持される

**Given** managed job の state を `.specrunner/local/<slug>/state.json` から読む
**When** state を検証する
**Then** machine-local フィールド（pid / session 等）と request.slug / request.path が strip されず保持されている

### Requirement: managed の初期 state 永続化を setupWorkspace に defer する

`ManagedRuntime.bootstrapJob()` は初期 state を構築するのみで I/O を**行ってはならない（MUST NOT）**。初期 state の `.specrunner/local/<slug>/` への seed は、権威ある slug が渡る `setupWorkspace()` の run 経路（branchName あり）で行う MUST。resume 経路（branchName なし）では seed しない MUST（既存ストアを温存）。

#### Scenario: bootstrap が jobs-dir に書かない

**Given** managed runtime で job を起動する
**When** `bootstrapJob()` が呼ばれる
**Then** `.specrunner/jobs/<jobId>/` は作成されず、in-memory の初期 state が返る

#### Scenario: setupWorkspace の run 経路で local/slug に seed される

**Given** managed run で branchName 付きの `setupWorkspace()` が呼ばれる
**When** setupWorkspace が完了する
**Then** `.specrunner/local/<slug>/state.json` + `events.jsonl` に初期 state が seed され、続く request.path / branch 更新が同ストアに反映される

### Requirement: managed の全 persist 経路が local/slug に着地する

`ManagedRuntime` の `updateJobState` / `persistJobState` / `storeFactory`（buildDeps）/ `registerCleanup` の signal ハンドラ persist は、いずれも `.specrunner/local/<slug>/` へ書く MUST。`.specrunner/jobs/<jobId>/` へ書いては**ならない（MUST NOT）**。これらは full state を保つ machine-local ストア（`changeDir` 単独構成）を使う MUST。

#### Scenario: pipeline step persist が local/slug に書く

**Given** managed run のパイプラインが各 step を実行する
**When** `storeFactory` 経由で step ごとに persist する
**Then** `.specrunner/local/<slug>/` の state.json / events.jsonl が更新され、jobs-dir は更新されない

#### Scenario: SIGINT/SIGTERM で local/slug に awaiting-resume が書かれる

**Given** managed run 中に SIGINT を受信する
**When** signal ハンドラが awaiting-resume へ遷移し persist する
**Then** `.specrunner/local/<slug>/` に awaiting-resume state が書かれる

### Requirement: managed の read / resolve 経路が local/slug を起点にする

`JobStateStore.list()` の managed marker 経路、`loadStateByJobId()` の `kind="managed"` 分岐、`resolveStateStoreByJobId()` の `kind="managed"` 分岐は、`.specrunner/local/<slug>/` から state を取得・解決する MUST。managed の読み取り・解決経路は `.specrunner/jobs/` を**参照してはならない（MUST NOT）**。

#### Scenario: job ls が managed job を local/slug から読む

**Given** active な managed job（marker.json と local/slug の state.json が存在）
**When** `job ls` が `JobStateStore.list()` を呼ぶ
**Then** marker から slug を引き、`.specrunner/local/<slug>/state.json` から正しい status の state が得られる（jobs-dir は参照されない）

#### Scenario: job show / finish が jobId から managed state を解決する

**Given** marker を持つ managed job の jobId
**When** `loadStateByJobId()` で state を読む
**Then** `.specrunner/local/<slug>/` から full state が読まれる

#### Scenario: resume / cancel / exit-guard の persist が managed を local/slug に解決する

**Given** marker を持つ managed job
**When** `resolveStateStoreByJobId()` でストアを解決し persist する
**Then** `.specrunner/local/<slug>/` のストアへ書かれ、jobs-dir には書かれない

### Requirement: marker.json は index、state.json が full state（重複・不整合なし）

`.specrunner/local/<slug>/marker.json` は index として残存する MUST。スキーマは `{ slug, jobId, createdAt }` とし、never-read で乖離源となる `status` フィールドを**持ってはならない（MUST NOT）**。status を含む job の真実は同ディレクトリの `state.json`（full state）に一本化する MUST。marker.json の `jobId` と同ディレクトリ `state.json` の `jobId` は一致する MUST。

#### Scenario: marker は jobId index として state.json と一致する

**Given** managed job の setupWorkspace が完了する
**When** `.specrunner/local/<slug>/marker.json` と `state.json` を読む
**Then** marker は `{ slug, jobId, createdAt }` を持ち、その `jobId` が state.json の `jobId` と一致する

### Requirement: cancel が managed job を local/slug 起点で正しく扱う

`cancelSingleJob` は managed の canceled state を `.specrunner/local/<slug>/` へ persist した**後に** marker を clear する MUST（persist 時点で marker が在ること）。canceled state を jobs-dir へ書いては**ならない（MUST NOT）**。`--purge` 時は `.specrunner/local/<slug>/` を物理削除する MUST。

#### Scenario: managed cancel が canceled state を local/slug に書く

**Given** marker を持つ active managed job を cancel する
**When** canceled への遷移と persist が走る
**Then** canceled state が `.specrunner/local/<slug>/` に書かれ、その後 marker が clear され、jobs-dir は更新されない

#### Scenario: managed cancel --purge が local/slug を物理削除する

**Given** managed job を `--purge` 付きで cancel する
**When** purge 段階に達する
**Then** `.specrunner/local/<slug>/` ディレクトリが削除される

### Requirement: 検証が green

`bun run typecheck && bun run test` が green になる SHALL。

#### Scenario: typecheck と test が green

**Given** 本変更適用後
**When** `bun run typecheck && bun run test` を実行する
**Then** いずれも green になる
