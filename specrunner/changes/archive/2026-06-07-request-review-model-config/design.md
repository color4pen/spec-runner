# Design: `specrunner request review` に `--model` フラグを追加する

## Context

`specrunner request review` のモデル選択は、現状 config の解決チェーン（`getStepExecutionConfig`）に
完全に委ねられている。実際の解決フローは次のとおり:

```
CLI request review handler (src/cli/command-registry.ts:276)
  → executeReview(filePath, { json }, client, slug)       (src/core/command/request-review.ts:42)
    → runReview(content, cwd, client)                      (src/core/request/reviewer.ts:191)
      → client.run({ ..., stepName: "request-review", model: "claude-opus-4-5" })
        → queryOneShot(opts, config)                       (src/adapter/claude-code/query-one-shot.ts:88)
          → resolvedConfig = getStepExecutionConfig(
                config, "request-review",
                { model: opts.model ?? "claude-sonnet-4-5", ... })   (query-one-shot.ts:96)
          → SDK query({ ..., model: resolvedConfig.model })          (query-one-shot.ts:123)
```

ここで重要なのは、`runReview` が渡す `model: "claude-opus-4-5"`（`reviewer.ts:213`）が
**`getStepExecutionConfig` の `stepDefaults.model`（解決チェーンの第 5 レベル＝最下位）** として注入される点である。
つまりコード定数 `claude-opus-4-5` は最下位のフォールバックでしかなく、config の
`steps["request-review"].model` 等（第 1〜4 レベル）が存在すればそれが優先される。

このため、CLI から一時的に別モデルを試すには config ファイル（`~/.config/specrunner/config.json` または
`<repo>/.specrunner/config.json`）を編集するしかなく、使い捨ての試行に対して手間が大きい。

### 制約: なぜ既存の `model` フィールドを流用できないか

`OneShotQueryOptions.model`（`src/core/port/one-shot-query-client.ts:33`）は
**解決チェーンの stepDefaults（最下位）** として消費される。ここに `--model` の値を流し込んでも、
config の第 1〜4 レベルがあれば上書きされてしまい、要件「config の解決チェーンより優先」を満たせない。
よって `--model` の値は、解決チェーンを**通過した後**の `resolvedConfig.model` を上書きする
別経路で渡す必要がある（architect 評価済みの設計判断と一致）。

### request review が `requestType` を持たないこと

pipeline step は `requestType` を持ち、`config.steps[...].byRequestType[requestType]` による
type 別注入が効く。しかし `request review` は pipeline を介さない stateless one-shot コマンドで
`requestType` を渡しておらず（`runReview` は `getStepExecutionConfig` に requestType を渡さない）、
byRequestType ベースの注入は機能しない。したがって `--model` は requestType に依存しない
単純な最優先オーバーライドとして実装する。

## Goals / Non-Goals

**Goals**:

- `specrunner request review` に `--model <model-name>` フラグ（string、enum 制約なし）を追加する。
- `--model` 指定時、config の解決チェーン（第 1〜6 レベル）で決まる `resolvedConfig.model` を
  上書きし、その値を最優先でモデルとして使う。
- `--model` 未指定時は、既存の解決チェーン挙動（config → defaults → コード定数 `claude-opus-4-5`）を
  完全に維持する（回帰なし）。

**Non-Goals**:

- `getStepExecutionConfig` / 解決チェーン自体の変更（スコープ外）。
- pipeline step（implementer / code-review 等）への `--model` フラグ追加（スコープ外）。
- `request generate` / watch 等、他の one-shot コマンドへの `--model` 追加（本変更は review のみ）。
- managed runtime のモデル指定（managed は事前登録済モデルを使うため `model` は無視される。本変更は
  local runtime の queryOneShot 経路のみに作用する）。

## Decisions

### D1: オーバーライドは「解決チェーン通過後」に適用する専用フィールドで渡す

`queryOneShot` の options に新フィールド `modelOverride?: string` を追加し、
`getStepExecutionConfig` で `resolvedConfig` を算出した**後**に適用する:

```ts
const resolvedConfig = getStepExecutionConfig(config, opts.stepName ?? "one-shot", {
  model: opts.model ?? "claude-sonnet-4-5",
  maxTurns: opts.maxTurns,
  timeoutMs: opts.timeoutMs,
});
const effectiveModel = opts.modelOverride ?? resolvedConfig.model;
// SDK query options の model に effectiveModel を渡す
```

- **Rationale**: 要件 2「config の解決チェーンより優先」を満たすには、チェーンを通過した最終値
  （`resolvedConfig.model`）を上書きする必要がある。`modelOverride` は解決の**後段**で適用されるため、
  config（第 1〜4 レベル）・stepDefaults（第 5 レベル）・SDK デフォルト（第 6 レベル）すべてに勝つ。
  `getStepExecutionConfig` には一切手を入れないため、Non-Goal「解決チェーン自体の変更」を侵さない。
  architect 評価済みの「`resolvedConfig.model` を上書きする形で渡す」と一致。
