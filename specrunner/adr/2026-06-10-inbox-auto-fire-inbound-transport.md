# issue を起点に job を自動発火する内向き輸送路（承認ラベル起動 + /resume 再開）

**Date**: 2026-06-10
**Status**: accepted
**Related**: `specrunner/adr/2026-06-10-issue-notification-outbound-transport.md`（外向き輸送路・マーカー仕様の上位決定）

## Context

job の起動（`job start`）と escalation からの再開（`job resume`）は terminal での手動操作のみで、無人運用ができない。外向き輸送路（issue-notification）が整い、escalation / 完走が GitHub issue コメントとして書き出されるようになったため、内向き輸送路を追加する。

内向き輸送路には 2 つの経路がある:

- **新規起動**: open かつ承認ラベル付きの issue を detect し、issue 本文を request.md として検証・起動する
- **再開**: `awaiting-resume` の job の紐付け issue に `/resume` コメントがあれば job を resume する

設計上の主な選択肢は (a) 常駐 watch プロセスを立てる、(b) one-shot コマンド + 外部起動装置、(c) CLI 内に発火ループを組み込む、の 3 択であった。

変更前の主要な制約:

- `GitHubClient` port（`src/kernel/github-client.ts`）に issue 一覧・コメント一覧のメソッドがない
- 「プロセスに state を持たせない」が CLI 設計の核心原則（`specrunner/adr/2026-05-26-process-lifecycle-keepalive.md` 等）
- 既存 run 経路 `runRunCore` / resume 経路 `runResumeCore` が preflight → bootstrap → pipeline の一連を担っており再実装は重複

## Decision

### D1: 発火判定を「純粋な plan 関数 + 薄い effect 実行」に分離する

inbox run の中核を、副作用のない計画関数 `planInbox(input) → InboxPlan` と、計画を既存実行経路へ流す orchestrator に分ける。

```ts
interface IssueRef     { number: number; title: string; body: string }
interface IssueComment { id: number; body: string; authorAssociation: string; createdAt: string }

interface StartAction  { issueNumber: number; slug: string; requestBody: string }
interface RejectAction { issueNumber: number; reason: string }
interface ResumeAction { jobId: string; slug: string; issueNumber: number; resumePrompt: string | null }
interface InboxPlan    { starts: StartAction[]; rejects: RejectAction[]; resumes: ResumeAction[] }
```

planner の入力は決定的なデータのみ（承認ラベル付き issue 一覧・全 job state・コメント一覧・config 値）。issue 本文の validate・cutoff 比較・権限チェック・resumePrompt 抽出をすべて planner 内の純関数で行い、orchestrator は I/O 収集と effect dispatch だけを持つ。

**Rationale**: 受け入れ基準はすべて「GitHubClient mock + 注入した job state での planner / orchestrator 検証」で観測可能になる。実際の pipeline 起動（長時間・非決定的）を seam の背後に隠すことで、発火ロジックを純関数として網羅テストできる。「agent には semantic content のみ、判定は決定的」という project 原則とも一致する。

**Alternatives considered**: (a) CLI ハンドラに判定と起動を直書き — 純関数 seam がなく pipeline を起動しないと発火条件をテストできない。却下。(b) 発火判定に LLM を使う — トリガー経路に非決定性を持ち込む。却下。

### D2: one-shot コマンド + 外部起動装置の構成にする（常駐プロセスなし）

`specrunner inbox run` は 1 回の走査と発火を行って終了する。常駐しない。コマンド自身は状態ファイルを持たない。起動装置（cron / launchd / GitHub Actions）は CLI の外に置く。

**Rationale**: 「プロセスに state を持たせない」原則の発火層への適用。冪等性を job state のみで閉じることで、消費位置管理・クラッシュリカバリ・多重起動の問題を構造的に消す。依存極小 North Star とも一致し、常駐デーモン管理の複雑さを持ち込まない。

**Alternatives considered**: 常駐 watch モード — プロセス lifecycle 管理・クラッシュリカバリ・ポート管理が必要で複雑化。却下。

