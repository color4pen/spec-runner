## 1. module-analysis の decisions 確認（前提確認タスク）

> design D6 / learned-patterns lesson「decisions/module-architect.md に書くだけで終わっていないか」を遵守。
> module-analysis.md は生成済み。Section 1 は module-analysis.md の decisions が Section 2 に正しく反映されていることを確認するタスクとして機能する。
> Section 2 は module-analysis.md の推奨 helper 名で既に具体化済み（`createSessionWithHistory` / `recordFailedStepResult` / `attachStateAndRethrow` / `throwWrappedError` / `failStepWithError`）。

- [x] 1.1 `module-analysis.md` の Section 2（共通化すべき箇所）と Section 4.1（推奨署名）を読み、Section 2 タスク（2.2.1-2.2.5）に反映された helper 名が module-analysis.md の推奨と一致していることを確認する
- [x] 1.2 module-analysis.md Section 4.1 の「越境懸念」（helper は store / step.name / errorInfo を引数で受ける純 orchestration に留め、IO や step.run ループは呼び出し側に残す）が Section 2 の注記に反映されていることを確認する
- [x] 1.3 module-analysis.md Section 4.1 の `verifyBranchLegacy` / `verifyChangeFolderLegacy` 削除推奨（~134 LOC、design D5 で採用）が Section 6 のタスクに存在することを確認する

## 2. executor.ts helper 抽出（要件 1）

> design D1 を遵守。helper 名と境界線は Section 1 で確定された module-analysis.md の decisions に従う。
> 振る舞い不変（既存 280 テスト全 PASS）。

- [x] 2.1 `src/core/step/executor.ts` の `runProposeStyleStep` と `runPollingStyleStep` の重複部を特定する（session-create / fail-state attach / pushStepResult / appendHistory の 4 軸）
- [x] 2.2 module-analysis.md の decisions に基づき、cohesive helper を `src/core/step/executor-helpers.ts` として新設・抽出する（helper 名は module-analysis.md Section 4.1 の推奨署名に従う）
  > 注意（越境懸念）: helper は store / step.name / errorInfo を引数で受ける純 orchestration に留める。IO や step.run のループは呼び出し側（runProposeStyleStep / runPollingStyleStep）に残す。
  - [x] 2.2.1 session-create + fail-state attach + appendHistory を集約する helper: `createSessionWithHistory(store, state, client, params, opts): Promise<{ state, sessionId }>`
  - [x] 2.2.2 失敗時 pushStepResult テンプレートを集約する helper: `recordFailedStepResult(state, stepName, errorInfo, session?): JobState`
  - [x] 2.2.3 `(err as unknown as Record<string, unknown>)["state"] = state; throw err` パターンを集約する helper: `attachStateAndRethrow(err, state): never`
  - [x] 2.2.4 `wrappedErr` 生成 + throw パターンを集約する helper: `throwWrappedError(errorInfo, state): never`
  - [x] 2.2.5 appendHistory + pushStepResult + fail + persist + throw のシーケンスを集約する helper: `failStepWithError(store, state, stepName, errorInfo, opts): Promise<never>`
- [x] 2.3 `runProposeStyleStep` を抽出 helper を使う形に書き換える
- [x] 2.4 `runPollingStyleStep` を抽出 helper を使う形に書き換える
- [x] 2.5 既存 280 テストを実行して PASS を確認する（regression 0 件）
- [x] 2.6 `wc -l src/core/step/executor.ts` の出力を確認する。helper 抽出のみでは LOC が 750-800 未達となる場合があるため、Section 6 の `verify*Legacy` 削除（design D5）完了後に再確認する。最終 LOC を implementation-notes.md に記録し、目標到達の可否と理由を rationale 付きで残す（目標到達できない場合は LOC 目標を 800-850 に緩める）
- [x] 2.7 helper の unit test を `tests/unit/step/executor-helpers.test.ts` 等に追加する（IO を持たない pure helper であれば独立テスト可能）

