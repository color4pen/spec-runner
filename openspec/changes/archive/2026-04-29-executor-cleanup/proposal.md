## Why

PR #26（D1-D9）と PR #28（D4-D6）の cumulative diff として、Step 抽象 / StepExecutor / Pipeline state machine / AgentRegistry / AgentSyncer / 統一 config schema が完成し、port/adapter 境界も確立された。一方で 2 つの request の "deferred LOW/MEDIUM" と「sibling file 残存」「@deprecated shim 残存」が累積しており、後続 request（implementer / verification / code-review / PR 作成 Step の追加）で executor.ts に手を入れる際に、本来見たい diff が cruft に埋もれる状態にある。

具体的な cruft:

1. **executor.ts が 900 LOC**: `runProposeStyleStep`（~290 LOC）と `runPollingStyleStep`（~280 LOC）の間に session-create / fail-state attach / pushStepResult / appendHistory の構造的重複が残存。PR #26 review-feedback-003 MEDIUM #3 で deferred 済。
2. **`@deprecated` shim が複数ファイルに残存**: `src/core/session.ts` / `src/sdk/sessions.ts` / `src/state/store.ts` / `src/core/types.ts` / `src/config/schema.ts` の各所に。production 経路から参照ゼロのものは test 側の移行漏れで生き残っている可能性が高い。
3. **`runPipeline` / `runProposePipeline` 関数本体が `src/core/pipeline.ts` に残置**: D1-D9 で transition table を `src/core/pipeline/` ディレクトリ形式に移行したが、`runPipeline` / `runProposePipeline` の関数本体が `src/core/pipeline.ts` に取り残されており、directory-form 移行が未完結。`src/core/pipeline/index.ts` はこれらを re-export していないため、`src/cli/run.ts` が `src/core/pipeline.ts` を直接 import し続けている。ADR-20260429-module-architecture-style D7 に沿って関数移動 + re-export + 旧ファイル削除を 1 commit で完結させる。
4. **D4-D6 の defer 済 LOW 群**: `def.role as StepName` の不要 cast、`step.name !== step.agent.role` の不整合検出、`AgentToolsetSpec.type` のハードコード集約、`canonicalJson` の `undefined` 値ハンドリング、`fetchSpecReviewResult` legacy fallback の整理。

これらは「Step を増やすコスト」を直接押し上げてはいないが、後続 request の diff を読みづらくし、review で見つけにくい regression を温存する。本 request は土台の整理に集中する（振る舞い不変）。

## What Changes

- **executor.ts helper 抽出**: `runProposeStyleStep` と `runPollingStyleStep` の重複部（session-create / fail-state attach / pushStepResult / appendHistory）を private helper に集約する。目標 LOC は 750-800（現状 900）。module-architect の analysis で cohesive helper の境界線を確定してから実装する。
- **`@deprecated` shim の体系的削除**: `grep -rn "@deprecated" src/` で対象を列挙し、(a) production 参照あり / (b) test 経由のみ / (c) 参照ゼロ / (d) field（`RawConfig.agent` 等）の 4 段階で分類。最低でも (b) と (c) を全て解消する。残債の (a) は implementation-notes.md に rationale 付きで記録する。
- **`src/core/pipeline.ts` の完全削除（directory-form 移行完結）**: `runPipeline` / `runProposePipeline` 関数本体を `src/core/pipeline/run.ts` に移動し、`src/core/pipeline/index.ts` から re-export する。call site（`src/cli/run.ts`、`tests/spec-review-fetch.test.ts`）の import path を `src/core/pipeline/index.js` 経由に書き換え、`src/core/pipeline.ts` を削除する。この 4 操作を 1 commit で完結させる（learned-patterns の D7 規律）。
- **D4-D6 review で defer された LOW の cleanup**:
  - `src/core/agent/registry.ts:27` の不要 cast `def.role as StepName` 削除
  - `AgentRegistry.fromSteps` で `step.name !== step.agent.role` 不整合を fail-fast 検出
  - `AgentToolsetSpec.type = "agent_toolset_20260401"` を `AGENT_TOOLSET_TYPE` const として `src/core/agent/definition.ts` に集約
  - `canonicalJson` を `value === undefined` のキーをスキップする実装に変更（または JSDoc で「undefined 値を持つキーは入力に含めない」を明示）
- **`fetchSpecReviewResult` legacy fallback の整理**: `deps.githubClient` が常に提供されているか確認し、常に提供されているなら fallback 削除。未提供 path があれば現状維持して理由を design.md に明示。
- **module-analysis を tasks.md に下ろす**: module-architect が生成した `module-analysis.md` の decisions（共通化候補・越境懸念）を tasks の冒頭タスクに具体作業として下ろす（learned-patterns lesson「decisions/module-architect.md に書くだけで終わっていないか」を遵守）。

**振る舞い不変**（外部 CLI 出力 / state file / config file に diff 無し）。delta specs は生成しない（refactoring であり capability 仕様の改訂は無い）。

## Capabilities

### Modified Capabilities

なし — 本 request は capability 仕様の改訂を伴わない pure refactoring。既存 spec（`step-execution-architecture` / `agent-registry` / `agent-syncer` / `agent-definition-ownership` / `cli-config-store` / `agent-environment-bootstrap`）の振る舞いはすべて不変。

### New Capabilities

なし。

## Impact

- **Affected code**:
  - `src/core/step/executor.ts` — `runProposeStyleStep` / `runPollingStyleStep` の共通ロジック helper 抽出（session-create / fail-state attach / pushStepResult / appendHistory）
  - `src/core/session.ts` — @deprecated shim の利用箇所確認 → 削除
  - `src/sdk/sessions.ts` — @deprecated shim の利用箇所確認 → 削除
  - `src/state/store.ts` — @deprecated shim の利用箇所確認 → 削除
  - `src/core/types.ts` / `src/config/schema.ts` — @deprecated `field`（RawConfig.agent legacy field 等）の確認 → 削除可能なら削除
  - `src/core/pipeline.ts` — 削除（`src/core/pipeline/` ディレクトリへの完全移行）
  - `src/core/agent/registry.ts` — D4-D6 review LOW #4（`as StepName` 不要 cast 削除）+ #5（`step.name !== step.agent.role` 検出）
  - `src/core/agent/definition.ts` — D4-D6 review LOW #6（`AgentToolsetSpec.type` 定数集約）
  - `src/core/agent/hash.ts` — D4-D6 review MEDIUM #3（`canonicalJson` の `undefined` 値ハンドリング）
  - `src/core/step/spec-review.ts` — `fetchSpecReviewResult` legacy fallback の整理
  - `tests/unit/**` — 上記モジュールのテスト更新。@deprecated shim 削除に伴い test 側 import を新パスへ統一
- **Affected specs**: なし（pure refactoring、振る舞い不変）
- **External CLI behavior**: 不変（既存 280 テスト全 PASS、`specrunner init/login/run/ps` の stdout / state file / config file に diff 無し）
- **Dependencies**: PR #28（merged）の D4-D6 完了が前提
- **Migration**: なし（schema 変更を伴わない）。test の import path 更新は内部リファクタとして 1 commit で実施
- **Out of scope**:
  - implementer / verification / code-review / PR 作成 Step の追加（後続 request）
  - spec-reviewer の rename-as-MODIFIED checklist 化（spec-review skill 改善は別系統 request）
  - production 経路から参照のある `@deprecated` の削除（implementation-notes.md に残債として明示）
  - E2E 実機検証（self-hosting 完成まで保留）
