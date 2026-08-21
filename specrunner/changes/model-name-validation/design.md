# Design: 実効モデル名を SDK の supportedModels() で実在検証する

## Context

config のモデル名 typo は `validateConfig()` → `checkModelRegistry()`（`src/config/schema/validation.ts`）が
`BUILTIN_MODEL_REGISTRY`（`src/config/model-registry.ts`）と照合して既に検出する。検出できないのは、
**ローカル registry には存在するが SDK の利用可能一覧から消えた Anthropic model ID の腐敗**（世代交代・提供終了）
である。腐った ID は job 起動後の agent 呼び出し失敗として初めて顕在化し、pipeline の途中 halt を招く。

利用可能な材料（fact-check 済み）:

- SDK `Query` オブジェクトは `supportedModels(): Promise<ModelInfo[]>` を持つ
  (`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2098`)。`ModelInfo = { value, displayName, description, ... }`
  (同 :1061-1097)。取得には SDK session（bundled CLI subprocess）が必要。
  さらに `Query` の control request 群は **streaming input/output mode でのみ**利用可能（同 :2026-2030）—
  `supportedModels()` を呼ぶには `prompt` を `AsyncIterable` として渡す streaming 起動が必要。
- model 値は full ID のほか alias（`'sonnet'` / `'opus'` / `'haiku'`）も受理される（同 :56）。
- `BUILTIN_MODEL_REGISTRY` は `provider:"anthropic"` と `provider:"openai"`（`gpt-5.5` 等）を含む。
  OpenAI model は `supportedModels()` に現れないため、全件照合は false positive になる。
- alias（`sonnet` 等）は現状 registry に無いため、静的検証 / provider 解決で失敗する。
- 実効 model は `getStepExecutionConfig(config, step.name, { model: step.agent.model }, requestType)`
  （`src/config/step-config.ts:62`）で解決される。これは runtime の agent-runner
  （`src/adapter/claude-code/agent-runner.ts:479`, `src/adapter/dispatching/agent-runner.ts:22`）が実際に使う経路そのもの。
  custom reviewer は snapshot 由来（`src/core/step/custom-reviewer.ts` の `snapshot.model ?? DEFAULT_REVIEW_MODEL`）、
  regression-gate は動的注入（`src/core/step/regression-gate.ts` の `DEFAULT_REVIEW_MODEL`）で `agent.model` が決まるため、
  ファイル上の定数列挙では網羅できない。**実際の composed descriptor の step を走査する必要がある。**
- composed pipeline は `composeReviewerDescriptor(descriptor, reviewers)`
  （`src/core/pipeline/compose-reviewers.ts`）が生成し、`PipelineDescriptor.steps` は
  `readonly (readonly [string, Step])[]`（`src/core/pipeline/types.ts`）で iterable。
  この composition は `PipelineRunCommand.prepare()`（`src/core/command/pipeline-run.ts`）で
  `bootstrapJob` の**前**に実施される（reviewer validation / input-completeness と同じ preflight slot）。
- 既存の類似パターン: provider readiness gate
  （port `src/core/port/provider-readiness.ts` / 分類 `src/core/runtime/provider-readiness.ts` /
  adapter probe `src/adapter/claude-code/provider-readiness-probe.ts` / 呼び出し `CommandRunner.execute()`）。
  SDK session を timeout 付き AbortController で起動し finally で片づける手本がある。
- managed runtime は configured model を実行に使わない（local 実行のみが検証対象になりうる）。

## Goals / Non-Goals

**Goals**:

- composed pipeline の**実効モデル**（custom reviewer snapshot 由来・regression-gate 動的注入を含む）を
  `getStepExecutionConfig()` で解決・収集し、SDK の `supportedModels()` と照合する。
- 照合対象は `provider === "anthropic"` の model のみ（OpenAI は除外して false positive を防ぐ）。
- 検証を行うのは `runtime === "local"` の実行のみ（managed は対象外）。
- 一覧取得成功 + 未知 Anthropic model → job 開始前に `CONFIG_INVALID` で停止（step 名 / config path を報告）。
- 一覧取得失敗（offline / auth 未設定 / SDK unavailable / timeout）→ warning + 検証 skip、job は継続。
- `sonnet` / `opus` / `haiku` の 3 alias を Anthropic model として registry に登録し、
  静的検証（validateConfig）・provider 解決・live 検証の全経路で pass させる（live 検証では alias は実在扱い）。
