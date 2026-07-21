# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更スコープ

`git diff main...HEAD --stat`: 40 ファイル、5,543 挿入、13 削除。
前回（iteration 1）の regression-gate 3 指摘（usage 動的参照化 / FoldResult.operatorEvents 必須化 / B-13 パターン appendOperatorEvent 追加）が commit e1438f7b5 で適用済みの HEAD に対してレビュー。

### ゲート確認

| ゲート | 結果 |
|--------|------|
| `bun run typecheck` (tsc --noEmit) | ✓ 0 errors |
| `bunx vitest run` | ✓ 590/590 files, 8,628 passed, 1 skipped |

### テストケース充足確認 (test-cases.md 全 24 件)

| TC | 優先 | 担当テストファイル | 充足 |
|----|------|--------------------|------|
| TC-001 | must | reopen-command.test.ts | ✓ |
| TC-002 | must | lifecycle-reopen.test.ts | ✓ |
| TC-003 | must | reopen-command.test.ts | ✓ |
| TC-004 | must | command-registry-reopen.test.ts | ✓ |
| TC-005 | must | reopen-command.test.ts | ✓ |
| TC-006 | must | reopen-command.test.ts | ✓ |
| TC-007 | must | reopen-command.test.ts | ✓ |
| TC-008 | must | reopen-command.test.ts | ✓ |
| TC-009 | must | event-journal-operator-event.test.ts | ✓ |
| TC-010 | should | command-registry-reopen.test.ts | ✓ |
| TC-011 | must | reopen-approval-invalidation.test.ts | ✓ |
| TC-012 | must | reopen-approval-invalidation.test.ts | ✓ |
| TC-013 | must | reopen-command.test.ts | ✓ |
| TC-014 | must | reopen-command.test.ts | ✓ |
| TC-015 | must | reopen-command.test.ts | ✓ |
| TC-016 | must | lifecycle-reopen.test.ts | ✓ |
| TC-017 | must | lifecycle-reopen.test.ts | ✓ |
| TC-018 | should | reopen-command.test.ts | ✓ |
| TC-019 | must | command-registry-reopen.test.ts | ✓ |
| TC-020 | should | reopen-command.test.ts | ✓ |
| TC-021 | should | reopen-command.test.ts | ✓ |
| TC-022 | should | event-journal-operator-event.test.ts | ✓ |
| TC-023 | should | event-journal-operator-event.test.ts | ✓ |
| TC-024 | should | command-registry-reopen.test.ts + event-journal-operator-event.test.ts | ✓ |

### 受け入れ基準確認

| AC | 根拠 |
|----|------|
| awaiting-archive(PR open)→reopen→新iteration追加 | TC-008: `state.steps`/`reviewerStatuses`が prepare後も保持。iteration path が `-002.md` |
| merged PR / archived / canceled → reopen 拒否 | TC-005/006/007: PrepareError thrown、persist with status=running なし |
| operator event (reason) が journal に記録 | TC-009: `fold()` round-trip で `operatorEvents[0]` フィールドを検証。TC-021: event が transition より先に呼ばれる |
| reopen 後の revision binding 再確立（stale 承認不使用） | TC-011/012: `selectPendingMembers`(oldSha≠newSha→pending) / `conformanceApprovedForVerifiedRevision`(mismatch→false) を pin |
| `job resume` で引き続き拒否 | TC-003: `ResumeCommand.prepare()` が `awaiting-archive` で throw、`transitionJob(...,"running")` 呼ばれない |
| typecheck && test green | ✓ |

### 実装ウォークスルー

**T-01 lifecycle.ts**: `VALID_TRANSITIONS` / `canTransition` は無変更。`REOPEN_TRANSITIONS` は独立 `ReadonlyMap`。`transitionJob` の 4th 引数は optional で default-off。`allowReopen: false` / 省略でも既存 throw を保持（TC-017）。B-17 invariant test が `allowReopen: true` の call-site を `src/core/command/reopen.ts` に一本化。

**T-02 event-journal.ts / job-journal.ts**: `OperatorEventRecord` を `EventRecord` union に追加。`FoldResult.operatorEvents: OperatorEventRecord[]` は required field。手書き `FoldResult` リテラル 3 箇所（job-journal.ts ENOENT、job-state-projection.ts empty fallback、journal-integrity.test.ts makeFoldResult）に `operatorEvents: []` を追加。TC-024 round-trip（実 fs、実 store）でパス。

**T-03 ReopenCommand**: `prepare()` のシーケンスを確認：
1. worktree guard → 2. slug 解決 → 3. status gate (awaiting-archive のみ許可) → 4. PR gate (null client/MERGED/CLOSED/query error → fail-closed) → 5. step 解決 → 6. request.md parse → 7. store 構築 → 8. `appendOperatorEvent`（transition より前） → 9. `transitionJob({allowReopen:true})` + `store.persist` → 10. PrepareResult 返却。patch は `{error:null, resumePoint:null, mainCheckoutDrift:null, pid}` のみ（TC-020）。

D6 durability: `appendOperatorEvent` 後に `store.persist` が失敗しても operator event は残る。

**T-04 src/cli/reopen.ts**: `resume.ts` と同構造。`resolveJobStateBySlug` で owner/name を取得して `bootstrap()` に渡す（state が null なら空文字列でフォールバック）。GitHub token を resolve して `GitHubClient` を構築（失敗なら null → PR gate が fail-closed）。`arch-allowlist.ts` に 2 エントリ（CWD di-default）を追加済み。

**T-05 command-registry.ts**: `reopen` subcommand に `from`(string, values=AGENT_STEP_NAMES∪CLI_STEP_NAMES) / `reason`(string) を宣言。handler で両フラグの欠如を検出して `EXIT_CODE.ARG_ERROR` で exit。`guardedSubcommands` に追加。`REOPEN_USAGE` 文字列を定義。

**T-06 承認失効調査**: 実ルーティングコードを確認。`selectPendingMembers`（commitOid 不一致 → pending、null approvedAtCommit → fail-closed）と `conformanceApprovedForVerifiedRevision`（commitOid mismatch → false）の両方がカバー済み。明示的無効化コードは不要と確認し、追加なし。TC-011/TC-012 で pin。

**アーキテクチャ変更**: `architecture/model.md` / `architecture/conformance.md` に B-17 追加。`core-invariants.test.ts` に B-17 test suite（liveness・違反検出・許可ファイル除外の 3 sub-test）。B-13 grep が `appendOperatorEvent` を含むよう拡張。

## 検証できなかった項目

None — 全受け入れ基準・全 test case を automated tests と実装コードウォークスルーで確認。

## Findings 詳細

### F-001 — INFO: `--from` の `values` 制約がカスタムレビューワーのステップ名を CLI パーサーで遮断する

**場所**: `src/cli/command-registry.ts:640`（reopen）/ 同 576（resume、同一パターン）

`flag-parser.ts` 行 117-119 は `values` に含まれない値を `FlagParseError` で拒否する。
`AGENT_STEP_NAMES ∪ CLI_STEP_NAMES` にカスタムレビューワー名（例: `security`）は含まれないため、
`--from security` はパーサーで遮断され `ReopenCommand.prepare()` の `resolveResumeStep` / `mapMemberToCoordinator` に届かない。

design.md D1 は「dynamic reviewer step names work unchanged」と記述しているが、CLI レイヤーで遮断される。

**severity: INFO**（新規 regression なし）— `resume` でも同じ `values` 制約があり、pre-existing な挙動の踏襲。reopen が resume を忠実に模倣した結果。修正が必要な場合は resume / reopen 双方で同一対応が必要になる独立スコープ。