## 3. `@deprecated` shim の体系的削除（要件 2）

> design D2 の 4 段階分類を遵守。完了条件は (b) と (c) の全削除。

- [x] 3.1 `grep -rn "@deprecated" src/` を実行し、対象 symbol を列挙する
- [x] 3.2 列挙した symbol ごとに `grep -rn "<symbol>" src/ tests/` で参照箇所を確認し、4 段階に分類する
  - [x] 3.2.1 (a) production 参照あり → implementation-notes.md に記録（削除対象外）
  - [x] 3.2.2 (b) test 経由のみ参照 → 削除対象（test 側を新パスに移行）
  - [x] 3.2.3 (c) 参照ゼロ → 削除対象（即削除可）
  - [x] 3.2.4 (d) field（schema） → migrate.ts での扱いを確認してから判断
- [x] 3.3 分類結果を表形式で `implementation-notes.md` に記録する
- [x] 3.4 (b) 分類の symbol について、test 側の import を新パスに移行する
  - [x] 3.4.1 `src/core/session.ts` の @deprecated shim 利用 test を移行
  - [x] 3.4.2 `src/sdk/sessions.ts` の @deprecated shim 利用 test を移行
  - [x] 3.4.3 `src/state/store.ts` の @deprecated shim 利用 test を移行
  - [x] 3.4.4 `src/core/types.ts` の @deprecated type 利用 test を移行
  - [x] 3.4.5 `src/config/schema.ts` の @deprecated field 利用 test を移行
- [x] 3.5 (b) と (c) 分類の @deprecated symbol を削除する
- [x] 3.6 (d) 分類の field について、design D2 の decision tree に従って判定する:
  - [x] 3.6.1 `grep -n "function migrate\|if.*version\|legacyField\|RawConfig\.agent" src/config/migrate.ts` で発火条件を確認する
  - [x] 3.6.2 無条件発火（load 時に常に実行）が確認できた場合: field を削除し、`tsc --noEmit` で型エラーが無いことを確認する
  - [x] 3.6.3 条件付き発火の場合: 削除せず `implementation-notes.md` に「`migrate.ts:<line>` で `<条件>` のため削除不可」と記録する
- [x] 3.7 既存 280 テストを実行して PASS を確認する
- [x] 3.8 `grep -rn "@deprecated" src/` の残件数が「(a) のみ」であることを確認し、各残件に対応する rationale が implementation-notes.md に記録されていることを確認する

## 4. `src/core/pipeline.ts` の完全削除（directory-form 移行完結、要件 3）

> design D3 を遵守。4 操作を 1 commit で実施。learned-patterns「directory-form 移行は sibling 削除を含めて 1 commit」。
> `src/core/pipeline.ts` は production 関数本体（`runPipeline` / `runProposePipeline`）を持つため、単純な import 書き換えでは解決しない。4 段階の移行が必要。

- [x] 4.1 `runPipeline` / `runProposePipeline` 関数本体を `src/core/pipeline.ts` から `src/core/pipeline/run.ts` に移動する
  > `src/core/pipeline/run.ts` が存在しない場合は新規作成する。既存の `src/core/pipeline/index.ts` が import している型定義が `run.ts` に依存する場合は循環参照に注意する
- [x] 4.2 `src/core/pipeline/index.ts` から `runPipeline` / `runProposePipeline` を re-export する
  > 既存の `Pipeline` クラス・`Transition` 型の re-export を壊さないこと
- [x] 4.3 call site の import path を `src/core/pipeline/index.js` 経由に書き換える
  - [x] 4.3.1 `src/cli/run.ts` の `import { runPipeline } from "../core/pipeline"` を `src/core/pipeline/index.js` 経由に変更
  - [x] 4.3.2 `tests/spec-review-fetch.test.ts` の同種 import を変更（存在する場合）
  - [x] 4.3.3 `grep -rn "from.*pipeline" src/ tests/` で他の import 漏れが無いことを確認
