# Design: rename-propose-to-design

## Overview

ステップ名 `propose` を `design` にリネームする。振る舞いは一切変更しない純粋なリネーミング。

## 設計判断

### D1: ファイルリネーム方針

`src/core/step/propose.ts` → `design.ts`、`src/prompts/propose-system.ts` → `design-system.ts` を git mv で移動。export 名・定数名も一括置換する。

- `ProposeStep` → `DesignStep`
- `proposeAgentDefinition` → `designAgentDefinition`
- `PROPOSE_SYSTEM_PROMPT` → `DESIGN_SYSTEM_PROMPT`
- `PROPOSE_INITIAL_MESSAGE_TEMPLATE` → `DESIGN_INITIAL_MESSAGE_TEMPLATE`
- `PROPOSE_AGENT_MODEL` → `DESIGN_AGENT_MODEL`

`buildInitialMessage` は汎用名のため変更しない（request.md の要件通り）。

### D2: StepName 型の更新

`src/state/schema.ts` の `StepName` union から `"propose"` を `"design"` に変更する。

### D3: 後方互換 — job state の step 名

既存の job state JSON に `step: "propose"` が記録されている場合がある。2 箇所で対応する:

1. **validateJobState on-read remap**: `src/state/schema.ts` の `validateJobState()` に `step === "propose"` → `"design"` の on-read 変換を追加。既存の `status === "success"` → `"awaiting-merge"` remap と同じパターン。
2. **resume resolve-step**: `src/core/resume/resolve-step.ts` の `SPEC_PHASE_STEPS` と `STEP_MAPPING` は StepName 型に従うため、D2 で自動的に `"design"` になる。on-read remap が先に走るので整合する。

遷移テーブルにエイリアスを残す方式は採用しない。on-read remap の方がデータ層で一元的に解決でき、遷移テーブルの汚染を避けられる。

### D4: config migration の後方互換

`src/config/migrate.ts` の `CAMEL_TO_KEBAB` マップと legacy `agent` → `agents.propose` 移行ロジック内の `"propose"` を `"design"` に変更する。ただし既存 config ファイルに `agents.propose` キーが残っている場合に備え、`CAMEL_TO_KEBAB` に `propose: "design"` のエイリアスを追加する。

`src/config/schema.ts` の validation で `agents["propose"]` を参照している箇所も `agents["design"]` に変更する。

### D5: agent name の更新

`proposeAgentDefinition.name` を `"specrunner-propose"` → `"specrunner-design"` に、`role` を `"propose"` → `"design"` に変更する。

managed runtime の agent-runner.ts で `step.agent.role === "propose"` で分岐しているため、ここも `"design"` に変更する。

### D6: pipeline.ts の propose ハードコード

`src/core/pipeline/pipeline.ts` の `getStepOutcome()` に `stepName === "propose"` のハードコードがある（L351）。`completionVerdict: "success"` が DesignStep に設定済みなので、この分岐は本来不要だが、安全のため `"design"` に変更する。

同様に `(finalState.step ?? "propose")` のフォールバック（L95）も `"design"` に変更する。

### D7: executor の PROJECT_CONTEXT_STEPS

`src/core/step/executor.ts` L22 の `PROJECT_CONTEXT_STEPS` Set に `"propose"` が含まれている。`"design"` に変更する。

### D8: prompt テキスト内の表現

`src/prompts/propose-system.ts` 内のシステムプロンプトテキストに「propose agent」「stage 1 (propose)」等の文言がある。ステップ名としての参照を `design` に変更する。pipeline の説明文（`propose (you) → spec-review → ...`）も `design (you) → spec-review → ...` に更新。

### D9: テストファイルのリネーム

`tests/prompts/propose-system.test.ts` → `design-system.test.ts` にリネーム。テスト内の import パスと定数参照を更新。

`tests/grep-no-step-name-hardcode.test.ts` の正規表現パターンで `"propose"` をチェックしている箇所を `"design"` に更新。

### D10: specs ファイルへの影響

`specrunner/specs/propose-pipeline/` と `specrunner/specs/propose-session/` は既存の仕様ドキュメントであり、リネーム後の実態を反映するべきだが、spec ファイルの変更は本 change の scope 外とする。spec 側の整理は別途行う。

## 影響範囲

### 変更対象ファイル

| カテゴリ | ファイル | 変更内容 |
|---------|--------|---------|
| Step 定義 | `src/core/step/propose.ts` → `design.ts` | git mv + export 名変更 |
| Step index | `src/core/step/index.ts` | import/export パス更新 |
| Prompt | `src/prompts/propose-system.ts` → `design-system.ts` | git mv + 定数名 + テキスト更新 |
| 型定義 | `src/state/schema.ts` | StepName union + validateJobState on-read remap |
| 遷移テーブル | `src/core/pipeline/types.ts` | step 名 + コメント |
| Pipeline run | `src/core/pipeline/run.ts` | import + Map キー + コメント |
| Pipeline index | `src/core/pipeline/index.ts` | re-export 名 (`runProposePipeline` → `runDesignPipeline`) |
| Pipeline core | `src/core/pipeline/pipeline.ts` | ハードコード step 名 |
| Command | `src/core/command/pipeline-run.ts` | ログメッセージ + `startStep: "propose"` → `"design"` |
| Resume | `src/core/resume/resolve-step.ts` | STEP_MAPPING |
| Config schema | `src/config/schema.ts` | validation 内の agent キー |
| Config migrate | `src/config/migrate.ts` | CAMEL_TO_KEBAB + legacy migration |
| Executor | `src/core/step/executor.ts` | PROJECT_CONTEXT_STEPS |
| Agent runner | `src/adapter/managed-agent/agent-runner.ts` | role 分岐 |
| SSE stream | `src/adapter/managed-agent/sse-stream.ts` | import パス |
| Doctor | `src/core/doctor/checks/agents/definition-drift.ts` | import + AGENT_ROLES |
| Doctor | `src/core/doctor/checks/agents/agents-registered.ts` | agent 名参照 |
| CLI init | `src/cli/init.ts` | import |
| CLI registry | `src/cli/command-registry.ts` | ヘルプテキスト |
| Types | `src/core/types.ts` | コメント内 `runProposePipeline` → `runDesignPipeline` |
| Errors | `src/errors.ts` | エラーメッセージ |
| Finish | `src/core/finish/preflight.ts` | エラーメッセージ |
| Tests | `tests/prompts/propose-system.test.ts` → `design-system.test.ts` | git mv + 全参照更新 |
| Tests | `tests/unit/core/pipeline/pipeline.transitions.test.ts` | step 名 |
| Tests | `tests/grep-no-step-name-hardcode.test.ts` | 正規表現パターン |

### 変更しないもの

- `buildInitialMessage` 関数名（汎用名）
- `specrunner/specs/` 内の仕様ドキュメント（別 change で対応）
- 振る舞い・ロジック（純粋リネーム）