- **Alternatives considered**:
  - (a) 既存 `model` フィールドに `--model` 値を流す — `model` は stepDefaults（最下位）として消費されるため、
    config があれば上書きされ要件 2 を満たせない。不採用。
  - (b) `getStepExecutionConfig` に「最優先オーバーライド」引数を足す — 解決チェーン本体の変更にあたり
    スコープ外。pipeline step 経路にも影響が波及し、本変更の局所性を壊す。不採用。
  - (c) `runReview` 側で `resolvedConfig` を再現してオーバーライドする — 解決ロジックが adapter の
    `queryOneShot` 内にあるため core 側で再現すると二重実装になり DRY 違反。不採用。

### D2: `--model` の値は CLI → executeReview → runReview → client.run の経路で透過的に伝播する

新フィールド `modelOverride` を以下の各層の options に追加し、上流から下流へ素通しで渡す:

| 層 | ファイル | 変更 |
|----|---------|------|
| Port | `src/core/port/one-shot-query-client.ts` | `OneShotQueryOptions` に `modelOverride?: string` 追加 |
| Adapter | `src/adapter/claude-code/query-one-shot.ts` | `QueryOneShotOptions` に `modelOverride?: string` 追加 + D1 の適用 |
| Core (reviewer) | `src/core/request/reviewer.ts` | `runReview(content, cwd, client, modelOverride?)` 引数追加、`client.run` に透過 |
| Core (command) | `src/core/command/request-review.ts` | `executeReview` の opts に `model?: string` 追加、`runReview` に透過 |
| CLI | `src/cli/command-registry.ts` | `review` の flags に `model: { type: "string" }` 追加、handler で opts に渡す |

- **Rationale**: 各層は値を加工せず透過するだけ（変換・分岐なし）。`ClaudeCodeOneShotQueryClient.run` は
  `queryOneShot(opts, config)` に opts をそのまま渡す薄いラッパなので、port に field を足せば adapter まで
  自動的に届く。新しい抽象を増やさず、既存の options-透過パターンに乗せる。
- **Alternatives considered**: グローバル flag 化 — `--model` は review コマンド固有の機能であり、
  command 単位の flag 定義に留める（pipeline step への波及は Non-Goal）。不採用。

### D3: stepDefaults の `claude-opus-4-5` は不変に保つ

`runReview` が `client.run` に渡す `model: "claude-opus-4-5"`（stepDefaults）は変更しない。
`modelOverride` は別フィールドとして並走し、未指定時（`undefined`）は `?? resolvedConfig.model` で
何も上書きしない。

- **Rationale**: 要件 3「`--model` 未指定時は既存挙動を維持」を満たす。`modelOverride` が `undefined` の
  ときは `effectiveModel === resolvedConfig.model` となり、解決チェーンの結果がそのまま使われる。
  既存テスト（query-one-shot.test.ts / reviewer.test.ts）の前提も不変。

### D4: CLI 境界で空値を未指定として正規化する

CLI handler で `--model` の値が空文字 / 空白のみの場合は `undefined`（未指定）として扱う:

```ts
const modelFlag = parsed.flags["model"];
const model = typeof modelFlag === "string" && modelFlag.trim() !== "" ? modelFlag : undefined;
```

- **Rationale**: `opts.modelOverride ?? resolvedConfig.model` は空文字を「指定あり」と解釈する（`""` は
  nullish でない）ため、空モデル名が SDK に渡る degenerate ケースを CLI 境界で潰す。flag parser は
  `--model ""` のような明示的空値を通しうる（`flag-parser.ts:96`）ため、入口で正規化するのが最も局所的。
- **Alternatives considered**: queryOneShot 内で空値を弾く — 正規化責務を adapter 深部に置くより、
  raw 入力が入る CLI 境界に置くほうが責務が明確。不採用。

## Risks / Trade-offs

- [Risk] `modelOverride` を既存 `model` フィールドと混同して stepDefaults 経路に流すと、要件 2
  （config より優先）が満たせない。
  → Mitigation: D1 のとおり `modelOverride` は `getStepExecutionConfig` の**後**に適用すると design で固定。
    T-04 のテストで「config に request-review.model がある状態でも `--model` が勝つ」ことを assert。
- [Risk] 透過経路（port → adapter → reviewer → command → CLI）のどこかで field を渡し忘れると、
  `--model` が黙って無視される（エラーにならない静かな失敗）。
  → Mitigation: T-04 で「CLI から `--model` を渡すと `queryOneShot` の SDK options に届く」ことと、
    「`runReview` が `client.run` に modelOverride を渡す」ことを経路ごとに検証。
- [Risk] `--model` 未指定時の挙動が回帰する。
  → Mitigation: D3 のとおり stepDefaults を不変に保ち、`modelOverride` 未指定時は no-op。既存
    query-one-shot / reviewer テストを維持し、T-04 で未指定時に `resolvedConfig.model` が使われることを assert。

## Open Questions

なし（ブロッキングなし）。`--model` の値はモデル識別子の自由文字列として扱い（enum 制約なし）、
存在しないモデル名を渡した場合の挙動は SDK のエラーに委ねる（CLI 側では検証しない）。
