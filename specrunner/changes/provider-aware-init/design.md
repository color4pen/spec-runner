# Design: provider-aware-init

## Context

specrunner のステップモデルは config 不在時、各 step 定義のハードコード値に解決される
（design は `claude-opus-4-6[1m]`、他は `claude-sonnet-4-6`）。`specrunner init` が生成する
scaffold も `steps.defaults.model: "claude-sonnet-4-6"` を固定で書いており、provider 選択の
余地がない（`src/cli/init.ts:59-65`）。

run 時の provider 分岐は既に存在する。`DispatchingAgentRunner.run()`
（`src/adapter/dispatching/agent-runner.ts:27-39`）が `mergeModelRegistry` →
`resolveProvider(resolvedConfig.model, merged)` でモデル名から provider を引き、`"openai"` なら
`CodexAgentRunner` へ dispatch する。つまり config の `steps.defaults.model` に OpenAI モデルを
書けば全ステップが Codex で走る仕組みは既に動いている。欠けているのは「init が OpenAI 用の
scaffold を書く入口」だけである。

加えて model registry（`src/config/model-registry.ts:13-29` の `BUILTIN_MODEL_REGISTRY`）に
含まれる OpenAI モデルが現行 Codex CLI と drift している。`o3` / `gpt-5.1` / `gpt-5.2-codex` /
`gpt-5.3-codex` は deprecated で、現行は `gpt-5.5` / `gpt-5.4` / `gpt-5.4-mini` /
`gpt-5.3-codex-spark`。registry にないモデルは run 時に `resolveProvider` が `CONFIG_INVALID` を
投げ、`validateConfig`（`src/config/schema.ts`）も config に書かれたモデルを registry 照合する
ため、init が書く OpenAI デフォルトモデルは必ず registry に登録されていなければならない。

### 現状コードの不変条件（変更しないもの）

- 6-level step-config resolution chain（`src/config/step-config.ts`）— 本変更では一切変えない
- config-write-hygiene で導入済みの「グローバル config が存在すれば scaffold 生成をスキップ」
  挙動（`src/cli/init.ts:33-78`）— 維持する
- design step のハードコードデフォルト `DESIGN_AGENT_MODEL = "claude-opus-4-6[1m]"`
  （`src/core/step/design.ts:12`）— resolution chain レベル5 として残す

## Goals / Non-Goals

**Goals**:

- `specrunner init` に `--provider anthropic|openai` フラグを追加する（省略時 `anthropic`）
- provider に応じたデフォルトモデルを scaffold の `steps.defaults.model` / `steps.design.model`
  に展開する
- model registry から deprecated な OpenAI モデルを削除し、現行モデルを追加する
- init が書く OpenAI デフォルトモデルが registry に必ず存在することを構造的・テスト的に保証する

**Non-Goals**:

- `SpecRunnerConfig` への `provider` フィールド追加 — init が scaffold の `steps` に展開すれば足り、
  config への永続化は不要（resolution chain に provider 解決層を足す侵襲を避ける）
- preflight / doctor での provider チェック追加 — SDK 有無チェックは run 時の
  `loadOptionalProviderSdk()` が既に担う
- 各ステップのハードコードモデル定数の変更 — resolution chain レベル5 として残す
- `DEFAULT_ONE_SHOT_MODEL` の provider 対応 — one-shot query は別経路で対象外
- `MODEL_PRICING`（`src/core/usage/pricing.ts`）の更新 — 別 registry であり受け入れ基準外
  （Open Questions 参照）

## Decisions

### D1: init が scaffold の `steps` に provider デフォルトを展開する

config に `provider` フィールドを持たせず、init が `steps.defaults.model` と（OpenAI 時のみ）
`steps.design.model` に直接モデル名を書く。run 時の解決は既存の resolution chain →
`DispatchingAgentRunner` がそのまま担う。

**Rationale**: provider 概念を resolution chain に持ち込むと、6-level chain に provider 解決層を
足す侵襲が発生する。init で scaffold に書くだけで同じ実効値が得られ、chain を一切変えずに済む
（最小侵襲）。run 時 dispatch（`resolveProvider`）は init の変更と独立しており、provider 分岐は
init の scaffold 生成 1 箇所（テーブル lookup）に閉じる。

**Alternatives considered**:

- config に `provider` フィールドを追加し resolution に provider 層を足す — chain 改変の侵襲が
  大きく、scaffold 展開と同じ効果しか生まない。却下。

### D2: provider デフォルトを `model-registry.ts` の `PROVIDER_DEFAULTS` テーブルで表現する

provider → デフォルトモデルの対応表を新定数 `PROVIDER_DEFAULTS` として
`src/config/model-registry.ts` に追加する。`Provider` 型・`BUILTIN_MODEL_REGISTRY` と同一ファイル
に凝集させ、新ファイルは作らない。

| 役割 | anthropic | openai |
|---|---|---|
| design（高品質） | `claude-opus-4-6[1m]` | `gpt-5.5` |
| その他全ステップ（defaults） | `claude-sonnet-4-6` | `gpt-5.4-mini` |

**Rationale**: provider デフォルトは「どのモデルがどの provider か」という registry の知識と
不可分であり、同一ファイルに置くのが凝集として正しい。`src/cli/init.ts`（composition-root）は
このテーブルを参照するだけ（composition-root → shared-kernel 参照は DSM 許可済み）。
`src/config/step-config.ts`（shared-kernel）は provider 概念を持たない分離を維持し、変更不要。

**Alternatives considered**:

- init.ts 内にテーブルを置く — provider↔モデルの対応が registry と離れ、registry 更新時に
  drift する。却下。

