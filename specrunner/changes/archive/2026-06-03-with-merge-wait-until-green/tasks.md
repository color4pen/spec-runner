# Tasks: `job archive --with-merge` を check 解決まで待つ wait ループにする

## T-01: GitHubClient port に check 取得メソッドと head SHA を追加する

- [x] `src/kernel/github-client.ts`（`GitHubClient` interface 正典）に `getCheckStatus` を追加
  - signature: `getCheckStatus(owner: string, repo: string, ref: string): Promise<CheckRollup>`
  - `CheckRollup` 型を定義: `{ state: "success" | "pending" | "failure" | "none"; total: number; failing: string[]; pending: string[] }`
  - doc コメントで `state` の意味（success=全 check 非ブロッキング / pending=未確定あり / failure=確定失敗あり / none=check 0 件）と、`failing` / `pending` は check 名一覧であることを記す
- [x] `getPullRequest` の戻り DTO に `headSha?: string` を追加（REST `head.sha` を写す。doc コメント更新）
- [x] `src/core/port/github-client.ts` は re-export のみのため変更不要だが、import 解決が通ることを確認

**Acceptance Criteria**:
- `GitHubClient` interface に `getCheckStatus` が存在し、`CheckRollup` 型が export されている
- `getPullRequest` の戻り型に `headSha?: string` が含まれる
- `bun run typecheck` が green

---

## T-02: github adapter に getCheckStatus を実装し headSha を mapping する

- [x] `src/adapter/github/github-client.ts` の `GitHubApiClient` に `getCheckStatus` を実装
  - `GET /repos/{owner}/{repo}/commits/{ref}/check-runs?per_page=100` を叩き `check_runs[]` を取得
  - `GET /repos/{owner}/{repo}/commits/{ref}/status` を叩き `statuses[]` を取得（最大 100 件。ページネーション非対応のため実用上十分）
  - check-runs endpoint のみ `Link` ヘッダがある場合は全ページ取得する（多数 check 対応。combined status `/status` はページネーション非対応）
  - 既存 `request()` middleware（401/429/5xx/rate-limit）を経由する
- [x] check run → 3 値の正規化（helper 関数）:
  - `status !== "completed"` → pending
  - `status === "completed"` かつ `conclusion ∈ {success, neutral, skipped}` → success
  - `status === "completed"` かつ `conclusion ∈ {failure, timed_out, cancelled, action_required, startup_failure, stale}` → failure
  - `conclusion == null`（完了表示だが結論未設定）→ pending（防御的）
- [x] combined status の各 `statuses[]` → 3 値の正規化:
  - `state === "success"` → success / `state === "pending"` → pending / `state ∈ {failure, error}` → failure
- [x] 集約ロジック:
  - `total = check_runs.length + statuses.length`
  - `total === 0` → `state: "none"`（combined status の rollup `state` フィールドには依存しない。配列長で判定する）
  - いずれか failure → `state: "failure"`、`failing` に該当 check 名（check run は `name`、status は `context`）を収集
  - failure 無し・pending あり → `state: "pending"`、`pending` に該当 check 名を収集
  - すべて success → `state: "success"`
- [x] `getPullRequest` の戻り値に `headSha: data.head?.sha` を追加（既存 mapping に 1 フィールド追加）
- [x] `tests/unit/adapter/github/github-client-pr.test.ts`（または同階層に新規 test ファイル）に `getCheckStatus` の unit test を追加:
  - 全 success → `state: "success"`
  - check run pending（in_progress）混在・failure 無し → `state: "pending"`
  - check run failure 混在 → `state: "failure"` かつ `failing` に名前が入る
  - combined status failure → `state: "failure"`
  - check 0 件（両 endpoint 空配列）→ `state: "none"`
  - `getPullRequest` が `headSha` を返す（`head.sha` mapping）

**Acceptance Criteria**:
- `getCheckStatus` が check-runs と combined status を集約し、success / pending / failure / none を正しく返す
- failure と pending が混在する場合は `failure` を返す
- check 0 件で `none` を返す
- `getPullRequest` が `headSha` を返す
- 追加した adapter test が pass する

---

## T-03: config schema に archive section（merge 待ち設定）を追加する

- [x] `src/config/schema.ts` に `ArchiveConfig` interface を追加
  - `mergeWaitTimeoutMs?: number | null`（doc: `null` = 無制限。未設定 = 有限 default。数値 = 上限 ms）
  - `mergeWaitPollIntervalMs?: number`（doc: 未設定 = default poll 間隔）
