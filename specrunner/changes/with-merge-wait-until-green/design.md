# Design: `job archive --with-merge` を check 解決まで待つ wait ループにする

## Context

`job archive --with-merge`（`src/core/archive/merge-then-archive.ts`）は「PR が green になるまで待って merge」する想定だが、実際には待っていない。

- merge 判定に finish 由来の `pollMergeStateAfterPush`（`src/core/finish/pr-status.ts`、`POST_PUSH_RETRY_COUNT = 5` × `POST_PUSH_RETRY_DELAY_MS = 3000` = 最大 ~12 秒）を流用している。CI 完了を待つには短すぎる。
- 判定が `mergeStateStatus` の `UNSTABLE` 一括判定に依存している。`UNSTABLE` は「**CI が pending/running**」と「**check が確定で failure**」の両方を含むため区別できず、CI 走行中（待つべき pending）でも即 escalation する。
- `pollMergeStateAfterPush` は exhausted 時に `{ mergeStateStatus: "" }` を返し、呼び出し側はそれを CLEAN 同等とみなして **merge を試みる** fall-through を持つ（`merge-then-archive.ts` Step 5 のコメント「CLEAN (or unknown/exhausted) → ... squash merge」）。「待ちきれず merge」が残っている。
- branch protection を持たない repo（required check が無い）では `UNSTABLE` が CI 走行中の常態になり、現状の `--with-merge` は常に escalation して merge できない。

構造制約として、archive 本体（`src/core/archive/orchestrator.ts`）は **client-closed**（GitHubClient(port) 非依存）を維持しなければならない（`architecture/components.md` の ArchiveOrchestrator 不変条件）。check 読み・wait・merge は opt-in merge 経路（`merge-then-archive.ts`）に閉じる。

## Goals / Non-Goals

**Goals**:

- `--with-merge` を、PR の check が terminal state に達するまで poll し続ける wait ループにする。pending/running の間は待ち続け、即 escalation しない。
- green/pending/failure を **check run / combined status を直接読む粒度**で判定し、`mergeStateStatus` の `UNSTABLE` 一括判定をやめる。
- green の定義を「**存在する check がすべて success**（neutral/skipped を含む非ブロッキング扱い）」とし、branch protection の有無に依らず機能させる。check が一つも無い repo では vacuously green として merge へ進む。
- 待ち上限を config で設定可能にする（`null` = 無制限）。default は典型的な CI 完了に足る有限値（数分オーダー）。
- timeout / failure / conflict はいずれも merge せず escalation する。exhausted → merge 試行の fall-through を削除する。
- check run / combined status を取得する `GitHubClient`(port) メソッドを追加する。

**Non-Goals**:

- branch protection / required check の GitHub 側設定そのもの（プロジェクト側の責任）。
- plain `job archive`（`--with-merge` 無し）の挙動。orchestrator.ts は touch しない。
- archive 本体（folder 移動・push・worktree 撤去・status 遷移）のロジック変更。
- merge strategy の変更（squash merge のまま）。

## Decisions

### D1: green 判定を check run / combined status の rollup に切り替える

`mergeStateStatus` の `UNSTABLE` 一括判定を green/pending/failure 判定の根拠に使うのをやめる。代わりに PR head commit の **check run（GitHub Actions 等）** と **combined status（legacy commit status）** を直接読み、3 値 + none に正規化した rollup で判定する。

- rollup state は `success` / `pending` / `failure` / `none` の 4 値。
- core 側の policy:
  - `failure` → 待たずに escalation（merge しない）。
  - `pending` → 待ち続ける（D3 の wait ループ）。
  - `success` → merge へ進む。
  - `none`（check が一つも存在しない）→ 「存在する check がすべて success」を vacuously 満たすため merge へ進む。

`mergeStateStatus = CLEAN` 単独には依存しない（required check 構造を前提にしない）。これにより branch protection 無しの repo でも全 check 通過後（または check 無し）に merge できる。

**rationale**: `UNSTABLE` は pending と failure を畳んでしまうため、要件1（pending を待つ）と要件2（failure を区別）を両立できない。check run / combined status は個々の status / conclusion を保持しており、pending と failure を分離できる唯一の粒度。

