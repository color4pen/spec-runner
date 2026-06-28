# Conformance Result

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
| tasks.md | ✅ | 全 6 タスク（T-01〜T-06）のチェックボックスが [x] 済み |
| design.md | ✅ | D1〜D7 の全設計判断が実装に反映されている（詳細は下記） |
| spec.md | ✅ | 全 7 Requirements / 12 Scenarios がテストで固定されている |
| request.md | ✅ | 9 個の受け入れ基準すべてに対応するテストが green |

---

## 1. Tasks Completeness

All task checkboxes in tasks.md are marked `[x]`:

| Task | Status |
|------|--------|
| T-01: archive 記帳を feature-branch 上で実行 | ✅ |
| T-02: post-merge cleanup を独立 step として切り出す | ✅ |
| T-03: merge-then-archive を「記帳 → CI 待ち → merge → cleanup」へ再順序化 | ✅ |
| T-04: CLI 配線を記帳専用へ更新 | ✅ |
| T-05: テストを更新・追加して受け入れ基準を固定 | ✅ |
| T-06: 検証（typecheck + test green） | ✅ |

---

## 2. Design Decisions

### D1: archive 記帳を feature-branch working tree 上で実行する
**Implemented.** `orchestrator.ts` Phase 1: worktree モードは `recordDir = worktreePath`（既に feature branch 上）、no-worktree モードは `recordDir = cwd` で `git checkout <feature-branch>`（base ではない）を先行実行。`git checkout <base>` / `git pull --ff-only` / `git push origin <base>` の削除を確認。

### D2: 記帳 commit を remote feature branch へ push し既存 feature PR に相乗りさせる
**Implemented.** `orchestrator.ts` line 294: `git push origin <branch>`（feature branch）のみ実行。archive 専用 PR は作らない。

### D3: status は記帳時点で `archived` に確定させ、merge 後経路は status を書き換えない
**Implemented.** `markJobArchived` を Phase 1（feature branch 上）で呼ぶ。`post-merge-cleanup.ts` には `markJobArchived` / `writeFile`（status 書き込み）の呼び出しが存在しない。`TERMINAL_STATUSES` に中間 status の追加なし。

### D4: post-merge cleanup を独立 step として切り出し、merge 完了後にのみ実行する
**Implemented.** `src/core/archive/post-merge-cleanup.ts` を新規作成。`runArchiveOrchestrator` からは cleanup の呼び出しが消えており、`runMergeThenArchive` の Step 6（merge 成功後）のみで `runPostMergeCleanup` を呼ぶ構造を確認。

### D5: `--with-merge` を「記帳 → CI green 待ち → squash merge → cleanup」へ再順序化
**Implemented.** `merge-then-archive.ts`:
1. Step 2: `runArchiveOrchestrator` で feature branch へ記帳、`archiveSha` を捕捉
2. Step 3: `getPullRequest` で MERGED 判定 → MERGED なら cleanup のみ
3. Step 4: wait loop で `headSha !== archiveSha` の間は CI rollup を信頼しない（D5 の race 対策）
4. Step 5: checkMergeableForMerge + squash merge
5. Step 6: merge 成功後のみ `runPostMergeCleanup`

### D6: `--no-worktree` モードの記帳・cleanup 挙動
**Implemented.** 記帳時は feature branch へ `git checkout <branch>`（base 不使用）。cleanup 時（merge 後のみ）は `git checkout baseBranch` で branch から離れてから local/remote feature branch を削除。merge-less 経路では cleanup 自体が呼ばれないため base checkout も発生しない。

### D7: 冪等性
**Implemented.** Phase 0 の terminal status 短絡（`archived` → no-op, spawn 未呼び出し）。`archiveChangeFolder` / `markJobArchived` / `commitArchive` のいずれも skip-if-done。`--with-merge` 再実行で MERGED なら記帳・merge をスキップし cleanup のみ。

---

## 3. Spec Requirements

### R1: Archive recording lands on feature branch, never on base
- Scenario「記帳 commit が feature branch に乗り remote feature branch へ push される」→ TC-003, TC-AO-FEATURE-PUSH ✅
- Scenario「merge なし archive は base に触れない」→ TC-AO-NO-BASE（`git checkout main` / `git push origin main` が呼ばれないことを spawn spy で固定）✅

