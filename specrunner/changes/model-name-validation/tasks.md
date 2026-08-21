# Tasks: 実効モデル名を SDK の supportedModels() で実在検証する

<!-- Task ordering: T-01 (alias registry) と T-02/T-03 (pure collector/checker) は独立。
     T-04 (port), T-05 (adapter probe), T-06 (local runtime + preflight 統合) は D2/D6 の縦串。
     T-07 (doctor) は条件付き配置。T-08 は最終 green 確認。 -->

## T-01: alias 3 種を BUILTIN_MODEL_REGISTRY に anthropic として登録

- [ ] `src/config/model-registry.ts` の `BUILTIN_MODEL_REGISTRY` に `"sonnet"` / `"opus"` / `"haiku"` を
      `{ provider: "anthropic" }` で追加する（既定 model の置換はしない）。
- [ ] 同ファイルに `export const ANTHROPIC_MODEL_ALIASES: ReadonlySet<string> = new Set(["sonnet", "opus", "haiku"])`
      を追加する（live 検証で「実在扱い」する集合の単一真理）。
- [ ] `resolveProvider("sonnet" | "opus" | "haiku", merged)` が `"anthropic"` を返すことを確認する
      （registry 追加により自動的に成立）。
- [ ] `validateConfig()` → `checkModelRegistry()`（`src/config/schema/validation.ts`）が
      alias を含む config（例 `steps.design.model = "sonnet"`）を throw せず pass することを確認する
      （registry 追加により自動的に成立、コード改修不要のはず — 不足があれば補う）。

**Acceptance Criteria**:
- `BUILTIN_MODEL_REGISTRY["sonnet" | "opus" | "haiku"]?.provider === "anthropic"`。
- `ANTHROPIC_MODEL_ALIASES` が 3 alias を含み export されている。
- `resolveProvider` が 3 alias に対し `"anthropic"` を返す（テストで固定）。
- `validateConfig` が `steps.<step>.model` / `byRequestType.<type>.model` に alias を持つ config を
  CONFIG_INVALID を投げず受理する（テストで固定）。
- 既定 model（`claude-sonnet-5` 等）は変更されていない。

## T-02: 実効モデル収集 pure module `collectEffectiveModels`

- [ ] `src/core/model-validation/collect-effective-models.ts` を新規作成する。
- [ ] `EffectiveModelRef` 型（`{ stepName: string; model: string; provider: "anthropic" | "openai" | undefined; configPath: string | null }`）
      を定義・export する（provider は merged registry 未登録時 `undefined`）。
  - **`configPath` の意味**: ここでの `configPath` は **dotted key パス**（例: `steps.code-review.model`）であり、
    エラーメッセージで「どの config キーが問題か」をユーザーに示すために使う。
    `TracedStepConfigSource`（`src/config/step-config.ts`）にも同名の `configPath?: string` フィールドが
    存在するが、そちらは**設定ファイルの絶対パス**（`/home/user/.claude/settings.json` 等）を意味する。
    `traceStepExecutionConfig().fields.model.source` から取得する際は、**`source.path`**（dotted key）を使い、
    `source.configPath`（絶対ファイルパス）と混同しないこと。
- [ ] `collectEffectiveModels(descriptor: PipelineDescriptor, config: SpecRunnerConfig, requestType: string | undefined, merged: ModelsConfig): EffectiveModelRef[]`
      を実装する。`descriptor.steps` を走査し `step.kind === "agent"` のみ対象とする。
- [ ] 各 agent step の実効 model を
      `getStepExecutionConfig(config, step.name, { model: step.agent.model }, requestType).model` で解決する
      （custom reviewer / regression-gate は step 名が config に無く `step.agent.model` = snapshot 値 / dynamic 値へ fallback）。
- [ ] provider は `merged[model]?.provider` で解決する（`resolveProvider` は未登録で throw するため使わない）。
- [ ] `configPath` は `traceStepExecutionConfig(config, step.name, { model: step.agent.model }, requestType).fields.model.source.path`
      から取得する（step 定義 fallback は `null`）。
