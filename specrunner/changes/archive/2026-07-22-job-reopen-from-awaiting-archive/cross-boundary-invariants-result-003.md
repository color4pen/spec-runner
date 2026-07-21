# Cross-Boundary Invariants Review — Iteration 003

**Change**: job-reopen-from-awaiting-archive  
**Reviewer**: cross-boundary-invariants  
**Date**: 2026-07-22

## Scope

対象は diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかの検出。  
実装の正しさやテスト網羅性ではなく、既存機構との相互作用に潜む欠陥が対象。

---

## Invariant Walk Results

### I-01: FSM 一般遷移テーブル不変性

**観点**: `VALID_TRANSITIONS` の内容が変わっておらず、`canTransition("awaiting-archive", "running")` が false を返し続けるか。

**確認**: `lifecycle.ts` の `VALID_TRANSITIONS` は `awaiting-archive → {archived, canceled}` のままで変更なし。  
新しく追加された `REOPEN_TRANSITIONS = { "awaiting-archive" → {"running"} }` は **別テーブル** であり、`canTransition()` は参照しない。  
`transitionJob()` の第4引数 `opts?.allowReopen` が true の場合のみ `REOPEN_TRANSITIONS` を参照する。

**判定**: 不変条件維持 ✓

---

### I-02: resume 経由での awaiting-archive → running 拒否の保持

**観点**: `ResumeCommand.prepare()` が `canTransition(state.status, "running")` を使用しており、awaiting-archive からの resume が引き続き拒否されるか。

**確認**: `resume.ts:155` の guard は `if (!canTransition(state.status, "running"))` であり、`canTransition` が `VALID_TRANSITIONS` のみを参照するため、`awaiting-archive` からは false が返る。`REOPEN_TRANSITIONS` は参照しない。

**判定**: resume 経由の拒否は維持 ✓

---

### I-03: allowReopen: true の呼び出し元限定

**観点**: `{ allowReopen: true }` の使用が `src/core/command/reopen.ts` に限定されているか。

**確認**: B-17 architectural test（`core-invariants.test.ts:1207`）が production ファイル全体に grep をかけ、`allowReopen: true` リテラルが `src/core/command/reopen.ts` のみに存在することを実行時に検証している。liveness test もあり（少なくとも1件の match を保証）。

**判定**: 呼び出し元限定が機械的に施行されている ✓

---

### I-04: FoldResult リテラルの completeness（operatorEvents フィールド）

**観点**: design.md が明示的に指摘した「FoldResult を手書きで構築している箇所が新フィールドを含む必要がある」問題を調査。

**確認場所2件**:
- `src/store/job-journal.ts:148`: `foldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0, lineage: [], operatorEvents: [] }` ✓
- `src/store/job-state-projection.ts:74`: 同上 ✓

`fold()` 本体は常に `operatorEvents` を populate する。

**判定**: 全リテラル更新済み ✓

---

### I-05: assertJobFinishable / archive 経路との相互作用

**観点**: reopen 後に `running` になった job を `job archive` しようとした場合、既存の guard が正しく拒否するか。

**確認**: `assertJobFinishable()` は `canTransition(state.status, "archived")` を使用。  
`VALID_TRANSITIONS["running"] = {awaiting-resume, awaiting-archive, failed, terminated, canceled}` であり `archived` を含まない → 拒否される（throws）。  
また `merge-then-archive.ts` の `--with-merge` 経路で `archive` が先に始まり reopen が後から transition した場合も、`transitionJob("running", "archived")` が throw するため fail-closed になる。

**判定**: archive 経路は fail-closed ✓

---

### I-06: beforeExit exit-guard との相互作用

**観点**: reopen 後の `running` job が process exit 時に exit-guard によって正しく `awaiting-resume` に遷移するか。

**確認**: `exit-guard.ts` は `if (state.status !== "running") return;` で running 以外をスキップ。reopen 後の job は `running` 状態になるため、exit-guard が正常に `awaiting-resume` に遷移させる。

特殊ケース（`appendOperatorEvent` 後・`store.persist(transitioned)` 前の narrow window での process kill）:  
- この時点では state.json はまだ `awaiting-archive`
- exit-guard は `awaiting-archive !== running` のためスキップする → 不変条件を壊さない
- events.jsonl に operator event record が残る（orphan）が、`job reopen` の再実行で追加 record が append されるだけで benign

**判定**: exit-guard との相互作用は正常 ✓

---

### I-07: 承認失効の revision 束縛（commitOid 照合）

**観点**: `selectPendingMembers` と `conformanceApprovedForVerifiedRevision` が、reopen 後の新 revision で古い承認を再利用しないか。

**確認**:
- `selectPendingMembers`（`reviewer-status.ts:95`）: `baselineCommit != null` の場合、`approvedAtCommit !== baselineCommit` で stale 承認を pending に戻す。null approvedAtCommit は fail-closed（pending 扱い）。
- `conformanceApprovedForVerifiedRevision`（`reverification.ts:108`）: conformance.commitOid === verification.commitOid の4条件が全て満たされた場合のみ true（fail-closed）。

TC-011 と TC-012 が pin test としてこれらを固定している。

**判定**: 承認失効は commitOid 束縛で正しく機能する ✓

---

### I-08: appendOperatorEvent の B-13 適用範囲

**観点**: B-13 アーキテクチャテスト（`executor.ts` による store 永続化 API の直接呼び出し禁止）が `appendOperatorEvent` を対象に含んでいるか。

