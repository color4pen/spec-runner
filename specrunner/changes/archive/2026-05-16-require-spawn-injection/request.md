# propagateVerificationResult の spawn を必須引数化してテストの git 副作用を遮断する

## Meta

- **type**: spec-change
- **slug**: require-spawn-injection
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

`bun run test` を回すと、`tests/pipeline-integration.test.ts` 経由で本物の `git commit` と `git push origin <branch>` が実行される。PR #254 の feature branch でテストを回した際、`a8b4161 chore: verification result for test-slug (iter 1)` という commit が勝手に作られ origin に push された実害がある。`main` 上で `bun run test` を回せば main に commit + push が走る危険もある。

原因は `src/core/verification/propagate.ts` の `propagateVerificationResult` が `spawn` を inject 可能な signature を持ちながら default を本物の `spawnCommand` にしていること。`src/core/step/verification.ts:44-49` の `VerificationStep` が `propagate` を呼ぶ際 `spawn` を渡しておらず、テスト経路でも本物の git が走る。`tests/pipeline-integration.test.ts` は `runVerification` / `runPrCreate` を mock しているが `propagateVerificationResult` は mock していない（副作用境界を 1 つ見落としている）。

関連 issue: https://github.com/color4pen/spec-runner/issues/255

## 目的

副作用関数の `spawn` を「inject 忘れたら本物が走る」leaky default ではなく **必須引数** にして、テスト経路で本物の git が動かないことを compile time に保証する。同類のバグ（他の副作用関数で同じ pattern を踏む）を将来防ぐ規律としても残す。

## 要件

### 1. `propagateVerificationResult` の `spawn` を required にする

`src/core/verification/propagate.ts`:

```ts
// Before
spawn?: SpawnFn;
const spawn = params.spawn ?? spawnCommand;

// After
spawn: SpawnFn;
const spawn = params.spawn;
```

### 2. CliStep 専用 deps を分離して spawn を持たせる

`StepContext` (`src/core/types.ts:18`) は全 step (agent step 含む) が受け取る共通型なので **触らない**。代わりに CliStep 専用 deps 型を新設し、`spawn: SpawnFn` をそこに置く。

- 新設例: `interface CliStepContext extends StepContext { spawn: SpawnFn }` (名前は design で確定)
- `src/core/step/verification.ts` の `VerificationStep` は新型を受け取り、`deps.spawn` を `propagate` に伝播
- `buildDeps` (`src/core/runtime/local.ts:256` / `src/core/runtime/managed.ts:159`) が CliStep 系 step には `spawnCommand` を含んだ deps を渡す
- 既存の LLM 系 step は `StepContext` のままで影響なし

### 3. テスト経路を必須注入に追従させる

`propagateVerificationResult` の production caller は `src/core/step/verification.ts:44` の **1 箇所のみ**で、`tests/pipeline-integration.test.ts` は `VerificationStep.run` 経由で間接呼び出ししている。したがって `propagate` の `spawn` を required にしただけでは compile error は出ず、test 実行時に runtime crash する。

- `VerificationStep` が `deps.spawn` を `propagate` に渡すよう改修した結果、`StepDeps.spawn` 必須化により **deps 構築箇所** で compile error が出る
- `tests/pipeline-integration.test.ts` の deps 構築ヘルパ (例: `makeDeps`) に fake spawn を inject する
- `tests/unit/core/verification/propagate.test.ts` は既に spawn を inject 済み（追加対応不要）
- `tests/setup.ts` は **現状リポジトリに存在しない**（`vitest.config.ts` にも `setupFiles` 指定なし）ため再利用不可。要件 4 で新規作成する場合はそこを参照する

## スコープ外

- `tests/setup.ts` の runtime guard 設計と `vitest.config.ts` 統合 — issue #256 で別途扱う
- 同類 leaky pattern を持つ他副作用関数の修正 (`src/core/pr-create/runner.ts`, `src/cli/finish.ts`, `src/core/worktree/manager.ts:64` 等) — issue #256
- CLAUDE.md / spec authority への副作用境界規律の明文化 — issue #256
- spawn 抽象化 / DI フレームワーク導入
- 既に push されてしまった `a8b4161` commit の history rewrite（main にいないので放置）

## 受け入れ基準

- [ ] `src/core/verification/propagate.ts` の `spawn` field が required (`?` なし) になっている
- [ ] `params.spawn ?? spawnCommand` の fallback が削除されている
- [ ] `VerificationStep` 経由で本物の `spawnCommand` が CLI 経路から inject されている
- [ ] `bun run test` を **clean tree** で実行しても **git commit や push が発生しない**（手動 acceptance: テスト前後の `git status` / `git log` で確認）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
