# Spec: `job archive --with-merge` の `none`（check 未出現）早期 merge を grace 待ちで塞ぐ

## Requirements

### Requirement: 初回 `none` は即 merge せず grace 期間 check の出現を待つ

`job archive --with-merge <slug>` の wait ループは、PR head commit の check rollup が `none`（check run も commit status も一つも無い）の時、その周回で即 merge へ進んではならない（MUST NOT）。代わりに、有限の grace 期間内は poll 間隔ごとに check を再取得し、check の出現を待ち続ける（SHALL）。grace は初めて `none` を観測した時点を起点とする。

#### Scenario: 初回 none で即 merge しない

**Given** PR head commit に check run も commit status も一つも無い（rollup state = `none`）
**When** `job archive --with-merge <slug>` の wait ループがこの状態を初めて観測する
**Then** その周回では merge を実行せず、poll 間隔だけ待機して check を再取得する

### Requirement: grace 内に check が出現したら既存の wait ループ判定に合流する

grace 期間中に check rollup が `none` 以外（`pending` / `failure` / `success`）に変わった場合、その周回からは既存の wait ループ判定に合流しなければならない（MUST）: `pending` は待機を継続し、`failure` は merge せず escalation し、`success` は merge へ進む。

#### Scenario: grace 内に check が pending として出現 → 待機を継続する

**Given** 初回 rollup が `none` で、次の再取得で rollup が `pending` になる
**When** `job archive --with-merge <slug>` を実行する
**Then** grace を抜けて既存の pending 判定に合流し、merge も escalation もせず待ち続ける

#### Scenario: grace 内に check が success として出現 → merge へ進む

**Given** 初回 rollup が `none` で、grace 内の再取得で rollup が `success` になる
**When** `job archive --with-merge <slug>` を実行する
**Then** squash merge を実行し、続けて archive を実行する

#### Scenario: grace 内に check が failure として出現 → escalation する

**Given** 初回 rollup が `none` で、grace 内の再取得で rollup が `failure` になる
**When** `job archive --with-merge <slug>` を実行する
**Then** merge は実行されず、失敗した check を含む escalation メッセージを出力し exit code 1 で終了する

### Requirement: grace 経過後も `none` なら merge へ進む

grace 期間を超えても rollup が `none` のままの場合、CI が無い repo と判断して merge へ進まなければならない（MUST）。

#### Scenario: CI 無し repo は grace 経過後に merge される

**Given** PR head commit の check rollup が grace 期間を通じてずっと `none` のまま
**When** `job archive --with-merge <slug>` を実行する
**Then** grace 経過後に squash merge を実行し、続けて archive を実行する

### Requirement: grace は有限・bounded で main の wait timeout と独立する

grace は「初回 check 出現」を待つための有限上限であり、main の wait timeout（`mergeWaitTimeoutMs`、`null` = 無制限を含む）とは独立に bounded でなければならない（MUST）。これにより `mergeWaitTimeoutMs: null`（無制限）設定でも、CI 無し repo は grace 経過後に merge され永久 hang しない。grace の長さは不変のハードコード定数（60 秒）であり、config / flag で変更できない。

#### Scenario: 無制限 timeout でも CI 無し repo は永久 hang しない

**Given** `mergeWaitTimeoutMs` が `null`（無制限）に設定され、check rollup がずっと `none`
**When** `job archive --with-merge <slug>` を実行する
**Then** main の無制限 timeout に関わらず grace 経過後に merge へ進み、永久に待ち続けない

#### Scenario: grace は config / flag で変更できない

**Given** `.specrunner/config.json` および CLI flag
**When** grace 期間を変更しようとする設定キー / flag を探す
**Then** grace 期間を露出する config キー / flag は存在せず、grace 長は不変のハードコード定数である

### Requirement: 変更は merge 経路に閉じ archive 本体は client-closed を維持する

grace 待しのロジックは opt-in merge 経路（`src/core/archive/merge-then-archive.ts`）に閉じなければならない（MUST）。archive 本体（`src/core/archive/orchestrator.ts`）は `GitHubClient`(port) に依存しない（client-closed）状態を維持する。

#### Scenario: plain archive で GitHub API 呼び出しが発生しない

**Given** `--with-merge` を指定せずに `job archive <slug>` を実行する
**When** archive orchestrator が完了する
**Then** GitHubClient のメソッド（`getPullRequest` / `getCheckStatus` / `mergePullRequest` 等）は一度も呼ばれない
