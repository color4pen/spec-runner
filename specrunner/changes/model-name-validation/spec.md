# Spec: 実効モデル名を SDK の supportedModels() で実在検証する

## Requirements

### Requirement: 実効モデルは composed pipeline の解決後モデルから収集される

システムは、composed pipeline の各 AgentStep について、現在の request type で
`getStepExecutionConfig()` により解決した**実効モデル**を収集 SHALL する。この収集は custom reviewer の
snapshot 由来モデルと regression-gate の動的注入モデルを含み、ファイル上の定数列挙 MUST NOT に依らない。

#### Scenario: custom reviewer と regression-gate の実効モデルが収集される

**Given** custom reviewer step（snapshot.model 指定）と regression-gate step を含む composed descriptor と、request type
**When** システムが実効モデルを収集する
**Then** custom reviewer の実効モデルは `snapshot.model ?? DEFAULT_REVIEW_MODEL`（snapshot.model 未設定時は
`DEFAULT_REVIEW_MODEL`（`claude-sonnet-5`）にフォールバック）、regression-gate の実効モデルは `claude-sonnet-5` として
収集結果に含まれ、各エントリは step 名と config path を持つ

#### Scenario: config の byRequestType override が実効モデルに反映される

**Given** `steps.code-review.byRequestType.new-feature.model` を上書きした config と request type `new-feature`
**When** システムが code-review step の実効モデルを収集する
**Then** 収集結果の code-review の実効モデルは上書き後の値になる

### Requirement: OpenAI provider のモデルは live 照合の対象外である

システムは、`supportedModels()` との実在照合を `provider === "anthropic"` のモデルに限定 SHALL する。
`provider === "openai"` のモデルは一覧に現れないため照合対象から除外 MUST し、false positive を発生させない。

#### Scenario: OpenAI モデルは一覧に無くても未知として扱われない

**Given** 実効モデルに `provider === "openai"` のモデル（例 `gpt-5.5`）が含まれ、それが SDK の supportedModels 一覧に無い
**When** システムが実在照合を行う
**Then** 当該 OpenAI モデルは未知（invalid）として報告されず、照合結果に影響しない

### Requirement: 未知 Anthropic モデルは job 開始前に CONFIG_INVALID で停止する

システムは、一覧取得成功かつ実効 Anthropic モデルが supportedModels 一覧に存在しない場合、job 開始前に
`CONFIG_INVALID` として停止 SHALL し、対象の step 名と config path を報告 MUST する。停止時点で job state は
作成されない。

#### Scenario: 腐った Anthropic model ID で job 開始前に停止する

**Given** 実効 Anthropic モデルに supportedModels 一覧へ存在しない ID が含まれ、runtime が local
**When** システムが local job preflight で実在照合を行う
**Then** `CONFIG_INVALID` エラーで停止し、エラーメッセージに当該 step 名と config path が含まれ、job state は作成されない

### Requirement: 一覧取得失敗時は warning を出して検証を skip し job を継続する

システムは、supportedModels 一覧の取得に失敗した場合（offline / auth 未設定 / SDK unavailable / timeout）、
warning を出力して実在検証を skip SHALL し、job を継続 MUST する。

#### Scenario: offline で一覧取得に失敗しても job は継続する

**Given** SDK の一覧取得が失敗する（unavailable）状況で runtime が local
**When** システムが local job preflight で実在照合を試みる
**Then** `CONFIG_INVALID` を throw せず warning を出力し、pipeline は job 開始へ継続する

### Requirement: 検証は local runtime に限定される

システムは、実在検証を `runtime === "local"` の実行に限定 SHALL する。managed runtime は configured model を
実行に使わないため検証対象外 MUST とする。

#### Scenario: managed runtime では実在検証が行われない

**Given** model 一覧取得の capability を持たない runtime（managed 相当）
**When** システムが preflight を実行する
**Then** SDK 一覧取得は起動されず、実在検証は行われない（job は継続する）

### Requirement: alias 3 種は静的検証・provider 解決・live 検証の全経路を pass する

システムは、`sonnet` / `opus` / `haiku` の 3 alias を Anthropic モデルとして組み込み registry に登録 SHALL し、
静的検証（validateConfig）・provider 解決・live 検証のすべてで pass させる MUST。live 検証では alias は実在扱い
とし、解決は SDK 側の責務とする。既定モデルの alias への置換は行わない。

#### Scenario: alias が静的検証と provider 解決を pass する

**Given** step model に `sonnet` / `opus` / `haiku` を設定した config
**When** システムが validateConfig と provider 解決を行う
**Then** CONFIG_INVALID を投げず受理し、provider は `anthropic` に解決される

#### Scenario: alias は live 検証で実在扱いされる

**Given** 実効 Anthropic モデルに alias（`sonnet` 等）が含まれ、supportedModels 一覧がその alias を含まない
**When** システムが実在照合を行う
**Then** 当該 alias は未知として報告されず、照合を pass する

### Requirement: SDK session / subprocess は全経路で後始末される

システムは、実在検証の成功・取得失敗・timeout のすべての経路において、起動した SDK session および
bundled CLI subprocess を残さない SHALL。session は abort と close により確実に終了 MUST される。

#### Scenario: 取得成功後に session が閉じられる

**Given** SDK 一覧取得が成功する
**When** システムが一覧取得を完了する
**Then** 起動した Query session は abort / close され、subprocess が残らない

#### Scenario: timeout 経路でも session が閉じられる

**Given** SDK 一覧取得が timeout する
**When** timeout が発火する
**Then** session は abort / close され、`unavailable` が返り、subprocess が残らない