- [x] 4.4 `src/core/pipeline.ts` ファイルを削除する
- [x] 4.5 上記 4.1-4.4 を **1 commit にまとめる**（commit message に「feat: relocate runPipeline to pipeline/run.ts, re-export from index, delete sibling pipeline.ts (D7 compliance)」と明記）
- [x] 4.6 `tsc --noEmit` を実行して循環参照や型エラーが無いことを確認する
- [x] 4.7 既存 280 テストを実行して PASS を確認する
- [x] 4.8 完了条件を grep で確認する:
  - `ls src/core/pipeline.ts` が `No such file` を返すこと
  - `grep -rn "from \"\.\./pipeline\"" src/` が 0 件であること
  - `src/core/pipeline/index.ts` が `runPipeline` / `runProposePipeline` を export していること

## 5. D4-D6 review LOW の cleanup（要件 4）

> design D4 を遵守。各タスクは独立に振る舞い不変。

### 5.1 `def.role as StepName` 不要 cast 削除

- [x] 5.1.1 `src/core/agent/registry.ts:27` 周辺の `def.role as StepName` cast を特定する
- [x] 5.1.2 `AgentDefinition.role` の型を `StepName` に直接揃え、cast を不要にする
- [x] 5.1.3 関連 type 定義（`src/core/agent/definition.ts`）の整合性を確認
- [x] 5.1.4 `tsc --noEmit` で型エラーが無いことを確認

### 5.2 `step.name !== step.agent.role` の fail-fast 検出

- [x] 5.2.1 `AgentRegistry.fromSteps` 内で各 step を登録する際に `step.name !== step.agent.role` を検出するガードを追加
- [x] 5.2.2 不整合検出時に `Step name and agent role mismatch: name=${step.name}, role=${step.agent.role}` を throw する
- [x] 5.2.3 `tests/unit/agent/registry.test.ts` に「step.name と step.agent.role が一致しない場合に throw する」テストを追加

### 5.3 `AGENT_TOOLSET_TYPE` 定数の集約

- [x] 5.3.1 `src/core/agent/definition.ts` に `export const AGENT_TOOLSET_TYPE = "agent_toolset_20260401"` を追加
- [x] 5.3.2 `AgentToolsetSpec.type` を参照している全ファイルで定数経由に書き換える
- [x] 5.3.3 `grep -rn "agent_toolset_20260401" src/` を実行し、リテラルが残っていないことを確認（定数定義箇所を除く）

### 5.4 `canonicalJson` の `undefined` 値ハンドリング

- [x] 5.4.1 `src/core/agent/hash.ts` の `canonicalJson` 実装で `value === undefined` のキーをスキップするロジックを追加
- [x] 5.4.2 `tests/unit/agent/hash.test.ts`（または該当するテスト）に「`{ a: undefined }` と `{}` が同一 hash を返す」テストを追加
- [x] 5.4.3 `tests/unit/agent/hash.test.ts` の既存テスト（`{ a: 1, b: 2 }` 等）が引き続き PASS することを確認

## 6. `fetchSpecReviewResult` legacy fallback 整理 + `verify*Legacy` 削除（要件 5、design D5）

> design D5 の決定に従う:
> - `fetchSpecReviewResult` 関数 export は **維持する**（TC-012/013/014/015 が直接呼ぶ）
> - executor.ts の production fallback 経路（:818-829）を削除する（`deps.githubClient` を必須化）
> - `verifyBranchLegacy` / `verifyChangeFolderLegacy` を削除する（~134 LOC 削減、LOC 目標達成に必要）
> - `tests/spec-review-fetch.test.ts` の TC-012/013/014/015 は存続させる

### 6.1 前提確認（削除可否を grep で確認）

- [x] 6.1.1 `grep -rn "createPipelineDeps\|githubClient" tests/` を実行し、`deps.githubClient` が未提供の test 経路が無いことを確認する
  - 未提供 path が残る場合: verify*Legacy 削除はスキップし、implementation-notes.md に理由を記録して LOC 目標を 800-850 に緩める
  - 未提供 path が無い場合: 下記 6.2-6.4 に進む