**alternatives**:
- `mergeStateStatus` の retry 回数を増やすだけ → 不採用。pending/failure の区別ができないため、failure を無駄に待つか pending で誤 escalation するかのどちらかにしかならない。
- GraphQL `statusCheckRollup` を使う → 不採用。既存 adapter は REST に閉じており（`architecture` の host/endpoint adapter-contained 方針）、REST の check-runs + status の 2 endpoint で同等の情報が得られる。multi-API 化は blast radius を増やす。

### D2: `GitHubClient` に `getCheckStatus(owner, repo, ref)` を追加し、集約は adapter に閉じる

port に check rollup を返す 1 メソッドを追加する。

- 公開 contract（要旨。正確な signature はコード正典）:
  ```ts
  getCheckStatus(owner, repo, ref): Promise<{
    state: "success" | "pending" | "failure" | "none";
    total: number;       // 集計対象になった check 数（check run + status）
    failing: string[];   // failure 扱いの check 名（escalation メッセージ用）
    pending: string[];   // pending 扱いの check 名（診断用）
  }>
  ```
- adapter（`src/adapter/github/github-client.ts`）が 2 endpoint を叩いて集約する:
  - `GET /repos/{owner}/{repo}/commits/{ref}/check-runs`（GitHub Actions 等の check run）
  - `GET /repos/{owner}/{repo}/commits/{ref}/status`（combined status の `statuses[]`）
- REST → 3 値の正規化（anti-corruption。GitHub の多値を内部 3 値へ畳むのは adapter の責務）:
  - check run: `status !== "completed"` → pending。`status === "completed"` で `conclusion ∈ {success, neutral, skipped}` → success、`conclusion ∈ {failure, timed_out, cancelled, action_required, startup_failure, stale}` → failure、`conclusion == null` → pending（防御的）。
  - combined status の各 `statuses[]`: `state === "success"` → success、`state === "pending"` → pending、`state ∈ {failure, error}` → failure。
  - 集約 priority: いずれか failure → `failure`、なければ pending があれば `pending`、すべて success なら `success`。
  - **`none` の判定は `check_runs.length === 0 && statuses.length === 0`**（個々の配列が空）で行い、combined status endpoint の rollup `state` フィールド（status 0 件でも `pending` を返す挙動がある）には依存しない。

判定対象の `ref` は PR head commit の SHA を使う（branch 名ではなく SHA）。head SHA は `getPullRequest` の戻り DTO に `headSha?: string`（REST `head.sha`）を追加して取得する。branch 名 ref は wait 中の force-push で別 commit を指しうるため SHA を使う。

**rationale**: 「内部 3 値への分類」は外部 API 形状の吸収（B-2）であり adapter の責務。「3 値をどう扱うか（待つ/escalation/merge）」の policy は core の責務。この境界分割により core は GitHub の conclusion 値体系を知らずに済み、テストも mock しやすい。port メソッドは 1 つ追加（要件「port メソッドを追加する」を最小で満たす）。

**alternatives**:
- adapter が「green か否か」の boolean を返す → 不採用。pending と failure の区別が消え、core が待つべきか escalation すべきか判断できなくなる（要件2 違反）。
- core が check-runs / status の生 JSON を解釈する → 不採用。SDK/REST 形状を core に漏らす（B-2 違反）。

### D3: `merge-then-archive.ts` を wait ループに改修する

固定回数の短い poll をやめ、check が terminal に達するまで poll し続けるループにする。

ループ 1 周（疑似）:
1. `getPullRequest(prNumber)` で最新状態を取得（`state` / `mergeStateStatus` / `mergeable` / `headSha`）。
   - `state === "MERGED"` → 外部 merge 済み。ループを抜けて archive へ。
   - conflict 検出: `mergeStateStatus === "DIRTY"` または `mergeable === "CONFLICTING"` → 待たずに escalation（conflict）。※ conflict 検出は確定状態であり、`UNSTABLE` 一括判定の禁止（D1）とは独立。
2. `getCheckStatus(owner, repo, headSha)` で rollup を取得。
   - `failure` → escalation（failure。`failing` を含めたメッセージ）。
   - `success` / `none` → ループを抜けて merge へ。
   - `pending` → 待ち上限（deadline）超過なら escalation（timeout）。未超過なら `sleepFn(pollIntervalMs)` して次周へ。

