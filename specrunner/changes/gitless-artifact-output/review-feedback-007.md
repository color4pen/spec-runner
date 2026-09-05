# Code Review Feedback — gitless-artifact-output — Iteration 7

## Overview

This review covers the full implementation of the `artifact-output` execution profile: snapshot collection and digest, change-set derivation, patch builder, manifest, artifact writer, revision binding, preflight, run orchestrator, source guard, guarded spawn, context builder, vertical integration test, and architecture gate tests.

Verification result: **passed** (build / typecheck / test / lint / changed-line-coverage all green).

---

## Findings

### [MEDIUM] `checkSourceUnchanged` returns `false` (no mutation detected) when `writeRunJson` throws after detecting mutation — `src/core/artifact-output/run.ts`

**Location**: `run.ts`, helper `checkSourceUnchanged` (lines ~490–518), called on the success path at ~421.

**Description**:

```typescript
async function checkSourceUnchanged(...): Promise<boolean> {
  try {
    const guardResult = await assertSourceUnchanged(sourceRoot, baselineDigest, collectOpts);
    if (guardResult.kind === "mutated") {
      runJson.error = ...;
      runJson.status = "failed";        // ← in-memory mutation recorded
      await writeRunJson(runRoot, runJson);  // ← if this throws ...
      return true;
    } else if (guardResult.kind === "unverifiable") {
      runJson.status = "failed";
      await writeRunJson(runRoot, runJson);  // ← if this throws ...
      return true;
    }
    return false;
  } catch {
    // best-effort: if the guard itself throws, we cannot update run.json
    return false;  // ← fails OPEN regardless of why the exception was thrown
  }
}
```

If `writeRunJson` throws (disk full, permission error, etc.) AFTER `runJson.status = "failed"` was set in memory, the `catch` block returns `false`.

On the success path the caller does:

```typescript
const sourceMutatedOnSuccess = await checkSourceUnchanged(...);
if (sourceMutatedOnSuccess) {
  return { kind: "failed", ... };
}
// ← reaches here when catch returned false
runJson.status = "completed";   // overwrites the in-memory "failed"
runJson.metrics = metrics;
await writeRunJson(runRoot, runJson);  // writes "completed" to disk
return { kind: "completed", ... };    // reports success despite detected mutation
```

D6 requires: "不一致なら fail-closed で記録する". When the source guard successfully detected mutation but the disk write failed, the implementation currently fails open, returning `{ kind: "completed" }` and writing `status: "completed"` to disk.

The TC-006 vertical test exercises the normal path (where `writeRunJson` succeeds), so the test passes. The fail-open surface is the disk-error sub-path.

**Fix options**:

Option A — Return `true` from the catch (treat any guard exception as mutation):

```typescript
  } catch {
    // Cannot confirm source is unchanged → treat as mutation (fail-closed).
    return true;
  }
```

Option B — Separate the mutation detection from the disk write so that a write failure does not suppress the caller's `true`:

```typescript
async function checkSourceUnchanged(...): Promise<boolean> {
  let mutated = false;
  try {
    const guardResult = await assertSourceUnchanged(sourceRoot, baselineDigest, collectOpts);
    if (guardResult.kind === "mutated") {
      mutated = true;
      runJson.error = (runJson.error ?? "") + " | source-mutated: " + guardResult.currentDigest;
      runJson.status = "failed";
    } else if (guardResult.kind === "unverifiable") {
      mutated = true;
      runJson.error = (runJson.error ?? "") + " | source-unverifiable: " + guardResult.reason;
      runJson.status = "failed";
    }
  } catch {
    mutated = true; // Cannot verify → fail-closed
  }
  if (mutated) {
    try { await writeRunJson(runRoot, runJson); } catch { /* best-effort */ }
  }
  return mutated;
}
```

Option A is simpler. Option B retains best-effort persistence while ensuring the caller always sees the correct boolean.

---

### [LOW] `ArtifactManifest` type is missing the `unsupported` array for file-level entries — `src/core/artifact-output/manifest.ts`

