# Design: job を GitHub issue に紐付け、escalation / 完走を issue コメントで通知する

## Context

pipeline の escalation（`awaiting-resume`）と完走（`awaiting-archive`）は現状 terminal 出力でしか
観測できず、無人実行では停止に誰も気付けない。job を起点 issue に紐付け、状態変化を issue コメントとして
書き戻すことで、GitHub 本体の通知設定（メール / モバイル / Slack 連携）をそのまま人間への push 経路に
できる。本 request は外向き（通知）輸送路のみを対象とし、内向き（発火）は別 request に分離する。

現状コードの主要な制約:

- `GitHubClient` port（`src/kernel/github-client.ts`、`src/core/port/github-client.ts` が re-export）の
  現メソッドは branch / PR / check / raw file 系のみで、issue 操作の API は存在しない
- `JobState`（`src/state/schema.ts`）に issue 番号のフィールドは存在しない
- 完走 / escalation の状態遷移は `pipeline.ts` の `runInternal` 内で起き、すべて `while` ループの
  `break` → 末尾 `return state` に収束する。具体的には 3 経路がある:
  1. `nextStep === "end"` → `transitionJob(state, "awaiting-archive", ...)`（`pipeline.ts:277-287`、
     直後に `commitFinalState` を実行し PR 情報は `state.pullRequest` に記録済み）
  2. `nextStep === "escalate"` → `transitionJob(state, "awaiting-resume", ...)`（`pipeline.ts:289-304`、
     `resumePoint` に step / reason / iterationsExhausted を記録）
  3. loop 上限到達 → `handleExhausted` → `transitionJob(state, "awaiting-resume", ...)`
     （`pipeline.ts:473-529`、同じく `resumePoint` を記録）
- pipeline state machine は local / managed の両 runtime で CLI プロセス内で実行される
  （runtime が抽象化するのは agent 実行のみ）。よって pipeline 内に置いた通知処理は両 runtime で
  自動的に CLI プロセスから走る
- architecture/model.md の DSM 閉包: domain（`src/core/` 除 runtime/・port/）は ports / persistence /
  shared-kernel / leaf のみ import 可。adapter 直接 import は不可。`JobState.status` の変更は
  `transitionJob` 経由のみ（B-9）。stdout/stderr は logger seam 経由（B-7）

## Goals / Non-Goals

**Goals**:

- `job start`（alias `run`）に `--issue <number>` を追加し、`JobState` に issue 番号を永続化する
- `GitHubClient` port に forge 中立な issue コメント作成メソッドを追加する
- `awaiting-resume` 遷移時に「停止 step・理由・再開手順」を含むコメントを issue に書く
- `awaiting-archive` 遷移時に PR URL を含む完了コメントを issue に書く
- コメントに種別（escalation / completed）と jobId の機械可読マーカーを埋め込む
- 通知を best-effort とし、失敗が job の最終状態・exit code に影響しないようにする
- 通知を local / managed 両 runtime で CLI プロセスから行う（agent には書かせない）

**Non-Goals**:

- 内向き輸送路（承認ラベル走査・`/resume` コメントによる再開・inbox one-shot コマンド）
- issue の自動作成（issue なし job への接ぎ木）
- Slack / 汎用 webhook / メールへの直接通知
- archive / merge-guard 段階の通知
- GitLab 等他 forge の adapter
- マーカーを読み取る inbound parser の実装（マーカー format の SSOT 化のみ行い、parse は別 request）
- `run()` catch（unhandled-error safety net）/ `beforeExit` invariant 経由の escalation への通知
  （収束点を通らない稀な経路。Risks に記載）

## Decisions

### D1: 通知の発火点は `runInternal` の terminal 収束点（単一 choke point）

`pipeline.ts` の `runInternal` 末尾、`while` ループを抜けた直後の `return state` の手前に
`await notifyJobTerminal(state, deps)` を 1 箇所だけ置く。

```ts
}  // end while
await notifyJobTerminal(state, deps);  // best-effort、status を見て種別判定
return state;
```

完走（経路1）・escalate-terminal（経路2）・loop 上限 escalation（経路3）はすべて
`break` → 末尾 `return state` に収束するため、この 1 箇所で 3 経路すべての遷移を捕捉できる。
`notifyJobTerminal` は `state.status` を見て `awaiting-archive` → completed、`awaiting-resume` →
escalation に振り分け、それ以外（`running` 残存 / `failed` 等）は何もしない。