### D3: start は「状態（ラベル）」、resume は「内容つきイベント（コメント）」という非対称を採る

- start: open かつ承認ラベル付きで、どの job にも紐付いていない issue。
- resume: `awaiting-resume` かつ issue 紐付けあり の job について、紐付け issue に「最新 escalation マーカーより新しい collaborator 以上の `/resume` コメント」が存在する。

媒体を揃えない。承認は GitHub の triage 権限ゲートに乗る 1 bit の意思表示で十分。escalation への回答は人間の指示文を運ぶ必要があり、ラベルでは表現できない。

**Alternatives considered**: 両方をコメントコマンド（`/start` + `/resume`）に揃える案 — start の承認を GitHub の権限モデルに乗せられず、コメントパーサに権限判定を追加で背負わせる。却下。

### D4: 冪等性を job state だけで閉じる（消費位置管理を持たない）

- **start の冪等性**: `JobStateStore.list()` 全件を走査し、`issueNumber` が一致する job が 1 件でも存在すれば起動しない（status を問わない）。
- **resume の冪等性**: 発火条件は `status === "awaiting-resume"` かつ「最新 escalation マーカーより新しい qualifying `/resume` コメントの存在」。resume 実行後 job は `running` に遷移するため後続 inbox run は no-op になる。再 escalation 時は新しい escalation マーカーが追記されるため、古い `/resume` コメントは cutoff より古くなり再発火しない。

「処理済みコメント id の記録」「消費オフセット」「クラッシュリカバリ用カーソル」は一切不要になる。

**Alternatives considered**: 処理済みコメント id を sidecar に記録する案 — inbox run が状態ファイルを持つことになり要件に反する。却下。

### D5: 権限境界とマーカーによる bot 自己コメント除外

`/resume` コメントは以下をすべて満たすもののみ採用する:

1. **権限**: `authorAssociation ∈ { OWNER, MEMBER, COLLABORATOR }`
2. **bot 除外**: 本文が通知マーカー接頭辞 `<!-- specrunner:notification` を含む場合は除外する
3. **形**: 先頭トークンが `/resume`

bot 判定は GitHub actor type ではなくマーカー接頭辞で行う。トークンの所有者によって actor type が変わるため、自分が書いたコメントを構造的に識別できるマーカーの方が堅牢。escalation マーカーコメント自体も bot コメントとして自然に除外される（cutoff 基準と bot 除外が同じマーカー族で統一される）。

resumePrompt のパース規則: 先頭の `/resume` トークンを取り除いた残り全体（改行を含む）を trim した文字列。空なら `null`。

**Alternatives considered**: actor `type === "Bot"` で除外する案 — PAT / OAuth / GitHub App でトークン主体が変わり判定が安定しない。却下。

### D6: `GitHubClient` port に forge 中立な意味論で 2 メソッドを追加する

```ts
listIssuesByLabel(
  owner: string, repo: string, label: string,
): Promise<Array<{ number: number; title: string; body: string }>>;

listIssueComments(
  owner: string, repo: string, issueNumber: number,
): Promise<Array<{
  id: number; body: string; authorAssociation: string; createdAt: string;
}>>;
```

adapter は `GET /repos/{owner}/{repo}/issues?labels={label}&state=open` の全ページを走査し、`pull_request` フィールドを持つエントリ（PR）を除外して返す。`listIssueComments` は `GET /repos/{owner}/{repo}/issues/{issueNumber}/comments` の全ページを返す。forge 固有概念（reaction / label 操作 等）は port に持ち込まない。

**Alternatives considered**: issue 専用の新 port を別に切る案 — host / token 束縛・retry ミドルウェアを再利用できなくなる。却下。

### D7: config に `inbox` セクションを追加する

| key | 型 | 既定 | 用途 |
|-----|----|------|------|
| `inbox.approveLabel` | string | `"specrunner-approved"` | 新規起動の承認ラベル名 |
| `inbox.maxStartsPerRun` | number（>= 0 の整数） | `3` | 1 回の inbox run で新規起動する job 数の上限（暴走・コスト防御） |

