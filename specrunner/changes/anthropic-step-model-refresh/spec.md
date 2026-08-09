# Spec: Anthropic step 既定モデルの世代更新

## Requirements

### Requirement: 非 design step の built-in 既定モデルは claude-sonnet-5 である

design 以外のすべての anthropic step の built-in default model は `claude-sonnet-5`
であること。step 定義の agent.model は、config で明示上書きされない限り、この値を
SHALL 解決する。

#### Scenario: config 無しで test-case-gen step の既定モデルが解決される

**Given** `.specrunner/config.json` に step model の上書きが無い
**When** `TestCaseGenStep.agent.model` を参照する
**Then** 値は `claude-sonnet-5` である

#### Scenario: 全 13 step の built-in 既定が同一世代である

**Given** 非 design step（test-case-gen / build-fixer / code-fixer / adr-gen / spec-fixer /
implementer / custom-reviewer / conformance / spec-review / request-review / test-materialize /
regression-gate / code-review）の built-in default const
**When** 各 const を参照する
**Then** すべて `claude-sonnet-5` であり、旧世代 `claude-sonnet-4-6` は残らない

### Requirement: design step の built-in 既定モデルは claude-opus-5 である（[1m] を付けない）

design step の built-in default model は `claude-opus-5` であること。`claude-opus-5` は
1M context がデフォルトで `[1m]` SKU 区別が存在しないため、モデル名に `[1m]` サフィックスを
付けては MUST NOT。

#### Scenario: design step の既定モデルが claude-opus-5 に解決される

**Given** config に design step model の上書きが無い
**When** design step の built-in default model を参照する
**Then** 値は `claude-opus-5` であり、`claude-opus-4-6[1m]` でも `claude-opus-5[1m]` でもない

### Requirement: anthropic init scaffold は claude-sonnet-5 を書き出し steps.design を省略する

`specrunner init`（provider: anthropic、既存 config 無し）は `steps.defaults.model` に
`claude-sonnet-5` を書き出すこと。`PROVIDER_DEFAULTS.anthropic.designModel` は省略され、
design step は built-in 既定へ委譲するため、scaffold は `steps.design` block を出力しては
MUST NOT。

#### Scenario: 新規 anthropic scaffold が sonnet-5 を書き既存の design block を持たない

**Given** 対象リポジトリに specrunner config が存在しない
**When** provider: anthropic で `runInit` を実行する
**Then** 生成 config の `steps.defaults.model` は `claude-sonnet-5` であり、
`steps.design` は undefined である

#### Scenario: 既存 config は init で上書きされない

**Given** `steps.defaults.model` が `claude-sonnet-4-6` の config が既に存在する
**When** `runInit` を実行する（provider flag の有無を問わず）
**Then** `steps.defaults.model` は `claude-sonnet-4-6` のまま保全され、書き換わらない

### Requirement: one-shot query の fallback モデルは claude-sonnet-5 である

config 解決チェーンがモデルを yield しないときの one-shot fallback（`DEFAULT_ONE_SHOT_MODEL`）
は `claude-sonnet-5` であること。この既定は registry 既定と同一世代であるべき（SHALL）。

#### Scenario: config でモデル未指定の one-shot query が sonnet-5 を使う

**Given** config.steps.defaults.model も opts.model も指定されていない
**When** one-shot query が fallback model を解決する
**Then** 値は `claude-sonnet-5` である

### Requirement: 新既定モデルは registry で解決可能でなければならない

すべての新既定モデル名（`claude-sonnet-5` / `claude-opus-5`）は、dispatch 時の
`resolveProvider` が `CONFIG_INVALID` を throw せずに provider `anthropic` を返せる状態で
なければならない（MUST）。同時に、旧モデル key は registry から削除されず解決可能なまま
残ること。

#### Scenario: 新既定モデルが provider anthropic に解決される

**Given** merged model registry
**When** `resolveProvider("claude-sonnet-5", merged)` および
`resolveProvider("claude-opus-5", merged)` を呼ぶ
**Then** いずれも例外なく `"anthropic"` を返す

#### Scenario: 旧モデル key も解決可能なまま残る

**Given** merged model registry
**When** `resolveProvider("claude-sonnet-4-6", merged)` を呼ぶ
**Then** 例外なく `"anthropic"` を返す（backward-compat のため旧 key は削除されない）
