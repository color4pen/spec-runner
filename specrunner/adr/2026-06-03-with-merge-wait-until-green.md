# ADR-20260603: --with-merge を check 解決まで待つ wait ループにする

## ステータス

accepted

Extends: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md)
Supersedes: [ADR-20260603-finish-branch-protection-gate](2026-06-03-finish-branch-protection-gate.md) の D1（UNSTABLE 一括判定を `pollMergeStateAfterPush` で処理する設計）

## コンテキスト

`job archive --with-merge`（`src/core/archive/merge-then-archive.ts`）は「PR が green になるまで待って merge」する想定だったが、実際には待っていなかった。

- merge 判定に finish 由来の `pollMergeStateAfterPush`（`src/core/finish/pr-status.ts`、`POST_PUSH_RETRY_COUNT=5` × `POST_PUSH_RETRY_DELAY_MS=3000` = 最大 ~12 秒）を流用していた。CI 完了を待つには短すぎる。
- `mergeStateStatus=UNSTABLE` を「確定失敗」として即 escalation していた。しかし `UNSTABLE` は「CI pending/running」と「check 確定失敗」を区別しないため、待つべき pending 状態でも escalation が発生し wait が成立しなかった。
- `pollMergeStateAfterPush` が poll 打ち切り（exhausted）時に `{ mergeStateStatus: "" }` を返し、呼び出し側がそれを CLEAN 同等として squash merge を試みる fall-through があった。「待ちきれず merge」経路が残存していた。
- branch protection を持たない repo では `UNSTABLE` が CI 走行中の常態になり、`--with-merge` は常に escalation して merge できなかった。

結果として `--with-merge` は事実上「待たずに escalation する」コマンドになっており、実用にならなかった。

[ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) で確立した client-closed 不変条件（`orchestrator.ts` は GitHubClient port に依存しない）は本変更でも維持する。check 読み・wait・merge は `merge-then-archive.ts` に閉じる。

## 決定

### D1: green 判定を check run / combined status の rollup に切り替える

`mergeStateStatus=UNSTABLE` 一括判定を green/pending/failure 判定の根拠に使うのをやめる。代わりに PR head commit の **check run**（GitHub Actions 等）と **combined status**（legacy commit status）を直接読み、4 値の rollup state（`success` / `pending` / `failure` / `none`）で判定する。

判定 policy（core 側）:

| rollup state | 挙動 |
|---|---|
| `success` | merge へ進む |
| `none`（check が一つも存在しない） | vacuously green として merge へ進む |
| `pending` | 待ち続ける（D3 の wait ループ） |
| `failure` | 待たずに escalation |

`mergeStateStatus=CLEAN` 単独には依存しない（required check 構造を前提にしない）。branch protection 無しの repo でも全 check 通過後（または check 無し）に merge できる。

**採用理由**: `UNSTABLE` は pending と failure を畳んでしまうため、「pending を待つ」と「failure を区別する」を両立できない。check run / combined status は個々の status / conclusion を保持しており、pending と failure を分離できる唯一の粒度。

**却下案**:
- `pollMergeStateAfterPush` の retry 回数を増やすだけ → pending/failure の区別ができないため、failure を無駄に待つか pending で誤 escalation するかのどちらかにしかならない。
- GraphQL `statusCheckRollup` を使う → 既存 adapter は REST に閉じており（`architecture` の host/endpoint adapter-contained 方針）、REST の check-runs + status 2 endpoint で同等の情報が得られる。multi-API 化は blast radius を増やすため不採用。

### D2: `GitHubClient` に `getCheckStatus(owner, repo, ref)` を追加し、集約は adapter に閉じる

port に check rollup を返す 1 メソッドを追加する。

公開 contract（要旨。正確な signature はコード正典）:

```ts
getCheckStatus(owner, repo, ref): Promise<{
  state: "success" | "pending" | "failure" | "none";
  total: number;       // 集計対象の check 数
  failing: string[];   // failure 扱いの check 名（escalation メッセージ用）
  pending: string[];   // pending 扱いの check 名（診断用）
}>
```

adapter（`src/adapter/github/github-client.ts`）が 2 endpoint を叩いて集約する:

- `GET /repos/{owner}/{repo}/commits/{ref}/check-runs`（GitHub Actions 等の check run）
- `GET /repos/{owner}/{repo}/commits/{ref}/status`（combined status の `statuses[]`）

REST → 3 値の正規化（adapter 内の anti-corruption 変換）:

- check run: `status !== "completed"` → pending。`status === "completed"` かつ `conclusion ∈ {success, neutral, skipped}` → success、`conclusion ∈ {failure, timed_out, cancelled, action_required, startup_failure, stale}` → failure、`conclusion == null` → pending（防御的）。
- combined status の各 `statuses[]`: `state === "success"` → success、`state === "pending"` → pending、`state ∈ {failure, error}` → failure。
- 集約 priority: いずれか failure → `failure`、なければ pending があれば `pending`、すべて success なら `success`。
- `none` 判定は `check_runs.length === 0 && statuses.length === 0`（個々の配列が空）で行い、combined status endpoint の rollup `state` フィールド（status 0 件でも `pending` を返す挙動がある）には依存しない。

