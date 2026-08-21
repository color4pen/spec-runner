# 実効モデル名を SDK の supportedModels() で実在検証する

## Meta

- **type**: new-feature
- **slug**: model-name-validation
- **base-branch**: main
- **adr**: false

## 背景

config のモデル名 typo は現在も `validateConfig()` の組み込み model registry 照合で検出される。検出できないのは、**ローカル registry には存在するが SDK の利用可能一覧から消えた Anthropic model ID の腐敗**（モデルの世代交代・提供終了）である。腐った ID は job 起動後の agent 呼び出し失敗として初めて顕在化し、pipeline の途中 halt になる。

SDK は利用可能モデルの一覧 API を持っている。これを使い、local job の起動前（preflight）に実効モデル名の実在を検証して、名前腐れを早期検出する。

## 現状コードの前提

- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:2098` — `supportedModels(): Promise<ModelInfo[]>` が Query オブジェクトの method として存在する（`ModelInfo = { value, displayName, description, ... }`、同 :1062-1096）。取得には SDK session（bundled CLI subprocess）が必要
- `sdk.d.ts:56` — model 値は full ID のほか alias（`'sonnet'` / `'opus'` / `'haiku'`）も受理される
- `src/config/model-registry.ts` — `BUILTIN_MODEL_REGISTRY` は `provider: "anthropic"` のほか `provider: "openai"` のモデル（`gpt-5.5` 等）も含む。**OpenAI モデルは `supportedModels()` の一覧に現れないため、全件照合は false positive になる**
- `src/config/schema/validation.ts` — `validateConfig()` が config のモデル名を registry と照合済み（typo はここで検出される）
- alias（`sonnet` 等）は `BUILTIN_MODEL_REGISTRY` に存在しないため、現状は静的検証 / provider 解決で失敗する
- `src/config/step-config.ts:62` — `getStepExecutionConfig()` が step 名 + request type から実効 model を解決する。custom reviewer は snapshot から、regression-gate は動的注入でモデルが決まるため、**ファイル上の定数列挙では実効モデルを網羅できない**
- managed runtime は configured model を実行に使わない（local 実行のみが検証対象になりうる）

## 要件

1. **検証対象は実効モデル**: pipeline 構成後の実際の AgentStep 群に対し、現在の request type で `getStepExecutionConfig()` した実効 model を収集して照合する（custom reviewer の snapshot 由来・regression-gate の動的注入を含む）。ファイル上の定数列挙は行わない。
2. **provider / runtime の限定**: `supportedModels()` との照合は `provider === "anthropic"` のモデルのみ。検証を行うのは `runtime === "local"` の実行のみ（managed は対象外）。
3. **配置は local job preflight**: composed pipeline と request type が確定した後の job 起動前検証とする。doctor にも置く場合は同じ checker を再利用する。
4. **終了条件**:
   - 一覧取得成功 + 未知の Anthropic model → job 開始前に `CONFIG_INVALID` として停止（対象箇所: step 名 / config path を報告）
   - 一覧取得失敗（offline / auth 未設定 / SDK unavailable）→ warning を出して検証 skip、job は継続
   - doctor に置いた場合、取得成功 + 未知モデルは doctor の fail とする
5. **alias の全経路対応**: `sonnet` / `opus` / `haiku` の 3 alias を Anthropic model として組み込み registry に登録し、静的検証（validateConfig）・provider 解決・live 検証のすべてを pass することを固定する。live 検証では alias は実在扱いとする（解決は SDK 側の責務）。既定モデルの alias への置換はしない。
6. **session / subprocess の後始末**: 検証の成功・取得失敗・timeout の全経路で SDK session / bundled CLI process が残らないこと。

## スコープ外

- 既定モデルの alias 化（`claude-sonnet-5` → `sonnet` への置き換え）
- モデルの自動選択・fallback（未知 ID の読み替え）
- managed runtime での検証
- `ModelInfo` の effort / fast mode 対応可否による設定検証

## 受け入れ基準

- [ ] composed pipeline の実効モデル（custom reviewer snapshot・regression-gate 動的注入を含む）が収集・照合されることをテストで固定する
- [ ] `provider === "openai"` のモデルが照合対象外であることをテストで固定する（false positive の防止）
- [ ] 一覧取得成功 + 未知 Anthropic model で job 開始前に `CONFIG_INVALID` 停止（対象箇所付き報告）となることをテストで固定する
- [ ] 一覧取得失敗時に warning + skip で job が継続することをテストで固定する
- [ ] alias 3 種が静的検証・provider 解決・live 検証の全経路を pass することをテストで固定する
- [ ] 成功・取得失敗・timeout の全経路で SDK session / subprocess が残らないことをテストで固定する
- [ ] 既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **検証のみ・変換なし**: 未知 ID の自動読み替えは却下（設定と実行の対応が暗黙になる）。検証は報告に徹し、修正は人間が行う。
- **実効モデル基準**: ファイル上の定数・config の生値でなく、実際の実行が使う解決後モデルを検証する。静的列挙は snapshot / 動的注入で漏れるため却下。
- **alias 化は分離**: 「名前が腐る」問題（本 request）と「最新へ追従する」問題（alias 化）は別問題。本 request は alias を全経路で通せるようにするだけで、既定の置換はしない。
