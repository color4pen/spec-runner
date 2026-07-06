# Tasks: job ls を運用一覧にする

依存順: T-01（純粋モデル）→ T-02/T-03（整形）→ T-04（配線）→ T-05（既存テスト更新）→ T-06（help）。
最終的に `bun run typecheck && bun run test` が green であること。

## T-01: 運用ビューの純粋モデルと導出関数

- [ ] `src/core/job-list/operations-view.ts` を新規追加（副作用・I/O なし）。import は
      `../../state/schema.js` の型と `../../state/job-slug.js` の `getJobSlug` のみに限定する
      （core → state のみ。adapter / store / fs を import しない）。
- [ ] 型を定義する:
  - `type JobCategoryId = "running" | "awaiting-response" | "awaiting-archive" | "failed" | "terminal"`
  - `interface JobViewRow { jobId: string; slug: string; step: string; status: JobStatus; stale: boolean; prMerged: boolean | null; escalationStep: string | null; nextAction: string | null; branch: string | null; createdAt: string }`
  - `interface CategoryGroup { category: JobCategoryId; label: string; jobs: JobViewRow[] }`
  - `interface OperationsView { categories: CategoryGroup[] }`
  - `interface ViewEntry { job: JobState; isStale: boolean; prMerged: boolean | null }`（buildOperationsView の入力）
- [ ] 区分メタデータ（id / label / 所属 status / 表示順）を単一の定数配列として定義し、
      `categorizeStatus(status: JobStatus): JobCategoryId` をその配列から導く。写像:
      `running`→`running` / `awaiting-resume`→`awaiting-response` / `awaiting-archive`→`awaiting-archive` /
      `failed`,`terminated`→`failed` / `archived`,`canceled`→`terminal`。全 7 status を網羅する
      （網羅漏れは switch の exhaustive check か定数配列走査で型/実行時に検出できるようにする）。
      label: 実行中 / 対応待ち / merge・archive 待ち / 失敗・停止 / 終了済み。表示順は
      running → awaiting-response → awaiting-archive → failed → terminal。
- [ ] `deriveEscalationSourceStep(state: JobState): string | null` を実装する。
      `state.steps`（未定義なら `{}`）の全 `StepRun` を走査し、`outcome.verdict === "escalation"`
      の run のうち `endedAt`（無ければ `startedAt`）が最大のものの step 名を返す。該当なしは `null`。
- [ ] `deriveNextAction(input: { status: JobStatus; isStale: boolean; prMerged: boolean | null; slug: string }): string | null`
      を design.md D4 の表に一致させる:
      running+not stale→null / running+stale→`job resume <slug>` / awaiting-resume→`job resume <slug>` /
      awaiting-archive+prMerged===true→`job archive <slug>` / awaiting-archive+それ以外→null /
      failed→`job resume <slug>` / terminated→`job resume <slug>` / archived→null / canceled→null。
- [ ] `buildOperationsView(entries: ViewEntry[]): OperationsView` を実装する。各 entry から
      `JobViewRow` を組み立て（slug は `getJobSlug`、escalationStep は awaiting-resume のときのみ
      `deriveEscalationSourceStep` を設定しそれ以外は null、nextAction は `deriveNextAction`）、
      `categorizeStatus` で区分に振り分け、区分内は `createdAt` 降順、区分は固定順、空区分は含めない。

**Acceptance Criteria**:
- `src/core/job-list/__tests__/operations-view.test.ts` が fixture の JobState 群
  （running / stale running / escalation 由来 awaiting-resume / 非 escalation の awaiting-resume /
  PR merged の awaiting-archive / 未 merge の awaiting-archive / failed / terminated / archived）に対し、
  `categorizeStatus`・`deriveEscalationSourceStep`・`deriveNextAction`・`buildOperationsView` の
  出力（区分割り当て・escalation 発生元 step・次アクション文字列・空区分除外・区分順・区分内 createdAt 降順）を固定する。
- `deriveEscalationSourceStep` が複数 step に escalation がある場合、`endedAt` 最大の step 名を返すことがテストで固定される。
- 全 `JobStatus` 値が例外なく区分へ写ることがテストで固定される（未知経路が無い）。
- モジュールは fs / GitHub / store をモックせずに純粋にテストできる。

## T-02: 人間向け整形関数

- [ ] `formatOperationsViewHuman(view: OperationsView, opts: { isTty: boolean }): string` を
      `operations-view.ts` に追加する。非空区分ごとに「区分ラベル行 → 列ヘッダ → 各行」を描く。
      列は JOB_ID(8桁短縮) / SLUG / STEP / STATUS / NEXT / AGE。STATUS 列に注記を畳む:
      running→`running` または `running (stale?)`、awaiting-resume→`awaiting-resume` または
      `awaiting-resume (escalation: <step>)`、awaiting-archive→`awaiting-archive` または
      `awaiting-archive (PR merged)`、それ以外は生 status。NEXT 列は nextAction または `-`。
      AGE は既存 `formatAge` を再利用。TTY は固定幅 pad、非 TTY は TAB 区切り（既存 isTty 分岐を踏襲）。
- [ ] `nowMs` を引数で受けて `formatAge` に渡せるようにし、テストの決定性を確保する。
- [ ] view が全区分空（job 0 件）の場合の描画は呼び出し側（T-04）で `No jobs found.` を出すため、
      本関数は空 view で空文字列（またはヘッダなし）を返す方針とし、その分岐を明確にする。

**Acceptance Criteria**:
- 人間出力テストで、区分ラベル（実行中 / 対応待ち / merge・archive 待ち / 失敗・停止 / 終了済み）が
  非空区分のみ現れ、空区分は現れないことが固定される。