**確認**: `core-invariants.test.ts:1014` の B-13 pattern は:
```
store.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)(
```
`appendOperatorEvent` は**含まれていない**。これは:
1. `appendOperatorEvent` は `PipelineDeps.StoreApi` 型にないため、step executor が DI で受け取る store 経由で通常は到達できない
2. ただし `deps.storeFactory(jobId)` から直接 `JobStateStore` インスタンスを取得すれば呼び出し可能
3. 現在の実装では `executor.ts` / `parallel-review-round.ts` で `appendOperatorEvent` を呼ぶコードは存在しない

結果: **現在は違反なし**だが B-13 test が `appendOperatorEvent` を監視していないため、将来の誤追加が機械的に検出されない。

**判定**: 現在の実装は正しいが、B-13 pattern に `appendOperatorEvent` を追加するとガードが強化される。**テストカバレッジ gap として記録。**

---

### I-09: B-10 host↔token 束縛

**観点**: `src/cli/reopen.ts` の新規 `resolveGitHubToken` / `createGitHubClient` 呼び出しが B-10 を満たすか。

**確認**:
```typescript
await resolveGitHubToken(process.env as ..., { host: githubHost });  // host: あり ✓
createGitHubClient(fetch, token, githubApiBaseUrl);                  // 3引数 ✓
```

**判定**: B-10 満たす ✓

---

### I-10: CWD ratchet

**観点**: `src/cli/reopen.ts` と `src/core/command/reopen.ts` の `process.cwd()` 参照が CWD allowlist に登録されているか。

**確認**: `arch-allowlist.ts` に以下の2エントリが追加済み:
- `src/cli/reopen.ts` / `options.cwd ?? process.cwd()` / CWD-reopen-cli-di-default
- `src/core/command/reopen.ts` / `this.options.cwd ?? process.cwd()` / CWD-core-reopen-di-default

**判定**: CWD ratchet 適用済み ✓

---

### I-11: RESOLVE_REPO_ROOT_ALLOWED_FILES への影響なし

**観点**: `src/cli/reopen.ts` が `resolveRepoRoot*` を直接呼ばず、TC-003 の confinement invariant を侵害しないか。

**確認**: `src/cli/reopen.ts` は `resolveRepoRoot` を import していない。`bootstrap(cwd, ...)` を経由する。ファイル内で `resolveRepoRoot` の呼び出しは0件。

**判定**: RESOLVE_REPO_ROOT 制約に影響なし ✓

---

### I-12: TERMINAL_STATUSES 不変性

**観点**: `TERMINAL_STATUSES = { archived, canceled }` が変更されていないか。

**確認**: `lifecycle.ts:58` は変更なし。`archived` と `canceled` のみが terminal。`awaiting-archive` は terminal ではなく、これは設計通り（reopen 可能な状態）。

**判定**: 不変 ✓

---

## Findings

### Finding F-01: B-13 architectural test が `appendOperatorEvent` を監視対象に含んでいない

**Severity**: low  
**Resolution**: fixable  
**File**: `tests/unit/architecture/core-invariants.test.ts`  
**Line**: ~1014

**現状**: B-13 の grep pattern `store.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)(` が `appendOperatorEvent` を含まない。  
**リスク**: 将来誰かが `executor.ts` や `parallel-review-round.ts` に `store.appendOperatorEvent()` を追加した場合、B-13 test が検出できない。`appendInterruption` と `appendLineage` は含まれているのに `appendOperatorEvent` だけ漏れている状態は一貫していない。  
**修正案**: B-13 pattern を `store.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun|appendOperatorEvent)(` に拡張するか、B-13 の liveness test も同様に更新する。

---

## Evidence Summary

| # | 検証項目 | 結果 |
|---|---------|------|
| 1 | VALID_TRANSITIONS 変更なし / canTransition("awaiting-archive", "running") = false | ✓ |
| 2 | ResumeCommand.prepare() の guard が引き続き拒否 | ✓ |
| 3 | allowReopen: true が B-17 test で reopen.ts のみに限定 | ✓ |
| 4 | FoldResult リテラル 2 件に operatorEvents: [] 追加済み | ✓ |
| 5 | assertJobFinishable が running job の archive を拒否 | ✓ |
| 6 | exit-guard が running job を awaiting-resume へ正しく遷移 | ✓ |
| 7 | process kill narrow window での orphan event は benign かつ retry-safe | ✓ |
| 8 | selectPendingMembers: commitOid 不一致で stale 承認を pending 化 (TC-011) | ✓ |
| 9 | conformanceApprovedForVerifiedRevision: commitOid 不一致で false (TC-012) | ✓ |
| 10 | appendOperatorEvent が executor.ts / parallel-review-round.ts から呼ばれていない | ✓ |
| 11 | B-13 が appendOperatorEvent を含まない gap を確認 | ⚠ finding F-01 |
| 12 | B-10 host↔token 束縛: src/cli/reopen.ts の新規呼び出し箇所 | ✓ |
| 13 | CWD ratchet: 両 reopen.ts ファイル allowlist 登録済み | ✓ |
| 14 | RESOLVE_REPO_ROOT_ALLOWED_FILES 侵害なし | ✓ |
| 15 | TERMINAL_STATUSES 不変 | ✓ |

- **checked**: 15
- **skipped**: 0
- **unverified**: 0
