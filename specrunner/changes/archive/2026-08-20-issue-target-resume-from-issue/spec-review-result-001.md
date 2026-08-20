# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md — コードベース前提の事実確認

| 検証対象 | 結果 |
|----------|------|
| `src/core/notify/issue-notifier.ts:78-82` の `buildMarker` 生成フォーマット | ✅ 一致。`<!-- specrunner:notification kind="${kind}" jobId="${jobId}" version="1" -->` |
| `src/state/schema/types.ts:412` — `JobState.branch: string \| null` | ✅ 一致 |
| `JobState.issueNumber` フィールドの存在 | ✅ 存在（`issueNumber?: number \| null`）。ただし行番号は `:476` ではなく `:458`（Findings #1） |
| `src/adapter/github/github-client.ts` に `graphqlEndpoint()` と `createLinkedBranch` が存在する | ✅ 一致（`graphqlEndpoint()` は private メソッド。`createLinkedBranch` はパラメータ化 GraphQL mutation） |
| `GitHubClient` port（`src/kernel/github-client.ts`）に `listIssueLinkedBranches` が無い | ✅ 一致。既存 18 メソッドの interface に含まれない |
| `listIssueComments` が `GitHubClient` port に存在する | ✅ 存在。返却型 `{ id, body, authorAssociation, createdAt }[]` |
| `src/core/pr-create/body-template.ts:75` の `Fixes #<issueNumber>` によるリンク | ✅ 一致（`Fixes #${jobState.issueNumber}`） |
| `src/core/issue-target/start.ts` が存在し resume face の実装様式の参照として機能する | ✅ 存在確認。`start.ts` は cli を import せず StartPrimitive を注入 |

### 2. design.md — 設計決定の整合性

| 決定 | 検証 |
|------|------|
| **D2**: `GitHubClient` port を変更しない → 狭い locator port を新設 | ✅ port shape を変えないことで既存 typed mock を壊さない設計として正当。`core/port/github-client.ts` が `kernel/github-client.ts` の re-export であることも確認 |
| **D3**: identity 3 照合（jobId / issueNumber / branch）の論拠 | ✅ `verifyCheckpoint`（verify-checkpoint.ts:194-213）が step (e) で `state.branch===branch` / `state.jobId` を検証しているため、前段フィルタとしての 3 照合は候補選別フェーズとして独立しており論理的に正当 |
| **D4**: `loadStateByJobId` による local short-circuit | ✅ 関数は `src/core/job-access/load-by-job-id.ts` に存在。`JOB_NOT_FOUND` を throw。sidecar index → worktree → canonical の解決順を確認 |
| **D5**: `getIssue` を呼ばない — GraphQL は issue 番号で解決 | ✅ `start.ts` の `buildLinkedBranchRegistrar` が `getIssue` を呼ぶが、resume face では issue body を読まないという制約として設計的に正当 |
| **D7**: 新 `src/cli/resume-from-issue.ts` に `process.cwd()` 直読みを書かない | ✅ `arch-allowlist.ts` の `src/cli/command-registry.ts` エントリ（tracking: CWD-registry-generate-resume-attach-archive-debt、pattern: `cwd: process.cwd(),`）が resume/attach 経路を既にカバー済み |
| **D9**: marker spoofing → identity 照合で無害化 | ✅ 偽 jobId は `state.jobId===marker_jobId && state.issueNumber===requested_number && state.branch===candidate` の 3 照合を突破できない。論理的に健全 |

### 3. tasks.md — 実装タスクの整合性

| タスク | 検証 |
|--------|------|
| **T-01**: `GitHubApiClient` に `listIssueLinkedBranches` 追加（port shape 不変） | ✅ `graphqlEndpoint()` が private メソッドとして利用可能。D2 の制約と整合 |
| **T-02**: `parseEscalationJobId` を `src/core/notify/issue-notifier.ts` に追加 | ✅ `buildMarker` と同ファイルに置くことで format drift を防ぐ設計として正当 |
| **T-03**: 3 種 typed error の追加 | ✅ `errors.ts` の `ERROR_CODES` への追加パターンが既存コードで確立されている |
| **T-04**: `src/core/issue-target/resume.ts` 新設（module boundary 準拠） | ✅ B-1 test（core-invariants.test.ts）が `src/core/`（runtime 除く）→ `adapter/` import を検査済み。TC-001（module-boundary.test.ts）が `src/core/issue-target/` → `cli/` import を検査済み |
| **T-05**: CLI orchestrator `runResumeFromIssue` | ✅ detach 前に slug 確定 → child が steps 1-3 を再実行という設計は design.md Risk セクションで明示。`from-issue.ts` の detach パターンと対称 |
| **T-06**: command-registry への配線 | ✅ `JOB_RESUME_USAGE`（line 347-387）は現在 `--from-issue` を含まない。追加が必要 |
| **T-07**: guide escalation topic 更新 | ✅ guide.ts の escalation topic（line 282-528）を確認。`resume --from-issue` への言及なし。追加が必要 |