`maxStartsPerRun: 0` は「新規起動を行わない（resume のみ）」を意味する。既存 config の deep merge / 部分上書きにそのまま乗る。

**Alternatives considered**: env var で渡す案 — team 共有可能な project local config に乗せたい運用に合わない。却下。

### D8: CLI 面 — `inbox` 親コマンド + `run` サブコマンド、worktree guard 付き

`inbox` を親コマンド（subcommands: `run`）として登録する。`run` は job 起動で worktree を作るため `guardedSubcommands: new Set(["run"])` に入れ、main worktree からのみ実行可能にする。

flags: `--dry-run`（計画のみ表示し発火しない）、`--limit <n>`（`maxStartsPerRun` の一時上書き）、`--json`、`--verbose` / `--quiet`。

**Rationale**: 既存 `job` 親コマンドと同じ guard 機構を再利用。`--dry-run` は安全な観測手段かつ planner の純粋性を活かしたテスト経路になる。

**Alternatives considered**: top-level `inbox-run` 単一コマンド — 将来の `inbox` 配下拡張を見越し親子構成にする。

## Alternatives Considered

### Alternative 1: 常駐 watch プロセス

- **Pros**: イベント駆動で低遅延
- **Cons**: プロセス lifecycle 管理・クラッシュリカバリが必要、「プロセスに state を持たせない」原則に反する
- **Why not**: 却下

### Alternative 2: 発火ループを CLI 内に組み込む（`--interval` オプション）

- **Pros**: 外部 cron 設定が不要
- **Cons**: sleep するプロセスが state を持つことになる。D2 と同じ問題
- **Why not**: 却下

### Alternative 3: 両方の発火条件をコメントコマンドに揃える

- **Pros**: 対称的な設計
- **Cons**: 承認という 1 bit の意思表示に GitHub 権限モデルを利用できなくなる
- **Why not**: 却下（D3）

### Alternative 4: 新規起動を detached subprocess で spawn して即 return する

- **Pros**: inbox run が即座に return し、pipeline が非同期でバックグラウンド実行される
- **Cons**: spawn から最初の state persist までの間に冪等性レース（複数 inbox run が同じ未紐付け issue を二重起動）が開く。子プロセスの log 収集・終了コード管理・クラッシュ検知が追加で必要になり複雑化する
- **Why not**: 冪等性の窓を構造的に解消できない。inline await（D2 採用案）なら persist が pipeline 本体より前で完了するため窓が最小化される。却下

## Consequences

### Positive

- `specrunner inbox run` を cron / launchd / GitHub Actions から呼ぶだけで無人運用が実現する
- planner が純関数のため、発火ロジックを実際の pipeline 起動なしに網羅テストできる
- 冪等性を job state のみで閉じ、消費位置管理・クラッシュリカバリ用の状態ファイルを持たない
- `--dry-run` フラグにより、副作用なしで「何が起動されるか」を事前確認できる
- 外向き輸送路のマーカー仕様（issue-notification ADR）を cutoff 基準と bot 除外に再利用し、設計の一貫性を保つ

### Negative / Known Debt

- inline await（D2）のため 1 回の inbox run は起動した pipeline の合計時間ぶんブロックする。起動上限と起動装置の cadence で制御する
- 同時 inbox run の二重起動は起動装置側（cron 間隔 / GitHub Actions `concurrency` group）で抑止する必要がある。inbox run 自身は排他ロックを持たない
- escalation 通知の取りこぼしがあった場合（best-effort の失敗）、inbox からの resume ができない。CLI からの手動 resume にフォールバック
- issues エンドポイントが PR を含む点は adapter で除外するが、将来 GitHub が API 仕様を変えた場合は adapter の更新が必要

## References

- Request: `specrunner/changes/inbox-auto-fire/request.md`
- Design: `specrunner/changes/inbox-auto-fire/design.md`
- Related: `specrunner/adr/2026-06-10-issue-notification-outbound-transport.md`