- [x] `SpecRunnerConfig` に `archive?: ArchiveConfig` を追加、`RawConfig` にも `archive?: Partial<Record<string, unknown>>` を追加
- [x] default 定数を追加（schema もしくは archive 経路の適切な module）: `DEFAULT_MERGE_WAIT_TIMEOUT_MS = 600_000`、`DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS = 15_000`
- [x] `validateConfig` に `archive` section の validation を追加（既存 section と同じ手書き validator パターン）:
  - `archive` が object でなければ `CONFIG_INVALID`
  - `mergeWaitTimeoutMs` が `undefined` / `null` 以外のとき、`number` かつ整数かつ `>= 0` でなければ `CONFIG_INVALID`（`null` は許可 = 無制限）
  - `mergeWaitPollIntervalMs` が `undefined` 以外のとき、`number` かつ整数かつ `>= 1` でなければ `CONFIG_INVALID`
- [x] `validateConfig` の validation 追加に対応する unit test を追加（既存 config schema test の置き場所に合わせる）: 正常 / `null` 許可 / 負値 reject / 非整数 reject

**Acceptance Criteria**:
- `archive.mergeWaitTimeoutMs` に `null` を設定でき、負値・非整数は `CONFIG_INVALID` になる
- `archive.mergeWaitPollIntervalMs` の範囲外が `CONFIG_INVALID` になる
- `unlimited` 等の文字列キーワードは schema に存在しない
- 追加した config test が pass する

---

## T-04: merge-then-archive を wait ループに改修する

- [x] `src/core/archive/merge-then-archive.ts` の `MergeThenArchiveInput` に注入パラメータを追加
  - `waitTimeoutMs?: number | null`（`null` = 無制限。default は CLI 側で解決して渡す。test では直接指定可）
  - `pollIntervalMs?: number`
  - `nowFn?: () => number`（default `Date.now`。テスト用に時刻注入）
  - 既存 `sleepFn?` はそのまま利用
- [x] Step 4 の `pollMergeStateAfterPush` 呼び出しと、それに続く `BLOCKED` / `UNSTABLE` / `DIRTY` 個別 escalation・`CLEAN (or exhausted)` → merge fall-through（現状 Step 4–5）を削除し、wait ループに置き換える
- [x] wait ループ（1 周）:
  1. `getPullRequest(owner, repo, prNumber)` → `state` / `mergeStateStatus` / `mergeable` / `headSha`
     - `state === "MERGED"` → ループ脱出して archive へ
     - `mergeStateStatus === "DIRTY"` または `mergeable === "CONFLICTING"` → conflict escalation（exit 1、merge しない）
     - `headSha` が欠如している場合は `unexpected: PR head SHA missing` 専用メッセージで escalation する（`getPullRequest` 自体は成功しているため "getPullRequest failed" メッセージは不正確）
     - `mergeStateStatus === "BLOCKED"` → branch protection 要件未充足として "branch protection requirements not met" メッセージで escalation する（exit 1、merge しない。conflict 検出と同じパターン）
  2. `getCheckStatus(owner, repo, headSha)` → rollup
     - `failure` → escalation（`failing` を含むメッセージ、merge しない）
     - `success` または `none` → ループ脱出して merge へ
     - `pending` → deadline 判定: `waitTimeoutMs` が `null` でなく `nowFn() - start >= waitTimeoutMs` なら timeout escalation（merge しない）。そうでなければ `sleepFn(pollIntervalMs)` して次周へ
- [x] ループ脱出後（green 確定、MERGED でない場合）: 既存 `checkMergeableForMerge`（最終 mergeable guard）→ `mergePullRequest({ mergeMethod: "squash" })` → 成功で `runArchiveOrchestrator` を呼ぶ（既存 Step 5–6 を流用）
- [x] `state === "MERGED"` でループ脱出した場合は merge をスキップして `runArchiveOrchestrator` を呼ぶ（既存 Step 3 と同等）
- [x] escalation メッセージは既存 `formatEscalation` を使い、failedStep / detectedState / recommendedAction / resumeCommand を timeout / failure / conflict 各ケースで記述する
- [x] `pollMergeStateAfterPush` の import を削除する

**Acceptance Criteria**:
- pending の間は待ち続け、即 escalation しない
- 全 check success または none で merge → archive まで進む
- failure / conflict / timeout はいずれも merge せず exit 1 escalation する
- `mergeStateStatus` の `UNSTABLE` を green/pending/failure 判定に使っていない
- exhausted → merge 試行の fall-through が無い
- `bun run typecheck` が green

---

## T-05: CLI archive.ts で待ち設定を解決して注入し、任意 flag を追加する

