# Design: issue を起点に job を自動発火する one-shot コマンド

## Context

job の起動（`job start`）と escalation からの再開（`job resume`）は現状すべて terminal での手動操作であり、無人運用ができない。

依存 request（issue-notification）により、外向きの輸送路はすでに整っている。確認できる既存資産:

- `JobState.issueNumber?: number | null`（`src/state/schema.ts`）— job と issue の紐付けフィールド。`job start --issue <n>` / `run --issue <n>` で設定される（`src/core/command/pipeline-run.ts:86-88`、`src/cli/run.ts`）。
- terminal 遷移時に紐付け issue へコメントする `notifyJobTerminal`（`src/core/notify/issue-notifier.ts`）。escalation コメントは機械可読マーカー `<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->` を含む（`buildMarker`）。
- `GitHubClient.createIssueComment(owner, repo, issueNumber, body)`（`src/kernel/github-client.ts`）。
- `JobStateStore.list(repoRoot)` が全 job state を列挙する（`src/store/job-state-store.ts`）。`getJobSlug(state)` で slug を導出（`src/state/job-slug.ts`）。
- PID liveness による多重起動検出（`isStaleRunning` / `src/core/resume/safety.ts`）。
- `job resume` は resumePrompt（再開時に agent へ渡す人間の指示）の受け口を持つ（`ResumeCommand` の `resumePrompt`、CLI flag `--prompt`）。CLI は `--prompt` を「agent prompt に直接注入される外部入力」として警告表示する（`src/cli/command-registry.ts:433`）。
- 既存 job 起動経路 `runRunCore(requestMdPath, { issue })`（`src/cli/run.ts`）と再開経路 `runResumeCore(slug, { prompt })`（`src/cli/resume.ts`）。
- request.md の検証は `parseRequestMdContent(content, path)`（`src/parser/request-md.ts`）。エラー時 `REQUEST_MD_INVALID` を throw、slug は Meta セクションから抽出される。
- config は user global + project local の deep merge（`src/config/schema.ts` / `loadConfig`）。zod/v4-mini による構造検証 + semantic check の 2 層。

本 request は内向きの輸送路を追加する: 承認ラベル付き issue からの新規起動と、`/resume` コメントによる再開。発火判定を冪等な one-shot コマンド `specrunner inbox run` に集約し、起動装置（cron / launchd / GitHub Actions）は CLI の外に置く。

## Goals / Non-Goals

**Goals**:

- `specrunner inbox run` を追加する。1 回の走査と発火で終了し、常駐しない。自身の状態ファイルを持たない。
- 承認ラベル付き・未紐付け issue から job を起動する。issue 本文を request.md として検証し、合格は起動、不合格はコメントで差し戻す。
- `awaiting-resume` の job を `/resume` コメントで再開する。コメント本文を resumePrompt として渡す。
- 冪等性を job state（紐付けの有無・status・escalation マーカーの時刻）だけで閉じる。独自の消費位置管理を持たない。
- 権限境界（author_association）と bot 自己コメント除外を発火条件に組み込む。
- `GitHubClient` port を forge 中立な意味論でラベル検索・コメント一覧に拡張する。
- 起動上限と承認ラベル名を config 化する。
- 起動装置（cron / launchd / GitHub Actions）の設定例を README に追加する。

**Non-Goals**:

- 常駐 watch モード。
- 自然文 issue からの LLM による request 生成（issue 本文は request.md 形式を前提とする）。issue form テンプレートの提供は含めてよい。
- issue の自動クローズ・ラベルの自動付け替え。
- GitHub 以外の輸送路（Slack / webhook）。
- 並列実行候補の自動衝突判定（ファイル footprint 解析）。

## Decisions

### D1: 発火判定を「純粋な plan 関数 + 薄い effect 実行」に分離する

inbox run の中核を、副作用のない計画関数 `planInbox(input) → InboxPlan` と、計画を既存実行経路へ流す orchestrator に分ける。

- planner の入力は決定的なデータのみ: 承認ラベル付き issue 一覧、全 job state、対象 issue のコメント一覧、解決済み config 値（起動上限）。
- planner の出力 `InboxPlan` は `{ starts, rejects, resumes }` の 3 配列。start/reject の判定（issue 本文の validate を含む）と resume の判定（cutoff 比較・権限・マーカー除外・resumePrompt 抽出）をすべて planner 内の純関数で行う。
- orchestrator は GitHubClient と `JobStateStore.list` で入力を集め、`planInbox` を呼び、計画を effect（start 経路・resume 経路・reject コメント）へ dispatch するだけ。

contract（実装ではなく型の形）:

```
interface IssueRef { number: number; title: string; body: string }
interface IssueComment { id: number; body: string; authorAssociation: string; createdAt: string }

interface StartAction  { issueNumber: number; slug: string; requestBody: string }
interface RejectAction { issueNumber: number; reason: string }
interface ResumeAction { jobId: string; slug: string; issueNumber: number; resumePrompt: string | null }
interface InboxPlan    { starts: StartAction[]; rejects: RejectAction[]; resumes: ResumeAction[] }
```

