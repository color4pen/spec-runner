# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md — escalation 起票 F-001 の修正確認

| 検証対象 | 結果 |
|----------|------|
| `src/state/schema/types.ts` の `issueNumber` 実際の行番号 | ✅ line 458 に位置することを確認 |
| request.md line 27 の参照が `:458` に修正されていること | ✅ 修正済み（旧 `:476` → `:458`） |

前回試行（attempt 1）の escalation 起票対象 F-001 は request.md への operator-apply commit で解消済み。

### 2. request.md — コードベース前提の事実再確認

| 検証対象 | 結果 |
|----------|------|
| `src/core/notify/issue-notifier.ts:78-82` の `buildMarker` 生成フォーマット | ✅ `<!-- specrunner:notification kind="${kind}" jobId="${jobId}" version="1" -->` |
| `src/state/schema/types.ts:412` — `JobState.branch: string \| null` | ✅ line 412 |
| `JobState.issueNumber?: number \| null` at `:458` | ✅ line 458 |
| `graphqlEndpoint()` private メソッドと `createLinkedBranch` の存在 | ✅ 両者とも `GitHubApiClient` に存在 |
| `GitHubClient` port に `listIssueComments` が存在し、返却型が `{ id, body, authorAssociation, createdAt }[]` | ✅ `src/kernel/github-client.ts` line 232-236 |
| `GitHubClient` port に `listIssueLinkedBranches` が存在しない | ✅ 18 メソッドの interface に含まれない — D2 設計の前提と整合 |
| `src/core/pr-create/body-template.ts:75` の `Fixes #${jobState.issueNumber}` | ✅ line 75 |
| `src/core/job-access/load-by-job-id.ts` に `loadStateByJobId` が存在し JOB_NOT_FOUND を throw する | ✅ |
| `src/core/attach/checkpoint-policy.ts` — `attachResumePolicy` の `status === "awaiting-resume"` 検査 | ✅ line 48 |
| `src/core/attach/verify-checkpoint.ts` — step (e) で `state.branch !== branch` 検査あり | ✅ line 201-206 |
| `EXIT_CODE_MAP` の `BASE_BRANCH_MISMATCH: ARG_ERROR` 先例 | ✅ line 31 |

### 3. 前回 F-002 / F-003 の解消確認

| Finding | 解消方法 | 確認 |
|---------|----------|------|
| F-002: `issue: null`（HTTP 200 + `repository.issue: null`）のテスト pin 欠如 | tasks.md T-01 Acceptance Criteria に明記（line 28）: 「存在しない issue（HTTP 200 + `repository.issue: null`）で `GITHUB_API_ERROR` が throw されることがテストで pin される」 | ✅ 実装者への指示が明確化された |
| F-003: fail-closed 3 種エラーの exit code が未固定 | tasks.md T-03 が `ARG_ERROR`(2) を明示し「実装者の裁量に委ねない」と記載（line 58-65） | ✅ exit code 固定と pin テスト要求が明文化された |

### 4. design.md — 設計決定の整合性

| 決定 | 結果 |
|------|------|
| D2: 狭い locator port 新設（`GitHubClient` port shape 不変） | ✅ `GitHubApiClient` に `listIssueLinkedBranches` を public メソッドとして追加するのみ、既存 mock への影響ゼロ |
| D3: identity 3 照合（jobId / issueNumber / branch）と rebind の分離 | ✅ `verifyCheckpoint` がすでに step (e) で同フィールドを検証。前段フィルタとして独立する設計は論理的に正当 |
| D4: local short-circuit（`loadStateByJobId` → JOB_NOT_FOUND 分岐） | ✅ `loadStateByJobId` が既存実装として存在し設計前提と整合 |
| D5: issue 本文を読まない（`getIssue` 非呼出し） | ✅ GraphQL クエリは issue 番号で直接解決、node ID 取得のための `getIssue` 呼び出しなし |
| D6: Development リンクを optional index に留める（ADR 指示） | ✅ request.md / design.md に明記 |
| D7: `resume-from-issue.ts` 内で `process.cwd()` を持たない | ✅ command-registry が既存 CWD allowlist エントリ同一 literal で渡す設計と整合 |
| D8: 3 種 typed error（NO_MARKER / NO_LINK / UNCONFIRMED） | ✅ 3 種の文言差別化と終止理由の明示が設計に組み込まれている |
| D9: marker spoofing → identity 照合で無害化（author gating 不要） | ✅ 偽 jobId は Development リンク上に一致 checkpoint を持てず fail-closed 正当 |

### 5. tasks.md — 実装タスクの整合性

