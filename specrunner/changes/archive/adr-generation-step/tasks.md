# Tasks: adr-generation-step

## 1. ParsedRequest 型と parser の拡張

- [x] 1.1 `src/core/request/types.ts`: `ParsedRequest` interface に `adr: boolean` を追加
- [x] 1.2 `src/parser/request-md.ts`: `adr` フィールド抽出ロジックを追加。pattern: `/^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/`。`true` → `true`、`false` → `false` に変換
- [x] 1.3 `src/parser/request-md.ts`: `adr` フィールド欠落時に `requestMdInvalidError("missing 'adr' in Meta section in ${filePath}")` を throw (= `base-branch` validation と同等パターン)
- [x] 1.4 `src/parser/request-md.ts`: `adr` フィールドの値が `true` / `false` 以外の場合も `requestMdInvalidError` を throw
- [x] 1.5 `src/parser/request-md.ts`: `parseRequestMdContent` の return 文に `adr` を追加

## 2. Step 名定義

- [x] 2.1 `src/core/step/step-names.ts`: `AGENT_STEP_NAMES` 配列に `"adr-gen"` を追加
- [x] 2.2 `src/core/step/step-names.ts`: `STEP_NAMES` オブジェクトに `ADR_GEN: "adr-gen"` を追加

## 3. adr-gen step 実装

- [x] 3.1 `src/prompts/adr-gen-system.ts` を新規作成: ADR 生成 agent の system prompt を定義。内容:
  - 役割: ADR-worthy 判定 (= judge) + ADR draft 生成
  - 入力材料の説明: request.md、delta spec、design.md、review-feedback
  - judge 判定基準: 新しい port/adapter 追加、既存パターンと違う設計選択、振る舞い/契約を変える bug-fix、構造的リファクタリング
  - judge=yes の場合: Michael Nygard 形式で ADR を `specrunner/adr/ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` に書き出し、git add + commit + push
  - judge=no の場合: 理由を簡潔に述べて終了 (= ファイル生成なし)
  - ADR フォーマットテンプレート: Context / Decision / Alternatives Considered / Consequences (+ Known Design Debt は該当時のみ)
  - 番号採番ルール: `specrunner/adr/` 配下の既存 ADR の最大番号 + 1 (= 0 件なら 0001)
- [x] 3.2 `src/core/step/adr-gen.ts` を新規作成: `AdrGenStep` を AgentStep として定義
  - `kind: "agent"`
  - `name: STEP_NAMES.ADR_GEN`
  - `agent: adrGenAgentDefinition` (= name: "specrunner-adr-gen", role: STEP_NAMES.ADR_GEN, model: "claude-sonnet-4-6", system: ADR_GEN_SYSTEM_PROMPT, tools: [{ type: AGENT_TOOLSET_TYPE }])
  - `completionVerdict: "success"`
  - `requiresCommit: undefined` (= false、design D10 参照)
  - `resultFilePath: () => null`
  - `parseResult: () => NULL_PARSE_RESULT`
  - `needsProjectContext: false`
  - `phase: "impl"` (= 省略可、デフォルト)
  - `buildMessage(state, deps)`: `deps.request.adr === false` の場合は no-op 指示 message を返す。`true` の場合は change folder 内の design.md / delta spec / review-feedback のパス情報を含む message を返す

## 4. Transition table 更新

- [x] 4.1 `src/core/pipeline/types.ts`: `STANDARD_TRANSITIONS` 配列の `code-review --approved→ pr-create` 行を `code-review --approved→ adr-gen` に変更 (= `STEP_NAMES.PR_CREATE` → `STEP_NAMES.ADR_GEN`)
- [x] 4.2 `src/core/pipeline/types.ts`: `pr-create` 行の直前に以下 2 行を追加:
  - `{ step: STEP_NAMES.ADR_GEN, on: "success", to: STEP_NAMES.PR_CREATE }`
  - `{ step: STEP_NAMES.ADR_GEN, on: "error", to: "escalate" }`

## 5. Pipeline wiring

- [x] 5.1 `src/core/pipeline/run.ts`: `import { AdrGenStep } from "../step/adr-gen.js"` を追加
- [x] 5.2 `src/core/pipeline/run.ts`: `createStandardPipeline` 内の `steps` Map に `[STEP_NAMES.ADR_GEN, AdrGenStep]` を追加 (= `CODE_FIXER` と `PR_CREATE` の間)

## 6. request template / scaffold 拡張

