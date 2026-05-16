# Spec Review Result — require-spawn-injection

- **reviewer**: spec-reviewer
- **date**: 2026-05-16
- **verdict**: approved

## Summary

request.md の問題定義・設計判断・タスク分解いずれも実コードベースと整合しており、compile-time safety を最小変更で達成する妥当なアプローチ。

## Verified Against Codebase

| Claim | File:Line | Actual | OK |
|-------|-----------|--------|----|
| `spawn?: SpawnFn` with `?? spawnCommand` fallback | `propagate.ts:35,37` | 一致 | Yes |
| `VerificationStep.run` が spawn を渡していない | `verification.ts:44-49` | `propagateVerificationResult` 呼び出しに spawn field なし | Yes |
| `StepDeps = StepContext` (alias) | `step/types.ts:19` | 一致 | Yes |
| `PipelineDeps extends StepContext` | `types.ts:39` | 一致 | Yes |
| `CliStep.run` がメソッド構文で宣言 | `step/types.ts:181` | `run(state: JobState, deps: StepDeps): Promise<void>;` — メソッド構文 | Yes |
| `PrCreateStep` が `CliStep` を実装 | `pr-create.ts:23` | `const PrCreateStep: CliStep` | Yes |
| `executor.ts` が `PipelineDeps` を `step.run()` に渡す | `executor.ts:305,319` | `deps: PipelineDeps` | Yes |
| `buildDeps` が `PipelineDeps` を返す (local) | `local.ts:256-274` | 一致 | Yes |
| `buildDeps` が `PipelineDeps` を返す (managed) | `managed.ts:159-177` | 一致 | Yes |
| テストが `propagateVerificationResult` を mock していない | `pipeline-integration.test.ts` | `runVerification` と `runPrCreate` のみ mock | Yes |

## Design Decisions

### D1 (spawn required) — OK

Leaky default の除去は正しい。`spawnCommand` import が dead code になるため Task 1 の削除指示も適切。

### D2 (CliStepDeps) — OK

`StepContext` を触らず `CliStepDeps extends StepDeps` で拡張する判断は request の制約に合致。

### D3 (PipelineDeps に spawn 追加) — OK

`PipelineDeps extends StepContext` + `spawn` → `CliStepDeps` (`StepContext` + `spawn`) を構造的に満たす。`executor.ts` 変更不要の根拠は正しい。Agent step が余分な `spawn` field を受け取るが、アクセスしないため harmless。

### D4 (buildDeps injection) — OK

`local.ts` と `managed.ts` の 2 箇所。省略すれば TypeScript が検出する — compile-time guarantee 達成。

### D5 (PrCreateStep bivariance) — Acceptable with note

`CliStep.run(deps: CliStepDeps)` に対して `PrCreateStep.run(deps: StepDeps)` はメソッド構文の bivariant checking で compile 通る。**現状正しいが、将来 interface をアロー構文に変えると壊れる**。issue #256 で `PrCreateStep` にも spawn injection が入れば解消されるため、今回は acceptable。

## Tasks

Task 1-6 の手順・ファイル参照・行番号は実コードと一致。Task 5 の行番号は approximate だが search pattern (`await runPipeline(jobState,`) が明示されており implementer は問題なく特定できる。

## Security

- spawn injection は副作用の抑制（git subprocess の遮断）であり、攻撃面の拡大なし
- `noopSpawn` はテスト専用で production path に入らない
- OWASP 観点で新たなリスクなし

## Findings

なし。