ループ後（green 確定）:
3. 既存 `checkMergeableForMerge`（`mergeable` の MERGEABLE 最終 guard、UNKNOWN retry 付き）を残す。これは `mergeStateStatus` ではなく `mergeable` を見るため D1 と矛盾しない。
4. `mergePullRequest({ mergeMethod: "squash" })`。
5. merge 成功 → `runArchiveOrchestrator` を呼ぶ（既存どおり、archive 本体は client-closed）。

deadline は注入された `nowFn?: () => number`（default `Date.now`）と `waitTimeoutMs`（`number | null`）で計算する。`null` のときは deadline チェックをスキップし無制限に待つ。`sleepFn` と `nowFn` を注入可能にしてテストで時間経過を制御する。

**rationale**: pending を待ち、failure/conflict/timeout を区別して escalation する要件1・2・3・4 を 1 ループで満たす。`getPullRequest` を毎周読むことで、外部 merge / force-push / conflict 化にも追従できる。

**alternatives**:
- headSha を初回 1 回だけ取得して固定 → 不採用。wait 中の rebase/force-push で古い commit の check を見続け、誤判定する。

### D4: 待ち上限・poll 間隔は config の専用 section で持ち、CLI が解決して core に注入する

`.specrunner/config.json` に専用 section を追加し、`null = 無制限` 慣習に揃える。

- schema（`src/config/schema.ts`）に section を追加（要旨。正確な型はコード正典）:
  ```ts
  interface ArchiveConfig {
    mergeWaitTimeoutMs?: number | null;   // null = 無制限。未設定 = 有限 default。
    mergeWaitPollIntervalMs?: number;     // 未設定 = default。
  }
  ```
- 値の意味:
  - `mergeWaitTimeoutMs`: 未設定（`undefined`）→ 有限 default（`DEFAULT_MERGE_WAIT_TIMEOUT_MS`）。明示 `null` → 無制限。数値 → その上限（ms）。
  - `mergeWaitPollIntervalMs`: 未設定 → default（`DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS`）。
- default 値（design 決定）: `DEFAULT_MERGE_WAIT_TIMEOUT_MS = 600_000`（10 分）、`DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS = 15_000`（15 秒）。~12 秒より十分長く、典型的な CI 完了に足る。
- `validateConfig` に `archive` section の validation を追加（`mergeWaitTimeoutMs` は `number(>=0) | null`、`mergeWaitPollIntervalMs` は `number(>=1)`。既存 section と同じ手書き validator パターン）。
- 解決責務は composition-root（`src/cli/archive.ts`）。既に `loadConfig()` を呼んでおり、deep merge 済み config から値を解決して `runMergeThenArchive` の input に `waitTimeoutMs: number | null` と `pollIntervalMs: number` として注入する。core は config を直接読まない。

**「step config」の解釈**: request は「step config を主とする」と表現するが、archive は 10 step pipeline の step ではなく CLI コマンドであり、`config.steps[stepName]`（`StepExecutionConfig`）の resolution chain（byRequestType 等）には乗らない。`StepExecutionConfig.timeoutMs` は agent step の実行 timeout（SDK へ渡す）という別 semantics を既に持つため再利用しない。本プロジェクトの非 step 機能は専用 typed section を持つ慣習（`specReview.pollIntervalMs` / `logs.maxJobs` / `progress.heartbeatIntervalSec`）に揃え、`archive` 専用 section を追加する。これにより acceptance「config で設定可能・`null` = 無制限・`unlimited` 等の固有文字列キーワードを導入しない」を満たす。

**flag override（任意）**: `--merge-wait-ms <number>` を追加し、指定時は config より優先する有限 ms 値とする。無制限は flag では表現せず（literal keyword を避ける）、config の `null` / 未設定で表現する。解決順は flag > project overlay config > user config（deep merge は既存機構）> 有限 default。

**rationale**: 既存の「core は config を読まず comp-root が解決値を注入する」パターンと、非 step 機能の typed section 慣習に合わせると、最小の追加で要件を満たせる。

**alternatives**:
- `config.steps.archive.timeoutMs` を流用 → 不採用。archive は step ではなく、`timeoutMs` の既存 semantics（agent SDK timeout）と衝突する。
- `unlimited` 等の literal keyword を導入 → 不採用（要件で明示的に禁止。`null` で表現する）。