### D3: anthropic 時は `steps.design` を scaffold に書かない（legacy byte 一致を優先）

OpenAI 時は `steps.defaults.model` と `steps.design.model` の両方を書く。anthropic 時は
`steps.defaults.model` のみを書き、`steps.design` キーは書かない。この非対称を `PROVIDER_DEFAULTS`
の構造（`design` を anthropic では省略可能フィールドとして持たない／持つ）で表現し、init 側に
provider 名の `if` 分岐を作らない。

**Rationale**: 受け入れ基準は「`init --provider anthropic` / フラグなしで生成された config が
**従来と同一**」を要求する。従来の scaffold は `steps.design` を書いていないため、anthropic で
`steps.design.model: "claude-opus-4-6[1m]"` を書くと config 形状が従来と乖離する。一方、その値は
design step のハードコードデフォルト（`DESIGN_AGENT_MODEL`）と一致するため、書かなくても
resolution chain レベル5 で同一の実効値 `claude-opus-4-6[1m]` に解決される。よって anthropic の
design は「書かない」が正しく、request 要件2のテーブルが示す『design は高品質モデル』という意図は
解決値レベルで保たれる。OpenAI の design（`gpt-5.5`）はハードコードと異なるため明示的に書く必要が
ある。

**Alternatives considered**:

- 両 provider で常に `steps.defaults` と `steps.design` を書く（対称テーブル） — anthropic config
  が従来形状から乖離し受け入れ基準「従来と同一」に反する。さらに将来 `DESIGN_AGENT_MODEL` を
  更新したとき scaffold が旧値で固定され forward-compat を失う。却下。

### D4: model registry の OpenAI モデルを現行 Codex セットへ更新する

`BUILTIN_MODEL_REGISTRY` の OpenAI エントリを以下へ更新する。anthropic エントリは変更しない。

- 削除: `o3`, `gpt-5.1`, `gpt-5.2-codex`, `gpt-5.3-codex`
- 追加: `gpt-5.4-mini`, `gpt-5.3-codex-spark`
- 維持: `gpt-5.4`, `gpt-5.5`

**Rationale**: deprecated モデルは Codex CLI で利用不可。`PROVIDER_DEFAULTS` が openai に書く
`gpt-5.4-mini` / `gpt-5.5` が registry に存在しないと run 時に `resolveProvider` が `CONFIG_INVALID`
を投げ、`init --provider openai → run` が成立しない。registry 更新と PROVIDER_DEFAULTS は同一
不変条件（init が書くモデルは必ず registry に存在する）で結ばれる。

**Alternatives considered**: なし（request で削除/追加リスト確定済み）。

### D5: `--provider` の enum 検証は flag-parser に委譲する

command-registry の init エントリに `provider: { type: "string", values: ["anthropic", "openai"] }`
を追加する。値域チェックは `parseFlags`（`src/cli/flag-parser.ts:116-121`）が既に enum 検証して
`FlagParseError` を投げるため、`runInit` 側で再検証しない。

**Rationale**: login が既に同名フラグ `provider`（`values: ["github", "claude"]`、`command-registry.ts:260`）
を持つが、コマンド単位の独立した `FlagDef` であり値域が衝突しても問題ない（同名・別意味）。
検証を flag-parser に一本化することで init.ts に防御コードを散らさない。

## Risks / Trade-offs

- [Risk] deprecated モデル削除の波及がテストに広く及ぶ。`o3` は registry テストだけでなく
  `tests/config/schema.test.ts`（local/managed バリデーション、3 箇所）/
  `tests/adapter/dispatching/agent-runner.test.ts`（dispatch ルーティング）/
  `tests/core/doctor/checks/runtime/codex-cli.test.ts`（codex CLI 検出、3 箇所）でも「有効な
  OpenAI モデル」のフィクスチャとして使われている。削除すると `validateConfig` が
  「not in the model registry」を投げ、doctor は openai step を検出できなくなる。
  → Mitigation: tasks T-04 でこれら全フィクスチャを現行 OpenAI モデル（`gpt-5.4-mini`）へ置換する。
  request の module-architect レビューは `model-registry.test.ts:29` のみを挙げていたが、実際の
  blast radius はより広い（本 design で全箇所を列挙済み）。

- [Risk] `init --provider anthropic` を「従来と同一」とする解釈が、request 要件2のテーブル
  （anthropic design = `claude-opus-4-6[1m]`）と表面上ズレる。
  → Mitigation: D3 のとおり「書かない＝解決値は同一」で意図を満たす。design.md と spec.md に
  明記し、テストは anthropic 時に `steps.design` が未定義であることを検査する。

- [Trade-off] 新 OpenAI モデル（`gpt-5.4-mini` / `gpt-5.3-codex-spark`）は `MODEL_PRICING` に
  エントリがないため、openai 実行時の usage コストは `computeCostUsd` が `null`（コスト不明）を
  返す。`lookupPricing`/`computeCostUsd` は未登録モデルで graceful に `null` を返すため
  クラッシュはしない（`src/core/usage/pricing.ts:179-196`）。run 自体は成立する。

## Open Questions

- `MODEL_PRICING` に `gpt-5.4-mini` / `gpt-5.3-codex-spark` を追加すべきか。受け入れ基準・スコープ
  外リストのいずれも pricing に言及しておらず、未追加でも run は成立する（コストが `null` 表示に
  なるのみ）。一方、`gpt-5.4-mini` は openai のデフォルトモデルになるため、コスト telemetry が
  空になるのは品質ギャップではある。正確な mini 価格の公開値を持たないため、本変更では pricing を
  対象外とし（推測値の混入を避ける）、別 issue で扱うことを推奨する。実装者は pricing.ts を
  編集しないこと。
