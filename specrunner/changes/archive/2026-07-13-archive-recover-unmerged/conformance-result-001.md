# Conformance Result — archive-recover-unmerged — iter 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | 全 7 タスクのチェックボックスが [x] 済み、実装と一致 |
| design.md | ✅ | D1–D6 全設計決定が実装に反映されている |
| spec.md | ✅ | 全 Requirements と Scenarios がテストで固定されている |
| request.md | ✅ | 全受け入れ基準が満たされ typecheck && test green |

---

## Judgment Detail

### 1. tasks.md — 全タスク完了確認

全 7 タスクのチェックボックスが `[x]` になっていることを確認した。実装との対応:

**T-01** (`ArchiveInput.deferArchivedTransition`): `orchestrator.ts:62` に `deferArchivedTransition?: boolean` が追加されており、`!input.deferArchivedTransition` ガード（`:260`）で `markJobArchived` をスキップしながら `archiveChangeFolder` / `commitArchive` / `git push` / `headSha` 捕捉をこれまで通り実行する。Phase 0 の terminal 短絡（`:149–151`）は不変。

**T-02** (worktree archive 走査 section 2b): `job-state-store.ts:322–363` に `opts?.includeArchived === true` を条件とする section 2b が追加されている。`parseArchiveDirName` で slug 抽出、`sourceChangeDir` を worktree archive dated dir として compose し、`tryMerge` に委ねる実装。

**T-03** (`merge-then-archive` 改修): Step 1 が `listWithSourceDirs({ includeArchived: true })` を使用（`:154`）、`archiveRecorded = path.basename(path.dirname(sourceChangeDir)) === "archive"` で記録済みシグナルを導出（`:179`）、Step 2 が `archiveRecorded` で分岐（`:217`）、Step 3 が `deferArchivedTransition: true` を渡す（`:249`）、`performPostMergeTransition` ヘルパーが 3 つの merge-success 経路（Step 2 resume 経路`:220`、Step 4 wait loop`:354`、Step 5 fresh merge`:614`）で cleanup 直前に呼ばれる。

**T-04** (store テスト): `job-state-store-list-with-source-dirs.test.ts` に TC-003（worktree archive 発見）、TC-012（includeArchived: false で非発見）、TC-013（dedup newest updatedAt 勝ち）が real-fs fixture テストとして追加されている。

**T-05** (merge-then-archive テスト): `merge-then-archive.test.ts` が `listWithSourceDirs` mock（`:34`）と `markJobArchived` mock（`:56`）を使用し、TC-001 / T-01 / T-02 / TC-004 / TC-005 / TC-006 / TC-014 / TC-015 / TC-016 / T-PMI-04 が追加・更新されている。

**T-06** (orchestrator テスト): `orchestrator.test.ts` に TC-009（deferArchivedTransition: true で markJobArchived 非呼び出し）、TC-010（unset で markJobArchived 呼び出し）が追加されている。

**T-07** (既存テスト回帰): verification-result.md で `typecheck` および `test` が passed（green）であることを確認した。

### 2. design.md — 設計決定適合

**D1** (記帳時の `archived` 遷移遅延): `deferArchivedTransition` option が `orchestrator.ts` に実装され、default `false`（plain 経路不変）で `merge-then-archive` Step 3 のみ `true` を渡す。設計の意図どおり「merge 後まで status が `awaiting-archive` に留まる」構造になっている。

**D2** (記録済みシグナルを folder 位置へ): `merge-then-archive.ts:179` の `path.basename(path.dirname(sourceChangeDir)) === "archive"` が設計記述（D2）と一字一句対応している。`jobStatus === "archived"` による判定は廃止されており、Step 1 の `listWithSourceDirs` が `sourceChangeDir` を返すことで成立する。

**D3** (遷移を post-merge cleanup 直前に集約): `performPostMergeTransition` ヘルパーが 3 経路（Step 2 MERGED+記録済み resume / Step 4 merge-during-wait / Step 5 fresh merge）全てで cleanup の直前に呼ばれている。integrity check 失敗時（Step 5.5 で `!integrityResult.ok` → early return）は cleanup も遷移も走らない。best-effort（失敗は warning + 継続）も実装されている（`:638–644`）。

**D4** (section 2b 追加): `job-state-store.ts:322–363` が D4 設計の通り実装されている。`includeArchived` gate により影響範囲を section 1b と同一 caller 集合に限定している。

**D5** (中間 status 不新設): `src/state/lifecycle.ts` は変更されていない（diff に含まれない）。status 集合・遷移表は不変。

**D6** (CLI 配線不変): `src/cli/archive.ts` は diff に含まれず、`deferArchivedTransition: true` は `merge-then-archive` 内部でのみ設定される。

### 3. spec.md — Requirements・Scenarios 適合

| Requirement | 適合テスト |
|-------------|------------|
| 記帳後・merge前は awaiting-archive (MUST) | TC-001: `deferArchivedTransition: true` 呼び出しを直接 assert |
| merge失敗後に再解決でき merge retry 可能 (MUST ×3) | T-02（No job found 非返却）、TC-003（worktree archive 発見） |
| archive/ 位置で記録済み判定・crash-resume と順序エラー区別 (MUST ×3) | TC-004（記録済み+MERGED → cleanup）、TC-005（未記録+MERGED → 順序エラー） |
| merge成功後 archived 遷移 + cleanup (MUST ×2) | TC-006（fresh merge）、TC-014（merge-during-wait）、TC-004（crash resume） |
| plain archive 挙動不変 (MUST / MUST NOT) | TC-010（markJobArchived 呼び出し回帰確認） |
| 中間 status 不新設 (MUST NOT ×2) | D5 確認済み（lifecycle.ts 不変） |

### 4. request.md — 受け入れ基準適合

| 受け入れ基準 | 状態 |
|-------------|------|
| 記帳後・merge前に再解決可能（awaiting-archive）をテストで固定 | TC-001 ✅ |
| merge失敗後の再実行で job 解決・idempotent 記帳・merge retry をテストで固定 | T-02 / TC-003 ✅ |
| merge成功後 archived 遷移 + cleanup をテストで固定 | TC-006 / TC-014 ✅ |
| 記録済み + PR merged の crash resume 機能維持をテストで固定 | TC-004 ✅ |
| plain archive 既存挙動不変を既存テストで確認 | TC-010 / T-07 ✅ |
| typecheck && test が green | verification-result.md: passed ✅ |

---

## 確認した不変条件

- `merge-then-archive` の merge **失敗** 経路（conflict / checks-failed / timeout / BLOCKED 等）では `performPostMergeTransition` も `runPostMergeCleanup` も呼ばれない。TC-015 で確認済み。
- integrity check 失敗（T-PMI-01）では cleanup も遷移も行われない。merge 完了後でも cleanup は走らない。
- `markJobArchived` の best-effort 設計（TC-016）: 失敗時は stderr warning を出してクリーンアップは継続し exit code 0 を返す。

## 結論

実装は tasks.md / design.md / spec.md / request.md の全要件を満たしており、`bun run typecheck && bun run test` が green であることが verification-result.md で確認されている。
