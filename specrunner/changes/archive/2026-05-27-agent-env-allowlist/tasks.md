## 1. Phase 1 — env フィルタユーティリティ + spawnCommand 適用

- [x] 1.1 `src/util/env-filter.ts` を新設する。`SECRET_DENYLIST` 定数（`GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`）と `stripSecrets(env)` 関数を export する。入力 env の shallow copy から denylist key を delete して返す
- [x] 1.2 `src/util/spawn.ts` の `spawnCommand()` を変更する。env 構築ロジックで `process.env` の代わりに `stripSecrets(process.env)` を使う。`opts.env` は `stripSecrets` 後に spread する（明示的上書きは維持）
- [x] 1.3 `tests/unit/util/env-filter.test.ts` を新設する。テスト対象: (a) denylist key が除去される、(b) denylist 外の key は保持される、(c) 元の env object が変更されない（immutability）、(d) denylist key が元から存在しない場合もエラーにならない
- [x] 1.4 `tests/unit/util/spawn.test.ts` の既存テスト TC-33 / TC-34 が引き続き通ることを確認する。追加テスト: (e) `process.env` に `GITHUB_TOKEN` をセットした状態で `spawnCommand()` を呼ぶと子プロセスから `GITHUB_TOKEN` が見えない、(f) `opts.env` で明示的に渡した変数は子プロセスから見える
- [x] 1.5 `bun run typecheck && bun run test` が green であることを確認する

## 2. Phase 2 — Claude Code SDK query() に filtered env 適用

- [x] 2.1 `src/adapter/claude-code/agent-runner.ts` の `queryOptions` 構築に `env: stripSecrets(process.env as Record<string, string | undefined>)` を追加する（`import { stripSecrets } from "../../util/env-filter.js"` を追加）
- [x] 2.2 `src/core/runtime/local.ts` の `buildSdkOptions()` に `env: stripSecrets(process.env as Record<string, string | undefined>)` を追加する（`import { stripSecrets } from "../../util/env-filter.js"` を追加）
- [x] 2.3 `bun run typecheck && bun run test` が green であることを確認する

## 3. Phase 3 — verification 経路に filtered env 適用

- [x] 3.1 `src/core/verification/commands.ts` の `spawnCommand()` を変更する。`{ ...process.env, PATH: pathWithLocalBin }` を `{ ...stripSecrets(process.env as Record<string, string | undefined>), PATH: pathWithLocalBin }` に変更する
- [x] 3.2 `src/core/verification/runner.ts` の `spawnScript()` を変更する。`env: process.env` を `env: stripSecrets(process.env as Record<string, string | undefined>)` に変更する
- [x] 3.3 `bun run typecheck && bun run test` が green であることを確認する

## 4. Phase 4 — Delta spec

- [x] 4.1 `specrunner/changes/agent-env-allowlist/specs/verification-runner/` に delta spec を作成する。`spawnCommand()` と `spawnScript()` の env フィルタ適用に関する ADDED requirement を記述する
- [x] 4.2 `specrunner/changes/agent-env-allowlist/specs/claude-code-runtime/` に delta spec を作成する。`queryOptions` と `buildSdkOptions` への env フィルタ適用に関する ADDED requirement を記述する
- [x] 4.3 `bun run typecheck && bun run test` が green であることを確認する（最終ゲート）
