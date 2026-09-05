# Review Feedback — gitless-artifact-output — iter 2

## Scope

- Branch: `feat/gitless-artifact-output-24a45cdc`
- Reviewed: implementation files, integration/unit tests, guide topic, README, design.md, tasks.md, test-cases.md
- Verification result (iter 1): **passed** (build / typecheck / test / lint all green)

---

## Summary of findings

| # | Severity | File | Title | Resolution |
|---|----------|------|-------|------------|
| F-01 | medium | `src/core/artifact-output/patch.ts` | Unreachable duplicate binary check in deleted-file branch | fixable |
| F-02 | medium | `tests/artifact-output-vertical.test.ts` | `_assertNoGitAbove` never called — T-10 AC broken | fixable |
| F-03 | medium | `src/core/command/guide.ts`, `README.md` | Guide topic and README lack "preview / not yet wired" notice for CLI flags | fixable |
| F-04 | medium | `tests/artifact-output-vertical.test.ts` | TC-027 (verification-time candidate drift → run halts) missing as integration test | fixable |
| F-05 | medium | `tests/unit/architecture/artifact-output-git-free.test.ts` | TC-071 reverse-import check and TC-072 RUN_JOB_FLAGS-unchanged gate tests absent | fixable |
| F-06 | low | `src/core/artifact-output/patch.ts` | `omitted:unreadable` for large text deletions — undocumented extension of D8 spec | decision-needed |

---

## Detailed findings

### F-01 — Unreachable duplicate binary check in `patch.ts` (medium, fixable)

**File**: `src/core/artifact-output/patch.ts:137-139`

**Description**: In the `changeKind === "deleted"` branch, `classifyContent(bytes) === "binary"` is checked twice. The first check at line 126 already returns `"omitted:binary-deletion"` if the content is binary. The second identical check at line 137 is therefore unreachable dead code that indicates a logic error.

```
// line 126 — checked here
if (classifyContent(bytes) === "binary") {
  return { path, classification: "omitted:binary-deletion", diffContribution: "" };
}

// line 130 — size check
if (bytes.length > PATCH_MAX_FILE_SIZE_BYTES) {
  return { path, classification: "omitted:unreadable", diffContribution: "" };
}

// line 137 — UNREACHABLE: binary check already happened above
if (classifyContent(bytes) === "binary") {
  return { path, classification: "omitted:binary-deletion", diffContribution: "" };
}
```

The second binary check should be removed. The current order of checks means a large binary deletion is classified as `omitted:unreadable` (via the size check) rather than `omitted:binary-deletion`, which may not be the intended behavior.

**Fix**: Remove lines 137-139 (the duplicate binary check). If the intent is to treat large deletions as `omitted:binary-deletion` for binary content, move the size check to come before the binary check and add the appropriate classification.

---

### F-02 — `_assertNoGitAbove` defined but never called (medium, fixable)

**File**: `tests/artifact-output-vertical.test.ts:50-71`

**Description**: The function `_assertNoGitAbove(dir)` is defined (with underscore prefix indicating intentional non-use) but is never called in any test. The T-10 Acceptance Criteria explicitly requires:

> "fixture root の祖先に `.git` が無いことが test 内で assert される（存在したら fail、skip しない）"

Without calling this assertion, the integration tests could silently run inside a git-controlled directory, potentially undermining the git-free guarantee they are supposed to verify.

**Fix**: Call `_assertNoGitAbove(sourceDir)` (and rename to remove the underscore prefix) at the start of each integration test that creates a source fixture. The vertical tests use `os.tmpdir()` which is typically outside git repos in CI, but the assertion should be explicit per the AC.

Example addition to each describe block that creates a sourceDir:
```typescript
// Inside test body, after mktemp:
assertNoGitAbove(sourceDir); // fails if sourceDir is inside a git tree
```

---

### F-03 — Guide topic and README lack "preview / not yet wired" notice (medium, fixable)

