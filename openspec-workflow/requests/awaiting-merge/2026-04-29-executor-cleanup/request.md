# executor.ts helper 抽出 + @deprecated shim / pipeline 並存解消

## Meta

- **type**: refactoring
- **date**: 2026-04-29
- **author**: color4pen
- **depends-on**: openspec-workflow/requests/merged/2026-04-29-d4-d6-agent-migration（PR #28 で merge 済み D4-D6）

## ワークフローオプション

- **enabled**:
  - module-architect

## 背景

PR #26（D1-D9）と PR #28（D4-D6）の累積で、Step 抽象 / StepExecutor / Pipeline state machine / AgentRegistry / AgentSyncer / config schema 統一まで完了し、外部 API 境界（port/adapter）も確立された。一方で D1-D9 と D4-D6 の cumulative diff には以下の cruft が残っている:

1. **executor.ts が 900 LOC**: `runProposeStyleStep`（~290 LOC）と `runPollingStyleStep`（~280 LOC）に session-create / fail-state attach / pushStepResult / appendHistory の構造的重複が残存。helper 抽出で 100–150 LOC 削減見込み（D1-D9 の code-review MEDIUM #3 で deferred 済）。

2. **@deprecated shim が複数ファイルに残存**: `src/core/session.ts` / `src/sdk/sessions.ts` / `src/state/store.ts` / `src/core/types.ts` / `src/config/schema.ts` の各所に `@deprecated` がついた export / type / field が残存。production 経路から参照ゼロのものは test 側の移行漏れで生き残っている可能性が高く、`grep -rn` で利用箇所を確定して削除する。

3. **`src/core/pipeline.ts` への `runPipeline` / `runProposePipeline` 関数本体の残置**: D1-D9 で transition table を `src/core/pipeline/` ディレクトリ形式に移行したが、`runPipeline` / `runProposePipeline` の関数本体が `src/core/pipeline.ts` に取り残されており directory-form 移行が未完結。`src/core/pipeline/index.ts` はこれらを re-export していないため、`src/cli/run.ts` が `src/core/pipeline.ts` を直接 import し続けている。ADR-module-architecture-style D7「directory-form 移行は sibling file を残さない」に沿って関数移動 + re-export + 旧ファイル削除を完結させる。

4. **D4-D6 で defer された軽微な改善**: review-feedback-002 / fixup-001 で deferred になった LOW 群 — `def.role as StepName` の不要 cast、`step.name !== step.agent.role` の不整合検出、`AgentToolsetSpec.type` のハードコード集約、`canonicalJson` の `undefined` 値ハンドリング、`fetchSpecReviewResult` legacy fallback の整理。

5. **archive 時に発覚した delta spec authoring lesson の機械化**: `/request-merge` Step 5 で archive subagent が rename-as-MODIFIED 等の bug を最小修正してから sync を実行した。learned-patterns に lesson は記録済み（PR #30）だが、spec-reviewer のチェックリスト化は未着手。本 request では扱わない（spec-review skill 側の更新になるため別 request 候補）。

これらは「Step を増やすコスト」を直接押し上げてはいないが、後続 request（implementer / verification / code-review / PR 作成 step の追加）で executor.ts に手を入れる際に diff が cruft に埋もれる。本 request で土台を整理しておく。

## 目的

D1-D9 と D4-D6 で残された cruft を一掃し、後続の Step 追加 request が clean な executor / pipeline / module 構造の上で完結するようにする。具体的には:

1. `executor.ts` の重複ロジックを helper 抽出して LOC を削減（目標: 900 → 750-800 LOC）
2. `@deprecated` export / type / field を「利用箇所 0 件」で削除
3. `src/core/pipeline.ts` を完全に削除して directory-form 移行を完結
4. D4-D6 で defer された LOW 群を cleanup（cast 削除 / hash robustness / 命名規約 unit test 追加 / legacy fallback 整理）

## 対象範囲

