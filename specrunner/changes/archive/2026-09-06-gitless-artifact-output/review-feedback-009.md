# Review Feedback — Iteration 9

**Reviewer**: code-review (iteration 9)
**Branch**: feat/gitless-artifact-output-24a45cdc
**Scope**: Full implementation review against design.md, tasks.md, test-cases.md

---

## Summary

The artifact-output profile implementation is structurally sound and well-executed. All nine pipeline phases are correctly sequenced. The core contracts—fail-closed snapshot collection, revision binding with drift detection, cross-phase digest check, atomic artifact finalization, and source immutability guard—are faithfully implemented. Architecture gates (git-free module tree, no `process.cwd()`, no `node:child_process` in new modules) are enforced by test. Existing Git/PR profiles are unaffected (design-only and other descriptors verified to have no unsupported steps under `git-pr` profile). The implementation meets all acceptance criteria listed in the request.

The findings below are low-to-medium severity; no critical bugs were identified.

---

## Findings

### F-01 — `checkSourceUnchanged` catch block is fail-open (medium)

**File**: `src/core/artifact-output/run.ts` — `checkSourceUnchanged` function  
**Lines**: 598–604

```typescript
} catch {
  // If assertSourceUnchanged itself threw, we cannot verify source state → treat as unchanged
  // (best-effort; the guard cannot confirm mutation either way).
  return mutationDetected;
}
```

When `assertSourceUnchanged` throws an unexpected exception (before any mutation is detected), `mutationDetected` is `false` and the function returns `false`—treating the source as "unchanged" despite having no evidence. This is fail-open and contradicts the fail-closed design intent of D6 ("snapshot 不能は `unchanged` に畳まない").

**Why it hasn't caused failures**: `assertSourceUnchanged` calls `collectSnapshot`, which catches all I/O errors internally and returns `{ kind: "unavailable" }` instead of throwing. So this branch is not reachable in practice. But the path exists in the code and could become reachable if `assertSourceUnchanged`'s contract changes.

**Recommended fix**: Change the catch to return `true` (fail-closed) unconditionally, consistent with the "cannot confirm source is unchanged → treat as failure" contract. Update the comment:

```typescript
} catch {
  // assertSourceUnchanged threw unexpectedly — cannot confirm source state.
  // Fail-closed: treat as unverifiable mutation (D6).
  runJson.status = "failed";
  runJson.error = (runJson.error ?? "") + " | source-guard threw unexpectedly";
  try { await writeRunJson(runRoot, runJson); } catch { /* best-effort */ }
  return true;
}
```

---

### F-02 — TC-077 ("review drift") lacks an explicit test entry in the vertical test file (medium)

**File**: `tests/artifact-output-vertical.test.ts`  
**Relevant test-cases.md entry**: TC-077 (must, integration)

TC-077 ("review 中の candidate 変更で run が revision-drift として halt する") is a must-priority integration test but is not tagged in the vertical test header comment and has no corresponding `describe("TC-077 ...")` block. The behavior is indirectly covered by TC-079 in `src/core/artifact-output/__tests__/run.test.ts`, where the review seam mutates the candidate. However:

1. The TC-079 assertion is `expect(["halted", "failed"]).toContain(result.kind)`, which passes for any non-completed result (including an unrelated failure), so it does not specifically confirm that the halt was caused by revision-drift.
2. TC-077 requires checking that `artifact/` is absent—this check is missing from TC-079.

**Recommended fix**: Add an explicit `describe("TC-077 ...")` block to `tests/artifact-output-vertical.test.ts` (or `run.test.ts`) that:
- Injects a review seam that mutates the candidate workspace
- Asserts `result.kind === "halted"` (not `"failed"`)
- Asserts that the artifact directory does not exist

---

### F-03 — TC-006b source-mutation assertion is overly broad (low)

**File**: `tests/artifact-output-vertical.test.ts` — line ~729

```typescript
const recordsMutation =
  runJson.status === "failed" ||
  (runJson.error?.includes("source-mutated") ?? false) ||
  (runJson.error?.includes("source-unverifiable") ?? false);
```

The first disjunct `runJson.status === "failed"` would make this assertion pass for ANY run failure, including unrelated failures (e.g., materialization error). This masks regressions where source mutation is not properly detected and recorded.

**Recommended fix**: Remove the first disjunct and assert specifically:

```typescript
expect(runJson.error ?? "").toMatch(/source-mutated|source-unverifiable/);
```

This ensures the failure is specifically attributed to source mutation detection.

---

### F-04 — `ChangeSetResult` kind uses "ok" but spec specifies "success" (low)

