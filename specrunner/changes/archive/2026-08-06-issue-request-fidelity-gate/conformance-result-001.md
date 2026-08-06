# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. tasks.md チェックボックス完了確認

T-01 〜 T-10 の全チェックボックスが `[x]` 完了済み。

### 2. 設計判断（D1〜D10）の実装確認

**D1（gate 位置: registerCleanup 直後・pipeline.run 直前）**
`src/core/command/runner.ts` の `handle = runtime.registerCleanup(...)` と `buildPipelineForJob` + `pipeline.run` 呼び出しの間に `evaluateIssueFidelityGate(...)` 呼び出しが挿入されている（runner.ts:236, 258-272, 333-334）。

**D2（発火条件: startStep===request-review && issueNumber!=null && !inboxOrigin）**
`src/core/gate/issue-fidelity-gate.ts` 内で:
1. `startStep !== STEP_NAMES.REQUEST_REVIEW` → proceed（line 96）
2. `issueNumber == null` → proceed（line 101）
3. `inboxOrigin === true` → skip + log（lines 106-111）

**D3（port IssueFidelityComparator）**
`src/core/port/issue-fidelity-comparator.ts` に `IssueFidelityComparison { undeclaredDrops: string[] }` / `IssueFidelityComparator.compare()` が定義。adapter を import しない純粋な core port。

**D4（prompt in src/prompts/issue-fidelity-system.ts）**
`ISSUE_FIDELITY_SYSTEM_PROMPT` に以下 contract 文言が存在:
- enumerate: "enumerate and analyze"
- scope-out 尊重: "Scope-out declarations are respected"
- 差分ゼロ非要求: "Exact match / verbatim copy is NOT required"
- 出力形式: "undeclaredDrops"

**D5（halt は awaiting-resume、pipeline.run 未呼び出し）**
runner.ts の `if (gateDecision.kind === "halt")` ブランチで `buildPipelineForJob` / `pipeline.run` を呼ばずに `transitionJob(..., "awaiting-resume", { resumePoint: { step: STEP_NAMES.REQUEST_REVIEW, ... } })` を構築し `finalState = haltState` で合流（lines 279-323）。

**D6（fail-closed）**
gate.ts で comparator 未注入・readRequestMd 失敗・getIssue throw・comparator throw のいずれも `{ kind: "halt" }` を返す（lines 114-166）。

**D7（inbox skip + log）**
`run-inbox.ts:400` で `runRunCore(draftPath, { cwd, issue: issueNumber, inboxOrigin: true })`。gate.ts:106-111 で `inboxOrigin === true` → skip理由を `log()` に出力し `{ kind: "proceed", skipped: { reason } }` を返す。

**D8（照合対象は worktree の change folder コピー）**
runner.ts:265-269 で `requestMdPath(slug)` を `workspace?.cwd ?? repoRoot` 配下で読む。resume 時は `recopyDraftToChangeFolder` が再コピー済み。

**D9（composition root から factory 注入）**
`CommandRunner` constructor が `comparatorFactory?: (config) => IssueFidelityComparator` を受け取る（runner.ts:96）。`src/cli/run.ts:106` / `src/cli/resume.ts:83` でそれぞれ `createIssueFidelityComparator` を factory として注入。

**D10（getIssue port + adapter）**
`src/kernel/github-client.ts:269` に `getIssue()` が port に追加。`src/adapter/github/github-client.ts:670-682` に adapter 実装（200→{number,title,body??""}, 非200→githubApiError）。

### 3. spec.md Requirements 全件の実装確認