判定対象の `ref` は PR head commit の SHA を使う（branch 名ではなく SHA）。branch 名 ref は wait 中の force-push で別 commit を指しうるため SHA を使う。head SHA は `getPullRequest` の戻り DTO に `headSha?: string`（REST `head.sha`）を追加して取得する。

check-runs endpoint は `?per_page=100` を指定し `Link` ヘッダがある場合は全ページ取得する（adapter 内で完結）。

**採用理由**: 「内部 3 値への分類」は外部 API 形状の吸収であり adapter の責務。「3 値をどう扱うか（待つ/escalation/merge）」の policy は core の責務。この境界分割により core は GitHub の conclusion 値体系を知らずに済み、テストも mock しやすい。

**却下案**:
- adapter が boolean（green か否か）を返す → pending と failure の区別が消え、core が待つべきか escalation すべきか判断できなくなる。
- core が check-runs / status の生 JSON を解釈する → GitHub REST 形状を core に漏らし、port/adapter の責務境界を崩す。

### D3: `merge-then-archive.ts` を wait ループに改修する

固定回数の短い poll をやめ、check が terminal に達するまで poll し続けるループにする。

ループ 1 周:

1. `getPullRequest(prNumber)` で最新状態を取得（`state` / `mergeStateStatus` / `mergeable` / `headSha`）。
   - `state === "MERGED"` → 外部 merge 済み。ループを抜けて archive へ。
   - conflict 検出: `mergeStateStatus === "DIRTY"` または `mergeable === "CONFLICTING"` → escalation（conflict）。
2. `getCheckStatus(owner, repo, headSha)` で rollup を取得。
   - `failure` → escalation（failing check を含むメッセージ）。
   - `success` / `none` → ループを抜けて merge へ。
   - `pending` → 待ち上限（deadline）超過なら escalation（timeout）。未超過なら `sleepFn(pollIntervalMs)` して次周へ。

ループ後（green 確定）:

- 既存 `checkMergeableForMerge`（`mergeable` の MERGEABLE 最終 guard、UNKNOWN retry 付き）を残す。これは `mergeStateStatus` ではなく `mergeable` を見るため D1 と矛盾しない。
- `mergePullRequest({ mergeMethod: "squash" })`。
- merge 成功 → `runArchiveOrchestrator` を呼ぶ（archive 本体は client-closed、D5 参照）。

deadline は注入された `nowFn?: () => number`（default `Date.now`）と `waitTimeoutMs`（`number | null`）で計算する。`null` のときは deadline チェックをスキップし無制限に待つ。`sleepFn` と `nowFn` を注入可能にしてテストで時間経過を制御する。

**採用理由**: pending を待ち、failure/conflict/timeout を区別して escalation する要件を 1 ループで満たす。`getPullRequest` を毎周読むことで、外部 merge / force-push / conflict 化にも追従できる。

**却下案**:
- headSha を初回 1 回だけ取得して固定 → wait 中の rebase/force-push で古い commit の check を見続け、誤判定する。

### D4: 待ち上限・poll 間隔は config の `archive` 専用 section で持つ（`null` = 無制限）

`.specrunner/config.json` の `archive` section に専用フィールドを追加し、`null` = 無制限の既存慣習（`maxTurns: null` 等）に揃える。

schema（`src/config/schema.ts`）追加フィールド:

```ts
interface ArchiveConfig {
  mergeWaitTimeoutMs?: number | null;   // null = 無制限。未設定 = 有限 default。
  mergeWaitPollIntervalMs?: number;     // 未設定 = default。
}
```

default 値: `DEFAULT_MERGE_WAIT_TIMEOUT_MS = 600_000`（10 分）、`DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS = 15_000`（15 秒）。~12 秒より十分長く、典型的な CI 完了に足る。`unlimited` 等の固有文字列キーワードは導入しない。無制限は `null` のみで表現する。

解決責務は composition-root（`src/cli/archive.ts`）。`loadConfig()` から解決して `runMergeThenArchive` の input に `waitTimeoutMs: number | null` と `pollIntervalMs: number` として注入する。core は config を直接読まない。

`--merge-wait-ms <number>` flag を追加し、指定時は config より優先する。無制限は flag では表現せず（literal keyword を避ける）、config の `null` / 未設定で表現する。

**採用理由**: archive は 10-step pipeline の step ではなく CLI コマンドであり、`config.steps[stepName]`（`StepExecutionConfig`）の resolution chain には乗らない。`StepExecutionConfig.timeoutMs` は agent step の実行 timeout という別 semantics を持つため再利用しない。非 step 機能は専用 typed section を持つ慣習（`specReview.pollIntervalMs` / `logs.maxJobs` / `progress.heartbeatIntervalSec`）に揃える。

**却下案**:
- `config.steps.archive.timeoutMs` を流用 → archive は step ではなく、`timeoutMs` の既存 semantics（agent SDK timeout）と衝突する。
- `unlimited` 等の literal keyword を導入 → 要件で明示的に禁止。既存の `null` = 無制限慣習から逸脱する。

