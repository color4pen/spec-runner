# Test Cases: rename-propose-to-design

## Summary

純粋なリネーミング変更（振る舞い変更なし）に対するテストシナリオ。検証軸は「旧ファイル・旧名称の消去」「新名称への統一」「後方互換（job state / config）」「ビルド・型・テスト」の4つ。

---

## T01 — 旧 step ファイルが存在しない

- **Category**: File Structure
- **Priority**: must
- **Source**: request.md 受け入れ基準, Task 1

**GIVEN** リネーム後のソースツリー  
**WHEN** `ls src/core/step/propose.ts` を実行する  
**THEN** ファイルが存在しない (exit code 非 0)

---

## T02 — 新 step ファイルが存在する

- **Category**: File Structure
- **Priority**: must
- **Source**: Task 1, D1

**GIVEN** リネーム後のソースツリー  
**WHEN** `ls src/core/step/design.ts` を実行する  
**THEN** ファイルが存在する (exit code 0)

---

## T03 — 旧 prompt ファイルが存在しない

- **Category**: File Structure
- **Priority**: must
- **Source**: request.md 受け入れ基準, Task 1

**GIVEN** リネーム後のソースツリー  
**WHEN** `ls src/prompts/propose-system.ts` を実行する  
**THEN** ファイルが存在しない (exit code 非 0)

---

## T04 — 新 prompt ファイルが存在する

- **Category**: File Structure
- **Priority**: must
- **Source**: Task 1, D1

**GIVEN** リネーム後のソースツリー  
**WHEN** `ls src/prompts/design-system.ts` を実行する  
**THEN** ファイルが存在する (exit code 0)

---

## T05 — StepName 型に "design" が含まれ "propose" が含まれない

- **Category**: Type Definition
- **Priority**: must
- **Source**: D2, Task 4

**GIVEN** `src/state/schema.ts` の `StepName` union 型  
**WHEN** 型定義を確認する  
**THEN** `"design"` が union に含まれ、`"propose"` は含まれない

---

## T06 — pipeline 遷移テーブルで "design" が使用される

- **Category**: Step Name
- **Priority**: must
- **Source**: Task 5, D1

**GIVEN** `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS`  
**WHEN** step 名を確認する  
**THEN** `step: "design"` が存在し、`step: "propose"` が存在しない

---

## T07 — pipeline が "design" ステップで開始される

- **Category**: Step Name
- **Priority**: must
- **Source**: Task 6, Task 15c

**GIVEN** `src/core/command/pipeline-run.ts` の `startStep` 設定  
**WHEN** 値を確認する  
**THEN** `startStep: "design"` が設定されており `"propose"` は存在しない

---

## T08 — executor の PROJECT_CONTEXT_STEPS に "design" が含まれる

- **Category**: Step Name
- **Priority**: must
- **Source**: D7, Task 10

**GIVEN** `src/core/step/executor.ts` の `PROJECT_CONTEXT_STEPS` Set  
**WHEN** Set の内容を確認する  
**THEN** `"design"` が含まれ `"propose"` は含まれない

---

## T09 — agent role が "design" に更新される

- **Category**: Agent Definition
- **Priority**: must
- **Source**: D5, Task 2, Task 12a

**GIVEN** `src/core/step/design.ts` の `designAgentDefinition`  
**WHEN** `role` フィールドを確認する  
**THEN** `role: "design"` であり `"propose"` ではない

---

## T10 — agent name が "specrunner-design" に更新される

- **Category**: Agent Definition
- **Priority**: must
- **Source**: D5, Task 2

**GIVEN** `src/core/step/design.ts` の `designAgentDefinition`  
**WHEN** `name` フィールドを確認する  
**THEN** `name: "specrunner-design"` であり `"specrunner-propose"` ではない

---

## T11 — 旧 job state（step: "propose"）の resume が成功する

- **Category**: Backward Compatibility — Job State
- **Priority**: must
- **Source**: request.md 要件 7, D3, Task 4

**GIVEN** `step: "propose"` を含む既存の job state JSON ファイル  
**WHEN** `specrunner resume <job-id>` を実行する  
**THEN** エラーなく resume が開始され、"design" ステップとして処理が継続される

---

## T12 — validateJobState が "propose" を "design" にリマップする

- **Category**: Backward Compatibility — Job State
- **Priority**: must
- **Source**: D3, Task 4

**GIVEN** `obj.step === "propose"` を持つ raw job state オブジェクト  
**WHEN** `validateJobState(obj)` を呼び出す  
**THEN** 返り値の `step` フィールドが `"design"` になっている

---

## T13 — 旧 config の agents.propose キーが agents.design に移行される

- **Category**: Backward Compatibility — Config
- **Priority**: should
- **Source**: D4, Task 9b

**GIVEN** `agents: { propose: { agentId: "xxx" } }` を含む config.json  
**WHEN** `specrunner` コマンドが config を読み込む  
**THEN** `agents.design.agentId` として参照され、エラーが発生しない

---

## T14 — 新 config の agents.design キーが正常に機能する