| タスク | 確認 |
|--------|------|
| T-01: `listIssueLinkedBranches` 追加（port shape 不変） | ✅ `graphqlEndpoint()` / `request()` 再利用可能。`issue: null` ケース処理も AC に明記 |
| T-02: `parseEscalationJobId` 純関数追加 | ✅ `buildMarker` と同ファイルに置くことで format drift を防ぐ設計 |
| T-03: 3 種 typed error + `EXIT_CODE_MAP` 登録 + ARG_ERROR(2) 明示 | ✅ F-003 の懸念が解消。pin テスト要求も AC に含まれる |
| T-04: `src/core/issue-target/resume.ts` 新設（module-boundary 準拠） | ✅ `cli/`・`adapter/` 非 import 制約と gate TC-029 で担保 |
| T-05: CLI orchestrator `runResumeFromIssue` | ✅ 連鎖ステップ（1-6）が設計と整合し、detach / rebind skip / 既存エラー伝播が記述 |
| T-06: command-registry 配線 | ✅ `"from-issue": { type: "integer", min: 1 }` で入力型制約あり、排他チェックと CWD allowlist 整合 |
| T-07: guide.ts 更新 | ✅ TC-023 で pin |
| T-08: 統合テストと回帰確認 | ✅ gate TC-027〜TC-032 で typecheck / test / arch 全確認 |

### 6. spec.md — 仕様の完全性

- 全 Requirement に SHALL / MUST が含まれる ✅
- 全 Requirement に少なくとも 1 つの Scenario が含まれる ✅
- linked branch 形・linked PR head 形が独立した Scenario（→ TC-001 / TC-002）でカバー ✅
- issue 本文非読みが getIssue spy Scenario（→ TC-003 / TC-022）でカバー ✅
- marker 複数時最新選択が Scenario（→ TC-004）でカバー ✅
- identity 3 照合失敗（jobId / issueNumber / branch / 複数一致）が Scenario でカバー（→ TC-005 / TC-006 / TC-007）✅
- marker 不在・リンク 0 件が独立 Scenario（→ TC-008 / TC-009）でカバー ✅
- local short-circuit が Scenario（→ TC-010）でカバー ✅
- rebind 失敗伝播が Scenario（→ TC-011）でカバー ✅
- positional 排他・detach 直交が Scenario（→ TC-012 / TC-013）でカバー ✅

### 7. test-cases.md — テストカバレッジ

- 32 件中 25 件が unit/integration（automated）、must: 29 件 ✅
- gate TC-027〜TC-032 で typecheck / test / arch / CWD ratchet / module-boundary を網羅 ✅
- TC-024（spoofing 耐性 / should）で D9 の設計判断を pin ✅
- TC-025（unreadable 候補 skip / should）で read 不能候補の黙殺禁止を pin ✅

### 8. セキュリティ検証

| 観点 | 結果 |
|------|------|
| GraphQL インジェクション | ✅ `listIssueLinkedBranches`（T-01）はパラメータ化変数使用。issue number は integer 型制約（`type: "integer", min: 1`）により文字列注入不能 |
| SSRF（GraphQL endpoint） | ✅ `graphqlEndpoint()` は設定済み `baseUrl` から導出。ユーザー入力が endpoint URL に混入しない |
| marker spoofing → 任意 resume 強制 | ✅ D9 が正確。identity 3 照合（jobId + issueNumber + branch）で真正性を担保。TC-024 で pin |
| issue 本文混入（`--prompt` 等） | ✅ issue 本文は一切読まない（D5）。`getIssue` 非呼出しが TC-003 / TC-022 で pin |
| ReDoS（`parseEscalationJobId` regex） | ✅ marker 構造は固定 literal。`/jobId="([^"]+)"/` 相当の非バックトラック型抽出が自然であり、buildMarker が `-->` を含む jobId を reject する事前検証もある |
| `first:50` による有界取得 | ✅ design Risks セクションに明示。無制限 fetch なし |
| OWASP A1 (Injection) | ✅ GraphQL / Git コマンドへのユーザー入力は issue number（integer）のみ。型制約でインジェクション不能 |
| `buildMarker` の jobId 安全性 | ✅ `-->` を含む jobId は `buildMarker` が throw するため、HTML コメント境界破壊が防止されている |

## 検証できなかった項目

| 項目 | 理由 |
|------|------|
| GitHub GraphQL `linkedBranches` / `closedByPullRequestsReferences` フィールドの live 確認 | Public Preview API の live introspection は spec-review scope 外。request.md が 2026-08-20 の introspection 確認を attestation として記録 |
| `runAttachVerification` と新 `resolveResumeBranchFromIssue` の結合パス動作 | 実装が存在しないため静的検証のみ |

## Findings 詳細

None

---

*検証済み項目数: 全 spec ファイル（request.md / design.md / tasks.md / spec.md / test-cases.md）の全 Requirements / Decisions / Tasks + セキュリティ観点 8 項目。前回試行 escalation 対象 F-001 の修正を確認、F-002 / F-003 の tasks.md レベル解消を確認。新規ブロッキング finding なし。*
