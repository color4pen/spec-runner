# Code Review — require-spawn-injection

- **reviewer**: code-reviewer
- **date**: 2026-05-16
- **iteration**: 1
- **verdict**: approved

## Summary

全 must TC が実装で充足されている。`spawn` required 化・`CliStepDeps` 導入・`buildDeps` injection・テスト側 `noopSpawn` 注入のすべてが正しく実装されており、verification-result.md が 161 ファイル / 1901 テスト全 pass を記録している。

---

## Findings

### [low] `noopSpawn` が 15+ のテストファイルに重複定義されている

**場所**: `tests/pipeline-integration.test.ts`, `tests/pipeline.test.ts`, `tests/cli-stdout-snapshot.test.ts`, `tests/core/pipeline/pipeline.test.ts`, ... (計 ~15 ファイル)

**内容**: 各ファイルで `const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" })` が独立して定義されている。ファイルによっては inline cast 形式 `(async () => ...) as SpawnFn` と named const 形式が混在している。

**影響**: 将来 `SpawnFn` の戻り値型が変わった場合に修正箇所が散在する。機能的な誤りはなく今回のスコープ外。

**推奨**: `tests/util/noop-spawn.ts` に集約する。issue #256 の test isolation 整備と合わせて対応するのが妥当。

---

### [low] `specrunner/changes/test-slug/pr-create-result.md` が検証実行中に書き換えられている

**場所**: `specrunner/changes/test-slug/pr-create-result.md`

**内容**: `diff --stat` に当該ファイルへの 2 行変更が含まれており、`CreatedAt` タイムスタンプが `2026-05-16T07:53:44.840Z` に更新されている。`runPrCreate` モックが `input.cwd ?? process.cwd()` で CWD に fallback しており、`process.cwd()` がワークツリー直下を指す場合に実 repoファイルへの書き込みが発生する。

**影響**: git commit / push は発生しないため本 PR の受け入れ基準は充足。ただし `test-slug` フォルダへのファイル副作用が残存しており、これは `pr-create/runner.ts` の leaky default に起因する既存問題。

**スコープ**: request.md 「スコープ外」で明示されている issue #256 に該当。本 PR での対応は不要。

---

## Test Coverage Against test-cases.md

| TC | Priority | 結果 |
|----|----------|------|
| TC-001: `spawn` が optional でない | must | ✅ `propagate.ts:35` — `spawn: SpawnFn`（`?` なし） |
| TC-002: `?? spawnCommand` fallback 削除 | must | ✅ `propagate.ts:37` — `const spawn = params.spawn;` |
| TC-003: `spawnCommand` import 削除 | must | ✅ import に `SpawnFn` 型のみ残存 |
| TC-004: `CliStepDeps` 定義 | must | ✅ `step/types.ts:30-32` |
| TC-005: `CliStep.run` が `CliStepDeps` を受け取る | must | ✅ `step/types.ts:194` |
| TC-006: `PipelineDeps` に `spawn: SpawnFn` | must | ✅ `core/types.ts:65` |
| TC-007: `VerificationStep.run` が `CliStepDeps` | must | ✅ `verification.ts:35` |
| TC-008: `propagate` に `spawn: deps.spawn` | must | ✅ `verification.ts:48` |
| TC-009: `LocalRuntimeStrategy.buildDeps` が `spawn: spawnCommand` | must | ✅ `local.ts:273` |
| TC-010: `ManagedRuntimeStrategy.buildDeps` が `spawn: spawnCommand` | must | ✅ `managed.ts:176` |
| TC-011: `bun run typecheck` green | must | ✅ verification-result.md: build/typecheck フェーズ passed |
| TC-012: `bun run test` green | must | ✅ verification-result.md: 1901 tests passed |
| TC-013: テスト後に新規 git commit なし | must | ✅ verification-result.md で確認済み |
| TC-014: テスト後に git push なし | must | ✅ `noopSpawn` により propagate 内の git push が遮断 |
| TC-015: 全 `runPipeline` に `noopSpawn` | must | ✅ grep 結果: 22 箇所すべてに `spawn: noopSpawn` |
| TC-017: `spawn` 省略でコンパイルエラー | must | ✅ required field により型システムが保証 |
| TC-023: `local.ts` に `spawnCommand` import | must | ✅ `local.ts:21` |
| TC-024: `managed.ts` に `spawnCommand` import | must | ✅ `managed.ts:21` |
| TC-025: `buildDeps` が `PipelineDeps` を満たす (local) | must | ✅ typecheck green |
| TC-026: `buildDeps` が `PipelineDeps` を満たす (managed) | must | ✅ typecheck green |

should TC (TC-016, TC-018, TC-019, TC-020, TC-021, TC-022, TC-027) も typecheck/test 通過から実質充足。

---

## 設計上の注記

**`PrCreateStep` bivariance 依存**: `PrCreateStep.run(deps: StepDeps)` が `CliStep.run(deps: CliStepDeps)` を満たすのは TypeScript のメソッド bivariant checking による。spec-review-result-001.md でも "Acceptable with note" として記録済み。issue #256 で `PrCreateStep` にも spawn injection が入れば自然に解消される。現状では問題なし。