**Location**: `manifest.ts`, `ArtifactManifest` interface.

**Description**:

D9 lists two distinct required fields in `manifest.json`:

- "unsupported 配列" — file-level entries that could not be represented
- "unsupported operation 一覧" — profile-level unsupported operations

The `ArtifactManifest` interface and `buildManifest` output include `unsupportedOperations` (the operation list) but no `unsupported` array for file-level entries.

In the current implementation, file-level unsupported entries (FIFO, socket, device node) cause `collectSnapshot` to return `unavailable`, which halts the run before `buildManifest` is ever called. So the array would always be `[]` if it existed. The gap is structural: the manifest type does not express this field, meaning future work adding partial-tolerance for specific unsupported kinds would need to also amend the type — unless the field is added now.

**Fix**: Add `unsupported: readonly SnapshotFailure[]` (or `readonly string[]`) to `ArtifactManifest` and pass `[]` from `buildManifest` until real entries arise. This closes the spec-implementation gap and provides a stable extension point.

---

### [LOW] `SnapshotResult` uses `kind: "ok"` but `ChangeSetResult` uses `kind: "success"` — naming inconsistency

**Location**: `src/core/snapshot/types.ts` (`SnapshotResult`) and `src/core/snapshot/compare.ts` (`ChangeSetResult`).

**Description**:

```typescript
// types.ts
export type SnapshotResult =
  | { kind: "ok"; snapshot: DirectorySnapshot }
  | { kind: "unavailable"; reason: string; failures: SnapshotFailure[] };

// compare.ts
export type ChangeSetResult =
  | { kind: "success"; changes: readonly ChangeEntry[] }
  | { kind: "unavailable"; reason: string };
```

Both types represent DU results with a happy-path arm and an unavailable arm, but the happy-path discriminant differs (`ok` vs `success`). This is a minor inconsistency within the same module family. Since `run.ts` already uses both, a reader switching between them must notice the difference.

**Fix**: Align to a single convention. Either rename `ChangeSetResult`'s `"success"` → `"ok"`, or rename `SnapshotResult`'s `"ok"` → `"success"`. Both would require updating callers. No behavior change.

---

### [LOW] Verification seam receives context block with empty `changes` list — `src/core/artifact-output/run.ts`

**Location**: `run.ts`, Phase 6 context construction (~lines 241–245).

**Description**:

```typescript
const preVerifyContext = buildSnapshotContext({
  baselineDigest,
  candidateDigest: preVerifySnapshotResult.snapshot.digest,
  changes: [],   // ← always empty at verification time
});
const verifyBound = await runBoundToCandidateRevision<VerificationRecord>(
  candidateRoot,
  () => input.verify.run(candidateRoot, preVerifyContext.contextBlock),
  ...
);
```

Change-set derivation is step 7, after verification (step 6). The verification seam therefore sees `(no changes)` in the `### Changed files` section of the context block. For the injected fake seams in the probe, this is invisible. For a production verifier that needs to know what was changed (e.g., to run targeted tests), the empty list is insufficient.

This is an architectural ordering constraint (the frozen candidate snapshot from step 6 IS the input to step 7), not a simple inversion. D14 addresses the replacement of git-context with snapshot-context but does not mention the empty-changes-at-verification-time trade-off.

**Fix** (none required for current scope): Document this as a known constraint in `OQ-4` or as an open question in the design. If production use requires change context at verification time, the architecture would need to either derive a preliminary change set before verification (using a separate, non-frozen snapshot) or accept the limitation with explicit documentation.

---

### [LOW] `computeSymlinkDigest` does not include the "kind tag" prefix specified in D3 — `src/core/snapshot/digest.ts`

**Location**: `src/core/snapshot/digest.ts`, `computeSymlinkDigest` (~lines 27–29).

**Description**:

D3 specifies: "symlink は link target 文字列の byte を **kind tag 付きで** SHA-256".

The implementation:

```typescript
export function computeSymlinkDigest(target: string): string {
  return "sha256:" + createHash("sha256").update(target, "utf8").digest("hex");
}
```

No kind prefix ("symlink:") is included in the hash input.

In practice, a collision between a file containing the bytes of a symlink target string and a symlink with that target string would produce the same `contentDigest`. Such a collision is prevented at the snapshot entry level because `kind` is a separate field in both the entry struct and the digest format (`kind\0path\0mode\0contentDigest\n`), so no identity confusion arises at the snapshot digest level.

However, the spec text explicitly calls for a "kind tag" in the content digest. If the spec is normative (i.e., external tools are expected to reproduce the digest), they would compute the wrong digest without the tag.

**Fix**: If reproducibility by external tools is a goal, prefix the hash input with `"symlink:"`:

```typescript
export function computeSymlinkDigest(target: string): string {
  return "sha256:" + createHash("sha256")
    .update("symlink:", "utf8")
    .update(target, "utf8")
    .digest("hex");
}
```

This is a **breaking change** to the digest format. It should only be made if the spec value is intentional (not a documentation looseness). If D3's "kind tag" refers to the entry-level `kind` field and not the content digest computation, no change is needed — but the spec should be clarified.

---

## Acceptance Criteria Coverage

| AC | Status | Notes |
|----|--------|-------|
| ADR で authority・revision identity・lifecycle・保証差分が定義される | ✅ | `design.md` covers all four axes thoroughly |
| Git の責務が「snapshot 置換 / profile 固有 / 初期 unsupported」に分類される | ✅ | `design.md` §Design Decisions + `execution-profile.ts` capability table |
| Git repository 外 fixture で最小縦断が完走する | ✅ | `tests/artifact-output-vertical.test.ts` TC-001, TC-067 |
| `git` / GitHub API を呼ばないことを機械的に検証できる | ✅ | `guarded-spawn.ts` + architecture gate `artifact-output-git-free.test.ts` |
| 元 source directory が成功時・失敗時とも変更されない | ⚠️ | TC-004/005 pass; fail-open edge case in `checkSourceUnchanged` when `writeRunJson` throws (Finding 1) |
| added / modified / deleted が manifest へ出力される | ✅ | `manifest.ts` + `compare.ts` + covered by TC-015 |
| text patch で表現できない変更が欠落しない | ✅ | D8 table fully implemented in `patch.ts`; `not-applicable`, binary, size, unreadable all classified |
| baseline / candidate digest が artifact と verification / review record へ束縛される | ✅ | `revision-binding.ts` + cross-phase check in `run.ts` |
| snapshot 取得・比較不能が「変更なし」として通過しない | ✅ | All paths return `unavailable` discriminant; no silent fallback to empty set |
| Git 依存 step を開始前 preflight で列挙し、途中で落ちない | ✅ | `preflight.ts` capability gate; `execution-profile.ts` data table |
| 既存 Git/PR profile の挙動は変わらない | ✅ | Purely additive; no existing source files modified except `guide.ts` / README |
| CLI / README で `--no-worktree` との違い・保証・unsupported operation が説明される | ✅ | `docs/artifact-output-profile.md`, `guide.ts` topic, README §artifact-output |
| 実測結果と次段階 Issue 案が記録される | ✅ | `docs/artifact-output-profile.md` §Measurement Results |
| SpecRunner verification が green | ✅ | `verification-result.md` iter 1: all phases passed |

---

## 検証した項目