- **src/core/step/executor.ts**: `runProposeStyleStep` / `runPollingStyleStep` の共通ロジック helper 抽出（session-create / fail-state attach / pushStepResult / appendHistory の重複部）
- **src/core/session.ts**: @deprecated shim の利用箇所確認 → 削除
- **src/sdk/sessions.ts**: @deprecated shim の利用箇所確認 → 削除
- **src/state/store.ts**: @deprecated shim の利用箇所確認 → 削除
- **src/core/types.ts** / **src/config/schema.ts**: @deprecated `field` の確認 → 削除可能なら削除（RawConfig.agent legacy field 等）
- **src/core/pipeline.ts**: 削除（src/core/pipeline/ ディレクトリへの完全移行）
- **src/core/agent/registry.ts**: D4-D6 review LOW #4（`as StepName` 不要 cast 削除）+ #5（`step.name !== step.agent.role` 検出）
- **src/core/agent/definition.ts**: D4-D6 review LOW #6（`AgentToolsetSpec.type` の定数集約）
- **src/core/agent/hash.ts**: D4-D6 review MEDIUM #3（`canonicalJson` の `undefined` 値ハンドリング）
- **src/core/step/spec-review.ts**: `fetchSpecReviewResult` export は維持。executor.ts の production fallback 経路（:818-829）を削除し、`deps.githubClient` を必須化する
- **src/core/step/executor.ts（verify*Legacy）**: `verifyBranchLegacy` / `verifyChangeFolderLegacy` を削除（~134 LOC）。`deps.githubClient` port を canonical 経路に一本化することで LOC 目標 750-800 を達成する（D5 決定）
- **テスト**: 上記モジュールのテストを更新。@deprecated shim 削除に伴い test 側の import を新パスに統一。`tests/spec-review-fetch.test.ts` は存続（TC-012/013/014/015 は `fetchSpecReviewResult` 直接呼び出しテストとして明示）

## 振る舞い不変の確認方法

外部から見た振る舞いが変わらないこと（CLI 結果が同じ）を以下で確認する:

- **既存 280 テスト全 PASS**: ユニット + integration の現行テスト（PR #28 merge 後の baseline）が 1 件も regression を起こさないこと
- **specrunner CLI コマンドの挙動維持**: `init` / `login` / `run` / `ps` の stdout / state file / config file 出力に diff が無いこと
- **module-architect の事前分析**: executor.ts を testability / cohesion / coupling / SRP 軸で分析し、helper 抽出方針（cohesive な session-lifecycle ヘルパー vs scattered な inline helper）を design 段階で確定する
- **@deprecated 削除前の grep 検証**: `grep -rn "<deprecated symbol>" src/ tests/` で「production 0 件」「test 経由のみ」「全削除可能」を機械的に分類してから削除する。learned-patterns の「`grep -r <legacy_function> src/core/ src/cli/ src/adapter/` で 0 件を完了条件にする」規律を遵守する
- **directory-form 移行の単一 commit 化**: `src/core/pipeline.ts` 削除は (a) ファイル削除 (b) import 更新 (c) test 更新 を 1 commit で完結させる（learned-patterns の D7 違反パターン回避規律）

## 要件

1. **executor.ts helper 抽出**:
   - `runProposeStyleStep` と `runPollingStyleStep` の重複部（session-create / pushStepResult / appendHistory / fail-state attach）を private helper に集約する
   - 抽出後の executor.ts が 750-800 LOC 以下になること（現状 900 LOC）
   - module-architect の分析結果（cohesive helper の境界線）を design.md に明示してから実装に入ること

2. **@deprecated shim の体系的削除**:
   - `grep -rn "@deprecated" src/` で対象を列挙
   - 各 `@deprecated` symbol について以下の 4 段階で分類:
     - (a) production 経路から参照あり → 削除不可（次の request で扱う）
     - (b) test 経由のみ参照 → test 側を新パスに移行してから削除
     - (c) 参照ゼロ → 即削除
     - (d) field（`RawConfig.agent` 等）→ migrate.ts での扱いを確認してから削除
   - 削除対象は最低でも (b) と (c) を全て解消すること

3. **`src/core/pipeline.ts` の完全削除（directory-form 移行完結）**:
   - `runPipeline` / `runProposePipeline` 関数本体を `src/core/pipeline.ts` から `src/core/pipeline/run.ts` に移動する
   - `src/core/pipeline/index.ts` から `runPipeline` / `runProposePipeline` を re-export する
   - call site（`src/cli/run.ts`、`tests/spec-review-fetch.test.ts`）の import path を `src/core/pipeline/index.js` 経由に書き換える
   - `src/core/pipeline.ts` を削除する
   - 上記 4 操作を 1 commit で完結させる（D7 規律）