| Requirement | 実装箇所 | テスト |
|-------------|---------|-------|
| entrance gate（照合は pipeline 最初の step より前） | runner.ts:258-272 | TC-001 |
| undeclared drop ≥1 → pipeline step 未実行 + awaiting-resume | runner.ts:276-323、gate.ts:170-182 | TC-002、TC-026（破壊確認） |
| スコープ外宣言は drop としない | prompt contract D4 | TC-003、TC-012 |
| undeclared drop 0 → gate pass + request-review から開始 | gate.ts:185-186、runner.ts:324-334 | TC-004 |
| 照合 issue 本文を state/folder/step prompt に保存しない | gate.ts GateDecision に body 含まず、runner.ts halt reason に body 含まず | TC-005、TC-002 sentinel |
| `--issue` なし run で gate・fetch 不発火 | gate.ts:101-103 | TC-006、gate 単体 |
| inbox 経路で gate skip + log に理由 | gate.ts:106-111、run-inbox.ts:400 | TC-007、gate 単体 |
| fetch 失敗 → fail-closed halt | gate.ts:141-148 | TC-008、gate 単体 |
| getIssue: endpoint / 認証 / 401 / 非200変換 | github-client.ts:670-682 | TC-009、TC-010、TC-013 |
| halt 後 resume で gate 再評価 | resumePoint.step=REQUEST_REVIEW → startStep=request-review → gate 再発火 | TC-011 |
| prompt contract（列挙・スコープ外尊重・差分ゼロ非要求） | issue-fidelity-system.ts:26-57 | TC-012（a〜e） |

### 4. 受け入れ基準（AC1〜AC10）のテスト固定確認

- **AC1**: TC-002（undeclared drop → pipeline.run 未呼び出し + exit 1）、TC-026（破壊確認: halt branch 無効化 → fail）✅
- **AC2**: TC-004（空 drop → pipeline.run(request-review) 呼び出し）✅
- **AC3**: TC-012-a/b/c/d（enumeration / scope-out / no exact match / undeclaredDrops key）✅
- **AC4**: TC-005（sentinel が change folder・pipeline args に現れない）、TC-002 sentinel test（halt reason に issue body 含まず）✅
- **AC5**: TC-006（issueNumber null/undefined → getIssue 未呼び出し + pipeline 通常呼び出し）、gate 単体 issueNumber==null✅
- **AC6**: TC-007（inboxOrigin=true → getIssue 未呼び出し + pipeline 通常呼び出し）、gate 単体 inboxOrigin===true + log✅
- **AC7**: TC-008（getIssue throw → pipeline.run 未呼び出し + exit 1）、gate 単体 getIssue throw✅
- **AC8**: TC-009（200射影: endpoint / Authorization / body null→""）、TC-010（404 → GITHUB_API_ERROR）、TC-013（401 → GITHUB_TOKEN_EXPIRED）✅
- **AC9**: TC-011（2回目 run で gate 再評価: mockEvaluateGate 2 呼び出し確認 + pipeline.run 呼び出し）✅
- **AC10**: `bun run typecheck` → clean（0 errors）、`bun run test` → 696 files / 10229 tests passed / 1 skipped✅

### 5. 非伝播不変条件の確認

`issue.body` は `gate.ts` 内のローカル変数として `comparator.compare()` に渡されるのみ。`GateDecision` 型に body フィールドは存在しない。`halt` の `reason` には drop の要件記述のみ（gate.ts:171-182）。runner.ts の state 構築でも issue body は参照されない。sentinel テスト（TC-002 / TC-005 / gate 単体）で機械固定済み。

### 6. FATAL_ERROR_CODES 非包含確認

`src/core/pipeline/pipeline.ts:19-24` の `FATAL_ERROR_CODES` は `SESSION_CREATE_FAILED / CONFIG_*` 4件のみ。`ISSUE_FIDELITY_UNDECLARED_DROP` / `ISSUE_FETCH_FAILED` は含まれない → resumable（awaiting-resume）。TC-014 で機械固定。TC-029 で gate halt が `checkConsecutiveEscalations` カウンタを消費しないことも固定（steps["request-review"] 未記録 → --force 不要）。

## 検証できなかった項目

None。全 AC、全 Requirements、全 D1-D10 の実装 + テスト固定を確認済み。

## Findings 詳細

None。blocking / non-blocking いずれの指摘もなし。