- 検証の成功・取得失敗・timeout の全経路で SDK session / bundled CLI process を残さない。

**Non-Goals**:

- 既定モデルの alias 化（`claude-sonnet-5` → `sonnet` への置換）は行わない。
- 未知 ID の自動読み替え・fallback は行わない（検証は報告に徹する）。
- managed runtime での検証は行わない。
- `ModelInfo` の effort / fast mode 等の対応可否による設定検証は行わない。

## Decisions

### D1: 実効モデルの収集は composed descriptor 走査 + `getStepExecutionConfig()` で行う

新規 pure module `src/core/model-validation/collect-effective-models.ts` に
`collectEffectiveModels(descriptor, config, requestType, mergedRegistry)` を置く。
`descriptor.steps` を走査し `step.kind === "agent"` の各 step について
`getStepExecutionConfig(config, step.name, { model: step.agent.model }, requestType).model` で実効 model を解決、
`mergedRegistry[model]?.provider` で provider を解決し、
`EffectiveModelRef = { stepName, model, provider, configPath }` の配列を返す。`configPath` は
`traceStepExecutionConfig()`（`src/config/step-config.ts`）の model field の `source.path`
（例 `steps.code-review.model` / step 定義 fallback は `null`）から取得し、報告に用いる。

- **Rationale**: runtime の agent-runner が実際に使う解決経路
  （`getStepExecutionConfig(config, step.name, { model: step.agent.model }, requestType)`）を
  そのまま preflight で再利用することで、config override・custom reviewer snapshot・regression-gate 動的注入を
  すべて自然に網羅する。custom reviewer / regression-gate の step 名は config に無いため、
  `getStepExecutionConfig` は `stepDefaults.model`（= `step.agent.model` = snapshot 値 / dynamic 値）に fallback し、
  実効値が正しく取れる。
- **Alternatives considered**:
  - ファイル上の定数列挙（各 step 定義の model を静的に集める）: snapshot / 動的注入で漏れるため却下
    （architect 判断「実効モデル基準」と一致）。
  - config の生値のみ照合: step 定義 hardcode default / snapshot を見落とすため却下。

### D2: SDK model 一覧取得は port + adapter probe に分離（provider readiness と同型）

port `src/core/port/model-listing.ts` に

```
type SupportedModelsResult =
  | { kind: "listed"; models: string[] }        // ModelInfo[].value の配列
  | { kind: "unavailable"; reason: string };     // offline / auth / SDK unavailable / timeout
type SupportedModelsProbe = (env) => Promise<SupportedModelsResult>;
```

を定義。adapter `src/adapter/claude-code/supported-models-probe.ts` に
`createClaudeSupportedModelsProbe(opts)` を実装する。streaming input mode で SDK session を起動し、
`query.supportedModels()` を呼び、`ModelInfo[].value` を抽出して `{ kind:"listed" }` を返す。
`provider-readiness-probe.ts` に倣い: secrets を strip、OAuth token を best-effort 解決、
wall-clock timeout を `AbortController` で設定、**never throw**（全エラーを `{ kind:"unavailable", reason }` に分類）。

- **Rationale**: 既存 provider readiness gate と同じ ports & adapters 構造を踏襲することで、
  DSM（core→adapter static import 禁止）を守り、テストでは fake probe を注入できる。
  `supportedModels()` は control request で streaming mode 必須（sdk.d.ts:2026-2030）なので、
  probe は `prompt` を AsyncIterable で渡す起動にする。
- **Alternatives considered**:
  - agent-runner の既存 query 経路を流用: 通常の agent 実行は task を実行してしまうため、
    一覧取得専用の最小 session が適切。却下。
  - `initializationResult()`（sdk.d.ts:2086、models を含む）: `supportedModels()` の方が意図が明確で
    request の指定 API と一致するため採用。

### D3: session / subprocess の後始末を probe の finally で保証する

probe は `try/finally` で、成功・取得失敗・timeout の全経路において
(1) `AbortController.abort()` で session を打ち切り、(2) `Query.close()`（sdk.d.ts:2230）を呼び、
(3) timeout timer を `clearTimeout` する。streaming input の AsyncIterable は完了/return させる。

- **Rationale**: 要件 6（session / bundled CLI subprocess を残さない）の直接実装。
  `Query` は control 用の long-lived session を張るため、明示 `close()` + abort が必要。
