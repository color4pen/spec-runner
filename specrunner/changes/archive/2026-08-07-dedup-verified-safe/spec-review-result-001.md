# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/dedup-verified-safe/request.md` — 要件・スコープ外・受け入れ基準を確認
- `specrunner/changes/dedup-verified-safe/design.md` — 設計決定 D1〜D8 を確認
- `specrunner/changes/dedup-verified-safe/tasks.md` — タスク T-01〜T-09 を確認
- `specrunner/changes/dedup-verified-safe/spec.md` — Scenario を確認

### ソース検証（各重複ブロックの実在確認）

| ID | ファイル | 検証内容 |
|----|----------|----------|
| C1 | `src/cli/command-registry.ts:400-454`, `:523-577` | `run` / `job start` handler が byte-identical であることを実読確認。flag 定義 6 項目、detach 経路、--issue parse、`runRun()` 呼び出しが完全一致 |
| C2 | `src/core/step/code-review.ts:28`, `spec-review.ts:51`, `request-review.ts:40`, `conformance.ts:35` | 4 関数すべてが `(state.steps?.[NAME]?.length ?? 0) + 1` を返すことを確認。全ファイルが `nextIteration` を import 済み |
| C3 | `src/util/detect-pm.ts:58-79`, `:134-156` | `detectPackageManager` phase-1 ループと `findLockfile` が同一 LOCKFILE_MAP 順・`.git` stop・fs root stop であることを確認 |
| C4 | `src/config/store.ts:77-127`, `:144-198` | `loadConfig` と `loadConfigWithSourceMetadata` の read→migrate→merge→validate 全段が同一。`repoRoot` が `undefined` の場合も両関数とも project local を読まず、同じ error path を通ることを確認 |
| C5 | `src/store/job-journal.ts:218-250` | 4 メソッド (`appendInterruption/Lineage/OperatorEvent/FindingRecency`) の本体が全て `await appendEventRecord(this.resolver.getEventsPath(), record)` の 1 行であることを確認 |
| C6 | `src/core/verification/runner.ts:390-471`, `:614-696` | 2 関数の tail が coverage-gate → lockfile-gate → verdict → write の構造で同一。skip 文言のみ "command" / "phase" で 1 語差 |
| C7 | `src/core/command/resume.ts:274-289`, `reopen.ts:311-326` | liveness sidecar worktreePath 解決ブロックが byte-identical であることを確認 |
| C8 | `descriptor-input-completeness.ts:64`, `job-state-projection.ts:79-86`, `spec-review.ts:100-102` | `PROBE_SLUG` が `VALIDATOR_PROBE_SLUG` の alias（2 箇所使用）、空 if block の本体がコメントのみ、`enrichContext` が identity (`return dynamicContext`) であることを確認 |

### 設計決定の検証

- **D4 行動等価性**: `loadConfigWithSourceMetadata` で `repoRoot` が `undefined` の場合も `if (repoRoot)` ガードで project local を読まないため、`loadConfig` と同一挙動。返却 `config` フィールドは同一 validation path を通る ✓
- **D5 部分 dedup**: `appendEventRecord` の `record` 型が `EventRecord`（`= StepAttemptRecord | TransitionRecord | InterruptionRecord | LineageRecord | OperatorEventRecord | FindingRecencyRecord`）の union であり、`_appendRecord` の union 型はその部分集合として型安全 ✓
- **D6 テンプレート文字列**: `` `_(skipped — previous ${args.skipLabel} failed)_` `` で `"command"` / `"phase"` を渡すと既存リテラルと byte-for-byte 一致することを確認 ✓
- **D7 空文字 slug の安全性**: `resolvedSlug ?? ""` で helper を呼び出した場合、helper 内部の `if (!resolvedWorktreePath && slug)` ガードが空文字を falsy として扱うため sidecar lookup がスキップされ、元のガードと等価 ✓

### タスク分解カバレッジ確認

| 要件 | タスク |
|------|--------|
| Req 1: run/job start 統合 | T-03 ✓ |
| Req 2: compute*Iteration 削除 | T-01 ✓ |
| Req 3: detectPackageManager phase-1 置換 | T-05 ✓ |
| Req 4: loadConfig 委譲 | T-04 ✓ |
| Req 5: journal append 統合 | T-06 ✓ |
| Req 6: verification tail 抽出 | T-08 ✓ |
| Req 7: worktreePath helper 抽出 | T-07 ✓ |
| Req 8: dead code 除去 | T-02 ✓ |
| 最終確認 | T-09 ✓ |

全 8 要件を網羅 ✓

### アーキテクチャ検証

- **依存方向**: `core/resume/resolve-worktree-path.ts` → `util/paths.js`（leaf）は方向として正しい ✓
- **責務分離**: 新ファイル・抽出関数はすべて単一責務（`resolveLivenessWorktreePath` は sidecar 解決のみ、`finalizeVerificationRun` は検証末尾処理のみ） ✓
- **スコープ外の保持**: `job-state-store.ts` の 4 wrapper は変更なし（テスト互換性を維持） ✓

## 検証できなかった項目

None — 全要件・設計決定を検証した。

## Findings 詳細

None — 指摘なし。設計・タスク分解ともに健全。