### D5: `pollMergeStateAfterPush` と exhausted → merge fall-through を削除する

`merge-then-archive.ts` から `pollMergeStateAfterPush` の呼び出しと、`UNSTABLE` / exhausted を経由した merge 試行の分岐を削除する。`pollMergeStateAfterPush` の production 利用は `merge-then-archive.ts` のみ（finish orchestrator は archive-command 変更で既に解体済み）であり dead code となるため、`src/core/finish/pr-status.ts` から `pollMergeStateAfterPush` と関連定数（`POST_PUSH_RETRY_COUNT` / `POST_PUSH_RETRY_DELAY_MS`）を削除する。

**採用理由**: 「待ちきれず merge」経路を dead code として残すと混乱の元になる。D1 の check run 判定に完全移行した後は、`mergeStateStatus` ベースの poll は不要になる。

### D6: client-closed 不変の維持（既存 ADR の継承）

check 読み・wait・merge は `merge-then-archive.ts` に閉じる。`src/core/archive/orchestrator.ts` は GitHubClient(port) を import せず、`ArchiveInput` にも `githubClient` を持たない状態を維持する。新 port メソッド `getCheckStatus` も merge 経路からのみ呼ぶ。

**採用理由**: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) の不変条件を引き継ぐ。merge の不確定性（CI 待ち・timeout）を決定的なローカル片づけ（archive orchestrator）に波及させない。

## 検討した代替案

### A1: `mergeStateStatus` の retry 回数と timeout を大幅に増やす

`pollMergeStateAfterPush` の `POST_PUSH_RETRY_COUNT` / `POST_PUSH_RETRY_DELAY_MS` を大きくして長時間待つ案。

- **Pros**: 変更量が小さい
- **Cons**: `UNSTABLE` は pending と failure を区別しないため、failure でも長時間待ち続けるか、pending で escalation するかのどちらかにしかならない（D1 の根本的問題が残る）。exhausted → merge fall-through も残る。
- **Why not**: pending/failure の区別が要件の核心であり、`mergeStateStatus` の粒度では解決不可能。

### A2: GraphQL `statusCheckRollup` を使って 1 クエリで rollup を取得する

GitHub GraphQL API の `statusCheckRollup`（3 値 + rollup 付き）を使う案。

- **Pros**: 1 クエリで集約済み rollup が得られる
- **Cons**: 既存 adapter は REST に閉じている（`architecture` の host/endpoint adapter-contained 方針）。GraphQL 導入は blast radius が大きく、認証ヘッダ・エラーハンドリング・テスト mock が大幅に増える。REST の 2 endpoint で同等の情報が得られる。
- **Why not**: 既存 REST アーキテクチャとの一貫性を保ち、最小変更で要件を満たす REST を採用する。

### A3: adapter が boolean（green か否か）を返す

`getCheckStatus` の戻り値を `{ isGreen: boolean }` に単純化する案。

- **Pros**: 呼び出し側の型が単純になる
- **Cons**: pending と failure の区別が消える。core が「待つべきか escalation すべきか」を判断できなくなる（要件の pending/failure 区別を満たせない）。
- **Why not**: D2 の「3 値 + none」が要件上の最小粒度。

## 影響

### Positive

- `--with-merge` が実用になる。CI pending 中は待ち続け、green で merge、failure/timeout で escalation する設計が確立する。
- branch protection 無しの repo でも、全 check 通過後（または check 無し）に merge できる。
- `pollMergeStateAfterPush` と exhausted → merge fall-through が削除され、「待ちきれず merge」という誤動作経路が消える。
- 待ち上限が config で明示的に設定可能になり、`null` = 無制限という既存慣習に揃う。

### Negative

- push 直後で check がまだ作成されていない瞬間に `getCheckStatus` を呼ぶと `none` を green とみなして CI 開始前に merge する可能性がある（CI を使う repo では branch protection / required check の設定を前提とする）。
- `getCheckStatus` を毎 poll 周に呼ぶことで API 呼び出しが増える。default 15 秒間隔で頻度を抑制し、adapter の既存 rate-limit middleware で backoff する。

### Known Debt

- CI を使う repo での「push 直後 `none` → 早期 merge」レースに対する grace 待ちは本変更では導入しない。required check 設定が前提（Non-Goal）。必要なら追加 request で扱う。
- check-runs の combined status endpoint（`/status` singular）は最大 100 statuses を返す（ページネーション非対応）。100 を超える statuses を持つ repo では判定漏れが発生しうるが、実用上十分と判断する。
- 無制限（`null`）設定時、CI が永久 pending だとプロセスが終了しない。仕様どおりの挙動（解決するまで待つ）であり、明示設定時のみ発生する。

## 参照

- Request: `specrunner/changes/with-merge-wait-until-green/request.md`
- Design: `specrunner/changes/with-merge-wait-until-green/design.md`
- Related: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — client-closed 不変条件（本 ADR で継承）
- Related: [ADR-20260603-finish-branch-protection-gate](2026-06-03-finish-branch-protection-gate.md) — UNSTABLE 一括判定の設計（本 ADR の D1 で置き換え）
