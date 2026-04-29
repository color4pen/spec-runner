## Context

PR #26（D1-D9, merged）と PR #28（D4-D6, merged）で Step / Agent / Pipeline / Config の構造的な置き換えが完了したが、以下の cumulative cruft が残った:

- `src/core/step/executor.ts` が 900 LOC。`runProposeStyleStep`（~290 LOC）と `runPollingStyleStep`（~280 LOC）の間に session-create / fail-state attach / pushStepResult / appendHistory の構造的重複が残存（PR #26 review-feedback-003 MEDIUM #3 で deferred）
- `src/core/session.ts` / `src/sdk/sessions.ts` / `src/state/store.ts` / `src/core/types.ts` / `src/config/schema.ts` に `@deprecated` shim が残存。production 0 件 / test のみ参照のものを機械的に判定して削除する規律（learned-patterns lesson）が未実行
- `runPipeline` / `runProposePipeline` 関数本体が `src/core/pipeline.ts` に残置。D1-D9 で transition table を `src/core/pipeline/` ディレクトリ形式に移行したが、これらの関数本体は移動されておらず directory-form 移行が未完結。`src/core/pipeline/index.ts` は `Pipeline` クラスと `Transition` 型のみ export しており `runPipeline` を re-export していない。`src/cli/run.ts:6` が `src/core/pipeline.ts` を直接 import し続けている（learned-patterns で D7 違反として既に lesson 化されている再発パターン）
- D4-D6 の review-feedback-002 / fixup-001 で deferred になった LOW 群（`as StepName` 不要 cast、命名規約 fail-fast、`AgentToolsetSpec.type` 集約、`canonicalJson` の undefined ハンドリング、`fetchSpecReviewResult` legacy fallback）

これらは「Step を増やすコスト」を直接押し上げてはいないが、後続 request の implementer / verification / code-review / PR 作成 Step を追加する際に diff が cruft に埋もれる。本 request は土台整理に集中する。

参照 ADR:
- `openspec-workflow/adr/ADR-20260429-step-and-agent-class-architecture.md`（D1-D9 / D4-D6 の決定文）
- `openspec-workflow/adr/ADR-20260429-module-architecture-style.md`（D7: directory-form への移行は sibling file を残さない）

参照 learned-patterns:
- 「refactoring の HIGH の主因は新旧並存」 — 削除と移行を 1 commit で完結
- 「migration の完了判定は production 経路の grep」 — `src/core/`、`src/cli/`、`src/adapter/`、`src/store/` で 0 件を完了条件
- 「directory-form 移行は sibling 削除を含めて 1 commit」 — `src/core/pipeline.ts` 削除タスクの規律
- 「decisions/module-architect.md に書くだけで終わっていないか」 — module-analysis を tasks の冒頭タスクに下ろす

### 制約

- **振る舞い不変**: 外部 CLI 出力 / state file / config file に diff 無し。既存 280 テスト全 PASS が必須
- **snapshot 検証**: `tests/cli-stdout-snapshot.test.ts` を `npm test` で実行し、`--update-snapshot` 無しで PASS することを完了条件とする。helper 抽出後 / `@deprecated` 削除後 / `pipeline.ts` 削除後のいずれの段階でも snapshot baseline を更新してはならない（更新が必要になった場合は別タスクとして明示し、なぜ振る舞い変化が許容されるかを rationale 付きで design に記録する）
- **module-architect の事前分析**: executor.ts を testability / cohesion / coupling / SRP 軸で分析し、helper 抽出の境界（cohesive な session-lifecycle ヘルパー vs scattered な inline helper）を design 段階で確定してから実装に入る
- **delta spec なし**: capability 仕様の改訂は無いため `specs/` ディレクトリは生成しない（refactoring の正当な省略）
- **grep ベース完了判定**: `@deprecated` 削除と `pipeline.ts` 削除は production 経路の grep 0 件を完了条件とする

## Goals / Non-Goals

**Goals:**
- `executor.ts` を 750-800 LOC 以下に圧縮し、`runProposeStyleStep` / `runPollingStyleStep` の共通ロジックを cohesive helper に集約する
- `@deprecated` shim を grep ベースで分類し、(b) test 経由のみ / (c) 参照ゼロ を全削除する。残債 (a) は implementation-notes.md に rationale 付きで記録
- `src/core/pipeline.ts` を削除し、directory-form 移行を完結させる（sibling 削除 + import 更新 + test 更新を 1 commit）
- D4-D6 で deferred された LOW 群を全て解消する
- module-analysis.md の decisions を tasks の冒頭タスクに具体作業として下ろす