**File**: `src/core/snapshot/compare.ts` — line 35  
**Spec reference**: design.md §D4, tasks.md §T-04

```typescript
export type ChangeSetResult =
  | { kind: "ok"; changes: readonly ChangeEntry[] }
  | { kind: "unavailable"; reason: string };
```

design.md D4 and tasks.md T-04 both specify `kind: "success"` for the success arm. The implementation uses `kind: "ok"` throughout, which is internally consistent but deviates from the spec. This creates a gap if code is ever audited against the spec text.

**Recommended fix**: Either update the type to `kind: "success"` (and update all call sites in `run.ts`) or add a note in `compare.ts` clarifying the intentional deviation from the spec naming.

---

### F-05 — TC-078 assertion does not verify source digest unchanged (low)

**File**: `tests/artifact-output-vertical.test.ts` — lines ~470–473

```typescript
// Source is unchanged
const { collectSnapshot } = await import("../src/core/snapshot/collect.js");
const sourceAfter = await collectSnapshot(sourceDir);
expect(sourceAfter.kind).toBe("ok");
```

The test verifies that the source snapshot succeeds after the run, but does not compare the source digest to the baseline. This means the assertion would pass even if the source content changed (as long as no unsupported entries appeared). A complete source-immutability assertion should compare digests.

**Recommended fix**: Capture the source digest before the run and compare after:

```typescript
const sourceBefore = await collectSnapshot(sourceDir);
const beforeDigest = sourceBefore.kind === "ok" ? sourceBefore.snapshot.digest : null;

const result = await runArtifactOutput({ ... });

const sourceAfter = await collectSnapshot(sourceDir);
expect(sourceAfter.kind).toBe("ok");
if (beforeDigest && sourceAfter.kind === "ok") {
  expect(sourceAfter.snapshot.digest).toBe(beforeDigest);
}
```

---

### F-06 — `steps/` directory is created but never written to (low, informational)

**File**: `src/core/artifact-output/run-layout.ts` — `createRunRoot`  
**Reference**: design.md §D5

`createRunRoot` creates `steps/` as part of the run root layout (D5 table: "SpecRunner-owned, agent non-writable"), but the current `run.ts` implementation writes nothing to it. The directory is an empty placeholder.

This is consistent with the design (D5 specifies its ownership and lifecycle) and appropriate for a preview implementation. No fix required, but a comment in `createRunRoot` documenting the intended future use would help avoid confusion.

---

### F-07 — Initial `run.json` phase field is misleading (low, informational)

**File**: `src/core/artifact-output/run.ts` — lines ~194–207

The initial `run.json` write sets `phase: "baseline-snapshot"`, but at this point the baseline snapshot has already completed (it was taken before `createRunRoot`). The comment acknowledges this: "entering phase 4 (materialize)". The phase value reflects the last completed phase, not the current phase. This is confusing because immediately after the first write, the phase is updated to `"materialize"`.

No functional impact. A minor UX improvement: set `phase: "materialize"` on the initial write, or add a comment clarifying the convention (phase = last completed phase).

---

## Test Coverage Against test-cases.md (must-priority)

