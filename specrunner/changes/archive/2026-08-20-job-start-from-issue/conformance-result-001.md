# Conformance Result — job-start-from-issue — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Normative Sources

- **request.md**: 6 要求、受け入れ基準 7 項
- **spec.md**: 8 Requirements / 10 Scenarios

## Scope of Implementation

```
src/cli/from-issue.ts                             新設（132 行）
src/core/job/start-from-issue.ts                  新設（33 行）
src/git/branch.ts                                 新設（18 行）
src/errors.ts                                     BASE_BRANCH_MISMATCH / baseBranchMismatchError 追加
src/cli/command-registry.ts                       --from-issue flag・排他検査・positional optional 化・help 更新
src/core/inbox/run-inbox.ts                       startJob 後半を materializeDraftAndStart 委譲に置換
src/core/command/guide.ts                         jobs topic に --from-issue 節追加
src/cli/__tests__/from-issue.test.ts              TC-002〜TC-012（480 行）
src/core/job/__tests__/start-from-issue.test.ts  TC-001（90 行）
src/git/__tests__/branch.test.ts                  TC-013/TC-014（52 行）
tests/unit/architecture/arch-allowlist.ts         from-issue.ts の CWD allowlist 追記
```

## 検証した項目

### R-1: job start SHALL accept --from-issue

- `RUN_JOB_FLAGS` に `"from-issue": { type: "integer", min: 1 }` が追加（command-registry.ts:548）。
- `runJobHandler` が `fromIssue` を読み出し `runFromIssue` へ委譲（command-registry.ts:583–594）。
- `runFromIssue` が GitHub 取得 → parse → guard → `materializeDraftAndStart` の全工程を実行（from-issue.ts）。
- **適合**

### R-2: fidelity comparator を実行してはならない（MUST NOT）

- `materializeDraftAndStart` が `runRunCore(..., { inboxOrigin: true })` を呼ぶ（start-from-issue.ts:32）。
- `pipeline-run.ts` が `inboxOrigin=true` を `jobState.inboxOrigin` に伝播（既存配線）。
- `issue-fidelity-gate.ts:106` が `inboxOrigin===true` で comparator を skip（既存配線）。
- TC-001（start-from-issue.test.ts）: `runRunCore` 呼び出し引数に `inboxOrigin: true` が含まれることを pin。
- TC-002（from-issue.test.ts）: `evaluateIssueFidelityGate` を実実装で呼び、`inboxOrigin: true` 時にcomparator が呼ばれないことを pin。
- **適合**

### R-3: base-branch guard を適用しなければならない（MUST）

- `getCurrentBranch(repoRoot)` で現在 branch を取得（branch.ts: `symbolic-ref --short -q HEAD`、detached HEAD は `null`）。
- `current !== baseBranch`（null 含む）で `baseBranchMismatchError` を throw → `logError` → 非ゼロ exit（from-issue.ts:105–110）。
- guard は `writeDraft` より前に実行（parse 後・materializeDraftAndStart 前）。
- エラー文言: `current branch ${currentLabel} does not match request base-branch "${baseBranch}"`（両値含む）。
- detached HEAD: `currentLabel = "(detached HEAD)"` でメッセージ生成（errors.ts:548）。
- positional / inbox 経路は `runFromIssue` を通らないため guard 無影響。
- TC-003: 不一致 → 非ゼロ exit・`materializeDraftAndStart` 未呼び出し・メッセージに両値含むを pin。
- TC-004: detached HEAD → 非ゼロ exit・`materializeDraftAndStart` 未呼び出し・メッセージに "detached" 含むを pin。
- **適合**

### R-4: --from-issue と positional / --issue は排他（MUST）

- `fromIssue !== undefined && hasPositional` → `logError("mutually exclusive")` + `process.exit(ARG_ERROR)`（command-registry.ts:566–568）。
- `fromIssue !== undefined && parsed.flags["issue"] !== undefined` → 同様（command-registry.ts:572–574）。
- `--detach` に排他は設けていない（通常の detach 契約が成立）。
- TC-005/TC-006: exit 2（ARG_ERROR）と "mutually exclusive" メッセージを pin。
- TC-007: `detach: true` で `detachSelf` が呼ばれることを pin。
- **適合**

### R-5: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit（MUST）

- `githubClient.getIssue` の失敗を `writeDraft` より前に catch（from-issue.ts:78–86）。
- `SpecRunnerError` は `err.exitCode` で返却、それ以外は `GENERAL_ERROR`（= 1）。
- TC-008: `getIssue` が throw → 非ゼロ exit・`materializeDraftAndStart` 未呼び出しを pin。
- **適合**

### R-6: issue 本文の request parse 失敗は副作用ゼロでエラー終了（MUST）

- `parseRequestMdContent` は `writeDraft` より前に実行（from-issue.ts:92–102）。
- parse throw を catch → 非ゼロ exit で return。
- TC-009: 不正 body → 非ゼロ exit・`materializeDraftAndStart` 未呼び出しを pin。
- **適合**

### R-7: slug 占有時は既存 SlugOccupiedError 経路に乗る（MUST）

- `materializeDraftAndStart` → `runRunCore` → `assertNoDuplicateLiveJob` が占有を検出（既存配線）。
- `from-issue.ts` 外側 catch が `SpecRunnerError`（`SlugOccupiedError` の親）を捕捉し `err.exitCode` で返却。
- TC-010: `materializeDraftAndStart` が `SlugOccupiedError` を throw → exit 2 を pin。
- **適合**

### R-8: issue → draft → start を単一 core 関数に統合（MUST）

- `materializeDraftAndStart`（src/core/job/start-from-issue.ts）が唯一の実装。
- `run-inbox.ts` の default `startJob` は後半 2 行を `materializeDraftAndStart` 委譲に置換（occupancy pre-check は inbox に残留）。
- inbox のテスト (`run-inbox.test.ts`) は `startJob` をモック注入でテストしており、実装変更は観測挙動を変えない。
- verification: `bun run test` が green（inbox テストを含む）。
- TC-011: `runFromIssue` が `materializeDraftAndStart` を呼ぶことを pin。
- **適合**

### 受け入れ基準のカバレッジ

| 受け入れ基準 | テスト | 適合 |
|---|---|---|
| fidelity gate で comparator が実行されない（テストで pin） | TC-001, TC-002 | ✓ |
| base-branch 不一致: state 未作成・draft 未残留・非ゼロ exit・両値エラー | TC-003, TC-004 | ✓ |
| 排他 usage エラー 2 系（positional / --issue 併用） | TC-005, TC-006 | ✓ |
| parse 失敗時に副作用ゼロでエラー終了（テストで pin） | TC-009 | ✓ |
| slug 占有時は既存 SlugOccupiedError 経路 | TC-010 | ✓ |
| inbox 既存テストが無改変で green | verification（test phase） | ✓ |
| `bun run typecheck` / `bun run test` green | verification-result.md（全 phase passed） | ✓ |

### ヘルプ・guide の追随（要求 #6）

- `job start` help summary に `--from-issue <n>` 行追加（fidelity skip・base-branch guard・排他を明示）（command-registry.ts:874）。
- guide `jobs` topic に `### --from-issue: issue を request として直接起動` 節追加（guide.ts）。契約（fidelity skip・base-branch guard・排他）を全て記載。
- **適合**

## 検証できなかった項目

None

## Findings 詳細

None — 全 normative 項目が適合。