### D5: client-closed 不変の維持（orchestrator.ts は touch しない）

check 読み・wait・merge は `merge-then-archive.ts` に閉じる。`src/core/archive/orchestrator.ts` は GitHubClient(port) を import せず、`ArchiveInput` にも `githubClient` を持たない現状を維持する。新 port メソッド `getCheckStatus` も merge 経路からのみ呼ぶ。

**rationale**: `architecture/components.md` の ArchiveOrchestrator 不変条件（client-closed）を崩さない。merge の不確定性（CI 待ち・timeout）を決定的なローカル片づけに波及させない。

### D6: 不要になった `pollMergeStateAfterPush` と exhausted → merge fall-through を削除する

`merge-then-archive.ts` から `pollMergeStateAfterPush` の呼び出しと、`UNSTABLE` / exhausted を経由した merge 試行の分岐を削除する。`pollMergeStateAfterPush` の production 利用は merge-then-archive のみ（grep 済み。finish orchestrator は archive-command 変更で既に解体済み）。dead code となるため、`src/core/finish/pr-status.ts` から `pollMergeStateAfterPush` と関連定数（`POST_PUSH_RETRY_COUNT` / `POST_PUSH_RETRY_DELAY_MS`）を削除する。`fetchPrViewWithRetry` / `checkMergeableForMerge` は他で使われ続けるため残す。

**rationale**: 要件4「exhausted → merge 試行 fall-through を削除する」を直接満たす。削除しないと「待ちきれず merge」経路が dead code として残り混乱の元になる。

## Risks / Trade-offs

- [Risk] push 直後で check がまだ作成されていない瞬間に `getCheckStatus` を呼ぶと、`none` を「green」とみなして CI 開始前に merge してしまう（CI を使う repo での早期 merge）。
  - Mitigation: 毎周 `getPullRequest` を読むため、conflict / 外部 merge には追従する。`none = green` は要件「branch protection 無し repo で merge できる」「green の定義 = 存在する check すべて success」を満たすための明示的選択。CI を使う repo は branch protection / required check を設定する（Non-Goal の前提）ことで `mergeStateStatus` 起因ではなく check の出現で pending になる。残差リスクは Open Questions に記載。

- [Risk] `getCheckStatus` を毎周呼ぶことで API 呼び出しが増える（pending が長いほど多い）。
  - Mitigation: poll 間隔 default 15s で頻度を抑制。adapter の既存 429 / rate-limit middleware が backoff を担保。`total` / `failing` / `pending` を返してログで可視化する。

- [Risk] check-runs / status のページネーション（多数 check）で 1 ページに収まらないと判定漏れする。
  - Mitigation: check-runs endpoint は `?per_page=100` を指定し `Link` ヘッダがある場合は全ページ取得する（adapter 内で完結）。combined status endpoint（`/status` singular）はページネーション非対応のため最大 100 statuses を返す（実用上十分）。tasks に明記する。

- [Risk] 無制限（`null`）設定時、CI が永久 pending だとプロセスが終了しない。
  - Mitigation: 仕様どおりの挙動（解決するまで待つ）。KeepAlive / Ctrl-C で中断可能。default は有限のため明示設定時のみ発生する。

- [Risk] 既存テスト `tests/unit/core/archive/merge-then-archive.test.ts` が `pollMergeStateAfterPush` 前提（BLOCKED/CLEAN の getPullRequest 連鎖）で書かれており、新ロジックで壊れる。
  - Mitigation: tasks で当該テストを新挙動（`getCheckStatus` mock を含む success/pending/failure/timeout）に書き換える。

## Open Questions

- CI を使う repo での「push 直後 `none` → 早期 merge」レースに対し、初回に「check が出現するまでの短い grace 待ち」を入れるべきか。本 design では入れない（要件は `none = green` を要求し、CI repo は required check 前提）。必要なら追加 request で扱う。

## Migration Plan

- config schema 追加は後方互換（`archive` section 未設定時は有限 default で従来より長く待つだけ。`unlimited` 等の新キーワードは導入しない）。
- 永続化済み job state / 既存 `.specrunner/config.json` の変更は不要。
- 本変更は構造的（新 port メソッド追加・判定契約の変更）であり ADR 相当の決定を含む。ADR の生成は adr-gen step に委ね、design では具体 path を指定しない。