**Non-Goals:**
- 新機能・新 capability の追加（pure refactoring）
- 後続 Step（implementer / verification / code-review / PR 作成）の実装（別 request）
- spec-reviewer の rename-as-MODIFIED checklist 化（skill 改善は別系統）
- production 経路から参照のある `@deprecated` の削除（implementation-notes.md に残債として明示するだけ）
- E2E 実機検証（self-hosting 完成まで保留）

## Decisions

### D1: executor.ts helper 抽出の境界線は module-architect が決める

**Decision**: `executor.ts` の helper 抽出は module-architect の `module-analysis.md` の決定（cohesive vs scattered）に従う。具体的な helper 名と境界は module-analysis.md で確定済みであり、tasks.md の冒頭タスク（Section 1）でその decisions を具体作業に下ろす。

**Rationale**: learned-patterns lesson「decisions/module-architect.md に書くだけで終わっていないか」を遵守する。implementer が module-analysis を読まずに自己判断で抽出すると、cohesion 違反（fail-state attach と session-create が別 helper に散る等）が発生しやすい。

**module-analysis.md 確定済み helper（`src/core/step/executor-helpers.ts` として新設）**:
- `createSessionWithHistory` — session-create + fail-state attach + appendHistory を cohesive に集約
- `recordFailedStepResult` — 失敗時の pushStepResult テンプレートを集約
- `attachStateAndRethrow` — `(err as unknown as Record<string, unknown>)["state"] = state; throw err` パターンを集約
- `throwWrappedError` — `wrappedErr` 生成 + throw パターンを集約
- `failStepWithError` — appendHistory + pushStepResult + fail + persist + throw のシーケンスを集約

**目標 LOC 750-800 達成シナリオ**:
- **シナリオ A（helper 抽出のみ）**: module-analysis.md の推定では helper 抽出（#1-#5）は cohesion 改善が主目的であり、LOC 削減は重複除去のみ（重複行が helper 内に集約されるため純粋削減は限定的）。helper 抽出だけでは 900 → 750-800 の目標到達は困難。
- **シナリオ B（helper 抽出 + `verifyBranchLegacy` / `verifyChangeFolderLegacy` 削除）**: module-analysis.md は `verify*Legacy` 2 関数の削除で約 134 LOC 削減と分析している（executor.ts:471-605）。helper 抽出と組み合わせることで目標 750-800 LOC を達成できる見込み。

**採用シナリオ**: **シナリオ B を採用**。`verifyBranchLegacy` / `verifyChangeFolderLegacy` の削除を本 request のスコープに含める（request 要件 5 の `fetchSpecReviewResult` legacy fallback 整理と歩調を合わせ、`deps.githubClient` port を必須化することで legacy 経路を一本化する）。tasks.md Section 6 に `verify*Legacy` 削除タスクを追加する。LOC 目標が達成できない場合は `wc -l` の実測値を implementation-notes.md に記録し、750-800 未達の理由を rationale 付きで残す。

### D2: `@deprecated` 分類は grep ベースの 4 段階

**Decision**: `grep -rn "@deprecated" src/` で対象を列挙し、symbol ごとに以下の 4 段階で分類してから削除する:

| 分類 | 条件 | 対応 |
|------|------|------|
| (a) production 参照あり | `src/core/` `src/cli/` `src/adapter/` `src/store/` のいずれかに参照 | **削除不可**。implementation-notes.md に rationale 記録 |
| (b) test 経由のみ参照 | `tests/` のみに参照 | test を新パスに移行してから削除 |
| (c) 参照ゼロ | grep 0 件 | 即削除 |
| (d) field（schema） | `RawConfig.agent` 等の type/field | 下記 decision tree で判定してから削除 |

**(d) field の判定 decision tree**:

```
migrate.ts で legacy field → new field への書き換え + persist が
  ├─ load 時に常に（無条件に）発火する → field 削除可能
  │   手順: migrate.ts の発火条件を grep で確認（`if (version < N)` 等の version guard が無いこと）
  │         → 無条件発火を確認したら field を削除し、tsc --noEmit で型エラーが無いことを確認
  └─ 条件付き（特定 version / flag 等）で発火する → 削除不可
       条件解消まで待機。implementation-notes.md に「migrate.ts:<line> で <条件> のため削除不可」と記録
```