4. **D4-D6 review で defer された LOW の cleanup**:
   - `src/core/agent/registry.ts:27` の不要 cast `def.role as StepName` 削除
   - `AgentRegistry.fromSteps` で `step.name !== step.agent.role` 不整合を fail-fast 検出
   - `AgentToolsetSpec.type = "agent_toolset_20260401"` を `AGENT_TOOLSET_TYPE` const として 1 箇所に集約
   - `canonicalJson` を `value === undefined` のキーをスキップする実装に変更（または JSDoc で「undefined 値を持つキーは入力に含めない」を明示）

5. **`fetchSpecReviewResult` legacy fallback の整理**:
   - `deps.githubClient` が常に提供されている（test 経由を含む）かを確認
   - 常に提供されているなら fallback 削除、まだ未提供 path があるなら現状維持して理由を design.md に明示

6. **module-architect の analysis を tasks.md に下ろす**:
   - module-analysis.md の decisions（共通化候補・越境懸念）を tasks の冒頭タスクに具体作業として下ろすこと（learned-patterns の lesson「decisions/module-architect.md に書くだけで終わっていないか」を遵守）

## 受け入れ基準

- [ ] 既存 280 テストが全て PASS する（regression 0 件）
- [ ] executor.ts が 750-800 LOC 以下になっている
- [ ] `grep -rn "@deprecated" src/` の件数が削減され、残存 `@deprecated` には「production 経路で参照あり」の rationale が implementation-notes.md に記録されている
- [ ] `grep -rn "from \"\.\./pipeline\"" src/` で `src/core/pipeline.ts` への参照が 0 件である
- [ ] `src/core/pipeline.ts` ファイルが存在しない
- [ ] `src/core/agent/registry.ts:27` の `as StepName` cast が削除されている
- [ ] `step.name !== step.agent.role` の不整合を `AgentRegistry.fromSteps` が throw する
- [ ] `AGENT_TOOLSET_TYPE` 定数が `src/core/agent/definition.ts` に export されている
- [ ] `canonicalJson` が `{ a: undefined }` と `{}` で同一 hash を返す（または JSDoc で制約明示）
- [ ] module-analysis.md の decisions が tasks.md の冒頭タスクとして具体作業に下ろされている
- [ ] specrunner init / login / run / ps の stdout snapshot が変化していない

## スコープ外

以下は本 request の対象外。後続 request で扱う:

- **implementer / verification / code-review / PR 作成 step の追加**: 後続 request。本 request は「これらが clean な土台で実装可能」になるための整理
- **buildSdkAdapter と AnthropicClientAdapter の統一**: PR #28 fixup で既に解決済み（init.ts は AnthropicClientAdapter を直接使用）
- **spec-reviewer の rename-as-MODIFIED checklist 化**: PR #30 で lesson 記録済み。spec-review skill の更新は別 request（skill 改善は別系統）
- **E2E 実機検証**: self-hosting 完成までまとめて保留（ユーザー方針）
- **production 経路から参照のある `@deprecated` の削除**: 本 request では対象外。implementation-notes.md に rationale 付きで残債として明示する

## 補足

### 参照 ADR

- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md` — D1-D9 + D4-D6 の決定文。本 request は D1-D9/D4-D6 の cumulative cleanup
- `openspec-workflow/adr/ADR-20260429-module-architecture-style.md` — D7（directory-form への移行は sibling file を残さない）が `src/core/pipeline.ts` 削除の根拠

### 参照 learned-patterns

`openspec-workflow/learned-patterns.md` の以下 lesson を本 request で遵守する:

- 「refactoring の HIGH の主因は新旧並存」 — 削除と移行を 1 commit で完結
- 「migration の完了判定は production 経路の grep」 — `src/core/`、`src/cli/`、`src/adapter/`、`src/store/` で 0 件を完了条件
- 「directory-form 移行は sibling 削除を含めて 1 commit」 — `src/core/pipeline.ts` 削除タスクの規律
- 「decisions/module-architect.md に書くだけで終わっていないか」 — module-analysis を tasks の冒頭タスクに下ろす

### 参照 PR / review

- PR #26 review-feedback-003 の MEDIUM #3（executor.ts LOC 重複） — 本 request の主目的
- PR #28 review-feedback-002 の MEDIUM 群（dead export 削除、port purity） — fixup で解消済
- PR #28 review-feedback-fixup-001 の LOW 群（cast / 命名規約検出 / hash robustness） — 本 request で cleanup
- PR #28 を含む過去 request で deferred と明示された全 LOW を本 request で潰す方針
