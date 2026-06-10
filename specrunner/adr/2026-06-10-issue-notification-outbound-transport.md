# job を GitHub issue に紐付け escalation / 完走を issue コメントで通知する（外向き輸送路）

**Date**: 2026-06-10
**Status**: accepted
**Related**: `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`（resumePoint 記録の上位決定）

## Context

pipeline の escalation（`awaiting-resume`）と完走（`awaiting-archive`）は terminal 出力でしか観測できず、無人実行では停止に誰も気付けない。job を起点 issue に紐付け、状態変化を GitHub issue コメントとして書き戻すことで、GitHub 本体の通知設定（メール / モバイル / Slack 連携）をそのまま人間への push 経路にできる。

本変更が対象とする外向き輸送路は将来の内向き輸送路（ラベル起動・`/resume` コメント再開）の前提となる。内向きは本 ADR のマーカー仕様とフィールド定義を前提として依存するため、外向きを先行して確定させる。

変更前の主要な制約:

- `GitHubClient` port（`src/kernel/github-client.ts`）の現メソッドは branch / PR / check / raw file 系のみで、issue 操作の API は存在しない
- `JobState`（`src/state/schema.ts`）に issue 番号フィールドは存在しない
- pipeline の terminal 遷移（escalation 3 経路・完走 1 経路）は `runInternal` の `while` ループを抜けた後の `return state` に収束する

## Decision

### D1: 通知発火点は `runInternal` の terminal 収束点（単一 choke point）

`pipeline.ts` の `runInternal` 末尾、`while` ループを抜けた直後の `return state` の手前に `await notifyJobTerminal(state, deps)` を 1 箇所だけ置く。

```ts
// end while
await notifyJobTerminal(state, deps);  // best-effort, status を見て種別判定
return state;
```

完走（`awaiting-archive`）・escalate-terminal（`awaiting-resume`）・loop 上限到達（`handleExhausted` → `awaiting-resume`）の 3 経路はすべてこの収束点を通る。`notifyJobTerminal` は `state.status` を見て通知種別を決定し、それ以外（`running` 残存 / `failed` 等）は何もしない。

**Rationale**: 遷移サイトが 3 箇所に散在しても収束点は 1 点。通知を収束点に集約することで DRY を保ち、将来 escalation 経路が増えても収束点が変わらない限り通知配線は不変。pipeline は local / managed 両 runtime で CLI プロセス内実行のため、この hook は「agent には書かせない」要件を構造的に満たす。完走経路では `commitFinalState` の後に収束するため `state.pullRequest` は確定済みで参照できる。

### D2: `GitHubClient` port に `createIssueComment` を required で追加する

`src/kernel/github-client.ts` の `GitHubClient` interface に以下を追加する。

```ts
createIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ id: number; url: string }>;
```

adapter（`src/adapter/github/github-client.ts`）は既存の `request()` ミドルウェア（retry / rate-limit / 401 ハンドリング）経由で `POST /repos/{owner}/{repo}/issues/{issueNumber}/comments` を呼ぶ。シグネチャは owner / repo / issueNumber / body の語彙のみで forge 固有概念（label / reaction 等）を port に持ち込まない。返り値の comment id / url は将来 inbound が「基準点判定・bot 自身のコメント識別」に使える。

required にすることで port は完全実装を契約とする。optional は orchestrator 側に存在判定の分岐が漏れる anti-pattern であるため選択しない。全テストダブルの型破壊は機械的に `createIssueComment` デフォルト mock を追加することで修復する（`verifyFindingRefs` 追加と同パターン）。

### D3: `JobState` に `issueNumber?: number | null` を追加する（optional、後方互換）

`src/state/schema.ts` の `JobState` に `issueNumber?: number | null` を追加する。設定経路は `PipelineRunCommand.prepare()` で `bootstrapJob` の後に `noWorktree` と同じく `if (this.options.issue !== undefined) jobState.issueNumber = this.options.issue` をセットする。

`validateJobState` は末尾で `return raw as JobState` して未知フィールドを pass-through するため、load 時に `issueNumber` が保持される。optional フィールドのため追加の必須検証は不要だが、present 時に「正の整数」であることの軽量検証を加えて不正値混入を早期検出する。resume は永続化済みの `issueNumber` を load して読むため、resume 側に flag を追加する必要はない。

### D4: `--issue` フラグは不正値を引数エラーで弾く

`job start`（alias `run`）の `flags` に `issue: { type: "string" }` を追加し、handler で `Number(value)` を取り `Number.isInteger(n) && n > 0` を確認する。`parseInt` でなく `Number` を使うことで trailing garbage（`"42abc"`）を NaN として拒否する。条件を満たさなければ `logError` + `EXIT_CODE.ARG_ERROR`(2) で終了する。

`merge-wait-ms` の silent-ignore とは方針を変える。ユーザーは通知を期待して `--issue` を付けるため、黙って無効化されると期待を裏切る事故になる。

### D5: 通知本体は純粋 body builder と best-effort orchestrator に分離する（`src/core/notify/`）

新規 `src/core/notify/issue-notifier.ts` を設ける。

```ts
// 機械可読マーカー（D6）
export function buildMarker(kind: "escalation" | "completed", jobId: string): string;

// 純粋: marker + 停止 step + reason + 再開手順
export function buildEscalationComment(state: JobState): string;

// 純粋: marker + PR URL + archive 手順
export function buildCompletionComment(state: JobState): string;

// best-effort orchestrator（GitHub API 呼び出しのみ、throw しない）
export async function notifyJobTerminal(
  state: JobState,
  ctx: { githubClient: GitHubClient; owner: string; repo: string },
): Promise<void>;
```

