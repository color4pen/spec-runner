# Design: job ls を運用一覧にする

## Context

無人運用では複数 job が並走し、人の関心は「いまどれが動いていて、どれが自分の対応を
待っていて、次に何を打てばよいか」に集約される。現状の `job ls`（`runPs`,
`src/cli/ps.ts:123-194`）はフラットな 6 列表（JOB_ID / SLUG / STEP / STATUS / BRANCH /
AGE）で、この 3 つの問いに答えるには status の意味を知る必要がある — escalation は
`awaiting-resume` に埋もれ（`JobStatus` に escalation は無い）、merge 待ちは
`awaiting-archive` で、それぞれの対応コマンドは頭の中にある。実質、作者専用の一覧に
なっている。

現状すでに存在する材料:

- `awaiting-archive` の PR merge 判定（`checkPrMerged`, `ps.ts:99-113`）と
  `awaiting-archive (PR merged, run archive)` 表示（`ps.ts:156-165`）。
- `running` の staleness 検出（`isStaleRunning`, `src/core/resume/safety.ts:40-67`）と
  `running (stale?)` 表示。
- escalation の発生元は step verdict である（`deriveJudgeVerdict` →
  `"escalation"`, `src/core/step/judge-verdict.ts:35-37`）。job status としては
  `awaiting-resume` に落ちるが、`state.steps[*].outcome.verdict === "escalation"` から
  発生元 step を再構成できる。
- 再着手動詞は `job resume` が既にカバーしている。lifecycle 上
  `failed` / `terminated` / `awaiting-resume` → `running` の遷移が許可されている
  （`src/state/lifecycle.ts:36-48`）。

制約: 永続 schema（`state.json`）と `JobStatus` union は変更しない。新しい
subcommand / 動詞も追加しない。表示層の導出のみで運用一覧を実現する。

## Goals / Non-Goals

**Goals**:

- `job ls` のデフォルト出力を、固定の運用区分（実行中 / 対応待ち / merge・archive 待ち /
  失敗・停止 / 終了済み）でグルーピングする。空区分は出さない。
- 対応待ち（`awaiting-resume`）の行に escalation 発生元 step を表示する。
- 各行に、状態から一意に決まる次アクション（推奨コマンド）を表示する。
- `--json` を追加し、区分・各 job の状態・escalation 発生元・次アクションを機械可読に出す。
- `--active` / `--all` / `--status` の選択（フィルタ）意味を厳密に維持する。

**Non-Goals**:

- 新 subcommand / 動詞（`job retry` / `job list` 等）。
- `JobStatus` への status 追加・`state.json` schema 変更。
- escalation 理由本文の要約（findings 内容表示）。詳細は `job show` に委ねる。
- watch / TUI / リアルタイム更新。
- inbox の挙動変更。
- PR の自動 merge 誘導（merge は明示動詞のみ、後述 D5）。

## Decisions

### D1: 表示モデルを純粋関数の core モジュールに切り出す

`src/cli/ps.ts` は I/O（`JobStateStore.list` / PR 照会 / stale 検出 / stdout）を担い、
区分・escalation 発生元・次アクションの導出は副作用のない純粋関数に分離する。新規
モジュール `src/core/job-list/operations-view.ts` を追加し、以下を提供する:

- 区分判定 `categorizeStatus(status): JobCategoryId`
- escalation 発生元導出 `deriveEscalationSourceStep(state): string | null`
- 次アクション導出 `deriveNextAction(input): string | null`
- ビューモデル構築 `buildOperationsView(entries): OperationsView`
- 整形 `formatOperationsViewHuman(view, { isTty })` / `formatOperationsViewJson(view)`

`ps.ts` は各 job について enrichment（`isStale`, `prMerged`）を計算して純粋関数へ渡す。

- **Rationale**: 受け入れ基準は「fixture の JobState 群に対する区分・escalation 発生元・
  次アクションの出力を固定する」ことを要求する。I/O から切り離した純粋関数なら、
  filesystem / GitHub モックなしに fixture 入力で決定的にテストできる。既存の
  `judge-verdict.ts`（純粋な verdict 導出）と同じ「pure core + cli orchestrator」分離に
  倣う。