- escalation 由来 awaiting-resume の行に `escalation: <step>`（例 `code-review`）が現れることが固定される。
- stale running の STATUS が `running (stale?)`、その行の NEXT に `job resume <slug>` が現れることが固定される。
- PR merged の awaiting-archive の STATUS に `(PR merged)`、NEXT に `job archive <slug>` が現れることが固定される。
- live running の NEXT が `-`（アクションなし）であることが固定される。

## T-03: --json 整形とフラグ追加

- [ ] `formatOperationsViewJson(view: OperationsView): string` を `operations-view.ts` に追加する。
      top-level は `{ categories }` のみ。各 category は `{ category, label, jobs }`、各 job は
      `{ jobId, slug, step, status, stale, prMerged, escalationStep, nextAction, branch, createdAt }`。
      `JSON.stringify(_, null, 2)` + 末尾改行（既存 `config-effective` の JSON 形に倣う）。
- [ ] `src/cli/command-registry.ts` の `job.subcommands.ls.flags` に `json: { type: "boolean" }` を追加し、
      handler で `json: !!parsed.flags["json"]` を `runPs` opts へ渡す。
- [ ] `runPs` の opts 型に `json?: boolean` を追加する（配線は T-04）。

**Acceptance Criteria**:
- JSON テストで、`job ls --json` 相当の出力が JSON.parse でき、top-level キー集合が厳密に
  `["categories"]` であることが固定される。
- 各 category が `category` / `label` / `jobs` を持ち、各 job entry が `status` / `escalationStep` /
  `nextAction` を含むことが固定される（escalation 由来 awaiting-resume で `escalationStep` 非 null、
  `nextAction === "job resume <slug>"`）。
- `categories` が非空区分のみ・固定順であることが固定される。

## T-04: runPs を運用ビューへ配線

- [ ] `src/cli/ps.ts` の `runPs` を、フィルタ後の job 集合から `ViewEntry[]`（`isStale` は既存
      `isStaleRunning` + sidecar、`prMerged` は既存 `checkPrMerged` を `awaiting-archive` のみに対して呼ぶ）を
      組み立て、`buildOperationsView` → `formatOperationsViewHuman` / `formatOperationsViewJson` を
      dispatch する形に置き換える。
- [ ] フィルタ選択ロジック（`--status` > `--active` > `--all` > default）と createdAt 降順ソート、
      `No jobs found.`（0 件時、human/JSON 双方で適切に）と exit code 0 を維持する。
      JSON かつ 0 件のときは `{ "categories": [] }` を出す。
- [ ] `prMerged` の照会は `awaiting-archive` の job にのみ行う既存の rate-limit 配慮を維持する。
- [ ] 旧 `formatJobRow`（フラット表 1 行整形）を撤去する。`formatAge` / `truncate` / `checkPrMerged` は
      残す（`formatAge` / `truncate` は新 formatter が再利用、`checkPrMerged` は runPs が使用）。

**Acceptance Criteria**:
- `runPs({...})` が human モードで区分グルーピング出力、`runPs({ json: true })` で JSON 出力を返す
      統合テストが通る。
- `No jobs found.` と exit code 0 が維持されることがテストで固定される。
- `checkPrMerged` が `awaiting-archive` 以外の status に対して呼ばれないことが維持される。

## T-05: 既存テストを新形式へ更新

- [ ] `tests/unit/cli/ps-filter.test.ts`: `--active` / `--all` / `--status` の「対象集合」
      （どの jobId が現れる / 現れない）を検証する assertion は意味を保って残す。新形式で job が
      区分セクション配下に出ることに合わせ、必要な期待値のみ更新する。
- [ ] `tests/unit/cli/ps-pr-hint.test.ts`: `formatJobRow` 依存を除去し、PR merged 注記
      （`(PR merged)`）と NEXT の `job archive <slug>` を新 formatter / JSON に対する検証へ移行する。
      旧文言 `(PR merged, run archive)` への依存を除去する。
- [ ] `tests/finish-ps-integration.test.ts`: `formatJobRow` / フラット列位置（TC-054 / TC-110 /
      TC-143 / TC-068 等）に依存する assertion を新形式へ更新する。job が出る/出ないの意味検証
      （TC-034 / TC-142 / stale 系）は保持し、列インデックス依存のみ差し替える。
- [ ] `tests/cli.test.ts`: `No jobs found.` 系（TC-067）と TAB 出力系（TC-068）を新形式に整合させる。
- [ ] `formatJobRow` を import している箇所を全て解消する（grep で残存ゼロを確認）。

**Acceptance Criteria**:
- フィルタ 3 種（`--active` / `--all` / `--status`）の対象集合が現行と同一であることが更新後テストで固定される。
- 旧 `formatJobRow` への import / 参照が repo から消えている。
- `bun run typecheck && bun run test` が green。

## T-06: help / usage 文言の追記（低リスク）

- [ ] `src/cli/command-registry.ts` の `USAGE` 内 `job ls` 行に `--json` の存在が分かる注記を最小限
      加える（`job ls` 文字列は残す。`help-output-tc.test.ts` は `USAGE.toContain("job ls")` を検証している）。
- [ ] 必要なら `job.subcommands.ls` に `usage`（`--active` / `--all` / `--status` / `--json` を説明する
      文字列）を追加する。

**Acceptance Criteria**:
- `tests/unit/cli/help-output-tc.test.ts` が green（`USAGE` は依然 `job ls` を含む）。
- `bun run typecheck && bun run test` が green。