**Rationale**: 受け入れ基準はすべて「GitHubClient mock + 注入した job state での planner / orchestrator 検証」で観測可能になる。実際の pipeline 起動（長時間・非決定的）を seam の背後に隠すことで、発火ロジックを純関数として網羅テストできる。「agent は semantic content のみ、判定は決定的」という project 原則とも一致する。

**Alternatives considered**: (a) CLI ハンドラに判定と起動を直書き — 純関数 seam がなく、pipeline を起動しないと発火条件をテストできない。却下。(b) 判定に LLM を使い「この issue は着手すべきか」を推論 — トリガー経路に非決定性を持ち込み、architect 評価済み判断「発火判定に LLM を使わない」に反する。却下。

### D2: 新規起動は既存 `run` 経路を inline で await して実行する

start effect は、issue 本文を `specrunner/drafts/<slug>/request.md` に書き出し、既存の `runRunCore(draftPath, { issue: issueNumber })` を await する。resume effect は既存の `runResumeCore(slug, { prompt: resumePrompt })` を await する。inbox run は detached な常駐プロセスや subprocess 管理を導入しない。

**Rationale**: 既存経路は preflight → bootstrap → workspace 確立（ここで state.json に issueNumber 紐付けを persist）→ pipeline を担う。inline await により、次の候補へ進む前に紐付けが永続化され、冪等性が同一プロセス内で閉じる。新たな subprocess / detach 機構を持ち込まないことは「依存極小・install してすぐ使える」North Star に沿う。起動上限（D6）が 1 回の wall-clock を上限づける。

**Alternatives considered**: (a) detached subprocess を spawn して即 return — spawn から最初の persist までの間に冪等性レースが開く。加えて子プロセスの log / 終了コード管理が必要で複雑化。却下。(b) inbox run 内で pipeline を完全に再実装 — 既存 run/resume 経路の重複。却下。残存リスク（同時実行の二重起動）は D7・Risks で扱う。

### D3: start は「状態」、resume は「内容つきイベント」という非対称を採る

新規起動の発火条件は承認ラベル（1 bit の状態）。再開の発火条件は `/resume` コメント（文章を運ぶイベント）。媒体を揃えない。

- start: open かつ承認ラベル付きで、どの job にも紐付いていない issue。
- resume: `awaiting-resume` かつ issue 紐付けあり の job について、紐付け issue に「最新 escalation マーカーより新しい collaborator 以上の `/resume` コメント」が存在する。

**Rationale**: 承認は GitHub の triage 権限ゲート（ラベル付与権限）に乗る 1 bit の意思表示で十分。escalation への回答は人間の指示文を運ぶ必要があり、ラベルでは表現できない。architect 評価済みの設計判断そのもの。

**Alternatives considered**: 両方をコメントコマンド（`/start` + `/resume`）に揃える案 — start の承認を GitHub の権限モデルに乗せられず、コメントパーサに権限判定を追加で背負わせる。却下。

### D4: 冪等性を job state だけで閉じる（消費位置管理を持たない）

- **start の冪等性**: 発火条件は「issue に紐付く job が 1 件も存在しないこと」。`linkedIssueNumbers = { s.issueNumber | s ∈ JobStateStore.list(), s.issueNumber != null }` を全 status（running / awaiting-resume / awaiting-archive / failed / terminated / archived / canceled）横断で構築し、この集合に含まれる issue は起動しない。一度 job が作られた issue は、結末によらず再起動されない。
- **resume の冪等性**: 発火条件は「status === awaiting-resume」かつ「最新 escalation マーカーより新しい qualifying `/resume` コメントの存在」。resume を実行すると job は running へ遷移するため、後続 inbox run は status により no-op になる。再 escalation 時は **新しい** escalation マーカーコメントが追記される（より新しい時刻）ので、古い `/resume` コメントは新マーカーより古くなり再発火しない。利用者は新たに `/resume` を投稿する。

これにより「処理済みコメント id の記録」「消費オフセット」「クラッシュリカバリ用カーソル」は一切不要になる。

**Rationale**: escalation マーカーの時刻を cutoff に使うことで「1 回の escalation につき 1 回の resume」が状態だけで成立する。architect 評価済み判断「冪等性を job state のみで閉じる」の具体化。

**Alternatives considered**: 処理済みコメント id を sidecar に記録する案 — inbox run が状態ファイルを持つことになり要件 1・4 に反する。却下。escalation マーカーが（best-effort 通知失敗で）存在しない job は resume 対象にしない（安全側）。利用者は従来どおり CLI で resume できる。

### D5: 権限境界とマーカーによる bot 自己コメント除外

`/resume` コメントは以下をすべて満たすもののみ採用する:

1. **権限**: `authorAssociation ∈ { OWNER, MEMBER, COLLABORATOR }`。それ以外（CONTRIBUTOR / NONE 等）は無視する。
2. **bot 除外**: コメント本文が通知マーカー接頭辞 `<!-- specrunner:notification` を含む場合は bot 自身のコメントとして除外する。
3. **形**: 本文の先頭トークンが `/resume`（後続は空白または行末）。