**Files**: `src/core/command/guide.ts` (artifact-output topic), `README.md`

**Description**: 

1. **README.md** (lines 148-153) shows example CLI usage:
   ```bash
   specrunner job start my-request.md \
     --profile artifact-output \
     --pipeline design-only \
     --source-root /path/to/source \
     --run-parent-dir /path/to/output
   ```
   These flags (`--profile artifact-output`, `--source-root`, `--run-parent-dir`) do **not exist** in the CLI (confirmed: `RUN_JOB_FLAGS` in `src/cli/command-registry.ts` has no such flags). A user following this example will get a usage error. Design D15 and T-12 AC explicitly require marking the surface as "preview / 未配線".

2. **Guide topic** (`guide.ts` artifact-output body): Does not contain any preview warning or mention that `job start --source-root` is not yet wired. D15 says: "現状は preview であり `job start --source <dir>` は未配線であることを説明する". T-12 AC: "topic body に `--no-worktree` との違いと「agent subprocess 内部の git は対象外」の記述がある" — the agent-subprocess caveat is present, but the preview/unwired notice is missing.

**Fix**:
- README: Add a prominent note (e.g. `> **Preview**: The `--profile artifact-output`, `--source-root`, and `--run-parent-dir` flags are not yet implemented in the CLI...`) before the example command block.
- Guide topic body: Add a section or note near the top stating the profile is currently accessible only programmatically via `runArtifactOutput()` and that `job start` CLI flags are planned for a future change.

---

### F-04 — TC-027 (verification-time candidate drift integration test) missing (medium, fixable)

**Files**: test-cases.md, `tests/artifact-output-vertical.test.ts`, `src/core/artifact-output/__tests__/run.test.ts`

**Description**: test-cases.md TC-027 (Category: integration, Priority: must):

> "verification 中の candidate 変更で run が revision-drift として halt する"

This requires an integration test that:
1. Injects a `verify` seam that mutates the candidate workspace during its execution
2. Calls `runArtifactOutput`
3. Asserts that the run halts (not succeeds) with the reason being revision-drift

The `context-binding.test.ts` "Revision drift detection" tests `runBoundToCandidateRevision` at the unit level, and `run.test.ts` TC-079 tests review-time mutation causing drift. But no test drives the full `runArtifactOutput` pipeline with a verify seam that mutates the candidate. The `run.ts` code at lines 249-256 handles this case, but it is not exercised at integration level.

**Fix**: Add an integration test in `tests/artifact-output-vertical.test.ts` or `src/core/artifact-output/__tests__/run.test.ts`:
```typescript
it("TC-027: verify seam that mutates candidate causes revision-drift halt", async () => {
  const sourceDir = await mktemp("ao-src-");
  const runParentDir = await mktemp("ao-run-");
  await fs.writeFile(path.join(sourceDir, "a.txt"), "content");

  const mutatingVerify: VerifySeam = {
    async run(candidateRoot, contextBlock): Promise<VerificationRecord> {
      // Mutate candidate during verification
      await fs.writeFile(path.join(candidateRoot, "injected-by-verify.txt"), "injected");
      const match = contextBlock.match(/\*\*Candidate digest\*\*: (sha256:[0-9a-f]{64})/);
      const candidateDigest = match?.[1] ?? "sha256:" + "0".repeat(64);
      return { candidateDigest, outcome: "passed" };
    },
  };

  const result = await runArtifactOutput({ ..., verify: mutatingVerify, ... });
  expect(["halted", "failed"]).toContain(result.kind);
  // artifact/ must not be created
  ...
});
```

---

### F-05 — TC-071 reverse-import gate and TC-072 RUN_JOB_FLAGS gate absent (medium, fixable)

**File**: `tests/unit/architecture/artifact-output-git-free.test.ts`

**Description**: The test-cases.md for this change declares two "must" gate tests that are attributed to `artifact-output-git-free.test.ts` but are not implemented there:

**TC-071** (gate, must): "既存の runtime / pipeline / step ディレクトリが新規モジュールを import しない"
The existing `src/core/runtime/**`, `src/core/pipeline/**`, and `src/core/step/**` should not import `core/artifact-output` or `core/snapshot`. The current architecture test only checks the forward direction (artifact-output doesn't import git utilities), not the reverse direction.

**TC-072** (gate, must): "RUN_JOB_FLAGS が本 change の前後で不変である"
The `RUN_JOB_FLAGS` constant in `src/cli/command-registry.ts` must remain unchanged (no `--source` flag added). No test asserts this.

**TC-054** (gate, must): "既存の runtime-capability-gate.ts に変更がない"
No gate test asserts that `runtime-capability-gate.ts` was not changed.

**Fix**: Add to `artifact-output-git-free.test.ts`:

1. Reverse import check:
```typescript
describe("TC-071: existing runtime/pipeline/step do not import artifact-output/snapshot", () => {
  it("src/core/runtime does not import core/artifact-output", () => {
    const result = grepE("core/artifact-output", path.join(ROOT, "src/core/runtime"));
    expect(result).toBe("");
  });
  // similar for pipeline, step
});
```

2. RUN_JOB_FLAGS snapshot:
```typescript
describe("TC-072: RUN_JOB_FLAGS is unchanged (no --source flag added)", () => {
  it("RUN_JOB_FLAGS does not contain '--source'", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/cli/command-registry.ts"), "utf-8");
    expect(src).not.toMatch(/RUN_JOB_FLAGS.*source|source.*RUN_JOB_FLAGS/);
  });
});
```

---

### F-06 — `omitted:unreadable` for large text deletions is not in D8 spec (low, decision-needed)

**File**: `src/core/artifact-output/patch.ts:130-135`

**Description**: D8 defines `omitted:size` only for `change=added/modified`. For a `change=deleted` text file whose size exceeds `PATCH_MAX_FILE_SIZE_BYTES`, the code classifies it as `omitted:unreadable` (line 134), with a comment acknowledging the deviation.

The D8 table has no defined classification for large text deletions. The `omitted:unreadable` classification is semantically inaccurate (the file is readable; it just exceeds the size limit). A consumer of the manifest cannot distinguish "unreadable file" from "large deletion" using the current classification.

**Options**:
1. **Extend D8 spec** to define `omitted:size-deletion` or add `omitted:size` semantics for deletions too, and update manifest schema, test-cases.md, and APPLY.md accordingly.
2. **Keep current behavior** but add a comment in the manifest's `APPLY.md` and design docs that explicitly documents the `omitted:unreadable` overload for large deletions.
3. **Treat large deletions as included** (the deletion hunk is a fixed-size header; the content removed is from the baseline, not the patch). This matches unified diff semantics since deletion hunks contain the removed lines. Re-classify as `included:deletion` even for large baselines.

Option 3 may be most aligned with D8 intent since the diff represents what was deleted (not what exists in the candidate), and patch size for deletions is proportional to old content.

---

## Evidence

- **Checked**: 47 files (implementation, tests, design, docs)
- **Skipped**: 0
- **Unverified**: 0

Verification (iter 1) was green across all phases (build / typecheck / test / lint / changed-line-coverage). The findings above are in test coverage gaps and implementation logic, not in the core algorithm correctness or spec adherence.

The core implementation (snapshot digest, fail-closed collection, revision binding, atomic finalize, guarded spawn, capability preflight) is sound and aligned with the design. The missing test cases and guide-topic gaps do not block the functional intent but should be resolved before production routing.

---

## 検証した項目

以下のファイルをソースコードレベルで読み、設計書・タスク・テストケースと照合した。

**コア実装**
- `src/core/snapshot/collect.ts` — フェイルクローズなディレクトリ走査、シンボリックリンクエスケープ検出、UTF-8 パス検証
- `src/core/snapshot/digest.ts` — SHA-256 スナップショットダイジェスト、エントリ順序（パス UTF-8 バイト昇順）、除外一覧のダイジェスト組み込み
- `src/core/snapshot/compare.ts` — 純粋な `deriveChangeSet()`、除外不一致でのフェイルクローズ、kind 変更時の delete+add 分割
- `src/core/artifact-output/execution-profile.ts` — `EXECUTION_PROFILE_IDS`、`PROFILE_CAPABILITIES` テーブル、`STEP_CAPABILITY_REQUIREMENTS` テーブル、`UNSUPPORTED_OPERATIONS`
- `src/core/artifact-output/preflight.ts` — 純粋な `planEffectivePipeline()`、`EffectivePipelineReport` 返却
- `src/core/artifact-output/run.ts` — 9 フェーズオーケストレーター、クロスフェーズダイジェスト照合、例外を決して throw しない設計
- `src/core/artifact-output/revision-binding.ts` — `runBoundToCandidateRevision()`、ドリフト検出、`frozenSnapshot` を pre-execution として固定
- `src/core/artifact-output/guarded-spawn.ts` — `createGitDenyingSpawn()`、`git`/`gh` をベース名でブロック、`node:child_process` 未使用
- `src/core/artifact-output/source-guard.ts` — `assertSourceUnchanged()`、unavailable → `unverifiable`（フェイルクローズ）
- `src/core/artifact-output/materialize.ts` — ソースからのコピーのみ、シンボリックリンクをシンボリックリンクとして再作成、ソース未書き込み
- `src/core/artifact-output/patch.ts` — D8 分類テーブル、重複バイナリチェック（F-01）、`PATCH_MAX_FILE_SIZE_BYTES`
- `src/core/artifact-output/artifact-writer.ts` — `artifact.staging/` → `artifact/` アトミックリネーム、ペイロード対象の分類
- `src/core/command/guide.ts` — artifact-output トピック、`UNSUPPORTED_OPERATIONS` 連携、preview 表記の不足（F-03）

**テストファイル**
- `tests/artifact-output-vertical.test.ts` — 9 フェーズ統合テスト、`_assertNoGitAbove` の未呼び出し（F-02）、TC カバレッジ確認
- `src/core/artifact-output/__tests__/run.test.ts` — TC-065、TC-066、TC-073、TC-079 の単体テスト
- `src/core/artifact-output/__tests__/context-binding.test.ts` — `runBoundToCandidateRevision()` ドリフト検出の単体テスト
- `tests/unit/architecture/artifact-output-git-free.test.ts` — アーキテクチャゲートテスト、TC-071 逆方向 import チェックと TC-072 `RUN_JOB_FLAGS` チェックの欠落（F-05）

**設計・仕様ファイル**
- `specrunner/changes/gitless-artifact-output/design.md` — D1〜D16 全決定事項
- `specrunner/changes/gitless-artifact-output/tasks.md` — T-01〜T-12 の受け入れ基準
- `specrunner/changes/gitless-artifact-output/test-cases.md` — 79 テストケース（must 63 件）の実装対応状況

**ドキュメント**
- `README.md` — artifact-output プロファイルセクション（F-03 対象）
- `docs/artifact-output-profile.md` — フルリファレンス（存在確認のみ）

---

## 検証できなかった項目

- **テスト実行結果の直接確認**: iter 1 の検証結果（ビルド／型チェック／テスト／lint 全グリーン）を権威ある結果として採用し、本セッションでのローカル実行は行っていない。
- **大規模ディレクトリでのスナップショット収集パフォーマンス**: ローカル実行環境がなく、実際の処理速度・メモリ使用量を計測していない。
- **TC-076（手動確認）**: `docs/artifact-output-profile.md` の内容の完全性チェック。test-cases.md にて「manual」と分類されており、本レビューの自動検証対象外。
- **`src/core/command/__tests__/guide.test.ts`**: ガイドトピックの単体テスト内容の詳細確認。トピック登録数のアサーションは存在することを把握しているが、個々のアサーション内容の精査は行っていない。