- **Alternatives considered**: for-await を最後まで回して自然終了に任せる案は、
  一覧取得後すぐ抜けたい（無駄な turn を消費しない）ため却下。abort + close を明示する。

### D4: 照合ロジックは pure checker に分離し alias を実在扱いする

新規 pure module `src/core/model-validation/check-model-existence.ts` に
`checkModelExistence(refs: EffectiveModelRef[], result: SupportedModelsResult)` を置き、
DU を返す:

```
{ kind: "ok" }
| { kind: "skipped"; reason: string }              // result.kind === "unavailable"
| { kind: "invalid"; unknown: EffectiveModelRef[] } // 未知 Anthropic model 群
```

ロジック:
- `result.kind === "unavailable"` → `{ kind:"skipped", reason }`（検証 skip）。
- `refs` から `provider === "anthropic"` のみ抽出。
- 各 anthropic ref について: model が `ANTHROPIC_MODEL_ALIASES`（`sonnet`/`opus`/`haiku`）に含まれれば実在扱い（pass）。
  それ以外は `result.models`（`supportedModels()` の value 集合）に含まれれば pass、含まれなければ unknown。
- unknown が 1 件以上 → `{ kind:"invalid", unknown }`、0 件 → `{ kind:"ok" }`。

- **Rationale**: probe I/O から分離した pure function にすることで、
  「anthropic のみ照合」「OpenAI 除外」「alias 実在扱い」「未知検出」を probe を起動せず単体テストで固定できる
  （受け入れ基準の大半をここで担保）。alias 解決は SDK 側の責務であり、live 検証で alias を弾かない。
- **Alternatives considered**: alias を `supportedModels()` の value 集合に含まれる前提で照合する案は、
  一覧が full ID のみを返す場合に alias が false positive になるため却下し、明示的に実在扱いする。

### D5: alias 3 種を BUILTIN_MODEL_REGISTRY に anthropic として登録する

`src/config/model-registry.ts` に `"sonnet"`/`"opus"`/`"haiku"` を `{ provider:"anthropic" }` で追加し、
`export const ANTHROPIC_MODEL_ALIASES = new Set(["sonnet","opus","haiku"])` を追加する。
これにより `validateConfig()` → `checkModelRegistry()`（registry 照合）と `resolveProvider()`（provider 解決）が
alias を pass する。既定 model（`claude-sonnet-5` 等）は置換しない。

- **Rationale**: 要件 5 の「全経路 pass」を満たす最小変更。alias を registry に入れれば静的検証・provider 解決は
  無改修で通り、live 検証は D4 の実在扱いで通る。
- **Alternatives considered**: alias を registry に入れず validation / resolveProvider 側に特例分岐を足す案は、
  照合ロジックが分散するため却下。単一の registry を真理とする。

### D6: preflight 統合は local 限定を「runtime capability の有無」で表現する

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）に optional method
`listSupportedModels?(env): Promise<SupportedModelsResult>` を追加。**LocalRuntime のみ**実装し
（adapter probe を lazy import、`providerReadinessProbe` と同様に constructor opts で注入可能）、
ManagedRuntime には実装しない。`RealRuntimeStrategy` の required 集合には**加えない**
（managed が実装を強制されないため）。

新規 orchestrator `src/core/model-validation/preflight.ts` に
`assertEffectiveModelsExist({ runtime, descriptor, config, requestType, env, mergedRegistry, logWarn })` を置き、
`PipelineRunCommand.prepare()` の `composeReviewerDescriptor` + input-completeness 検証の**後**、
`assertNoDuplicateLiveJob` / `bootstrapJob` の**前**に呼ぶ。処理:
- `runtime.listSupportedModels` が無ければ即 return（= managed は skip）。
- `collectEffectiveModels(...)` で実効 model を収集。anthropic ref が 0 件なら probe を起動せず return。
- `result = await runtime.listSupportedModels(env)` → `checkModelExistence(refs, result)`。
- `invalid` → step 名 + config path を列挙した message で `SpecRunnerError(CONFIG_INVALID, ...)` を throw
  （prepare() が throw → job state 未作成のまま停止）。
- `skipped` → `logWarn(...)` で理由を出し継続。
- `ok` → 何もしない。

