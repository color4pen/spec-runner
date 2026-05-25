# Design: remove-xdg-mode

## Summary

`config.jobs.location` の `"xdg"` opt-out を廃止し、jobs/logs を常に `<repo-root>/.specrunner/` 配下に置く。module-level state (`jobsLocation`, `projectRoot`) を削除し、`getJobsDir()` / `getVerboseLogDir()` を `repoRoot` 引数で駆動する純粋関数に変換する。

## Design Decisions

### D1: `repoRoot` parameter injection

**選択**: `getJobsDir(repoRoot)` / `getVerboseLogDir(repoRoot)` は `repoRoot: string` を必須引数として受け取る純粋関数にする。

**理由**:
- module-level state を完全に削除できる（`setJobsLocation` / `resetJobsLocation` 不要）
- テストでの state leak リスクがゼロになる
- 依存関係が型レベルで可視化される（`git rev-parse` を内部で隠蔽しない）
- `feedback_llm_uncertainty_principle` に合致 — agent/module が判断する場面を消す

**却下案**:
- `git rev-parse --show-toplevel` を各 helper 内で実行 → 副作用が見えにくい、テスト困難
- 新たな module-level `setRepoRoot()` → 旧問題の再導入

### D2: `JobStateStore` constructor に `repoRoot` を追加

**選択**: `new JobStateStore(jobId, repoRoot)` — 内部で `getJobStatePath(repoRoot, jobId)` を呼びファイルパスを確定。

**Static method**:
- `JobStateStore.create(repoRoot, params)` → 内部で `getJobStatePath(repoRoot, jobId)` を呼ぶ
- `JobStateStore.list(repoRoot)` → 内部で `getJobsDir(repoRoot)` を呼ぶ
- `JobStateStore.delete(repoRoot, jobId)` → 同上
- `JobStateStore.resolveId(repoRoot, prefix)` → 内部で `list(repoRoot)` を呼ぶ

**`StoreFactory` 型**: signature は `(jobId: string) => JobStateStore` のまま維持。composition root で `repoRoot` を closure capture する:
```ts
storeFactory: (id: string) => new JobStateStore(id, repoRoot)
```

### D3: `initVerboseLog(repoRoot, jobId)` に `repoRoot` を追加

**選択**: `initVerboseLog` の第一引数に `repoRoot` を追加。`CommandRunner.execute()` で `repoRoot` は `PrepareResult` から取得する（既に各 prepare() subclass が resolve 済み）。

### D4: CLI entry の fallback 戦略

**旧**: config 読み込み失敗 → `setJobsLocation("xdg")` にフォールバック
**新**: `git rev-parse --show-toplevel` 失敗 → jobs ディレクトリは見つからない（ENOENT → 空リスト返却 or エラー）

合理性: specrunner は repo-bound tool。repo 外では jobs が存在しないのが正常。

### D5: 旧 config の `jobs` section は無視

旧 config に `{ "jobs": { "location": "xdg" } }` が残っていても:
- `validateConfig()` から jobs validation block を削除 → 未知 field として passthrough
- error にならない（`loadConfig` は known fields のみ extract し、残りを無視する既存挙動と整合）

## Affected Modules

| Module | Change |
|--------|--------|
| `src/util/xdg.ts` | module state 削除、関数 signature 変更 |
| `src/config/schema.ts` | `JobsConfig` 型削除、`jobs` field 削除、validation block 削除 |
| `src/store/job-state-store.ts` | constructor + static methods に `repoRoot` 引数追加 |
| `src/logger/stdout.ts` | `initVerboseLog` に `repoRoot` 引数追加 |
| `src/core/types.ts` | `StoreFactory` 型は変更なし（closure capture） |
| `src/core/runtime/local.ts` | `storeFactory` 生成時に `this.cwd` を capture |
| `src/core/runtime/managed.ts` | 同上 |
| `src/core/command/runner.ts` | `PrepareResult` に `repoRoot` 追加、`initVerboseLog` 呼び出し更新 |
| `src/core/command/pipeline-run.ts` | `prepare()` で `repoRoot` を返す |
| `src/core/command/resume.ts` | `prepare()` で `repoRoot` を返す |
| `src/core/finish/orchestrator.ts` | `new JobStateStore(id, repoRoot)` に更新 |
| `src/core/cancel/runner.ts` | `new JobStateStore(id, repoRoot)` に更新、`list(repoRoot)` に更新 |
| `src/state/store.ts` | deprecated wrappers 更新 |
| `src/cli/run.ts` | `setJobsLocation` 削除、`repoRoot` 受け渡し |
| `src/cli/resume.ts` | 同上 |
| `src/cli/cancel.ts` | 同上 |
| `src/cli/finish.ts` | 同上 |
| `src/cli/ps.ts` | 同上 |
| `src/cli/job-show.ts` | 同上 |
| `src/prompts/rules.ts` | XDG 言及を削除 |
| `specrunner/project.md` | XDG 言及を削除 |

## Spec Changes

3 capability の delta spec を提出:
- `cli-config-store`: `JobsConfig` 型・`jobs` field・validation scenarios を削除
- `job-state-store`: XDG mode scenario 削除、`setJobsLocation` 言及を `repoRoot` parameter に置換
- `verbose-execution-log`: XDG mode scenario 削除、`setJobsLocation` 言及を `repoRoot` parameter に置換