### R2: Archive completes when base is protected
- Scenario「protected base 環境で merge なし archive が成功する」→ TC-AO-PROTECTED-BASE（push origin main が exit 1 を返しても archive は exit 0）✅

### R3: Status finalizes to archived at recording time, independent of merge
- Scenario「merge なしでも status が archived に確定する」→ TC-STATUS-CONFIRMED-AT-RECORD（`markJobArchived` が記帳時点で 1 回呼ばれる）✅
- Scenario「merge 後の cleanup は status を書き換えない」→ TC-MTA-STATUS-NO-WRITE（`runPostMergeCleanup` が `writeFile` を呼ばないことを確認）✅

### R4: with-merge waits for CI green on post-archive head, then merges, then cleans up
- Scenario「CI green を待ってから merge し、merge 後に cleanup する」→ TC-MTA-001, TC-MTA-ARCHIVE-SHA ✅
- Scenario「merge が成立しなければ cleanup しない」→ TC-MTA-CLEANUP-POST-MERGE（`mergePullRequest` throw → cleanup 未呼び出し）✅

### R5: No-merge archive preserves feature branch and worktree
- Scenario「merge なし archive は feature branch を残す」→ TC-005（worktree モードで branch -D / remote delete が呼ばれない）、TC-NW-012（no-worktree モードでも orchestrator は branch 削除しない）✅

### R6: No intermediate status is introduced
- Scenario「status 集合と遷移が不変である」→ TC-AO-NO-INTERMEDIATE-STATUS（`TERMINAL_STATUSES` に `archive-recorded` / `archiving` / `recording` が含まれないこと、既知の 4 値のみで構成されることを検証）✅

### R7: Archive recording and cleanup are idempotent and recoverable
- Scenario「記帳済み feature branch への再実行は no-op」→ TC-STATUS-ARCHIVED-NO-OP（status=archived → exit 0, spawn 未呼び出し）、TC-AO-IDEMPOTENT（folder 移動済みでも commit/push が成功）✅
- Scenario「with-merge 再実行で既に merged なら cleanup のみ実行する」→ TC-014（MERGED 検出 → `mergePullRequest` 未呼び出し、`runPostMergeCleanup` 呼び出し）✅

---

## 4. Acceptance Criteria (request.md)

| 受け入れ基準 | テスト | 判定 |
|---|---|---|
| merge なし archive が base への checkout / commit / push を一切行わない | TC-AO-NO-BASE | ✅ |
| 記帳 commit が feature branch 上に存在し remote へ push | TC-003, TC-AO-FEATURE-PUSH | ✅ |
| protected base 環境で merge なし archive が成功 | TC-AO-PROTECTED-BASE | ✅ |
| `--with-merge` が記帳 push 後の headSha を待って merge し、merge 後のみ cleanup | TC-MTA-001, TC-MTA-ARCHIVE-SHA, TC-MTA-CLEANUP-POST-MERGE | ✅ |
| merge の有無に関わらず archive 実行時点で status が `archived` | TC-STATUS-CONFIRMED-AT-RECORD | ✅ |
| merge 後の cleanup 経路が job status を書き換えない | TC-MTA-STATUS-NO-WRITE | ✅ |
| archive-recorded 等の中間 status が導入されていない | TC-AO-NO-INTERMEDIATE-STATUS | ✅ |
| 記帳済み feature branch への再実行が no-op | TC-STATUS-ARCHIVED-NO-OP, TC-AO-IDEMPOTENT | ✅ |
| `typecheck && test` が green | verification-result.md（5641 tests passed） | ✅ |

---

## 5. Findings

特記すべき問題なし。

- `post-merge-cleanup.ts` は job status への書き込みを一切行わない（D3 の不変をコード構造で保証）。
- no-worktree の cleanup での `git checkout baseBranch` は merge-path 内にのみ存在し（merge-less 経路では cleanup 自体が呼ばれない）、「merge なし archive は base への checkout を一切行わない」要件 1 と矛盾しない。
- `archiveSha` gating により、記帳 commit 直後の GitHub eventual consistency による旧 headSha 誤信頼を構造的に防止している（D5）。
- ADR 生成（adr-gen step）は本 request で `adr: true` が設定されており、pipeline が次 step で実行する。conformance の評価対象外。