- **Alternatives considered**:
  - 全ロジックを `ps.ts` に残す（却下: PR 照会モック等が必要になり、区分・次アクションの
    単体テストが重くなる。純粋部分を独立に固定できない）。
  - `src/cli/ps-view.ts` に置く（可: co-locate で近い。却下寄り: cli 層は I/O 前提の層で、
    純粋ロジックは core に置く既存慣習に合わせて `core/job-list/` を採る。依存方向は
    core → state のみで DSM 上も安全）。

### D2: 区分は status → 区分の全域写像で、全 status を 5 区分に畳む

要件が挙げる 4 区分（実行中 / 対応待ち / merge・archive 待ち / 失敗・停止）に加え、
`archived` / `canceled` を受ける第 5 区分「終了済み」を定義する。これにより
`categorizeStatus` は `JobStatus` の全 7 値を漏れなく 1 区分へ写す全域関数になる。

- **Rationale**: `--all` / `--status archived` は archived を選択する（既存テスト TC-20 /
  TC-110 が固定）。4 区分だけだと archived / canceled の行き場が無く、選択済みの job を
  取りこぼす。全域写像にすれば「選択された job は必ずどこかの区分に出る」不変条件が
  型・実装の両面で保てる。
- **Alternatives considered**:
  - archived / canceled を無条件に非表示（却下: `--all` の意味が壊れ、既存テストと矛盾。
    フィルタ意味の維持という要件に反する）。
  - `failed`（失敗・停止）に terminal も混ぜる（却下: 「失敗・停止」は再着手対象、
    archived / canceled は終了で意味が異なる。次アクションも別）。

区分順は要件 1 の列挙順（実行中 → 対応待ち → merge・archive 待ち → 失敗・停止）に、
終了済みを末尾で足した固定順とする。

### D3: escalation 発生元は steps 走査で「最も新しい escalation run の step 名」

`deriveEscalationSourceStep` は `state.steps`（`Record<string, StepRun[]>`）の全 run を
走査し、`outcome.verdict === "escalation"` の run のうち `endedAt`（無ければ `startedAt`）
が最大のものの step 名を返す。該当が無ければ `null`。

- **Rationale**: 要件が「`state.steps[*].outcome.verdict === "escalation"` である最後の
  step 名」を明示している。`resumePoint.step` にも近い情報はあるが、要件が指定するのは
  verdict 由来の導出であり、poll timeout 等の非 escalation awaiting-resume を step 名なしで
  区別するには verdict 走査が最も直接的。純粋関数なので fixture で固定できる。
- **Alternatives considered**:
  - `resumePoint.step` を使う（却下: escalation 以外の理由でも resumePoint は入りうるため、
    「escalation 由来か否か」の判別に使えない）。

### D4: 次アクションは表示状態からの決定的テーブル（per-row）

`deriveNextAction({ status, isStale, prMerged, slug })` を spec の表に一致する決定的写像と
する。導出は per-row（区分単位でなく行単位）で行う。理由: 同一区分内でも stale か否か
（実行中）、PR merged か否か（merge・archive 待ち）で次アクションが分かれるため、行単位で
ないと一意にできない。

- **Rationale**: 「状態から一意に決まる推奨コマンド」を満たす。再着手は既存
  `job resume` に集約（architect 採用済み判断: `job retry` は作らない、lifecycle が
  `failed` / `terminated` / stale running → running をカバー）。
- **Alternatives considered**: 区分単位の action（却下: stale / PR-merged の行内分岐を
  表現できない）。

### D5: merge を促す next action は「PR 既 merged」時のみ

`awaiting-archive` かつ PR が未 merge / 判定不能のときは next action を「なし」とし、
`--with-merge` 等の merge を伴うコマンドは推奨しない。PR が既に merged のときのみ
`job archive <slug>` を出す。

