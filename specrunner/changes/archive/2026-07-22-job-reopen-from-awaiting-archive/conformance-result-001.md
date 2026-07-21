# Conformance Result — job-reopen-from-awaiting-archive — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Tasks: 全 checkbox 完了確認

tasks.md の T-01〜T-11 すべてが `[x]` でマーク済み。

| Task | 内容 | 完了 |
|------|------|------|
| T-01 | REOPEN_TRANSITIONS + transitionJob opts | ✅ |
| T-02 | OperatorEventRecord + fold + appendOperatorEvent | ✅ |
| T-03 | ReopenCommand (core) | ✅ |
| T-04 | CLI entry (src/cli/reopen.ts) | ✅ |
| T-05 | command-registry reopen 登録 | ✅ |
| T-06 | approval invalidation 調査 + revisionChangedSinceLastVerification 追加 | ✅ |
| T-07 | test — reopen transitions and preserves evidence (AC1) | ✅ |
| T-08 | test — reopen rejects ineligible jobs (AC2) | ✅ |
| T-09 | test — reopen writes operator event (AC3) | ✅ |
| T-10 | test — job resume still rejects awaiting-archive → running (AC5) | ✅ |
| T-11 | Final verification (build + typecheck + test) green | ✅ |

### Design decisions (D1〜D8) 実装確認

**D1 — 明示的 `job reopen` コマンド**

`src/core/command/reopen.ts` に `ReopenCommand extends CommandRunner` が実装され、`src/cli/reopen.ts` が薄い CLI エントリとして `runReopen` / `runReopenCore` を提供。`ResumeCommand` と同一構造（prepare() override + Template Method）。確認済み。

**D2 — Operator-scoped FSM edge (REOPEN_TRANSITIONS)**

`src/state/lifecycle.ts`:
- `REOPEN_TRANSITIONS` が `Map<"awaiting-archive", Set<"running">>` として export されている。
- `VALID_TRANSITIONS` は変更なし（awaiting-archive → running は引き続き含まれない）。
- `transitionJob` に第4引数 `opts?: TransitionOpts` が追加され、`opts?.allowReopen === true` の場合のみ REOPEN_TRANSITIONS を参照する。
- `canTransition` は変更なし。

**D3 — Fail-closed 前提条件ゲート**

`ReopenCommand.prepare()` で以下を順に検証:
1. worktree guard (exit 2)
2. status !== "awaiting-archive" → exit 1、archived/canceled は明示メッセージ
3. pullRequest?.number 未設定 → exit 1
4. githubClient === null → exit 1（fail-closed）
5. getPullRequest() throw → exit 1
6. prState === "MERGED" → exit 1
7. prState === "CLOSED" → exit 1
8. OPEN のみ続行

**D4 — 証跡の不変保持**

`transitionJob` の patch は `{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid }` のみ。`steps`, `reviewerStatuses`, `decisions`, `biteEvidence` への書き込みは一切ない。TC-020 がこれをピン。

**D5 — 承認失効: revision 束縛との整合**

T-06 の調査で以下の gap が発見・対処済み:

シナリオ: reopen from code-review → 人間が push → code-review pass (code-fixer 不要) → conformance が新 SHA で approved。`codeChangedSinceLastVerification`（timestamp 比較）は false を返す（specrunner mutator が走っていない）が、verification は旧 SHA で実施済み。`reverificationNeeded` が false のまま conformance → adr-gen に進むと、旧 SHA の verification で新コードを保証したことになる。

対処: `src/core/pipeline/reverification.ts` に `revisionChangedSinceLastVerification` を追加し、`reverificationNeeded = codeChangedSinceLastVerification || revisionChangedSinceLastVerification` に更新。

- `selectPendingMembers`（reviewer-status.ts）: approvedAtCommit ≠ baselineCommit → pending。TC-011 でピン。
- `conformanceApprovedForVerifiedRevision`（reverification.ts）: conformance.commitOid ≠ verification.commitOid → false。TC-012 でピン。

**D6 — Operator event を append-only journal に記録**

