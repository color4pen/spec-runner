# Spec: 設計レイヤ CLI（aozu）受け口の結線

## Requirements

### Requirement: 無効（既定）のとき aozu を一切 spawn しない

`designLayer.enabled` が `true` でない（不在含む）とき、システムは aozu を一切 spawn してはならない（MUST NOT）。入口ゲート・出口 hook・doctor check のすべてが即座に no-op となり、既存の `run` preflight / `request validate` / `job archive` / `doctor` の挙動を完全に保存しなければならない（MUST）。

#### Scenario: 既定 config で validate が spawn しない

**Given** `.specrunner/config.json` に `designLayer` セクションが無い
**When** `request validate <valid request.md>` を実行する
**Then** aozu コマンドは spawn されず、終了コードは既存挙動どおり 0 である

#### Scenario: 既定 config で preflight が spawn しない

**Given** `designLayer.enabled` が未設定の config
**When** `run` の `runPreflight` が実行される
**Then** aozu コマンドは spawn されず、preflight は既存どおり完了する

#### Scenario: 既定 config で archive が spawn しない

**Given** `designLayer.enabled` が未設定の config
**When** `job archive` の archive orchestrator が feature ブランチに記録する
**Then** `aozu mark implemented` は spawn されず、archive コミットは既存どおり生成される

### Requirement: 有効時、引用が解決しない request を入口で不合格にする

`designLayer.enabled` が `true` のとき、システムは request 検証で `<command> check --request <path>` を spawn しなければならない（MUST）。aozu が非 0 で終了したとき、`request validate` と `run` の preflight はいずれも不合格として扱わなければならず（MUST）、aozu の stderr 診断を利用者向け出力へ透過しなければならない（MUST）。

#### Scenario: validate が exit 1 の request を不合格にする

**Given** `designLayer.enabled: true` の config と、fake aozu が exit 1 + stderr 診断を返す設定
**When** `request validate <request.md>` を実行する
**Then** 終了コードは非 0 であり、出力に aozu の stderr 診断が含まれる

#### Scenario: preflight が exit 1 の request を不合格にする

**Given** `designLayer.enabled: true` の config と、fake aozu が exit 1 + stderr 診断を返す設定
**When** `run` の `runPreflight` が `parseRequestMd` 直後にゲートを実行する
**Then** `SpecRunnerError` が throw され、run は非 0 で中断し、aozu の診断が出力に含まれる

### Requirement: 有効時、合格 request は従来どおり進行する

`designLayer.enabled` が `true` で、`<command> check --request` が exit 0 を返すとき、システムはゲートを通過させ、後続処理（preflight の残り / validate の成功）を従来どおり継続しなければならない（MUST）。

#### Scenario: 合格 request で validate が成功する

**Given** `designLayer.enabled: true` の config と、fake aozu が exit 0 を返す設定
**When** `request validate <request.md>` を実行する
**Then** 終了コードは 0 であり、追加のエラー出力は無い

#### Scenario: 合格 request で preflight が継続する

**Given** `designLayer.enabled: true` の config と、fake aozu が exit 0 を返す設定
**When** `runPreflight` がゲートを実行する
**Then** ゲートは通過し、preflight は `PreflightResult` を返して完了する

### Requirement: `--require-citation` を config 列挙 type にのみ付与する

システムは、`requestType` が `designLayer.requireCitationTypes` に含まれるときにのみ `check` 呼び出しへ `--require-citation` を付与しなければならず（MUST）、非列挙 type には付与してはならない（MUST NOT）。

#### Scenario: 列挙 type で --require-citation が付く

**Given** `designLayer.requireCitationTypes: ["new-feature"]` の config
**When** `new-feature` type の request でゲートを実行する
**Then** spawn された aozu の引数に `--require-citation` が含まれる

#### Scenario: 非列挙 type で --require-citation が付かない

**Given** `designLayer.requireCitationTypes: ["new-feature"]` の config
**When** `bug-fix` type の request でゲートを実行する
**Then** spawn された aozu の引数に `--require-citation` は含まれない

### Requirement: 出口 hook が mark implemented を worktree 内で実行し archive コミットに含める

`designLayer.enabled` が `true` のとき、システムは archive フェーズで feature ブランチ上に archive コミットを記録する時点で、worktree（recordDir）内で `<command> mark implemented --request <slug> [--pr <n>]` を実行しなければならない（MUST）。exit 0 のとき、生じた設計側 state 変更を feature ブランチの archive コミットに含めて push しなければならない（MUST）。システムは base ブランチへ直接コミット / push してはならない（MUST NOT）。PR 番号は job state の `pullRequest.number` から解決し、存在するときのみ `--pr` を付与する（MUST）。

#### Scenario: mark の書いた state 変更が archive コミットに含まれる

**Given** `designLayer.enabled: true` の config と、`mark implemented` 実行時に recordDir へ state ファイルを書き exit 0 を返す fake、および PR 番号を持つ job state
**When** archive orchestrator が feature ブランチに記録する
**Then** `mark implemented --request <slug> --pr <n>` が recordDir で実行され、fake が書いた state ファイルの変更が feature ブランチの archive コミットに含まれる

### Requirement: mark の exit 1 は警告継続、exit 2 は失敗

システムは、`mark implemented` の exit 1（未知の slug）を警告に留めて archive を継続しなければならず（MUST）、exit 2（入力不正）では archive を失敗させなければならない（MUST）。

#### Scenario: exit 1 は archive を継続する

**Given** `designLayer.enabled: true` と、`mark implemented` が exit 1 を返す fake
**When** archive orchestrator が hook を実行する
**Then** 警告が出力され、archive は継続して成功する（exitCode 0）

#### Scenario: exit 2 は archive を失敗させる

**Given** `designLayer.enabled: true` と、`mark implemented` が exit 2 を返す fake
**When** archive orchestrator が hook を実行する
**Then** archive は escalation 付きで失敗する（exitCode 1）

### Requirement: doctor が結線有効かつ aozu 不在を検出する

`designLayer.enabled` が `true` のとき、doctor は `command`（既定 `aozu`）の presence を検証する check を実行しなければならない（MUST）。CLI が不在のとき check は fail を返さなければならず（MUST）、無効のとき check は spawn せず pass を返さなければならない（MUST）。

#### Scenario: 有効かつ不在で fail

**Given** `designLayer.enabled: true` の config と、aozu presence probe が reject する `execFile`
**When** doctor の aozu check を実行する
**Then** check の status は fail で、導入を促す hint を含む

#### Scenario: 無効で pass（spawn なし）

**Given** `designLayer.enabled` 未設定の config
**When** doctor の aozu check を実行する
**Then** check の status は pass で、`execFile` は呼ばれない

### Requirement: request テンプレに設計要素引用セクションを含める

`request template` の出力（および `buildScaffoldTemplate` を用いる `request new`）は、設計要素引用のための任意セクションを含まなければならない（MUST）。当該セクションは、この request が実装する設計要素の `[[id]]` を書く場所であることと、設計レイヤ未導入プロジェクトでは省略可であることを規約コメントで示さなければならない（MUST）。セクション追加後も request.md の validate は green を保たなければならない（MUST）。

#### Scenario: template 出力に引用セクションが含まれる

**Given** 任意の request type
**When** `request template --type <type>` を実行する
**Then** 出力に設計要素引用セクションの見出しと規約コメントが含まれる

#### Scenario: 引用セクションを含むテンプレが validate を通過する

**Given** `buildScaffoldTemplate` が生成した本文
**When** `parseRequestMdContent` で検証する
**Then** 例外は throw されず、type / slug / title が解決される