**Rationale**: 遷移サイトは 3 箇所に散在するが収束点は 1 点。通知呼び出しを収束点に集約することで
DRY を保ち、将来 escalation 経路が増えても収束点が変わらない限り通知配線は不変。pipeline は両
runtime で CLI プロセス内実行のため、この hook は要件 7（CLI プロセスから通知）を自動的に満たす。
完走経路では `commitFinalState` の後に収束するため `state.pullRequest` は確定済みで参照できる。

**Alternatives considered**:
- 各 `transitionJob` 呼び出し直後に個別通知 → 3+ 箇所に散在し、新 escalation 経路追加のたびに
  配線追加が必要。DRY 違反のため却下。
- `EventBus` の `pipeline:complete` / `pipeline:fail` subscriber で通知 → `emit` は同期 fire-and-forget
  （`void` 返却、handler の async を await しない）。network I/O を伴う通知の完了保証が設計上崩れるため却下。
- `transitionJob`（`src/state/lifecycle.ts`）に通知を内蔵 → 純粋関数かつ shared-kernel 層で、port や
  network を import できない（DSM 違反）。却下。

### D2: `GitHubClient` port に `createIssueComment` を追加する（required, forge 中立）

`src/kernel/github-client.ts` の `GitHubClient` interface に以下を追加する。

```ts
/**
 * Create a comment on an issue.
 * Forge-neutral semantics: owner / repo / issueNumber / body のみ。
 * Returns the created comment's id and url.
 */
createIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ id: number; url: string }>;
```

adapter（`src/adapter/github/github-client.ts`）は既存の共有 `request()` ミドルウェア経由で
`POST /repos/{owner}/{repo}/issues/{issueNumber}/comments`（body `{ body }`）を呼ぶ。201 を期待し、
それ以外は `githubApiError`、401 は `request()` が `githubTokenExpiredError` を throw する。
レスポンスの `id` と `html_url` を返す。`createPullRequest`（POST / 201 / JSON body）と同じ実装形。

**Rationale**: 要件 2。owner / repo / issueNumber / body の語彙のみで forge 固有概念（label /
reaction 等）を port に持ち込まない。返り値の comment id / url は将来 inbound が「基準点」「自身の
コメント識別」に使える。port メソッドは adapter が完全実装する契約のため required にする。

**Alternatives considered**:
- optional method（`createIssueComment?`）にして既存テストダブル破壊を避ける案 → port は完全実装が
  契約。optional は anti-pattern で、orchestrator 側に存在判定の分岐が漏れる。却下（破壊は T-07 で
  機械的に修復する。judge-verdict change の `verifyFindingRefs` 追加と同パターン）。
- issue 専用の新 port を別に切る案 → 要件 2 が「GitHubClient port の拡張」を明示。既存の host/token
  束縛・retry ミドルウェアを再利用できる利点も失うため却下。

### D3: `JobState` に `issueNumber` フィールドを追加する（optional, backward compat）

`src/state/schema.ts` の `JobState` に `issueNumber?: number | null` を追加する。

- 設定経路: `PipelineRunCommand.prepare()`（`src/core/command/pipeline-run.ts`）で `bootstrapJob` の後に
  `noWorktree` と同じく `if (this.options.issue !== undefined) jobState.issueNumber = this.options.issue`
  をセットする。この `jobState` が `workspaceOpts.bootstrapState` と `PrepareResult.jobState` の双方に
  渡るため、永続化（seed）と in-memory pipeline の両方に反映される。
- 永続化 / 復元: `setupWorkspace` が `bootstrapState` を slug store に seed し `state.json` に書く。
  `validateJobState` は末尾で `return raw as JobState` し未知フィールドを pass-through するため、
  load 時に `issueNumber` が保持される。optional フィールドのため追加の必須検証は不要だが、present
  時に「正の整数」であることの軽量検証を任意で加える（不正値混入時の早期検出）。
- 未指定 job: `issueNumber` は `undefined` のまま → 通知ロジックが即 return し挙動不変。
- resume: 永続化済みの `issueNumber` を load して読むため、resume 側に flag を足す必要はない。

**Rationale**: 要件 1 / 受け入れ基準「永続化・復元で保持される」。`noWorktree` の既存配線をそのまま
踏襲することで新しい seam を作らずに済む。

**Alternatives considered**:
- `issue?: { number: number }` のネスト構造 → 現状 number 1 つで足り、フラットな方が読み書きが単純。
  将来 issue メタを増やす必要が出た時点で widen する。却下（YAGNI）。
