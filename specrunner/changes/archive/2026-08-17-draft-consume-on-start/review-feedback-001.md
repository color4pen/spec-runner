# Code Review Feedback — draft-consume-on-start — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Gate Checks

| Gate | Result |
|------|--------|
| `grep -r recopyDraftToChangeFolder src/` → 0 hits (TC-012) | ✅ PASS |
| `grep -r recopyDraftToChangeFolder tests/` → 0 hits (TC-012) | ✅ PASS |
| `typecheck && test` green (TC-013) | ✅ PASS (verification-result.md: build/typecheck/test/lint/coverage すべて passed) |
| `src/core/archive/orchestrator.ts` 未変更 | ✅ PASS (diff 0 行) |

### 変更ファイル

| File | 変更内容 |
|------|---------|
| `src/core/artifact/copy-artifacts.ts` | `recopyDraftToChangeFolder` 削除 → `consumeDraft` 追加 |
| `src/core/runtime/workspace-materializer.ts` | resume arm から recopy 除去、new-run arm に `consumeDraft` 追加 |
| `src/core/runtime/local.ts` | resume arm から recopy 除去、run-path arm に `consumeDraft` 追加 |
| `src/core/runtime/managed.ts` | resume arm から recopy 除去、push 成功後に `consumeDraft` 追加 |
| `tests/unit/util/copy-artifacts.test.ts` | TC-RECOPY-001〜005 削除、TC-001/002/004/005/009 追加 |
| `tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts` | TC-001/002/003/006 追加 |
| `tests/unit/core/runtime/bootstrap-egress-ledger-managed.test.ts` | TC-010 追加 |

### Test Coverage vs test-cases.md

| TC | Priority | Status | Evidence |
|----|----------|--------|----------|
| TC-001: directory-format draft consumed | must | ✅ covered | `copy-artifacts.test.ts` TC-001 |
| TC-002: flat-format draft consumed | must | ✅ covered | `copy-artifacts.test.ts` TC-002 |
| TC-003: commit failure preserves draft | must | ✅ covered | `bootstrap-egress-ledger-wm.test.ts` TC-003 |
| TC-004: tracked draft warned, not deleted | must | ✅ covered | `copy-artifacts.test.ts` TC-004 |
| TC-005: non-canonical path → no-op | must | ✅ covered | `copy-artifacts.test.ts` TC-005 |
| TC-006: operator-edited request.md survives resume | must | ✅ covered | `bootstrap-egress-ledger-wm.test.ts` TC-006 |
| TC-007: cancel --restore-draft recreates draft | must | ✅ covered | 既存 `cancel/runner.test.ts` (未変更 / green) |
| TC-008: archive backstop no-op when draft consumed | must | ❌ **MISSING** | 後述 |
| TC-009: consumeDraft no-op when no draft | must | ✅ covered | `copy-artifacts.test.ts` TC-009 |
| TC-010: managed push failure preserves draft | should | ✅ covered | `bootstrap-egress-ledger-managed.test.ts` TC-010 |
| TC-011: inbox → start consumes draft (integration) | should | not added | should 優先度 / integration |
| TC-012: recopyDraftToChangeFolder absent from src/ | must | ✅ gate pass | — |
| TC-013: typecheck && test green | must | ✅ gate pass | — |

### `consumeDraft` 実装の確認（copy-artifacts.ts:147-174）

- flat / directory 両形式を正しくループする
- `git ls-files -- <relPath>` で tracked 判定し、tracked なら warning のみ（archive ポリシーと同一）
- `fs.rm(absPath, { recursive: true, force: true })` で directory 形式も再帰削除
- rm 失敗を警告で握り続行（best-effort、archive と同一ポリシー）
- `ponytail:` コメントで archive との重複を明示済み
- `draftPath` / `requestMdPath` の旧 import は削除済み、`draftsDir` のみ残る

### `consumeDraft` 呼び出し位置の確認（D1 契約）

| Runtime | 呼び出し行 | 契約（commit 成立後） |
|---------|------------|---------------------|
| workspace-materializer | `appendSynthesizedCommit` の後（L241） | commit + rev-parse 成功後 ✅ |
| local no-worktree | `appendSynthesizedCommit` の後（L446） | commit + rev-parse 成功後 ✅ |
| managed | `git push` 成功の後（L271） | commit + push 成功後 ✅ |

いずれも commit（managed は push も）が失敗したら throw が先行し `consumeDraft` に到達しない。D1「削除は commit 成立後のみ」を構造的に満たす。

### resume 経路からの recopy 除去

- `workspace-materializer.ts`: resume-existing / resume-recreated 両 arm から削除 ✅
- `local.ts`: `if (!isRunPath)` ブロック削除、`consumeDraft` は `if (isRunPath && opts?.requestFilePath)` 内のみ ✅
- `managed.ts`: `if (!branchName)` arm から削除 ✅
- attach-from-checkpoint arm は変更なし ✅

## 検証できなかった項目

- **TC-011（should）**: inbox `writeDraft → start` 経路の integration test。差分に含まれず。should 優先度のため許容範囲。

## Findings 詳細

### F-001: TC-008「archive backstop no-op」テスト未実装

test-cases.md の TC-008 は「draft 消費済みの job を archive したとき draft cleanup が no-op になること」を **unit / must** で規定している。しかし実装差分にこのシナリオのテストが存在しない。

現行の `orchestrator.test.ts` の `makeFs()` は `exists: vi.fn().mockResolvedValue(true)`（draft 常に存在）を返す。archive の draft cleanup ループは `if (!(await fs.exists(absPath))) continue;` でドラフト不在をガードしているが、この no-op 分岐を通る test case が追加されていない。

**修正案**: `tests/unit/core/archive/orchestrator.test.ts` に以下のテストを追加する。

```typescript
describe("TC-008: archive draft cleanup is a no-op when draft was already consumed", () => {
  it("fs.rm is NOT called for draft paths when fs.exists returns false for them", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "awaiting-archive", branch: BRANCH }),
    ]);
    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "archived" });
    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const mockFs = makeFs();
    // draft は消費済み — drafts/ パスは存在しない
    (mockFs.exists as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) =>
      !p.includes("specrunner/drafts"),
    );

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn: makeSpawn(0), fs: mockFs });

    expect(result).toMatchObject({ exitCode: 0 });
    const rmMock = mockFs.rm as ReturnType<typeof vi.fn>;
    const draftRmCall = rmMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("specrunner/drafts"),
    );
    expect(draftRmCall).toBeUndefined();
  });
});
```

archive orchestrator.ts 本体は未変更で `fs.exists` ガードが機能しているため、実害はない。ただし将来の変更でこの no-op 保証が破れても検出する歯がない状態。