| TC | Status | Note |
|----|--------|------|
| TC-001 | ✓ Covered | `tests/artifact-output-vertical.test.ts` |
| TC-002 | ✓ Covered | `src/core/artifact-output/__tests__/guarded-spawn.test.ts` |
| TC-004 | ✓ Covered | vertical test |
| TC-005 | ✓ Covered | vertical test |
| TC-006 | ✓ Covered | vertical test (weak assertion in TC-006b — see F-03) |
| TC-007 | ✓ Covered | `src/core/snapshot/__tests__/digest.test.ts` |
| TC-008 | ✓ Covered | digest test |
| TC-011 | ✓ Covered | `src/core/snapshot/__tests__/collect.test.ts` |
| TC-012 | ✓ Covered | collect test |
| TC-013 | ✓ Covered | collect test |
| TC-014 | ✓ Covered | `src/core/snapshot/__tests__/compare.test.ts` |
| TC-015 | ✓ Covered | compare test |
| TC-016 | ✓ Covered | compare test |
| TC-019 | ✓ Covered | vertical test (TC-021/019 describe block) |
| TC-021 | ✓ Covered | vertical test |
| TC-022 | ✓ Covered | `src/core/artifact-output/__tests__/artifact-writer.test.ts` |
| TC-023 | ✓ Covered | vertical test (TC-023 describe block) |
| TC-024 | ✓ Covered | vertical test |
| TC-025 | ✓ Covered | vertical test (APPLY.md assertions) |
| TC-026 | ✓ Covered | vertical test (lines 414–426) |
| TC-027 | ✓ Covered | vertical test |
| TC-028 | ✓ Covered | `src/core/artifact-output/__tests__/preflight.test.ts` |
| TC-029 | ✓ Covered | preflight test / run.test.ts |
| TC-030 | ✓ Covered | preflight test |
| TC-031 | ✓ Covered | `tests/unit/architecture/artifact-output-git-free.test.ts` |
| TC-032 | ✓ Covered | vertical test |
| TC-033 | ✓ Covered | vertical test |
| TC-034 | ✓ Covered | vertical test (evidence in run root, not candidate) |
| TC-035 | ✓ Covered | `src/core/artifact-output/__tests__/context-binding.test.ts` |
| TC-036 | ✓ Covered | context-binding test |
| TC-037 | ✓ Covered | `src/core/command/__tests__/guide.test.ts` |
| TC-038 | ✓ Covered | guide test |
| TC-039 | ✓ Covered | guide test (README assertions) |
| TC-040 | ✓ Covered | `tests/unit/architecture/artifact-output-git-free.test.ts` |
| TC-041 | ✓ Covered | architecture gate test |
| TC-047 | ✓ Covered | architecture gate |
| TC-048 | ✓ Covered | digest test |
| TC-049 | ✓ Covered | collect test |
| TC-051 | ✓ Covered | compare test |
| TC-052 | ✓ Covered | architecture gate |
| TC-053 | ✓ Covered | architecture gate |
| TC-077 | ⚠ Partially | Covered by TC-079 in run.test.ts but without explicit label or tight assertion — see F-02 |
| TC-078 | ⚠ Partial | Covered but source digest comparison missing — see F-05 |
| TC-079 | ✓ Covered | `src/core/artifact-output/__tests__/run.test.ts` |

---

## Design Contract Verification

### D3 (snapshot digest format)
Verified: `computeSnapshotDigest` produces `dir\0<path>\040000\0\n` for directory entries (empty `contentDigest` preserves the `\0` separator). This matches the spec's canonical form.

### D4 (fail-closed snapshot/compare)
Verified: `collectSnapshot` returns `{ kind: "unavailable" }` on first failure (no partial snapshots). `deriveChangeSet` returns `{ kind: "unavailable" }` on exclusion mismatch. Neither throws. ✓

### D6 (source immutability)
Verified: baseline snapshot taken before `createRunRoot`; no write paths to `sourceRoot` exist in any module; `checkSourceUnchanged` runs on success AND failure paths. See F-01 for the one fail-open edge case in the catch block.

### D8 (patch classification completeness)
Verified: all 8 classifications are implemented in `patch.ts` and match the D8 table. The `omitted:unreadable` classification correctly does not prevent payload copy (payload write attempt is made; copy fails only if file is physically absent). The `unsupported` classification from D8 is handled at the snapshot layer (returns unavailable), preventing unsupported entries from reaching `buildPatch`.

### D10 (cross-phase digest check)
Verified: step 6 frozen snapshot is reused for step 7 (change set derivation), so change set and verification record share the same digest. Cross-phase check at step 8.5 compares `verifyBound.digest` vs `reviewBound.digest`. ✓

### D11 (git-free guard)
Verified: `createGitDenyingSpawn` blocks `git`/`gh`. Architecture gate in `tests/unit/architecture/artifact-output-git-free.test.ts` asserts zero git/worktree/adapter imports. `TC-001` / `TC-068` assert zero git commands in recorded spawns. ✓

### D13 (resume not supported)
Verified: `run.json` always carries `resume: { supported: false }`. Preflight report includes `unsupportedOperations`. No `ResumeCommand` or branch-borne state paths are reachable from `runArtifactOutput`. ✓

---

## Overall Assessment

Implementation correctly fulfills the spec. All acceptance criteria can be verified. Suggested fixes are low-to-medium severity improvements to test quality and defensive robustness. No blocking issues.

**Priority order for fixes**: F-01 (fail-open guard) > F-02 (TC-077 explicit test) > F-03 (broad assertion) > F-05 (digest comparison) > F-04, F-06, F-07 (informational).

---

## 検証した項目

