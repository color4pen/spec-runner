# Tasks: env-seam-hygiene

## T-01: `runPreflight()` の env パラメータ化

- [x] `src/core/preflight.ts`: `runPreflight(requestMdPath: string, cwd: string)` → `runPreflight(requestMdPath: string, cwd: string, env: Record<string, string | undefined>)` に変更（required param、デフォルト値なし）
- [x] `runPreflight()` 内部の 3 箇所を `env` パラメータに置換:
  - L105: `resolveGitHubToken(process.env as Record<string, string | undefined>)` → `resolveGitHubToken(env)`
  - L121: `checkRuntimePrereqs(config, process.env as Record<string, string | undefined>)` → `checkRuntimePrereqs(config, env)`
  - L135-136: `resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>, ...)` → `resolveSpecRunnerApiKey(env, ...)`
- [x] caller 修正 — `src/cli/run.ts` L62: `runPreflight(absolutePath, cwd)` → `runPreflight(absolutePath, cwd, process.env as Record<string, string | undefined>)`
- [x] テスト修正 — `tests/core/preflight.test.ts`: `runPreflight("/fake/request.md", "/fake/cwd")` の全呼び出しに第 3 引数 `{}` を追加（credential resolver は vi.mock 済みなので空 object で十分）

**Acceptance Criteria**:
- `src/core/preflight.ts` に `process.env` 文字列が存在しない
- `bun run typecheck` が green
- `bun run test tests/core/preflight.test.ts tests/unit/core/preflight.test.ts` が green

## T-02: `logPipelineDiag()` の env 読み取りを seam 関数に抽出

- [x] `src/util/env-filter.ts` に `getDebugSubsystems()` 関数を追加:
  ```typescript
  export function getDebugSubsystems(): string {
    return process.env["SPECRUNNER_DEBUG"] ?? "";
  }
  ```
- [x] `src/core/lifecycle/diagnostic.ts` を修正:
  - `import { getDebugSubsystems } from "../../util/env-filter.js"` を追加
  - L15: `const debugEnv = process.env["SPECRUNNER_DEBUG"] ?? ""` → `const debugEnv = getDebugSubsystems()`
- [x] テスト修正 — `src/core/lifecycle/__tests__/diagnostic.test.ts`:
  - `vi.mock("../../../util/env-filter.js", ...)` を追加し `getDebugSubsystems` をモック化
  - `process.env["SPECRUNNER_DEBUG"]` の直接書き換えを `vi.mocked(getDebugSubsystems).mockReturnValue(...)` に置換
  - beforeEach/afterEach の env 保存・復元ロジックを除去

**Acceptance Criteria**:
- `src/core/lifecycle/diagnostic.ts` に `process.env` 文字列が存在しない
- `bun run typecheck` が green
- `bun run test src/core/lifecycle/__tests__/diagnostic.test.ts` が green

## T-03: `spawnCommand()` の env パラメータ化

- [x] `src/core/verification/commands.ts`: `spawnCommand(command: string, cwd: string)` → `spawnCommand(command: string, cwd: string, env: Record<string, string | undefined>)` に変更（required param、デフォルト値なし）
- [x] 内部の `process.env` 参照を `env` パラメータに置換:
  - L53: `process.env.PATH` → `env.PATH`（`env["PATH"]` でも可）
  - L60: `stripSecrets(process.env as Record<string, string | undefined>)` → `stripSecrets(env)`
- [x] caller 修正 — `src/core/verification/runner.ts` L299: `spawnCommand(cmd.run, cwd)` → `spawnCommand(cmd.run, cwd, stripSecrets(process.env as Record<string, string | undefined>))`（`stripSecrets` が同行にあるため B-6 grep フィルタで safe）。runner.ts は既に `stripSecrets` を import 済み（L11）
- [x] テスト修正 — `tests/unit/verification/commands.test.ts`: `spawnCommand("exit 0", cwd)` 等の全呼び出しに第 3 引数 `process.env as Record<string, string | undefined>` を追加（テストファイルは B-6 scope 外）

**Acceptance Criteria**:
- `src/core/verification/commands.ts` に `process.env` 文字列が存在しない
- `runner.ts` の新規 `process.env` 参照は `stripSecrets()` 経由（B-6 grep フィルタ safe）
- `bun run typecheck` が green
- `bun run test tests/unit/verification/commands.test.ts` が green

## T-04: arch-allowlist.ts の B-6 エントリ全件削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から B-6 invariant のエントリ 5 件を削除:
  - `src/core/preflight.ts` + `resolveGitHubToken(process.env` (tracking: B6-preflight)
  - `src/core/preflight.ts` + `checkRuntimePrereqs(config, process.env` (tracking: B6-preflight)
  - `src/core/preflight.ts` + `Record<string, string | undefined>,` (tracking: B6-preflight)
  - `src/core/lifecycle/diagnostic.ts` + `process.env["SPECRUNNER_DEBUG"]` (tracking: B6-diagnostic)
  - `src/core/verification/commands.ts` + `process.env.PATH` (tracking: B6-commands)
- [x] B-6 セクションのコメントブロック（`// ── B-6: ...` 〜 entries の間の説明コメント）も合わせて削除

**Acceptance Criteria**:
- `ARCH_ALLOWLIST` 配列に `invariant: "B-6"` のエントリが存在しない
- `bun run test tests/unit/architecture/core-invariants.test.ts` が green（B-6 enforcement が ratchet 解除後も通ること）

## T-05: T-04 suppression-demo の B3-logger repoint

- [x] `tests/unit/architecture/core-invariants.test.ts` の T-04 テスト `"does not flag violations that are correctly allowlisted (B-6 allowlist suppression)"` を修正:
  - テスト名を `"does not flag violations that are correctly allowlisted (B-3 allowlist suppression)"` に変更
  - コメントを更新: B-6 → B-3 の説明に
  - synthetic match data を変更:
    - file: `"src/logger/pipeline-logger.ts"`
    - line: 適当な行番号
    - content: `'import type { EventBus } from "../core/event/event-bus.js";'`
  - フィルタを `ARCH_ALLOWLIST.filter((e) => e.invariant === "B-3")` に変更
  - assertion コメントを更新

**Acceptance Criteria**:
- T-04 suppression-demo テストが B3-logger entry を使って allowlist suppression を検証している
- `bun run test tests/unit/architecture/core-invariants.test.ts` が green

## T-06: 全体検証

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` を実行し全 green を確認する

**Acceptance Criteria**:
- 4 コマンド全てが exit code 0
- `src/core/` に raw `process.env` 直参照が無い（B-6 arch test が green）
