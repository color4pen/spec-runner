# Conformance Result — draft-consume-on-start (iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

Normative sources: `request.md` acceptance criteria + `spec.md` Requirements (SHALL/MUST) and Scenarios.  
Plan context (design.md / tasks.md) — noted but not raised as findings unless they violate normative sources.

---

### Requirement 1: Job start shall consume the canonical draft after the materialization commit succeeds

**consumeDraft helper (src/core/artifact/copy-artifacts.ts)**

- Loops over flat form (`specrunner/drafts/<slug>.md`) and directory form (`specrunner/drafts/<slug>/`).
- Each: `fs.access` (skip if absent) → `git ls-files -- <relPath>` (tracked → warn, skip) → `fs.rm({ recursive: true, force: true })`.
- Non-canonical `requestFilePath` guard: if provided and matches neither `flatAbs` nor `dirAbs`, returns immediately without touching the canonical draft (D2 conformant).
- Deletion targets are derived solely from slug; `requestFilePath` is only a guard, not a deletion target.
- `ponytail:` comment on policy duplication with archive orchestrator is present (D3).

**Three run-path call sites — ordering verified**

| File | Caller block | consumeDraft position |
|------|--------------|-----------------------|
| `workspace-materializer.ts` | `if (opts?.requestFilePath)` | after `appendSynthesizedCommit` (post-commit, post-rev-parse) |
| `local.ts` | `if (isRunPath && opts?.requestFilePath)` | after `appendSynthesizedCommit` (post-commit, post-rev-parse) |
| `managed.ts` | `if (opts?.requestFilePath)` | after second `git push` succeeds (post-commit, post-rev-parse, post-push) |

In all paths the commit (and rev-parse / push) throw on non-zero exit, so control never reaches `consumeDraft` on failure.

**Scenarios coverage**

| Scenario | Test |
|----------|------|
| directory-format draft consumed on successful start | `copy-artifacts.test.ts` TC-001; `bootstrap-egress-ledger-wm.test.ts` TC-001/002 |
| flat-format draft consumed on successful start | `copy-artifacts.test.ts` TC-002; `bootstrap-egress-ledger-wm.test.ts` TC-001/002 |
| start failure before commit preserves draft | `bootstrap-egress-ledger-wm.test.ts` TC-003 — commit exitCode 1 → materialize rejects → dirDraft confirmed present |
| git-tracked draft warned, not deleted | `copy-artifacts.test.ts` TC-004 — `ls-files` non-empty stdout → draft survives + stderr warning |
| non-canonical request path does not consume canonical draft | `copy-artifacts.test.ts` TC-005 (two sub-cases) |
| managed push failure after commit preserves draft | `bootstrap-egress-ledger-managed.test.ts` TC-010 — second push exitCode 1 → dirDraft confirmed present |
| no-op when no draft present | `copy-artifacts.test.ts` TC-009 — spawnFn not called |

---

### Requirement 2: Resume shall not recopy the draft into the change folder

**recopyDraftToChangeFolder deleted**

`grep -rn recopyDraftToChangeFolder src/` → 0 results. All 4 call sites removed:
- `workspace-materializer.ts` resume-existing and resume-recreated/without-recorded-worktree arms: no copy call.
- `local.ts` resume branch: no copy call.
- `managed.ts` resume branch (`if (!branchName)`): no copy call.

TC-RECOPY-001~005 confirmed deleted from `tests/unit/util/copy-artifacts.test.ts`.

**Scenario: operator-edited request.md survives a subsequent resume**

`bootstrap-egress-ledger-wm.test.ts` TC-006: operator content in `changes/<slug>/request.md`, stale-content draft in repo root, `resume-existing` materialize called — post-call content equals operator content. ✓

---

### Requirement 3: cancel --restore-draft shall restore the draft from the change-folder request.md

`src/core/cancel/runner.ts` is **unchanged** (`git diff main...HEAD -- src/core/cancel/runner.ts` = empty). With draft consumed at start, draft is absent when cancel runs → "draft already exists; skipping restore" branch is not hit in the normal path.

Test: `runner.test.ts` — "writes drafts/`<slug>`/request.md and returns info entry when restoreDraft: true" (TC-007) — unchanged, confirmed green by verification-result.md.

---

### Requirement 4: archive draft cleanup shall remain as a backstop

`src/core/archive/orchestrator.ts` is **unchanged** (`git diff main...HEAD -- src/core/archive/orchestrator.ts` = empty). The backstop is preserved.

Spec scenario "archiving a job whose draft was consumed at start is a no-op for draft cleanup": structurally guaranteed by the unchanged archive code — `fs.rm({ recursive: true, force: true })` on an absent path is a no-op. No dedicated test exists for this scenario; request.md acceptance criteria do not require one.

---

### Request.md acceptance criteria

| Criterion | Status |
|-----------|--------|
| job start 成功後、canonical draft（flat / directory 両形式）が削除されている | ✓ tested |
| start が commit 成立前に失敗した場合、draft が残る | ✓ tested |
| git tracked な draft は削除せず警告する | ✓ tested |
| `recopyDraftToChangeFolder` が存在せず resume 経路に draft からのコピーが無い | ✓ verified (grep + TC-006) |
| operator が request.md を編集して `--apply-canon` 後、後続 resume で内容が巻き戻らない | ✓ tested (TC-006) |
| `cancel --restore-draft` が worktree の request.md から draft を復元する | ✓ tested (existing TC-007, unchanged) |
| 旧挙動 pin テスト TC-RECOPY-001〜005 は削除済み、他の既存テストは無変更で green | ✓ confirmed |
| `typecheck && test` が green | ✓ verification-result.md: typecheck passed, test passed |

---

## 検証できなかった項目

None.

## Findings 詳細

None.