- **Rationale**: 「配置は composed pipeline と request type が確定した後の job 起動前」（要件 3）を満たす slot は
  `prepare()`（composition が起きる場所）であり、既存の reviewer validation / input-completeness と同じ
  「bootstrap 前に throw → 状態を作らず停止」パターンに一致する。「local のみ」の制約（要件 2）は
  `assertProviderReadiness?` / `canDeriveChangedFiles?` と同じく **capability の presence** で表現するのが
  この codebase の既存流儀。managed が method を持たない = 自然に skip。
- **Alternatives considered**:
  - `CommandRunner.execute()` の `assertProviderReadiness` と同じ prepare() 前の slot: そこでは
    composed descriptor / requestType が未確定のため要件 3 を満たせず却下。
  - `runPreflight()`（`src/core/preflight.ts`）に置く: descriptor composition を行わないため却下。
  - `config.runtime === "local"` を直接分岐: runtime 抽象化を破り、既存 capability パターンから逸脱するため却下。

### D7: doctor へは同一 checker を再利用して配置する（条件付き配置）

要件 3/4 の「doctor にも置く場合は同じ checker を再利用する」を満たすため、doctor の local check として
`src/core/doctor/checks/config/model-existence.ts` を追加し `localChecks`（`src/core/doctor/checks/index.ts`）へ登録する。
この check は `collectEffectiveModels`（base standard descriptor、requestType 無し）+ `checkModelExistence` を再利用する。
SDK probe は `DoctorContext` に optional field `supportedModelsProbe?` を追加して注入する（未注入 → skip=warn）。
判定マッピング: `invalid` → doctor `fail`（未知モデルを step/config path 付きで details 化）、
`skipped` → `warn`、`ok` → `pass`。

- **Rationale**: preflight と doctor で同じ `collectEffectiveModels` / `checkModelExistence` を共有し、
  ロジック二重化を避ける（要件 3「同じ checker を再利用」）。
- **Alternatives considered**: doctor 独自ロジックの再実装は乖離リスクがあるため却下。
- **Note**: doctor には job の request type / custom reviewer snapshot が無いため、doctor 側の収集対象は
  base descriptor の agent step + config の byRequestType を含まない実効値に限られる（doctor の構造的制約）。
  これは受け入れ基準の必須項目ではない（要件 4 は「置いた場合」の条件付き）。

## Risks / Trade-offs

- [Risk] `supportedModels()` が control request で streaming mode を要求する点を見落とすと、
  probe が hang / error する。→ Mitigation: probe を streaming input（AsyncIterable prompt）で起動し、
  timeout（AbortController）と finally での `close()`/abort を必ず実装する（D2/D3）。テストで timeout 経路を固定。
- [Risk] session / subprocess のリーク（要件 6）。→ Mitigation: probe の `try/finally` で abort + close + clearTimeout を
  全経路実行し、成功・取得失敗・timeout の 3 経路で「起動した session が close/abort された」ことをテストで固定（D3）。
- [Risk] alias を registry に追加すると registry を列挙・カウントする既存テストが破綻する可能性。
  → Mitigation: 現行 `tests/config/model-registry.test.ts` は個別 key の存在のみを assert し
  厳密な件数比較や `toEqual(BUILTIN_MODEL_REGISTRY)` は「同一参照との比較」で追加後も green。実装時に
  `bun run test` で全 registry 依存テストを確認する。
- [Risk] preflight で毎回 SDK session を起動するとレイテンシ増（provider readiness と合わせて 2 session）。
  → Mitigation: anthropic 実効 model が 0 件なら probe を起動しない早期 return（D6）。取得失敗は warn+skip で
  job を止めない。timeout は provider readiness 同様に十分な ceiling を設ける。
- [Trade-off] 「local 限定」を capability presence で表現するため、`listSupportedModels` は
  `RealRuntimeStrategy` の required に含めない。managed が誤って実装しても preflight 側は起動するが、
  managed は configured model を使わないため実害は無い（要件のスコープ外）。

## Open Questions

- probe の wall-clock timeout 値: provider readiness の `PROBE_TIMEOUT_MS = 30_000` に揃えるか、
  一覧取得のみで軽いため短縮するか。→ 初期値は provider readiness と同値（30s）を推奨。実装時に調整可。
- doctor の SDK probe 注入（`DoctorContext.supportedModelsProbe?`）を今回含めるか、preflight のみに絞るか。
  受け入れ基準は doctor を必須としないため、preflight を主成果物とし doctor は同一 checker 再利用の
  追加 task として扱う（T-07）。レビューで scope 調整可能。