- [ ] pure（no I/O）を維持する。

**Acceptance Criteria**:
- composed descriptor（custom reviewer step + regression-gate step を含む）を渡すと、それら step の実効 model が
  収集される（custom reviewer は snapshot.model、regression-gate は `claude-sonnet-5` が取れる）ことをテストで固定する。
- config の `steps.<step>.model` / `byRequestType.<type>.model` override が実効 model に反映されることをテストで固定する。
- 収集結果に各 ref の `stepName` / `provider` / `configPath` が含まれる。
- `CliStep`（kind !== "agent"）は収集対象外。

## T-03: 照合 pure checker `checkModelExistence`

- [ ] `src/core/model-validation/check-model-existence.ts` を新規作成する。
- [ ] 戻り値 DU を定義・export する:
      `{ kind: "ok" } | { kind: "skipped"; reason: string } | { kind: "invalid"; unknown: EffectiveModelRef[] }`。
- [ ] `checkModelExistence(refs: EffectiveModelRef[], result: SupportedModelsResult): ModelExistenceOutcome` を実装する。
- [ ] `result.kind === "unavailable"` → `{ kind: "skipped", reason: result.reason }`。
- [ ] `refs` を `provider === "anthropic"` のみに絞る（OpenAI / provider 未登録は照合対象外）。
- [ ] anthropic ref のうち `ANTHROPIC_MODEL_ALIASES.has(model)` は実在扱い（pass）。
      それ以外は `result.models` に含まれれば pass、含まれなければ unknown に積む。
- [ ] unknown が 1 件以上 → `{ kind: "invalid", unknown }`、0 件 → `{ kind: "ok" }`。
- [ ] pure（no I/O）を維持する。

**Acceptance Criteria**:
- `provider === "openai"` の ref は `result.models` に無くても照合対象外で unknown に入らない（false positive 防止）ことをテストで固定する。
- alias（`sonnet`/`opus`/`haiku`）は `result.models` に含まれなくても pass することをテストで固定する。
- 一覧に無い anthropic full ID（腐った ID）が `invalid.unknown` に step 名 / config path 付きで入ることをテストで固定する。
- `result.kind === "unavailable"` は常に `{ kind: "skipped" }` を返すことをテストで固定する。
- すべて既知 → `{ kind: "ok" }`。

## T-04: model listing port 定義

- [ ] `src/core/port/model-listing.ts` を新規作成する（port 層 — adapter / core-runtime を import しない）。
- [ ] `SupportedModelsResult = { kind: "listed"; models: string[] } | { kind: "unavailable"; reason: string }`
      を定義・export する。
- [ ] `SupportedModelsProbe = (env: Record<string, string | undefined>) => Promise<SupportedModelsResult>`
      を定義・export する（contract: never throw — 全エラーを `unavailable` に分類）。

**Acceptance Criteria**:
- port ファイルが adapter / core/runtime に依存しない（DSM 準拠、`bun run typecheck` green）。
- 型が collector / checker / adapter probe / runtime port から参照可能。

## T-05: SDK model 一覧 adapter probe `createClaudeSupportedModelsProbe`

- [ ] `src/adapter/claude-code/supported-models-probe.ts` を新規作成する
      （`provider-readiness-probe.ts` を範として構成する）。
- [ ] `createClaudeSupportedModelsProbe(opts?)` を実装し `SupportedModelsProbe` を返す。
      `opts` に `loadSdkFn?`（既定 `loadClaudeAgentSdk`）・`resolveTokenFn?`・`timeoutMs?` を注入可能にする。