- `bootstrapJob` のシグネチャに issue を足す案 → `RuntimeStrategy` interface（port）と local/managed
  両実装の変更を誘発する。post-bootstrap セットで足りるため却下。

### D4: `--issue` フラグの CLI 配線

- `src/cli/command-registry.ts` の `run`（alias）と `job start` の `flags` に
  `issue: { type: "string" }` を追加し、両 handler で number へ parse する。
- parse + 検証: `Number(value)` を取り `Number.isInteger(n) && n > 0` を確認する（`parseInt` でなく
  `Number` を使うことで trailing garbage `"42abc"` を NaN として拒否する）。
  条件を満たさなければ `logError` + `EXIT_CODE.ARG_ERROR`(2) で終了（silent ignore しない＝通知期待を裏切らない）。
  `merge-wait-ms` の silent-ignore とは方針を変える。
- 伝播: `runRun` / `runRunCore`（`src/cli/run.ts`）の options に `issue?: number` を追加し、
  `PipelineRunCommand` の `PipelineRunOptions` まで渡す。
- `USAGE` の `job start` 行に `--issue <number>` を追記する。

**Rationale**: 要件 1。`run` と `job start` は同じ `runRun` を呼ぶため、配線は options に 1 フィールド
追加するだけで両入口に効く。

**Alternatives considered**:
- 不正値を silent ignore（`merge-wait-ms` 流儀）→ ユーザーは通知を期待して `--issue` を付けるため、
  黙って無効化されるのは事故。明示エラーにする。

### D5: 通知本体は純粋 body builder + 薄い best-effort orchestrator に分離する

新規 `src/core/notify/issue-notifier.ts`:

```ts
import type { GitHubClient } from "../port/github-client.js";
import type { JobState } from "../../state/schema.js";

// 通知に必要な最小依存（PipelineDeps が構造的に満たす）
interface NotifyCtx { githubClient: GitHubClient; owner: string; repo: string; }

// 機械可読マーカー（D6）
export function buildMarker(kind: "escalation" | "completed", jobId: string): string;

// 純粋: marker + 停止 step + reason(resumePoint) + 再開手順
export function buildEscalationComment(state: JobState): string;

// 純粋: marker + PR URL + archive 手順
export function buildCompletionComment(state: JobState): string;

// best-effort orchestrator
export async function notifyJobTerminal(state: JobState, ctx: NotifyCtx): Promise<void>;
```

`notifyJobTerminal` の手順:

1. `state.issueNumber` が未設定（undefined / null）→ **即 return（GitHub API を一切呼ばない）**
2. `state.status` で種別判定: `awaiting-resume` → escalation / `awaiting-archive` → completed /
   それ以外 → return
3. 対応する builder で body 生成
4. `try { await ctx.githubClient.createIssueComment(ctx.owner, ctx.repo, state.issueNumber, body) }
   catch (err) { logWarn(...) }` — 失敗は warn のみ

`pipeline.ts` は `notifyJobTerminal(state, deps)` を呼ぶ（`deps` は `githubClient` / `owner` / `repo` を
持ち `NotifyCtx` を構造的に満たす）。

**Rationale**: body 生成を純粋関数に切り出すことで marker / 本文 / 種別判定をユニットテストでき、
受け入れ基準（マーカー含有・理由含有・PR URL 含有）を直接検証できる。orchestrator は I/O と
best-effort 制御だけを持つ。DSM: `src/core/notify`（domain）→ `core/port`（GitHubClient）/ `state` /
`logger` のみ import で適合。runtime 分岐なし（B-8 適合）。`logWarn`（logger seam）経由で B-7 適合。

**Alternatives considered**:
- orchestrator に builder を内包し 1 関数にする案 → I/O のない body 生成のテストに network mock が
  必要になり、テストの粒度が落ちる。分離する。

### D6: 機械可読マーカーの形式を SSOT 化する

コメント先頭に HTML コメントのマーカーを埋め込む。

```
<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->
```

- `kind` ∈ `escalation` | `completed`
- `jobId` は `state.jobId`
- `version` は前方互換のための schema 版（初版 `1`）

`buildMarker(kind, jobId)` を SSOT とし、両 builder がこれを使う。inbound parser は本 request 対象外
だが、format をコード上の単一定数 / builder に集約し、将来の parse 実装が同じ定義を参照できるようにする。