- `src/core/artifact-output/run.ts` — 全 9 フェーズの orchestration フロー、`checkSourceUnchanged` の分岐挙動、fail-closed / fail-open 経路
- `src/core/artifact-output/artifact-writer.ts` — staging → rename による atomic finalize、payload 書き込みの分岐（binary / size / unreadable）
- `src/core/artifact-output/revision-binding.ts` — pre/post snapshot drift check プロトコル、cross-phase digest check
- `src/core/artifact-output/preflight.ts` — capability gate の純関数実装、`executable` 判定ロジック
- `src/core/artifact-output/execution-profile.ts` — profile capability テーブル、step → required capability マッピング
- `src/core/artifact-output/manifest.ts` — `ArtifactManifest` 型定義と `buildManifest` 出力フィールド
- `src/core/artifact-output/patch.ts` — D8 分類テーブルの実装（`included` / `omitted:binary` / `omitted:size` / `not-applicable` / `omitted:unreadable`）
- `src/core/artifact-output/context.ts` — snapshot 由来 context block の生成、`changes: []` 問題
- `src/core/artifact-output/source-guard.ts` — `assertSourceUnchanged` の DU 返却（`unchanged` / `mutated` / `unverifiable`）
- `src/core/artifact-output/guarded-spawn.ts` — git / gh コマンドのブロック実装
- `src/core/snapshot/collect.ts` — 全 traversal 経路（file / symlink / dir / unsupported-kind）、symlink escape 検出、UTF-8 decode 失敗
- `src/core/snapshot/digest.ts` — canonical streaming hash フォーマット、`computeSymlinkDigest` の kind tag 有無
- `src/core/snapshot/compare.ts` — `ChangeSetResult` discriminant、exclusion 差異の fail-closed
- `src/core/snapshot/types.ts` — `SnapshotResult` discriminant（`ok` vs `success` 不整合）
- `tests/artifact-output-vertical.test.ts` — TC-001/003/004/005/006/023/024/027/033/065/067/068/073/077/078 の全テストコード
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-040/041/068/069/070/071/072 architecture gate
- `specrunner/changes/gitless-artifact-output/design.md` — D1–D16 全決定事項、OQ-1–6、migration plan
- `specrunner/changes/gitless-artifact-output/test-cases.md` — 80 test cases の must/should 分類と実装対応
- `specrunner/changes/gitless-artifact-output/verification-result.md` — build / typecheck / test / lint / changed-line-coverage pass 確認

## 検証できなかった項目

- `writeRunJson` が throw した場合の `checkSourceUnchanged` fail-open 経路（TC-006 は writeRunJson 正常系のみ; ディスクエラー注入テストなし）
- `computeSymlinkDigest` の "kind tag" 仕様意図（D3 の記述が "entry フィールドの kind を指す" のか "content digest ハッシュ入力への prefix を指す" のかは設計者に確認が必要）
- `ArtifactManifest` の `unsupported` 配列を D9 が file-level entries 専用として意図しているか、それとも `unsupportedOperations` と同義で使っているか（仕様上の曖昧さ）
- 大規模 directory（`node_modules` 相当）での baseline / candidate / 終了時 source 再走査の実測コスト（D16 metrics は記録されているが、CI 環境値のためベンチマーク信頼性は未検証）
- 実 agent adapter（Claude Code CLI）との配線時に candidate 内への pipeline 成果物 overlay が必要かどうか（OQ-2 未解決、最小縦断は injected seam で回避）

## Positive Observations

- **Fail-closed discipline is consistent** throughout snapshot collection, change-set derivation, revision binding, and cross-phase digest check. No "change nothing on error" fallbacks.
- **Architecture ratchet** (`artifact-output-git-free.test.ts`) is thorough: value imports, `process.cwd()`, `node:child_process`, and adapter imports are all independently gated.
- **Guarded spawn** (`guarded-spawn.ts`) is minimal and correct: the git/gh block is at the command-basename level and tested independently.
- **Revision binding protocol** (pre-snapshot → execute → post-snapshot → drift check) is cleanly separated from the orchestrator, and the cross-phase digest check in `run.ts` closes the gap between per-phase drift and inter-phase drift.
- **Atomic artifact finalization** (staging dir → rename) is correct; `artifact/` is never created on partial failure.
- **Design decisions are traceable**: every D-number in `design.md` maps to an identifiable code location, and the rationale for each alternative rejection is preserved.
- **Preflight is data-driven**: `STEP_CAPABILITY_REQUIREMENTS` is a flat map; no capability logic is scattered as `if` branches in the run orchestrator.