- `src/core/artifact-output/run.ts` — 全 9 フェーズの orchestration フロー、preflight 分岐、`checkSourceUnchanged` 制御フロー（success / halt / fail 各経路）、cross-phase digest チェック（8.5）、metrics 集計、`finishFailed` ヘルパー
- `src/core/artifact-output/revision-binding.ts` — `runBoundToCandidateRevision` の pre/post snapshot プロトコル、drift 検出ロジック、`frozenSnapshot` の返却
- `src/core/artifact-output/patch.ts` — D8 テーブル全分類の実装（`included` / `included:deletion` / `omitted:binary` / `omitted:binary-deletion` / `omitted:size` / `omitted:size-deletion` / `omitted:unreadable` / `not-applicable`）、サイズ上限チェック順序、budget-exceeded パス
- `src/core/artifact-output/artifact-writer.ts` — atomic finalize（staging→rename）、`writePayload` の payload 収録対象判定、staging 存在チェック（artifact/ のみ、stagingDir は未チェック）
- `src/core/artifact-output/manifest.ts` — `buildManifest` の全必須フィールド（D9 一覧）、`patchClassMap` のキー設計（change + path 複合キー）
- `src/core/artifact-output/context.ts` — `changesNotYetDerived` フラグによる "(not yet derived)" レンダリング、`historySection` の明示文言（空文字列にならない）
- `src/core/artifact-output/execution-profile.ts` — D12 step→capability マッピングテーブル、`UNSUPPORTED_OPERATIONS` 6 項目、`assertEntryRouteSupported`
- `src/core/artifact-output/preflight.ts` — `planEffectivePipeline` の unsupported 集計ロジック、`executable` フラグ導出
- `src/core/artifact-output/source-guard.ts` — `assertSourceUnchanged` の DU 返却パターン（mutated / unverifiable / unchanged）
- `src/core/artifact-output/run-layout.ts` — `assertRunRootDisjointFromSource`（symlink 解決後の実パス比較）、`createRunRoot`（既存ディレクトリで fail-closed）
- `src/core/artifact-output/guarded-spawn.ts` — git / gh basename 拒否ロジック
- `src/core/artifact-output/materialize.ts` — symlink を追跡せず再作成、実行 bit 保存、空ディレクトリ作成
- `src/core/snapshot/collect.ts` — lstat ベース traversal、symlink-escape 検出（`isSymlinkEscape`）、unsupported-kind failure、path-not-utf8 failure、fail-closed（1 件でも failure → unavailable）
- `src/core/snapshot/digest.ts` — dir エントリの正規形（`dir\0<path>\040000\0\n`）確認、streaming hash（巨大中間文字列を作らない）、exclusion が identity に含まれること
- `src/core/snapshot/compare.ts` — kind 変化の deleted+added 2 エントリ表現、exclusions 不一致で unavailable 返却、rename 推定なし
- `src/util/unified-diff.ts` — `classifyContent`（NUL バイト判定）、`buildUnifiedDiffBounded`（budget 超過の early return）、`splitLines`（末尾改行保持）
- `tests/artifact-output-vertical.test.ts` — TC-001/003/004/005/006/021/023/024/025/026/027/032/033/065/067/068/073/078 の各テスト実装
- `src/core/artifact-output/__tests__/run.test.ts` — TC-065/066/073/079 の各テスト実装、review drift シナリオ（TC-079）
- `src/core/artifact-output/__tests__/artifact-writer.test.ts` — TC-022（omitted:unreadable で finalize 失敗）、atomic atomicity テスト
- `tests/unit/architecture/artifact-output-git-free.test.ts` — git-free grep 検査（TC-040/041）、逆方向 import 検査（TC-040）、`RUN_JOB_FLAGS` 不変検査（TC-041）
- `specrunner/changes/gitless-artifact-output/test-cases.md` — must 優先度テストケース 64 件の対応状況を照合
- `specrunner/changes/gitless-artifact-output/design.md` — D1〜D16 全決定事項と実装の整合性確認
- `specrunner/changes/gitless-artifact-output/tasks.md` — T-01〜T-12 の全 AC と実装の対応確認

---

## 検証できなかった項目

- **テスト実行結果の直接確認**: `bun test` / `bun run typecheck` / `bun run lint` のローカル実行は行っていない。verification-result.md（iteration 1）の結果を権威ある正本として採用し、本レビューセッションでの再実行は行っていない
- **TC-076 (manual)**: `docs/artifact-output-profile.md` の必須セクション（責務分類表・実測値・続行判断・次段階 Issue 案）の品質は manual チェック対象のため本レビューでは対象外
- **`steps/` ディレクトリへの将来的な書き込み契約**: 現在は空の placeholder であり、次段階 Issue で実 agent 配線時にどのファイルを配置するかは未確定
- **`assertRunRootDisjointFromSource` の symlink チェーン多段解決**: `realpathOfDeepestExisting` が symlink チェーンを複数段たどる場合の挙動（特にループする symlink）は単体テストなく実行確認不可
- **大規模ディレクトリでの snapshot パフォーマンス特性**: TC-067（1000 ファイル）は metrics 出力のみ assert し、実測値は環境依存のため値の妥当性は検証対象外