- **Category**: Config Schema
- **Priority**: must
- **Source**: D4, Task 9a

**GIVEN** `agents: { design: { agentId: "xxx" } }` を含む config.json  
**WHEN** `specrunner` コマンドが config を読み込む  
**THEN** `agents["design"].agentId` が正しく解決され、エラーが発生しない

---

## T15 — typecheck が全 pass する

- **Category**: Build
- **Priority**: must
- **Source**: request.md 受け入れ基準, Task 18

**GIVEN** リネーム後のソースコード全体  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## T16 — 全テストが pass する

- **Category**: Build
- **Priority**: must
- **Source**: request.md 受け入れ基準, Task 18

**GIVEN** リネーム後のソースコードとテストコード全体  
**WHEN** `bun run test` を実行する  
**THEN** 全テストスイートが pass する

---

## T17 — src/ に step 名としての "propose" が残っていない

- **Category**: Code Cleanliness
- **Priority**: must
- **Source**: request.md 受け入れ基準, Task 18

**GIVEN** リネーム後の `src/` ディレクトリ  
**WHEN** `grep -r '"propose"' src/ --include="*.ts"` を実行する  
**THEN** step 名として使われている `"propose"` の出現が 0 件である（英単語としての一般用法は除く）

---

## T18 — grep-no-step-name-hardcode テストが pass する

- **Category**: Code Cleanliness
- **Priority**: must
- **Source**: D9, Task 16c

**GIVEN** `tests/grep-no-step-name-hardcode.test.ts` の正規表現パターンが `"design"` を対象としている  
**WHEN** `bun run test` を実行する  
**THEN** hardcode 検出テストが pass する

---

## T19 — commitAndPush が "design: \<slug\>" の commit message を生成する

- **Category**: Commit Message
- **Priority**: should
- **Source**: request.md 要件 8

**GIVEN** design ステップ完了後の `commitAndPush` 呼び出し  
**WHEN** `step.name` が `"design"` になっている状態で commit message を生成する  
**THEN** commit message が `"design: <slug>"` の形式になる

---

## T20 — エラーメッセージが "design" を参照する

- **Category**: Error Messages
- **Priority**: should
- **Source**: Task 15a, Task 15b

**GIVEN** `src/errors.ts` および `src/core/finish/preflight.ts`  
**WHEN** エラーメッセージ文字列を確認する  
**THEN** `"propose output"` `"propose pipeline"` `"propose ran successfully"` が存在せず、それぞれ `"design"` に置き換わっている

---

## T21 — pipeline 開始ログが "design pipeline" を出力する

- **Category**: Log / UX
- **Priority**: should
- **Source**: Task 15c

**GIVEN** `src/core/command/pipeline-run.ts` の `logInfo` 呼び出し  
**WHEN** pipeline 開始時のログを確認する  
**THEN** `"Starting design pipeline for:"` が出力され `"Starting propose pipeline"` は出力されない

---

## T22 — doctor チェックが "specrunner-design" agent を認識する

- **Category**: Doctor
- **Priority**: should
- **Source**: Task 13a, Task 13b

**GIVEN** managed runtime に `specrunner-design` agent が登録されている状態  
**WHEN** `specrunner doctor` を実行する  
**THEN** agent が見つかったと報告され、drift エラーが発生しない

---

## T23 — 旧テストファイルが存在しない

- **Category**: File Structure
- **Priority**: must
- **Source**: D9, Task 1

**GIVEN** リネーム後のテストディレクトリ  
**WHEN** `ls tests/prompts/propose-system.test.ts` を実行する  
**THEN** ファイルが存在しない (exit code 非 0)

---

## T24 — 新テストファイルが存在する

- **Category**: File Structure
- **Priority**: must
- **Source**: D9, Task 1

**GIVEN** リネーム後のテストディレクトリ  
**WHEN** `ls tests/prompts/design-system.test.ts` を実行する  
**THEN** ファイルが存在する (exit code 0)

---

## T25 — system prompt テキストが "design" を参照する

- **Category**: Prompt Content
- **Priority**: should
- **Source**: D8, Task 3

**GIVEN** `src/prompts/design-system.ts` のプロンプトテキスト  
**WHEN** 文字列内の step 名参照を確認する  
**THEN** `"design agent"` `"stage 1 (design)"` `"design (you)"` / `"design (あなた)"` が使われており、`"propose agent"` `"stage 1 (propose)"` は存在しない

---

## T26 — managed agent runner が "design" role で分岐する

- **Category**: Adapter
- **Priority**: must
- **Source**: D5, Task 12a

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` の role 分岐ロジック  
**WHEN** `step.agent.role` を評価する  
**THEN** `=== "design"` で分岐しており `=== "propose"` の比較は存在しない

---

## T27 — pipeline index が runDesignPipeline を re-export する

- **Category**: API Surface
- **Priority**: must
- **Source**: Task 6, design.md 影響範囲表

**GIVEN** `src/core/pipeline/index.ts`  
**WHEN** export 一覧を確認する  
**THEN** `runDesignPipeline` がエクスポートされ `runProposePipeline` は存在しない
