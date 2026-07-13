# Test Cases: archive --with-merge の merge 失敗後に job が復旧不能になる問題を修正

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 13, should: 4, could: 0

---

### TC-001: 記帳後・merge 前の status は awaiting-archive

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 記帳後・merge 前は job が再解決可能な非 terminal 状態を保つ > Scenario: 記帳後・merge 前の status は awaiting-archive

---

### TC-002: merge 失敗後の再実行が job を解決し merge へ進む

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 記帳後・merge 失敗時に job が再解決でき merge を retry できる > Scenario: merge 失敗後の再実行が job を解決し merge へ進む

---

### TC-003: worktree の archive/ 配下の状態が includeArchived 走査で発見される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 記帳後・merge 失敗時に job が再解決でき merge を retry できる > Scenario: worktree の archive/ 配下の状態が includeArchived 走査で発見される

---

### TC-004: 記録済み + PR merged の crash resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 「archive 記録済み」判定を change folder の位置で行い crash-resume と順序エラーを区別する > Scenario: 記録済み + PR merged の crash resume

---

### TC-005: 未記録 + PR merged は順序エラー

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 「archive 記録済み」判定を change folder の位置で行い crash-resume と順序エラーを区別する > Scenario: 未記録 + PR merged は順序エラー

---

### TC-006: fresh merge 成功後に archived へ遷移し cleanup する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: merge 成功後に status を archived へ遷移させ cleanup を実行する > Scenario: fresh merge 成功後に archived へ遷移し cleanup する

---

### TC-007: plain archive は記帳時に archived を確定する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `--with-merge` なしの `job archive` は挙動不変 > Scenario: plain archive は記帳時に archived を確定する

---

### TC-008: status 集合と遷移が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 中間 status を新設しない > Scenario: status 集合と遷移が不変

---

### TC-009: deferArchivedTransition: true で markJobArchived がスキップされる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / T-06

**GIVEN** `runArchiveOrchestrator` が `deferArchivedTransition: true` を渡されて呼ばれる状態  
**WHEN** 記帳フェーズが実行される  
**THEN** `markJobArchived` が呼ばれない  
**AND** `archiveChangeFolder` / `commitArchive` / `git push <feature-branch>` / headSha 捕捉はこれまで通り実行される

---

### TC-010: deferArchivedTransition 未指定で markJobArchived が呼ばれる（回帰防止）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 / T-06

**GIVEN** `runArchiveOrchestrator` が `deferArchivedTransition` を指定せずに呼ばれる状態  
**WHEN** 記帳フェーズが実行される  
**THEN** `markJobArchived` が呼ばれ、status が `archived` へ遷移する

---

### TC-011: 記帳済み folder への deferArchivedTransition: true 再実行で新規 commit を作らない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 > Acceptance Criteria 3

**GIVEN** folder が既に `archive/<YYYY-MM-DD>-<slug>/` へ移動・commit 済みの feature branch  
**WHEN** `deferArchivedTransition: true` で `runArchiveOrchestrator` を再実行する  
**THEN** 新規 commit を作らず（mv skip / staged 変更なし → commit skip）exit 0 で headSha を返す

---

### TC-012: includeArchived: false では worktree archive が発見されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 / T-04

**GIVEN** worktree の `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/state.json` に status `awaiting-archive` の state が存在する  
**WHEN** `listWithSourceDirs` を `includeArchived: false` で呼ぶ  
**THEN** その job が一覧に含まれない

---

### TC-013: 同一 jobId が main archive と worktree archive の双方に存在する場合 newest updatedAt が勝つ

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** 同一 jobId が main checkout archive と worktree archive の双方に存在し、worktree archive の `updatedAt` が新しい  
**WHEN** `listWithSourceDirs` を `includeArchived: true` で呼ぶ  
**THEN** worktree archive の entry が採用され（newest updatedAt 勝ち）、重複は含まれない

---

### TC-014: merge-during-wait 経路でも cleanup 直前に markJobArchived が呼ばれる

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 / T-05

**GIVEN** status `awaiting-archive` の job と、CI wait loop 中に他プロセスが PR を MERGED へ更新した状態  
**WHEN** wait loop が MERGED を検出する  
**THEN** cleanup（`runPostMergeCleanup`）の直前に `markJobArchived(slug, recordDir)` が呼ばれ `awaiting-archive → archived` へ遷移する  
**AND** `runPostMergeCleanup` が実行される  
**AND** `postMergeVerify`（integrity check）は呼ばれない（merge-during-wait 経路の既存挙動を維持）

---

### TC-015: merge 失敗（escalation）経路では status 遷移も cleanup も走らない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-03 > Acceptance Criteria / design.md > D3

**GIVEN** status `awaiting-archive` の job と記帳済みの feature branch  
**WHEN** `job archive --with-merge` の Step 5 squash merge が escalation で失敗する  
**THEN** `markJobArchived` が呼ばれない  
**AND** `runPostMergeCleanup` が呼ばれない  
**AND** escalation が返される

---

### TC-016: markJobArchived の best-effort — 失敗時に warning を出して cleanup を継続する

**Category**: unit
**Priority**: should
**Source**: design.md > D3

**GIVEN** post-merge 遷移時に `markJobArchived` が例外を投げる状態  
**WHEN** post-merge 遷移ヘルパを実行する  
**THEN** `stderrWrite` で warning が出力される  
**AND** `runPostMergeCleanup` が継続して実行される  
**AND** command 全体は失敗（非 0 exit）を返さない

---

### TC-017: typecheck && test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07

**GIVEN** 本変更後のコードベース  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 両コマンドが exit 0 で完了する

---

## Result

```yaml
result: completed
total: 17
automated: 17
manual: 0
must: 13
should: 4
could: 0
blocked_reasons: []
```