**確認手順（tasks.md 3.6 対応）**:
1. `grep -n "function migrate\|if.*version\|legacyField\|RawConfig\.agent" src/config/migrate.ts` で発火条件を確認
2. migration が無条件（全 load 時に常に実行される）なら field を削除し、`tsc --noEmit` で検証
3. 条件付きなら implementation-notes.md に残債として記録し、削除しない

**Rationale**: learned-patterns lesson「migration の完了判定は production 経路の grep」を遵守。symbol ごとに分類を implementation-notes.md に表形式で記録し、後続 request が残債を追跡できるようにする。

**完了条件**: 最低でも (b) と (c) を全て解消する。(d) field は decision tree に従い確認結果を implementation-notes.md に記録する。残存する (a) には implementation-notes.md に「production 経路で参照あり」の rationale が記録されていること。

### D3: `src/core/pipeline.ts` 削除は 4 操作を 1 commit で完結

**Decision**: `src/core/pipeline.ts` の `runPipeline` / `runProposePipeline` 関数本体を `src/core/pipeline/` 配下に移動し、旧ファイルを削除する。これらを 1 commit で実施する:

1. `runPipeline` / `runProposePipeline` 関数本体を `src/core/pipeline/run.ts` に移動する
2. `src/core/pipeline/index.ts` から `runPipeline` / `runProposePipeline` を re-export する
3. call site（`src/cli/run.ts`、`tests/spec-review-fetch.test.ts`）の import path を `src/core/pipeline/index.js` 経由に書き換える
4. `src/core/pipeline.ts` を削除する

**Rationale**: `src/core/pipeline.ts` は production 関数本体（`runPipeline` / `runProposePipeline`、93 LOC）を持つファイルであり、単純な import 書き換えだけでは `runPipeline` が解決できず破綻する。関数移動 → re-export → call site 書き換え → ファイル削除の 4 操作を 1 commit で完結させることで、learned-patterns lesson「directory-form 移行は sibling 削除を含めて 1 commit」を遵守する。

**完了条件**:
- `grep -rn "from \"\.\./pipeline\"" src/` で `src/core/pipeline.ts` への参照が 0 件
- `src/core/pipeline.ts` ファイルが存在しない（`ls src/core/pipeline.ts` が `No such file`）
- `src/core/pipeline/index.ts` から `runPipeline` / `runProposePipeline` が export されている
- `src/core/pipeline/` ディレクトリ経由の import のみが残る

### D4: D4-D6 LOW 群の cleanup 方針

**Decision**: PR #28 review-feedback-002 / fixup-001 で deferred になった LOW 群を以下の方針で実装する:

- **`def.role as StepName` 不要 cast 削除（registry.ts:27）**: `AgentDefinition.role` の型を `StepName` に直接揃え、cast を不要にする。型階層の整合性で吸収する
- **`step.name !== step.agent.role` の不整合検出**: `AgentRegistry.fromSteps` で各 step を登録する際に `step.name !== step.agent.role` を fail-fast 検出し、`Step name and agent role mismatch: name=${step.name}, role=${step.agent.role}` を throw する
- **`AGENT_TOOLSET_TYPE` 集約**: `src/core/agent/definition.ts` に `export const AGENT_TOOLSET_TYPE = "agent_toolset_20260401"` を export し、`AgentToolsetSpec.type` を参照する全箇所をこの定数経由に変更する
- **`canonicalJson` の undefined ハンドリング**: 実装で `value === undefined` のキーをスキップするように変更する（採用案）。これにより `{ a: undefined }` と `{}` が同一 hash を返す。代替案（JSDoc で制約明示）は「呼び出し側が事前に sanitize する責務を負う」ため採用しない（防御的実装を優先）

**Rationale**: いずれも振る舞い不変の改善で、後続 request での誤用（例: `step.name` と `step.agent.role` がズレた状態で AgentRegistry を構築）を fail-fast で防ぐ。

### D5: `fetchSpecReviewResult` export は維持し、executor.ts の legacy fallback 経路と `verify*Legacy` を削除する

**Decision**: `src/core/step/spec-review.ts` の `fetchSpecReviewResult` 関数 export は **維持する**（`tests/spec-review-fetch.test.ts` の TC-012/013/014/015 が直接呼ぶため、削除するとテスト 4 件が壊れる）。