### 4. spec.md — 仕様の完全性

- Requirement ごとに少なくとも 1 つの Scenario が存在する ✅
- SHALL / MUST キーワードが各 Requirement に含まれる ✅
- issue 本文を読まない制約が Scenario（getIssue スパイ）として pin される ✅
- positional 排他・detach 直交の Scenario が存在する ✅（TC-012, TC-013 の source）
- fail-closed 3 種（no-marker / no-link / unconfirmed）が別 Scenario として分離されている ✅
- rebind 検証失敗の伝播が Scenario として pin される ✅

### 5. test-cases.md — テストカバレッジ

- 32 件中 25 件が unit/integration、must: 29 件 ✅
- linked branch 形・linked PR head 形の双方を TC-001/TC-002 でカバー ✅
- spoofing 耐性を TC-024 (should) でカバー ✅
- gate TC（typecheck / test / arch）が TC-027〜TC-032 として定義されている ✅
- resolver path で `getIssue` が呼ばれないことを TC-003 / TC-022 で 2 層（core / CLI）でカバー ✅

### 6. セキュリティ検証（要求スコープ）

| 観点 | 結果 |
|------|------|
| GraphQL インジェクション | ✅ `createLinkedBranch` および T-01 の新クエリはパラメータ化変数を使用。文字列補間なし |
| SSRF（GraphQL endpoint） | ✅ `graphqlEndpoint()` は設定済み `baseUrl` から導出。ユーザー入力がエンドポイント URL に混入しない |
| marker spoofing → 任意 resume 強制 | ✅ D9 分析が正確。identity 3 照合（jobId + issueNumber + branch）が真正性を担保 |
| `--prompt` への issue 本文混入 | ✅ issue 本文は一切読まない（D5）。`--prompt` は operator CLI 入力のみ |
| ReDoS（`parseEscalationJobId` regex） | ✅ marker 構造は固定 literal。`/jobId="([^"]+)"/` 相当の非バックトラック型抽出が自然 |
| `first:50` による有界取得 | ✅ Design Risk セクションに明示。無制限 fetch なし |
| OWASP A1 (Injection) | ✅ GraphQL / Git コマンドへのユーザー入力は issue number（integer）のみ。型制約でインジェクション不能 |

## 検証できなかった項目

| 項目 | 理由 |
|------|------|
| GitHub GraphQL `linkedBranches` / `closedByPullRequestsReferences` フィールドの live 確認 | Public Preview API の live introspection は spec-review scope 外。request.md が 2026-08-20 の introspection 確認を attestation として記録 |
| `runAttachVerification` と新 `resolveResumeBranchFromIssue` の結合パス動作 | 実装が存在しないため静的検証のみ |

## Findings 詳細

### F-001: `issueNumber` の行番号参照が不正確

`request.md` の「現状コードの前提」に `JobState.issueNumber`（同 `:476`）と記載されているが、`src/state/schema/types.ts` 実測では line 458 に位置する。実装への機能的影響はないが、fact-check attestation として不正確。

対処: request.md の行番号参照を `:458` に修正する。

---

### F-002: `issue: null` GraphQL レスポンスのテスト pin 欠如

T-01 実装メモには「`issue` が null（存在しない）の場合の扱いを決めて実装する（`githubApiError` を提案）」とあるが、test-cases.md に対応する TC が存在しない。TC-017〜TC-019 は empty nodes / non-2xx / GraphQL errors のみをカバーする。

存在しない issue 番号を指定した場合、GraphQL は HTTP 200 かつ `repository.issue: null` を返す。このケースを黙って `[]` に落とすと、「Development リンクが 0 件」→ `RESUME_FROM_ISSUE_NO_LINK`（`job attach --branch` 誘導）という誤ったエラー文言に誘導され、デバッグが困難になる。

対処: T-01 Acceptance Criteria に `issue: null` → `GITHUB_API_ERROR` の pin を追加する。または test-cases.md に TC を 1 件追加する。

---

### F-003: fail-closed 3 種エラーの exit code が test-cases.md で未固定

TC-008（marker 不在）・TC-009（Development リンク 0 件）・TC-005/TC-006（identity 不一致）は、エラーメッセージと副作用ゼロを pin しているが exit code を固定していない。tasks.md T-03 に「`ARG_ERROR`(2) を提案」の Open Question はあるが test-cases.md への反映がない。

実装者が exit code を GENERAL_ERROR(1) で実装しても gate TC が通過してしまう。TC-008/TC-009 に exit code の assert を追加するか、T-03 Acceptance Criteria に「3 コードすべて `ARG_ERROR`(2) で登録」と明記することで実装者の裁量を排除できる。