- **Rationale**: merge は明示的な依頼時にのみ行うべき操作で、一覧の受動的な hint が
  「とりあえず merge」を助長するのは運用規律に反する。既 merged は「もう archive するだけ」
  という決定的状態なので誘導して安全。
- **Alternatives considered**: 未 merge に `job archive <slug> --with-merge` を出す
  （却下: 一覧を見た人へ merge を促すことになり規律に反する。merge・archive 待ちという
  区分ラベルで「PR 待ち」は十分伝わる）。

### D6: 人間出力は区分セクション + 行、STATUS 列に注記を畳む

人間向け出力は、非空区分ごとに「ラベル行 → 列ヘッダ → 行」を描く。行の列は
JOB_ID / SLUG / STEP / STATUS / NEXT / AGE とし、区分固有の注記は STATUS 列に畳む:

- 実行中: `running` / `running (stale?)`
- 対応待ち: `awaiting-resume` / `awaiting-resume (escalation: <step>)`
- merge・archive 待ち: `awaiting-archive` / `awaiting-archive (PR merged)`
- 失敗・停止 / 終了済み: 生 status

TTY は固定幅 pad、非 TTY は TAB 区切り（既存の isTty 分岐を踏襲）。BRANCH 列は人間
出力から外し（NEXT 列を優先）、`--json` には `branch` を残す。

- **Rationale**: 運用一覧の目的（何が動いていて / 何が対応待ちで / 次に何を打つか）に対し
  NEXT 列が BRANCH より価値が高い。branch は slug から概ね導け、詳細は `job show` にある。
  escalation・PR-merged 注記を STATUS 列へ畳むことで新規列は NEXT の 1 本に抑えられる。
- **Alternatives considered**: BRANCH を残し ESCALATION / NEXT を別列で足す（却下: 7〜8 列で
  横幅が過大。運用の主眼から外れる列を優先することになる）。

### D7: --json は top-level `{ categories }` の安定形

`--json` は top-level キー集合を `{ categories }` に固定する。`categories` は非空区分のみ・
固定順の配列で、各要素は `{ category, label, jobs }`。各 job は
`{ jobId, slug, step, status, stale, prMerged, escalationStep, nextAction, branch, createdAt }`。

- **Rationale**: 受け入れ基準が「top-level キー集合を固定」と要求する。単一キー
  `categories` は最小で安定。時刻依存を避けるため生成時刻等の揮発フィールドは top-level に
  置かない（`createdAt` は job 由来で決定的）。
- **Alternatives considered**: フラットな job 配列（却下: 区分情報を含める要件に反する）。

## Risks / Trade-offs

- [Risk] 既存テスト（`tests/finish-ps-integration.test.ts` / `tests/cli.test.ts` /
  `tests/unit/cli/ps-pr-hint.test.ts` / `tests/unit/cli/ps-filter.test.ts`）がフラット表の
  列位置や `(PR merged, run archive)` 文言に依存している。→ Mitigation: 受け入れ基準が
  「表示形式変更に伴う既存テストの期待値更新は可」と明記。フィルタの「対象集合」
  （どの job が出るか）を検証する assertion は意味を保ったまま新形式に更新し、列位置・文言
  依存の assertion のみ差し替える。
- [Risk] `formatJobRow` を import している既存テストがある（`ps-pr-hint.test.ts` /
  `finish-ps-integration.test.ts`）。→ Mitigation: 旧 `formatJobRow` は撤去し、新しい純粋
  formatter / 導出関数に対するテストへ移行する。`formatAge` / `truncate` は再利用。
- [Risk] BRANCH 列の除去で branch を目視していた運用者が影響を受ける。→ Mitigation:
  `--json` に `branch` を残し、`job show` でも参照可能。区分・次アクションの獲得が上回る。
- [Trade-off] 区分ヘッダ + 列ヘッダを区分ごとに描くため、単一表よりパイプ処理の 1 行 grep は
  やや複雑化する。→ 機械処理は `--json` を正路とする（そのための `--json` 追加）。

## Open Questions

なし（区分・順序・次アクション・escalation 導出・JSON 形はいずれも要件と architect 採用済み
判断で確定している）。