- [ ] `stripSecrets(env)` + OAuth token best-effort 解決（token 絶対値を返り値・log に出さない）を行う。
- [ ] SDK を **streaming input mode** で起動する（`prompt` を `AsyncIterable` として渡す — control request
      `supportedModels()` は streaming mode でのみ利用可能: sdk.d.ts:2026-2030）。
  - `ClaudeSdkQuery` の戻り値型 `ClaudeSdkQueryResult`（`src/adapter/claude-code/sdk-loader.ts`）に
    `supportedModels(): Promise<SdkModelInfo[]>` と `close(): void` を追加すること。SDK は streaming input
    で起動した場合にのみこれらのメソッドを提供するため、probe は必ず `prompt` を `AsyncIterable` として渡す
    （そうしない場合 `supportedModels()` 呼び出しは実行時エラーになる）。
    型安全のために `ClaudeSdkQueryResult` を拡張するか、`sdk.query()` の戻り値を
    `as ClaudeSdkQueryResult` でキャストするかのどちらかを採用すること（実装者判断）。
  - **AsyncIterable の構成パターン**: streaming input として渡す `AsyncIterable<SDKUserMessage>` は、
    `AbortController.signal` の abort イベントで終了させる方式で実装する。具体的には以下のパターンを使うこと:
    ```typescript
    async function* makePromptIterable(signal: AbortSignal): AsyncIterable<SDKUserMessage> {
      // セッションを維持するために何も yield しない（control request のみを使う用途）。
      // finally で return することで streaming input channel を正常終了させる。
      try {
        await new Promise<void>((resolve) => {
          if (signal.aborted) { resolve(); return; }
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        return; // AsyncIterable を正常終了（streaming input channel を閉じる）
      }
    }
    // 使用例: sdk.query({ prompt: makePromptIterable(abortController.signal), ... })
    ```
    この方式により、`AbortController.abort()` を呼ぶだけで iterable が終了し、
    streaming input channel が閉じられる。
- [ ] 起動した `Query` の `supportedModels()` を呼び、`ModelInfo[].value` を抽出して
      `{ kind: "listed", models }` を返す。
- [ ] wall-clock timeout を `AbortController` + `setTimeout` で設定する（既定は provider readiness と同値 30s を推奨）。
- [ ] **never throw**: SDK unavailable / auth 失敗 / offline / timeout / その他例外はすべて捕捉し
      `{ kind: "unavailable", reason }` に分類する（reason に token 絶対値を含めない）。
- [ ] `try/finally` で成功・取得失敗・timeout の全経路において
      `AbortController.abort()` + `Query.close()`（sdk.d.ts:2230）+ `clearTimeout` を実行し、
      streaming input iterable を終了させる（session / bundled CLI subprocess を残さない）。

**Acceptance Criteria**:
- 一覧取得成功時 `{ kind: "listed", models: string[] }`（`ModelInfo.value` の配列）を返すことをテストで固定する
  （fake SDK loader を注入）。
- SDK loader throw / auth 失敗 / timeout 時に throw せず `{ kind: "unavailable", reason }` を返すことをテストで固定する。
- 成功・取得失敗・timeout の全経路で `AbortController.abort()` と `Query.close()` が呼ばれる
  （= session / subprocess を残さない）ことを fake SDK でテストで固定する。
- token 絶対値が返り値・log に現れない。

## T-06: runtime port + LocalRuntime 実装 + preflight 統合（local 限定）

- [ ] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に optional method
      `listSupportedModels?(env: Record<string, string | undefined>): Promise<SupportedModelsResult>` を追加する
      （`RealRuntimeStrategy` の required 集合には**加えない** — managed に実装を強制しない）。
- [ ] `src/core/runtime/local.ts`（`LocalRuntime`）に `listSupportedModels(env)` を実装する。
      constructor opts に `supportedModelsProbe?` を追加し（`providerReadinessProbe` と同じ注入パターン）、
      未注入時は adapter probe を lazy import（`createClaudeSupportedModelsProbe`）して使う。