### 6.2 executor.ts production fallback 経路の削除

- [x] 6.2.1 `executor.ts:818-829` の `deps.githubClient` 未提供時の fallback 分岐を削除する
- [x] 6.2.2 `deps.githubClient` を必須（非 optional）に型定義を変更する
- [x] 6.2.3 `tsc --noEmit` で型エラーが無いことを確認する

### 6.3 `verifyBranchLegacy` / `verifyChangeFolderLegacy` の削除（~134 LOC）

- [x] 6.3.1 `grep -rn "verifyBranchLegacy\|verifyChangeFolderLegacy" src/ tests/` で呼び出し箇所を列挙する
- [x] 6.3.2 列挙した呼び出しが全て port 経由（`verifyBranchViaPort` / `verifyChangeFolderViaPort`）に移行済みであることを確認する（またはそのように書き換える）
- [x] 6.3.3 `verifyBranchLegacy` / `verifyChangeFolderLegacy` の実装を削除する
- [x] 6.3.4 `tsc --noEmit` で型エラーが無いことを確認する

### 6.4 `tests/spec-review-fetch.test.ts` の位置づけ明記

- [x] 6.4.1 `tests/spec-review-fetch.test.ts` の TC-012/013/014/015 に「これらは `fetchSpecReviewResult` の直接呼び出しテストであり、production 経路（executor 経由）のテストではない」旨のコメントを追加する

### 6.5 完了確認

- [x] 6.5.1 既存 280 テストを実行して PASS を確認する
- [x] 6.5.2 `wc -l src/core/step/executor.ts` で最終 LOC を確認し、implementation-notes.md に記録する
- [x] 6.5.3 `implementation-notes.md` に `fetchSpecReviewResult` の判断結果（export 維持・理由）と `verify*Legacy` 削除の実施結果を記録する

## 7. 検証と受け入れ基準確認

> request.md「受け入れ基準」を機械的に確認するチェックリスト。

- [x] 7.1 `npm test`（または該当のテストコマンド）で既存 280 テストが全て PASS する
- [x] 7.2 `wc -l src/core/step/executor.ts` の出力が 750-800 LOC 以下である（最終: 675 LOC）
- [x] 7.3 `grep -rn "@deprecated" src/` の件数が削減され、残件は (a) production 参照ありで implementation-notes.md に rationale 記録済み
- [x] 7.4 `grep -rn "from \"\.\./pipeline\"" src/` で `src/core/pipeline.ts` への参照が 0 件
- [x] 7.5 `ls src/core/pipeline.ts` が「ファイル無し」を返す
- [x] 7.6 `src/core/agent/registry.ts:27` 周辺に `as StepName` cast が無い
- [x] 7.7 `step.name !== step.agent.role` のテストが PASS（fail-fast を検証）
- [x] 7.8 `src/core/agent/definition.ts` に `AGENT_TOOLSET_TYPE` が export されている
- [x] 7.9 `canonicalJson({ a: undefined })` と `canonicalJson({})` が同一 hash を返すテストが PASS
- [x] 7.10 `module-analysis.md` の decisions が tasks.md の Section 1 / Section 2 に下ろされている（Section 1 編集の痕跡確認）
- [x] 7.11 `tests/cli-stdout-snapshot.test.ts` を `npm test` で実行し、`--update-snapshot` 無しで PASS することを確認する（snapshot baseline の更新は禁止。更新が必要になった場合は別タスクとして起票し、振る舞い変化の rationale を design.md に記録してからレビューを受ける）
- [x] 7.12 `implementation-notes.md` に以下が記録されている: (a) @deprecated 残債と rationale、(b) `fetchSpecReviewResult` の判断結果と理由、(c) module-analysis から下ろした helper 抽出の決定と LOC 削減実績
