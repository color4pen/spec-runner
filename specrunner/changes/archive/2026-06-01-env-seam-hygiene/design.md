# Design: env-seam-hygiene

## Context

architecture/model.md §4 B-6 は「subprocess / SDK へ渡す env は `stripSecrets` seam（`util/env-filter`）経由。raw `process.env` を直接渡さない」と規定する。現在 3 ファイル・5 箇所が違反しており、`arch-allowlist.ts` の B-6 エントリとして凍結されている:

1. **`src/core/preflight.ts`**（3 箇所）:
   - L105: `resolveGitHubToken(process.env as ...)` — `runPreflight()` が raw env を credential resolver に渡す
   - L121: `checkRuntimePrereqs(config, process.env as ...)` — 同上
   - L136: `resolveSpecRunnerApiKey(process.env as ..., ...)` — 同上
2. **`src/core/lifecycle/diagnostic.ts`**（1 箇所）:
   - L15: `process.env["SPECRUNNER_DEBUG"]` — `logPipelineDiag()` が debug 判定で env を直読み
3. **`src/core/verification/commands.ts`**（1 箇所）:
   - L53: `process.env.PATH` — `spawnCommand()` が PATH を直読みして子プロセスに渡す

`checkRuntimePrereqs()` は既に `env` パラメータを受け取っている（caller 側の `runPreflight()` で `process.env` を渡している）ため、修正対象は `runPreflight()` の env thread のみ。

B-6 category を空にすると T-04 の suppression-demo test（B-6 entry で「allowlisted violation は suppress される」ことを証明するテスト）が壊れるため repoint が必要。

## Goals / Non-Goals

**Goals**:

- `src/core/` から raw `process.env` 直参照を全除去し B-6 arch test を green にする
- `arch-allowlist.ts` の B-6 エントリ 5 件を全削除
- T-04 suppression-demo を生存 entry（`B3-logger`）へ repoint して regression guard を維持
- 既存の挙動は不変（env 読み取り経路を seam に寄せるのみ）

**Non-Goals**:

- B-7（出力 mask）・B-8（runtime 分岐）・他 invariant の解消
- doctor の実 secret 解決経路
- 振る舞い変更

## Decisions

### D1: `runPreflight()` に `env` パラメータを追加

`runPreflight(requestMdPath, cwd)` → `runPreflight(requestMdPath, cwd, env?)` に拡張する。`env` は optional で、デフォルト値は `process.env as Record<string, string | undefined>`。

`runPreflight()` 内部の 3 箇所の `process.env` 参照を全て `env` パラメータに置換する。

**ただし B-6 test は `src/core/` 内で `process.env` 文字列を grep するため、関数 signature のデフォルト値 `= process.env as ...` も grep に引っかかる**。→ caller（`cli/run.ts`）から明示的に `process.env` を渡し、`preflight.ts` のデフォルト値は設定しない。signature は `env: Record<string, string | undefined>` (required) にする。

**Rationale**: `checkRuntimePrereqs()` が既に env パラメータを受け取るパターンが確立されている。同一パターンに揃える。

**Alternatives considered**:
- optional param + デフォルト値 → signature 内の `process.env` が B-6 grep に引っかかるため不可
- 各 call site で `stripSecrets(process.env)` を挟む → credential resolution は secret key 自体を読むので strip すると機能が壊れる

### D2: `logPipelineDiag()` の `process.env` 読み取りを seam 関数に抽出

`diagnostic.ts` L15 の `process.env["SPECRUNNER_DEBUG"]` を、`src/util/env-filter.ts` に新設する seam 関数 `getDebugSubsystems(): string` に委譲する。`getDebugSubsystems()` は `process.env["SPECRUNNER_DEBUG"] ?? ""` を返す。

`diagnostic.ts` は `getDebugSubsystems()` を import して使い、ファイル内に `process.env` 文字列を一切残さない。

**Rationale**: `logPipelineDiag` の caller は 14 箇所（pipeline.ts, executor.ts, agent-runner.ts）あり、全 caller に debugEnv を thread するのは不釣り合い。`src/util/` は B-6 test scope（`src/core/`）の外であるため、seam 関数内の `process.env` 読み取りは test に引っかからない。`env-filter.ts` は既に env 関連の seam を提供しているファイルであり、debug subsystem の env 読み取りもここに置くのは自然。

**Alternatives considered**:
- パラメータ追加（`logPipelineDiag(point, detail?, debugEnv?)`）→ 14 caller 全てにデフォルト値が波及、signature 内 `process.env` が grep に引っかかるリスクもある
- module-level 定数 `const SPECRUNNER_DEBUG = process.env[...]` → grep は行単位で match するため violation になる

### D3: `spawnCommand()` に `env` パラメータを追加

`spawnCommand(command, cwd)` → `spawnCommand(command, cwd, env: Record<string, string | undefined>)` に拡張する（required）。

内部の `process.env.PATH` と `stripSecrets(process.env)` を `env.PATH` と `stripSecrets(env)` に置換する。caller（`runner.ts`）から `process.env` を渡す。

**Rationale**: caller は `runner.ts` の 1 箇所のみなので修正コストは低い。テスト（`commands.test.ts`）も explicit env を渡すよう修正する。

**Alternatives considered**:
- optional param + デフォルト値 → D1 と同じ理由で不可（signature 内 `process.env` が grep hit）
- PATH だけ別パラメータ → `stripSecrets(process.env)` も参照しているので env 全体を渡す方が一貫的

### D4: T-04 suppression-demo を B3-logger へ repoint

T-04 の `"does not flag violations that are correctly allowlisted (B-6 allowlist suppression)"` テストを B-3 の `B3-logger` entry（`src/logger/pipeline-logger.ts` → `core/event/event-bus.js`）へ repoint する。

テストの synthetic match data を `pipeline-logger.ts` の import に変え、`ARCH_ALLOWLIST.filter(e => e.invariant === "B-3")` でフィルタする形にする。テスト名も `(B-3 allowlist suppression)` に変更。

**Rationale**: B-6 category が空になるため B-6 based の suppression demo は成立しなくなる。`B3-logger` は全 follow-on change で生存する（request.md 明記）。B-8 は並行 change が空にする予定なので避ける。

**Alternatives considered**:
- B-8 entry を使う → 並行 change `runtime-branch-consolidation` で空になるリスクがあり不適切
- テスト自体を削除 → regression guard の一部であり、削除は安全性を下げる

## Risks / Trade-offs

- [Risk] `runPreflight` signature を required param に変更すると caller 修正が必要 → **Mitigation**: caller は `cli/run.ts` L62 と `tests/core/preflight.test.ts` の 2 系統。限定的。`core/finish/preflight.ts` は別関数（同名だが別 module）で影響なし。
- [Risk] `commands.test.ts` が env を渡さず `spawnCommand("exit 0", cwd)` と呼んでいる → **Mitigation**: テスト修正で `process.env` を第 3 引数に追加。
- [Risk] `diagnostic.test.ts` が `process.env["SPECRUNNER_DEBUG"]` を直接書き換えてテストしている → **Mitigation**: seam 関数化後は `vi.mock` で `getDebugSubsystems` を差し替える形に変更。
- [Trade-off] `getDebugSubsystems` は薄い seam だが、B-6 enforcement を通すための architectural seam として正当化される。

## Open Questions

なし。