- [ ] `ManagedRuntime`（`src/core/runtime/managed.ts`）には実装しない（method presence = local 限定を表現）。
- [ ] `src/core/model-validation/preflight.ts` を新規作成し
      `assertEffectiveModelsExist({ runtime, descriptor, config, requestType, env, merged, logWarn }): Promise<void>`
      を実装する。処理順:
  - [ ] `runtime.listSupportedModels` が無ければ即 return（managed skip）。
  - [ ] `collectEffectiveModels(descriptor, config, requestType, merged)` で ref を収集。
        `provider === "anthropic"` の ref が 0 件なら probe を起動せず return（不要 session 抑制）。
  - [ ] `result = await runtime.listSupportedModels(env)` → `checkModelExistence(refs, result)`。
  - [ ] `invalid` → step 名 + config path を列挙した message で
        `new SpecRunnerError(ERROR_CODES.CONFIG_INVALID, hint, message)` を throw する。
  - [ ] `skipped` → `logWarn(...)`（理由を含める）で継続。`ok` → 何もしない。
- [ ] `src/core/command/pipeline-run.ts` の `prepare()` で、`composeReviewerDescriptor` +
      `validateDescriptorInputCompleteness` の**後**、`assertNoDuplicateLiveJob` / `bootstrapJob` の**前**に
      `await assertEffectiveModelsExist(...)` を呼ぶ（`merged` は `mergeModelRegistry(config)`、
      `requestType` は `request.type`、`env` は `process.env`、`logWarn` は logger）。

**Acceptance Criteria**:
- 一覧取得成功 + 未知 Anthropic model のとき、`prepare()`（= job 開始前）で `CONFIG_INVALID` が throw され、
  message に対象 step 名 / config path が含まれ、job state が作成されない（bootstrapJob 未到達）ことをテストで固定する。
- 一覧取得失敗（`unavailable`）のとき、throw せず warning を出し、pipeline が継続する（bootstrapJob へ進む）ことをテストで固定する。
- `runtime.listSupportedModels` を持たない runtime（managed 相当の fake）では probe が起動されず検証が skip されることをテストで固定する。
- anthropic 実効 model が 0 件のとき probe が起動されないことをテストで固定する。
- `alias` のみの構成では live 検証が pass する（unknown 0 件）ことをテストで固定する。

## T-07: doctor への同一 checker 再利用配置（条件付き）

- [ ] `DoctorContext`（`src/core/doctor/types.ts`）に optional field
      `supportedModelsProbe?: SupportedModelsProbe` を追加する（未注入 → skip=warn）。
- [ ] `src/core/doctor/checks/config/model-existence.ts` を新規作成し `DoctorCheck` を実装する。
      `collectEffectiveModels`（base standard descriptor、requestType 無し、`merged = BUILTIN_MODEL_REGISTRY` +
      config.models）+ `checkModelExistence` を再利用する。
- [ ] 判定マッピング: `probe 未注入` / `skipped` → `warn`、`invalid` → `fail`（未知モデルを step / config path 付きで
      `details` 化）、`ok` → `pass`。`required: false`。
- [ ] `localChecks`（`src/core/doctor/checks/index.ts`）に登録する。
- [ ] doctor の runner（`src/core/doctor/runner.ts`）で local runtime のとき probe を注入する
      （既存の provider-alive 系 check の注入経路に倣う）。

**Acceptance Criteria**:
- 取得成功 + 未知 Anthropic model のとき doctor check が `fail` を返し、details に step 名 / config path を含むことをテストで固定する。
- `skipped`（probe 未注入 / unavailable）のとき `warn` を返すことをテストで固定する。
- `collectEffectiveModels` / `checkModelExistence` を preflight と共有している（ロジック二重定義が無い）。
- doctor 全体の既存 check 挙動を変えない。

## T-08: 型チェック・全テスト green 確認

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green（既存テストは無変更で green — 特に `tests/config/model-registry.test.ts` /
      registry 依存テスト、`tests/core/provider-readiness-gate.test.ts` を確認）。
- [ ] 新規テストが受け入れ基準の全項目を固定していることを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 既存テストは無変更で green。
- 受け入れ基準（request.md）の 8 項目に対応するテストが存在する。