body 生成を純粋関数に切り出すことで、マーカー含有・理由含有・PR URL 含有をネットワーク mock なしでユニットテストできる。orchestrator は I/O と best-effort 制御だけを持つ。DSM 適合: `src/core/notify`（domain）→ `core/port`（GitHubClient）/ `state` / `logger` のみ import。runtime 分岐なし（B-8 適合）。

### D6: 機械可読マーカーの形式を SSOT 化する

コメント先頭に HTML コメントのマーカーを埋め込む。

```
<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->
```

- `kind` ∈ `escalation` | `completed`
- `jobId` は `state.jobId`（システム生成 UUID、`-->` を含まない）
- `version` は前方互換のための schema 版（初版 `1`）

`buildMarker(kind, jobId)` を SSOT とし、両 builder がこれを使う。`buildMarker` は先頭で `if (jobId.includes("-->")) throw new Error(...)` を持ち、HTML コメント途中閉じを防ぐ安価な guard を置く。将来の inbound parser はコメント先頭行のマーカーのみ認識する設計とし、本文中の craft されたマーカー行を誤解釈しない。

### D7: 通知失敗は warn のみ、job の最終状態・exit code に影響させない

`notifyJobTerminal` 内の `try-catch` が `createIssueComment` の全例外を握り、`logWarn` のみ出す。`JobState.status` は変更しない（B-9 準拠）。exit code は `handleResult` が `finalState.status` から決めるため、通知の成否は exit code に影響しない。

通知は状態遷移・永続化が済んだ後の収束点で走るため、通知が throw しない限り後段に副作用はない。adapter の `request()` は 5xx / rate-limit の retry を内包するため、notifier 層での追加 retry は行わない。

## Alternatives Considered

### Alternative 1: D1 — 各 `transitionJob` 呼び出し直後に個別通知

- **Pros**: 状態遷移と通知が同じ場所にある
- **Cons**: 3+ 箇所に散在し、新 escalation 経路追加のたびに配線追加が必要。DRY 違反
- **Why not**: 却下

### Alternative 2: D1 — `EventBus` subscriber で通知

- **Pros**: pipeline コードに通知ロジックが入らない
- **Cons**: `emit` は同期 fire-and-forget（`void` 返却、handler の async を await しない）。network I/O の完了保証が設計上崩れる
- **Why not**: 却下

### Alternative 3: D1 — `transitionJob`（`src/state/lifecycle.ts`）に内蔵

- **Pros**: 遷移と通知が同一箇所
- **Cons**: 純粋関数かつ shared-kernel 層で port / network を import できない（DSM 違反）
- **Why not**: 却下

### Alternative 4: D2 — optional method（`createIssueComment?`）にして既存テストダブルを壊さない

- **Pros**: 全テストダブルの修正が不要
- **Cons**: port は完全実装が契約。optional は orchestrator 側に存在判定の分岐が漏れる anti-pattern
- **Why not**: 却下（機械的修復で対処）

### Alternative 5: D2 — issue 専用の新 port を別に切る

- **Pros**: `GitHubClient` port の責務を分割できる
- **Cons**: host / token 束縛・retry ミドルウェアを再利用できなくなる。要件が「GitHubClient port の拡張」を明示
- **Why not**: 却下

### Alternative 6: D3 — `issue?: { number: number }` のネスト構造

- **Pros**: 将来 issue メタ情報が増えた際に拡張しやすい
- **Cons**: 現状 number 1 つで足り、フラットな方が読み書きが単純。YAGNI
- **Why not**: 却下（拡張時に widen する）

### Alternative 7: D5 — orchestrator に builder を内包して 1 関数にする

- **Pros**: ファイルが 1 つで済む
- **Cons**: I/O のない body 生成のテストに network mock が必要になり、テストの粒度が落ちる
- **Why not**: 却下

### Alternative 8: D6 — JSON を HTML コメントに入れる

- **Pros**: 構造化データを機械的に parse しやすい
- **Cons**: 人間が raw を見たときの可読性が落ちる。属性形式で必要十分
- **Why not**: 却下

### Alternative 9: D6 — マーカーをコメント末尾に置く

- **Pros**: 人間への本文が先に読める
- **Cons**: 先頭固定の方が将来の前方一致 parse が単純
- **Why not**: 却下

## Consequences

### Positive

- pipeline terminal 遷移が GitHub issue コメントとして外部通知され、無人実行の停止を人間が検知できる
- マーカー（D6）が将来の inbound 輸送路（`/resume` 走査・bot コメント識別）の布石として確定する
- 通知失敗が job の成否から切り離され（D7）、観測の失敗が観測対象を壊さない
- `src/core/notify/` の純粋 builder によりコメント本文のユニットテストが容易

### Negative / Known Debt

- required メソッド追加により全 `GitHubClient` テストダブルの型が壊れる（機械的修復で対処済み）
- `run()` catch（unhandled-error safety net）と `beforeExit` invariant 経由の escalation は収束点を通らず未通知（稀な経路。terminal stdout からは観測可能）
- escalation → resume → 再 escalation のサイクルで同一 issue にコメントが複数付く（マーカー jobId による将来の dedup で対処可能）
- `state.pullRequest` が何らかの理由で未記録のまま `awaiting-archive` に到達した場合、完了コメントは PR URL を省略して出力（graceful degrade）

## References

- Request: `specrunner/changes/issue-notification/request.md`
- Design: `specrunner/changes/issue-notification/design.md`
- Related: `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`