- [x] `src/cli/archive.ts` の `--with-merge` 分岐で、既に取得している `loadConfig()` の結果から merge 待ち設定を解決する
  - `waitTimeoutMs`: flag `--merge-wait-ms` 指定時はその値、無ければ `config.archive?.mergeWaitTimeoutMs`（`null` 含む。`undefined` なら `DEFAULT_MERGE_WAIT_TIMEOUT_MS`）
  - `pollIntervalMs`: `config.archive?.mergeWaitPollIntervalMs ?? DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS`
  - 解決した値を `runMergeThenArchive` の input に渡す
- [x] `RunArchiveOptions` に `mergeWaitMs?: number` を追加（flag 由来。任意）
- [x] `src/cli/command-registry.ts` の `job.subcommands.archive.flags` に `"merge-wait-ms": { type: "string" }`（または number 受理）を追加し、handler で parse して `runArchive` の `mergeWaitMs` に渡す（不正値は無視またはエラー、既存 flag parse 方針に合わせる）
- [x] `ARCHIVE_USAGE` に `--merge-wait-ms <ms>`（指定で待ち上限を override。無制限は config の `archive.mergeWaitTimeoutMs: null` で設定）の説明行を追加

**Acceptance Criteria**:
- `--with-merge` 実行時に config / flag から待ち上限・poll 間隔が解決され `runMergeThenArchive` に渡る
- config 未設定時は有限 default が使われる
- `--merge-wait-ms` で待ち上限を override できる（無制限 keyword は flag に存在しない）
- `specrunner job archive --help` の出力に `--merge-wait-ms` が表示される

---

## T-06: 不要になった pollMergeStateAfterPush を削除する

- [x] `src/core/finish/pr-status.ts` から `pollMergeStateAfterPush` 関数と定数 `POST_PUSH_RETRY_COUNT` / `POST_PUSH_RETRY_DELAY_MS` を削除する
- [x] module 冒頭の責務コメントから `pollMergeStateAfterPush` の記述を削除する
- [x] `fetchPrViewWithRetry` / `checkMergeableForMerge` とそれらの定数・型は残す（他で使用中）
- [x] 全ソースで `pollMergeStateAfterPush` の参照が残っていないことを確認する

**Acceptance Criteria**:
- `pollMergeStateAfterPush` がソースから削除され、参照が残っていない
- `bun run typecheck` が green

---

## T-07: architecture/components.md の GitHubClient port 記述を更新する

- [x] `architecture/components.md` の ports 表の `GitHubClient` 行に `getCheckStatus` を追記する
- [x] ArchiveOrchestrator の client-closed 不変条件・opt-in merge 経路の記述に、check 読み・wait・merge が merge-then-archive に閉じる旨が整合していることを確認する（必要なら最小追記）

**Acceptance Criteria**:
- `GitHubClient` 行に `getCheckStatus` が記載されている
- ArchiveOrchestrator の client-closed 記述と矛盾しない

---

## T-08: 既存テストの更新と typecheck / test green 確認

- [x] `tests/unit/core/archive/merge-then-archive.test.ts` を新挙動に書き換える
  - GitHubClient mock に `getCheckStatus` を追加（default は `{ state: "success", total: 1, failing: [], pending: [] }` 等）
  - `getPullRequest` mock に `headSha` を含める
  - TC: 全 check success → merge → archive
  - TC: check none（`state: "none"`）→ merge → archive（branch protection 無し repo）
  - TC: check pending → success の遷移を `getCheckStatus` の連続 mock で表現し、待機後 merge することを確認（`sleepFn` / `nowFn` 注入）
  - TC: check failure → exit 1 escalation、merge / archive 呼ばれない
  - TC: pending のまま `waitTimeoutMs` 超過（`nowFn` で時刻を進める）→ timeout escalation、merge / archive 呼ばれない
  - TC: conflict（`mergeStateStatus: "DIRTY"` または `mergeable: "CONFLICTING"`）→ escalation、merge 呼ばれない
  - TC: 既に MERGED → merge スキップして archive（既存 TC-014 を `getCheckStatus` 追加に合わせて維持）
  - 旧 BLOCKED/UNSTABLE 前提の assertion（`pollMergeStateAfterPush` の getPullRequest 連鎖）を除去・置換する
- [x] `pollMergeStateAfterPush` を参照していた test / コメントを除去する
- [x] `bun run typecheck && bun run test` が green

**Acceptance Criteria**:
- merge-then-archive のテストが pending / success / failure / timeout / conflict / none / already-merged を網羅する
- `pollMergeStateAfterPush` 参照がテストから消えている
- `bun run typecheck && bun run test` が green