- `OperatorEventRecord` 型が `EventRecord` union に追加（event-journal.ts）。
- `fold()` が `operatorEvents: OperatorEventRecord[]` を返すよう更新。
- `JobJournal.appendOperatorEvent()` / `JobStateStore.appendOperatorEvent()` を追加。
- ENOENT branch の手書き `FoldResult` literal に `operatorEvents: []` を追加（job-journal.ts:148）。
- `appendOperatorEvent` は `transitionJob + persist` より前に実行される（D6 durability）。TC-021 でピン。

**D7 — Branch / PR 保持**

`ReopenCommand.prepare()` は cancel 系クリーンアップ関数を一切呼ばない。pr-create は OPEN PR を `existing-open` として再利用（idempotent）。

**D8 — Runtime / minimumAssurance 非依存**

slug-canonical store + GitHubClient（両 runtime で利用可）を使用。`minimumAssurance` は参照しない。

### Spec requirements 対応確認

| Requirement | シナリオ | テスト |
|---|---|---|
| awaiting-archive → running (reopen のみ) | Scenario 1, 2 | TC-001, TC-002, TC-016, TC-017 |
| job resume 引き続き拒否 | Scenario: resume rejected | TC-003, TC-017-c |
| --from と --reason 必須 | Scenario: missing --reason | TC-004 (CLI registry test) |
| 不適格 job の拒否 | Scenario 各種 | TC-005〜TC-007, TC-013〜TC-015 |
| 証跡保持・新 iteration 追加 | Scenario: appends not overwrites | TC-008-a, TC-008-b |
| operator event 記録 | Scenario: event in journal | TC-021, TC-022, TC-023, TC-024 |
| branch / PR 保持 | Scenario: PR survives reopen | TC-010 (CLI registry) + コード確認 |
| 承認の revision 再束縛 | Scenario: stale approval / stale conformance | TC-011, TC-012 |

### 受け入れ基準 (AC1〜AC6) テスト固定確認

**AC1** — reopen → 再実行 → 新 iteration が旧証跡を上書きしない:
`TC-008-a`（state.steps / reviewerStatuses 保持）、`TC-008-b`（`specReviewResultPath(slug, 2)` = `*-002.md`）でテスト固定。

**AC2** — merged PR / archived / canceled への reopen 拒否:
`TC-005`（MERGED）、`TC-006`（archived）、`TC-007`（canceled）、`TC-013`（no PR）、`TC-015-a/b`（query failure / no client）でテスト固定。全ケースで status 変更なし。

**AC3** — operator event（reason 含む）が journal に記録される:
`TC-021` が `appendOperatorEvent` の呼び出し順・フィールド（type / action / reason / fromStep / ts）をピン。`TC-009`（fold 後の operatorEvents 内容）でも固定。

**AC4** — 再実行で revision binding が新 revision に張り直される（stale 承認が routing に再利用されない）:
`TC-011`（selectPendingMembers, oldSha ≠ newSha → pending）、`TC-012`（conformanceApprovedForVerifiedRevision, commitOid mismatch → false）でテスト固定。

**AC5** — `job resume` 経由では引き続き awaiting-archive → running が拒否:
`TC-003`（ResumeCommand.prepare() throw）、`TC-002-a`（canTransition returns false）、`TC-017`（transitionJob without allowReopen throws）でテスト固定。

**AC6** — typecheck && test green:
verification-result.md に `build passed / typecheck passed / test passed (590 files, 8625 tests)` を確認。

### アーキテクチャ不変条件 (B-17)

`tests/unit/architecture/core-invariants.test.ts` に B-17 describe ブロック追加済み。`{ allowReopen: true }` の call-site を `src/core/command/reopen.ts` に限定するアサーションと regression guard が追加されている。`arch-allowlist.ts` に `src/cli/reopen.ts`、`src/core/command/reopen.ts` を追加。

### git diff --stat スコープ

48 files changed, 6466 insertions, 18 deletions。変更は request スコープ内に収まっている。spec/design 以外の source の変更はすべて要件実装の直接結果。

## 検証できなかった項目

None。

## Findings 詳細

None。