bot 判定は GitHub actor type ではなくマーカー接頭辞で行う（finding #3 の解決）。トークンの所有者によって actor type が変わるため、自分が書いたコメントを構造的に識別できるマーカーの方が堅牢。escalation マーカー（D4 の cutoff 基準）も同じ通知マーカー族なので、cutoff 基準コメント自体も bot コメントとして resume 候補から自然に除外される。

resumePrompt のパース規則（finding #2 の解決）: 先頭の `/resume` コマンドトークンを取り除いた残り全体（改行を含む）を trim したものを resumePrompt とする。空なら `null`（追加指示なしの resume）。

**Rationale**: 承認ラベル（triage 権限）と collaborator 以上ゲートが、外部入力（issue 本文・コメント）を agent prompt へ流す経路の trust boundary になる。マーカーによる bot 除外は無限ループ（bot コメントを誤って指示と解釈）を構造的に防ぐ。

**Alternatives considered**: actor `type === "Bot"` で除外する案 — PAT / OAuth / GitHub App でトークン主体が変わり判定が安定しない。却下。

### D6: config に `inbox` セクションを追加する

`SpecRunnerConfig` に追加（provider 固有名を避ける）:

| key | 型 | 既定 | 用途 |
|-----|----|------|------|
| `inbox.approveLabel` | string | `"specrunner-approved"` | 新規起動の承認ラベル名 |
| `inbox.maxStartsPerRun` | number（>= 0 の整数） | `3` | 1 回の inbox run で新規起動する job 数の上限（暴走・コスト防御） |

`RawConfig` と zod `configSchema` に対応する optional フィールドを追加し、既定値は解決時に補う。`maxStartsPerRun: 0` は「新規起動を行わない（resume のみ）」を意味する。

**Rationale**: ラベルは利用者の GitHub 運用に合わせる必要があるため config 化し、既定を明示（finding #1）。起動上限はコスト防御の要件 7。既存 config の deep merge / 部分上書きにそのまま乗る。

**Alternatives considered**: env var で渡す案 — team 共有可能な project local config（`.specrunner/config.json`）に乗せたい運用に合わない。却下。

### D7: CLI 面 — `inbox` 親コマンド + `run` サブコマンド、worktree guard 付き

`inbox` を親コマンド（subcommands: `run`）として COMMANDS に登録する。`run` は job 起動で worktree を作るため `guardedSubcommands: new Set(["run"])` に入れ、main worktree からのみ実行可能にする。

flags: `--dry-run`（計画のみ表示し発火しない）、`--limit <n>`（`maxStartsPerRun` の上書き）、`--json`、`--verbose` / `--quiet`。

**Rationale**: 既存 `job` 親コマンドと同じ guard 機構を再利用。`--dry-run` は安全な観測手段かつ planner の純粋性を活かしたテスト経路になる。

**Alternatives considered**: top-level `inbox-run` 単一コマンド — 将来の `inbox` 配下拡張（status 等）を見越し親子構成にする。

## Risks / Trade-offs

- [同時 inbox run の二重起動] cron 多重発火 / GitHub Actions 並行実行で 2 つの inbox run が、どちらも persist 前に同じ未紐付け issue を走査すると二重起動しうる → 起動装置側で重複を抑止する（cron の間隔確保 / GitHub Actions の `concurrency` group）。inline await（D2）により persist は pipeline 本体より前で完了するため窓は小さい。起動上限（D6）が被害を有界化する。README の起動装置例に concurrency 設定を明記する。
- [外部入力の agent prompt 注入] issue 本文（request.md）と `/resume` 本文（resumePrompt）は外部入力 → issue 本文は validate を通し、pipeline は `<user-request>` を信頼できないデータとして扱う既存規律で隔離する。resumePrompt は collaborator 以上ゲート（D5）と承認ラベル運用が trust boundary。既存 `job resume` と同じ「外部入力が prompt に注入される」注意を README に明記する。誰でもラベル付与・コメントできる public repo では承認ラベル付与権限の管理が前提条件であることを文書化する。
- [escalation 通知の取りこぼし] issue-notifier は best-effort で、escalation コメント投稿失敗時はマーカーが存在せず inbox からの resume ができない → CLI からの手動 resume にフォールバック。安全側（誤再開しない）に倒す。
- [start の wall-clock] inline 実行のため 1 回の inbox run は起動した pipeline の合計時間ぶんブロックする → 起動上限と起動装置の cadence で制御する。GitHub Actions の `issues.labeled` トリガーでは 1 job が CI runner 上で走る想定で問題にならない。
- [issues エンドポイントが PR を含む] GitHub の issue 一覧 API は PR も返す → label 検索アダプタで `pull_request` フィールドを持つ要素を除外し、issue のみを返す。

## Open Questions

- なし（finding #1〜#3 は D5・D6 で解決済み）。

<!-- adr: true。本変更は新規 port メソッド追加・新コマンド層・発火層への「プロセスに state を持たせない」原則適用という構造判断を含むため、ADR は専用 step が生成する。 -->