**jobId の制約と guard**: `jobId` に `-->` を含む文字列を渡すと HTML コメントが途中で閉じ、マーカーテキストが
レンダリング本文に漏れる。jobId はシステム生成（UUID 形式）のためこの文字列は含まれないが、
`buildMarker` の JSDoc に「`jobId` は `-->` を含んではならない」と明記し、先頭で
`if (jobId.includes("-->")) throw new Error(...)` の安価な guard を置く。

**inbound parser の信頼境界**: マーカー行より下の本文（停止理由・コマンド文字列等）は機械 parse の
対象として信頼しない。将来の inbound parser はコメント先頭行のマーカーのみ認識する設計とする。
本文に craft された `<!-- specrunner:... -->` が含まれても先頭行以外は無視することで、
agent 出力由来の reason 等が誤ってマーカーとして解釈されるリスクを排除する。

**Rationale**: 要件 5。HTML コメントは GitHub のレンダリングに現れず、`kind` と `jobId` を埋めることで
将来 inbound が author 名に依存せず「bot 自身のコメント識別」「`/resume` 走査の基準点判定」を成立させる
布石になる。`version` で format 変更時の互換を確保する。

**Alternatives considered**:
- JSON を `<!-- ... -->` に入れる案 → 人間が raw を見たときの可読性が落ちる。属性形式で十分。
- マーカーをコメント末尾に置く案 → 先頭固定の方が将来の前方一致 parse が単純。

### D7: best-effort 失敗隔離（通知は観測手段であり観測対象を壊さない）

`notifyJobTerminal` は内部の `try-catch` で `createIssueComment` の全例外（network / 権限 / issue
クローズ済み / 401 等）を握り、`logWarn` のみ出す。`JobState.status` は変更せず（B-9 抵触なし）、
例外を再 throw しない。exit code は `handleResult`（`runner.ts`）が `finalState.status` から決めるため、
通知の成否は exit code に影響しない。

**Rationale**: 要件 6 / architect 判断「通知を job の成否から切り離す。観測の失敗が観測対象を壊しては
ならない」。通知は収束点で状態遷移・永続化が済んだ後に走るため、通知が throw しない限り後段に副作用
はない。

**Alternatives considered**:
- 失敗時に retry を重ねる案 → adapter の `request()` が既に 5xx / rate-limit の retry を内包する。
  notifier 層での追加 retry は scope 過剰。1 回試行 + warn に留める。

## Risks / Trade-offs

- **[全 `GitHubClient` テストダブルの型破壊]** required メソッド追加により、`GitHubClient` を full
  literal で構築する全テスト（`grep` で約 40 ファイル）が typecheck で落ちる → Mitigation: T-07 で
  `grep -rln "listPullRequestFiles" tests/` 等で全 full-literal を洗い出し `createIssueComment` の
  デフォルト mock を追加する（judge-verdict change の `verifyFindingRefs` 追加と同じ機械的修復）。
  将来の追従コスト低減のため shared fake helper 化は推奨に留める（本 request では scope 外）。
- **[safety net / beforeExit 経由の escalation は未通知]** `run()` catch（unhandled-error）と
  `beforeExit` invariant は収束点を通らず通知されない → Mitigation: いずれも稀な経路で terminal
  stdout からは観測可能。将来 inbound が状態を reconcile できる。本 request では Non-Goal とする。
- **[resume 都度の重複コメント]** escalation→resume→再 escalation で同 issue にコメントが複数付く
  → Mitigation: マーカーに jobId を含めるため将来 inbound で dedup 可能。v1 は各遷移を記録する挙動を
  許容する。
- **[完走したが PR URL 未記録]** 何らかの理由で `state.pullRequest` が無いまま `awaiting-archive` に
  到達した場合 → Mitigation: `buildCompletionComment` は PR URL 不在を graceful degrade（URL 行を
  省略 or 「(PR URL 不明)」と注記）し、通知自体は出す。
- **[issue 番号の取り違え]** ユーザーが他リポジトリの issue 番号を渡す等の誤用 → Mitigation: number
  検証（正の整数）のみ行い、issue の実在検証は best-effort（書き込み失敗は warn）に委ねる。実在検証の
  追加は API コスト増のため行わない。

## Open Questions

- `issueNumber` の検証粒度: 「正の整数」までを CLI 境界で検証する。上限値や issue 実在性は検証しない。
  この粒度で受け入れ基準を満たすか。
- マーカーの `version` 運用: inbound 実装時に version gating を行うか、現状は記録のみで十分か。
- safety net / beforeExit 経路の escalation 通知を将来含めるべきか（収束点単一の単純さと、全 escalation
  網羅性のトレードオフ）。