一方、production 経路での legacy fallback は以下のように整理する:

1. **executor.ts:818-829 の fallback 分岐を削除する**: `deps.githubClient` を必須（mandatory）に格上げし、`githubClient` が未提供の場合は起動時 fail-fast とする。fallback として `fetchSpecReviewResult` を呼ぶ分岐を削除する
2. **`verifyBranchLegacy` / `verifyChangeFolderLegacy` を削除する（~134 LOC）**: `deps.githubClient` port を canonical 経路とし、legacy HTTP 直接実装を持つ `verify*Legacy` を削除する。これにより D1 の LOC 目標 750-800 を達成する（シナリオ B）
3. **`tests/spec-review-fetch.test.ts` はそのまま残す**: TC-012/013/014/015 は `fetchSpecReviewResult` の legacy export を対象としたテストとして明示的に存続させる。ただし production 経路（executor 経由）ではなく、関数の直接呼び出しテストとして位置づけを明記する

**`verify*Legacy` 削除の前提確認（tasks.md Section 6 で実施）**:
- `grep -rn "createPipelineDeps\|githubClient" tests/` で `deps.githubClient` 未提供の test 経路が無いことを確認してから削除する
- 未提供 path が残る場合は implementation-notes.md に記録し、verify*Legacy 削除はスキップして LOC 目標を 800-850 に緩める

**スコープへの追加**: `verifyBranchLegacy` / `verifyChangeFolderLegacy` の削除（~134 LOC）を本 request のスコープに含める。request.md の「対象範囲」に `src/core/step/executor.ts: verify*Legacy 削除` を追記する。

**Rationale**: `fetchSpecReviewResult` を削除すると直接テスト 4 件が壊れる。しかし production 経路の fallback と verify*Legacy を削除することで executor.ts の SRP が改善し、LOC 目標を達成できる。test は legacy export を「直接呼び出しテスト」として存続させることで、振る舞い不変の確認コストを維持する。

### D6: module-analysis を tasks の冒頭タスクに下ろす

**Decision**: tasks.md の Section 1 を「module-analysis から下ろされた具体作業」とし、module-architect が `module-analysis.md` で出した decisions（共通化候補・越境懸念）を 1.x の番号付きタスクに変換する。

**Rationale**: learned-patterns lesson「decisions/module-architect.md に書くだけで終わっていないか」を遵守。module-architect が分析しても、tasks に下ろさないと implementer は読まずに自己判断するリスクが残る。冒頭セクションに置くことで「最初に module-analysis を読む」を構造的に強制する。

## Risks / Trade-offs

- **Risk: helper 抽出で cohesion を壊す**: session-create と fail-state attach を別 helper に分けてしまうと、状態の一貫性が見えづらくなる。**Mitigation**: module-architect の analysis に従い、cohesive な単位（"session lifecycle around step run" 等）で抽出する
- **Risk: `@deprecated` 削除で test の import が壊れる**: test 側の import path 更新を漏らすと test 実行で fail する。**Mitigation**: grep ベースで test の参照箇所を機械的に列挙し、削除前に全て移行
- **Risk: `pipeline.ts` 削除で循環参照が露出する**: directory-form の `src/core/pipeline/index.ts` が他モジュールに依存していた場合、import path 変更で循環参照が発覚する可能性。**Mitigation**: 削除前に `tsc --noEmit` で循環参照検知、必要なら import path をさらに細分化する
- **Trade-off: `canonicalJson` の undefined 値スキップ実装 vs JSDoc 明示**: 防御的実装（undefined スキップ）を選ぶことで関数の責務が増えるが、呼び出し側のミスを構造的に防げる。本 request では防御的実装を採用

## Migration Plan

なし。schema 変更を伴わず、test の import path 更新は内部リファクタとして 1 commit で実施する。

## Open Questions

（解消済み — 以下は決定の記録）

- **helper 名**: module-analysis.md が生成済みであり、helper 名と署名が確定している（`createSessionWithHistory` / `recordFailedStepResult` / `attachStateAndRethrow` / `throwWrappedError` / `failStepWithError`）。Section 1 で tasks に下ろす。
- **`fetchSpecReviewResult` legacy fallback**: D5 で確定。`fetchSpecReviewResult` export は維持し、executor.ts の production fallback 経路と `verify*Legacy` を削除する。`tests/spec-review-fetch.test.ts` は存続（直接呼び出しテストとして位置づけを明記）。