- [x] 6.1 `src/core/command/request.ts`: `buildScaffoldTemplate` の Meta セクションに `- **adr**: false` を `base-branch` の直後に追加
- [x] 6.2 `src/core/command/request.ts`: Meta セクションの後 (or `## 背景` の前) に ADR 判断基準のコメントブロックを追加:
  ```
  <!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
  ```

## 7. request generate prompt 拡張

> **delta spec 不要の根拠 (= 選択肢 B)**: `request-generate-system.ts` は `specrunner request generate` コマンドが LLM に渡す内部 system prompt であり、ユーザー向け振る舞い仕様ではない。`adr` フィールドの構造・型・validation は `specs/request-md-parser/spec.md` で、scaffold 出力は `specs/cli-commands/spec.md` でそれぞれ仕様化済み。prompt の内部品質向上は delta spec の対象外と判断する。

- [x] 7.1 `src/prompts/request-generate-system.ts`: `## Meta` セクションの必須項目に `- **adr**: <true|false>` を追加
- [x] 7.2 `src/prompts/request-generate-system.ts`: ADR 判断基準を prompt に明文化 (= 新しい port/adapter 追加、既存パターンと違う設計選択、振る舞い/契約を変える bug-fix、構造的リファクタリング → true、それ以外 → false)

## 8. specrunner/adr/ ディレクトリ新設

- [x] 8.1 `specrunner/adr/.gitkeep` を作成して空ディレクトリを保持

## 9. docs/architecture.md の削除

- [x] 9.1 `docs/architecture.md` が存在する場合は削除 (= untracked の場合は `rm` のみ、tracked の場合は `git rm`)
  - Note: worktree には存在しなかった (= untracked of main repo のみ)。worktree スコープ外のため skip。

## 10. テスト

- [x] 10.1 `tests/unit/parser/request-md.test.ts`: TC-ADR-PARSE-01 — `adr: true` を含む request.md → 正常 parse、`result.adr === true`
- [x] 10.2 `tests/unit/parser/request-md.test.ts`: TC-ADR-PARSE-02 — `adr: false` を含む request.md → 正常 parse、`result.adr === false`
- [x] 10.3 `tests/unit/parser/request-md.test.ts`: TC-ADR-PARSE-03 — `adr` フィールド欠落 → `REQUEST_MD_INVALID` throw
- [x] 10.4 `tests/unit/parser/request-md.test.ts`: TC-ADR-PARSE-04 — `adr: maybe` (= 不正値) → `REQUEST_MD_INVALID` throw
- [x] 10.5 `tests/unit/core/step/adr-gen.test.ts` を新規作成:
  - TC-ADR-STEP-01: `request.adr === false` → buildMessage が no-op 指示を返す
  - TC-ADR-STEP-02: `request.adr === true` → buildMessage が判断材料パス情報を含む message を返す
  - TC-ADR-STEP-03: step.name === "adr-gen"、step.kind === "agent"、step.completionVerdict === "success"
  - TC-ADR-STEP-04: step.resultFilePath() === null、step.parseResult() === NULL_PARSE_RESULT
- [x] 10.6 `tests/pipeline-integration.test.ts`: TC-ADR-INT-01 — STANDARD_TRANSITIONS に `code-review --approved→ adr-gen` と `adr-gen --success→ pr-create` が存在し、旧行 `code-review --approved→ pr-create` が存在しないことを assert
- [x] 10.7 既存テストの修正: parser テストで MINIMAL_META に `adr` フィールドが必要になるため、既存テストの fixture を更新 (= `- **adr**: false\n` を追加)

## 11. Delta spec 作成

- [x] 11.1 `specrunner/changes/adr-generation-step/specs/adr-generation/spec.md`: ADDED Requirements — adr-gen step の振る舞い仕様
- [x] 11.2 `specrunner/changes/adr-generation-step/specs/pipeline-orchestrator/spec.md`: MODIFIED Requirements — transition table に adr-gen を追加
- [x] 11.3 `specrunner/changes/adr-generation-step/specs/request-md-parser/spec.md`: MODIFIED Requirements — adr フィールド必須化
- [x] 11.4 `specrunner/changes/adr-generation-step/specs/cli-commands/spec.md`: MODIFIED Requirements — scaffold に adr フィールド追加

## 12. 検証

- [x] 12.1 `bun run typecheck` が green
- [x] 12.2 `bun run test` が green (= 既存テスト regression なし)
