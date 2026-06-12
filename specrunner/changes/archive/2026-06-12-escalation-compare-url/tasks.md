# Tasks: escalation 通知コメントに branch の compare URL を含める

## T-01: `RequestInfo` に `baseBranch` フィールドを追加する

- [x] `src/state/schema.ts` の `RequestInfo` interface に `baseBranch?: string | null` を追加する
  （backward compat のため optional。JSDoc に「job 起動時に request.md の base-branch から設定。
  未設定の legacy state では escalation 通知で `main` にフォールバックする」を明記）（D1）
- [x] `validateJobState`（`src/state/schema.ts`）は変更不要であることを確認する: `baseBranch` は
  optional で、末尾 `return raw as JobState` の pass-through で保持される。欠落（undefined）は許容＝
  backward compat（slug の `req.slug = null` 既定のような追加検証は不要）

**Acceptance Criteria**:
- `RequestInfo`（`JobState.request`）に `baseBranch?: string | null` が宣言される
- `baseBranch` を持つ state を persist→load して値が保持される
- `baseBranch` を持たない legacy state が `validateJobState` を通過する（regression なし）
- `bun run typecheck` が green

## T-02: job 起動時に base-branch を state へ配線する

- [x] `src/core/command/pipeline-run.ts` の `bootstrapJob` 呼び出し（`request: { ... }` リテラル、
  現状 `path` / `title` / `type` / `slug` を渡す箇所）に `baseBranch: request.baseBranch` を 1 行追加する
  （`request` は `ParsedRequest`、`baseBranch` は確定済み）（D1）
- [x] `buildInitialJobState`（`src/store/job-state-store.ts`）は変更不要であることを確認する:
  `request: { ...params.request, slug: ... }` の spread で `baseBranch` を取り込む
- [x] `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` の
  `request: { ...s.request, path: changeFolderRequestPath }` 形の更新箇所が `...s.request` の spread で
  `baseBranch` を保全していることを確認する（変更不要の確認のみ）

**Acceptance Criteria**:
- `job start <slug>` / `run <slug>` で起動した job の `state.request.baseBranch` が request.md の
  base-branch と一致する
- branch path 更新後も `state.request.baseBranch` が保持される
- `bun run typecheck` が green

## T-03: `buildCompareUrl` と escalation コメントへの URL 行挿入を実装する

- [x] `src/core/notify/issue-notifier.ts` に純関数
  `buildCompareUrl(owner: string, repo: string, base: string, branch: string): string` を追加し、
  `https://github.com/${owner}/${repo}/compare/${base}...${branch}` を返す（owner/repo/base/branch は
  verbatim 挿入、追加 encoding なし）（D2）
- [x] `buildEscalationComment(state)`（純関数のまま）を更新する: `state.branch` が非 null のとき、
  marker ブロックの後・`To resume:` の前に compare URL 行（簡潔な英語ラベル付き、例 `Diff: <url>`）を
  1 行挿入する。base は `state.request.baseBranch ?? "main"`、owner/repo は `state.repository.owner` /
  `state.repository.name`（D2 / D3）
- [x] `state.branch` が `null`（および空文字）のときは URL 行を生成せず、従来どおり marker / Step /
  Reason / resume コマンドのみの本文を返す（D3）
- [x] import / DSM を変更しない（`core/port` / `state` / `logger` のみ）。コメント本文に絵文字を含めない

**Acceptance Criteria**:
- `buildEscalationComment` は `JobState` のみを入力とする純関数のまま
- branch 非 null の state で body に compare URL が 1 行含まれる
- branch null の state で body に compare URL が含まれない（従来文面）
- `bun run typecheck` が green

## T-04: issue-notifier のユニットテストを追加する

- [x] `tests/unit/core/notify/issue-notifier.test.ts` を更新する。`makeState` helper の `request` に
  `baseBranch` を持たせられるようにする（既存ケースを壊さない範囲で）
- [x] compare URL 含有: branch 確定 + repository owner/repo を持つ `awaiting-resume` state で、body が
  `https://github.com/{owner}/{repo}/compare/{base}...{branch}` を含むことを固定する（受け入れ基準 1）
- [x] branch null: `state.branch = null` の `awaiting-resume` state で、body が `/compare/` を含まず、
  従来どおり marker・停止 step・理由・`specrunner job resume <slug>` を含むことを固定する（受け入れ基準 2）
- [x] base-branch 反映: `state.request.baseBranch = "develop"` の state で URL の base が `develop` に
  なること、`baseBranch` 未設定の state で base が `main` にフォールバックすることを固定する（受け入れ基準 3）
- [x] `buildCompareUrl` の純関数テスト（owner/repo/base/branch → 期待 URL）を加える

**Acceptance Criteria**:
- 上記 4 ケースが pass する
- URL 含有・branch null での省略・base 反映・main フォールバックが検証される
- `bun run test` で当該テストが pass

## T-05: state round-trip と pipeline 通知の統合テスト

- [x] state 永続化テスト（`baseBranch` の round-trip）: `request.baseBranch` を持つ `JobState` を
  persist→load して値が保持されること、`baseBranch` 無しの legacy state が load できることを検証する
  （`tests/unit/state/` または既存 schema/store テストに追記）
- [x] pipeline 通知テスト: escalation 通知経路（`tests/unit/core/pipeline/pipeline.notification.test.ts`
  の escalation ケース）で、`createIssueComment` に渡る body に compare URL が含まれることを固定する
  （`issueNumber` + branch 確定 + `awaiting-resume` の前提）。既存アサーション（`toContain('kind="escalation"')`
  等）が regression しないことを確認する

**Acceptance Criteria**:
- `baseBranch` の persist→load round-trip と legacy load が検証される
- escalation 通知 body に compare URL が含まれることが pipeline 経路で検証される
- `bun run test` で当該テストが pass

## T-06: 最終検証

- [x] `bun run typecheck` が green
- [x] `bun run test` で全テストが pass（regression なし）
- [x] `grep -rn "buildCompareUrl\|baseBranch" src/core/notify src/core/command/pipeline-run.ts src/state/schema.ts`
  で配線が正しいことを確認する
- [x] 受け入れ基準（spec.md の全 Requirement / Scenario）が満たされることを確認する

**Acceptance Criteria**:
- `typecheck && test` が green
- escalation 通知コメントへの compare URL 含有・branch null 省略・base-branch 反映が満たされる
