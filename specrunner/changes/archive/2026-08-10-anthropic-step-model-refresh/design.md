# Design: Anthropic step 既定モデルの世代更新 (sonnet-4-6 → sonnet-5 / opus-4-6[1m] → opus-5)

## Context

pipeline の各 step は built-in default model を source-code const として持つ。現状は
非 design step 13 箇所が `"claude-sonnet-4-6"`、design step のみ `"claude-opus-4-6[1m]"`。
加えて `PROVIDER_DEFAULTS.anthropic.defaultModel`（`specrunner init` scaffold が
`steps.defaults.model` に書き出す値）と `DEFAULT_ONE_SHOT_MODEL`（one-shot query の
fallback）が旧世代を指す。

Claude 5 世代（`claude-sonnet-5` / `claude-opus-5`）は先行 request `model-catalog-refresh`
で `BUILTIN_MODEL_REGISTRY`・pricing に追加済み（attestation で確認済み）。本 change は
step 既定・scaffold 既定・one-shot 既定を新世代へ更新する、値差し替え中心の変更。

制約:
- step の model は dispatch 時に `src/adapter/dispatching/agent-runner.ts` の
  `resolveProvider` で registry 照合される。registry に無いモデル名を既定にすると
  `CONFIG_INVALID` が throw される。→ 本 change は `model-catalog-refresh` merge 後に
  のみ成立する（registry に `claude-sonnet-5` / `claude-opus-5` が存在することが前提）。
- 旧世代モデルは registry / pricing から**削除しない**。model-catalog-refresh は
  「追加」であり、`BUILTIN_MODEL_REGISTRY` と pricing 表には旧モデルの key が残る。
  historical usage の cost 計算・user config で旧モデルを pin しているケース・
  据え置く test fixture がいずれも旧 key の解決可能性に依存する。

## Goals / Non-Goals

**Goals**:
- 非 design step 13 箇所の built-in default を `"claude-sonnet-5"` に更新する。
- design step の built-in default を `"claude-opus-5"` に更新する（`[1m]` サフィックスなし）。
- `PROVIDER_DEFAULTS.anthropic.defaultModel` を `"claude-sonnet-5"` に更新する。
  `designModel` は引き続き省略し、design.ts built-in へ委譲する現行構造を維持する。
- `DEFAULT_ONE_SHOT_MODEL` を `"claude-sonnet-5"` に更新する。
- 更新対象 const に付随するコメント／scaffold 例中の旧モデル名を新世代に追随させる
  （設計根拠の文言は保持）。
- 旧既定値を pin する既存 3 テストの期待値のみ、意図的挙動変更への追随として更新する。

**Non-Goals**:
- step prompt（system 文）の Claude 5 向け再調整（別 request）。
- `BUILTIN_MODEL_REGISTRY` / pricing の変更（model-catalog-refresh 済み。旧 key は据え置き）。
- openai 側 step 既定・`PROVIDER_DEFAULTS.openai`（model-catalog-refresh 済み）。
- user config で明示指定されたモデル設定の移行。
- test fixture 内の明示モデル指定（`model: "claude-sonnet-4-6"` 等）の書き換え。

## Decisions

### D1: sonnet 系 13 箇所を一括で `claude-sonnet-5` に更新（段階移行しない）

既定値は「1 世代 1 値」を原則とする。step ごとに世代を混在させると usage 比較・
障害切り分けが複雑になる。

- **Rationale**: 全 step 一括のほうが挙動変化の観測が単純（切り分け対象が 1 変数）。
- **Alternatives considered**: 品質敏感 step（implementer / code-review 等）のみ先行 →
  却下。世代混在で cost / quality 回帰の帰属が困難になる。

対象 const（すべて `"claude-sonnet-4-6"` → `"claude-sonnet-5"`）:
`TEST_CASE_GEN_AGENT_MODEL` (test-case-gen.ts) /
`BUILD_FIXER_AGENT_MODEL` (build-fixer.ts) /
`CODE_FIXER_AGENT_MODEL` (code-fixer.ts) /
`ADR_GEN_AGENT_MODEL` (adr-gen.ts) /
`SPEC_FIXER_AGENT_MODEL` (spec-fixer.ts) /
`IMPLEMENTER_AGENT_MODEL` (implementer.ts) /
`DEFAULT_REVIEW_MODEL` (custom-reviewer.ts) /
`CONFORMANCE_AGENT_MODEL` (conformance.ts) /
`SPEC_REVIEW_AGENT_MODEL` (spec-review.ts) /
`REQUEST_REVIEW_AGENT_MODEL` (request-review.ts) /
`TEST_MATERIALIZE_AGENT_MODEL` (test-materialize.ts) /
`DEFAULT_REVIEW_MODEL` (regression-gate.ts) /
`CODE_REVIEW_AGENT_MODEL` (code-review.ts)。

### D2: design step は `claude-opus-5`（`[1m]` サフィックスを落とす）

- **Rationale**: `claude-opus-5` は 1M context がデフォルトで、`[1m]` の SKU 区別が
  存在しない（registry にも `claude-opus-5[1m]` エントリは無い — attestation で確認済み）。
  存在しない SKU 区別を持ち込まない。
- **Alternatives considered**: `claude-fable-5` → 却下。$10/$50 で opus-5 の 2 倍、かつ
  安全 classifier の refusal 経路が pipeline の escalation 設計と未整合。

### D3: `PROVIDER_DEFAULTS.anthropic.defaultModel` を更新、`designModel` は省略維持

`defaultModel` を `"claude-sonnet-5"` に更新する。`designModel` は引き続き省略し、
design step は design.ts の built-in default（D2 の `claude-opus-5`）に fall back する
現行構造を保つ。これにより anthropic scaffold は `steps.design` block を書かず、
legacy 互換（`steps.design` 不在）を維持する。

- **Rationale**: 委譲構造を保つと scaffold の byte 構造（`steps.design` block 不在）が
  変わらず、init 系 test の scaffold 形状 assert（`steps.design` toBeUndefined）が
  無変更で通る。
- **Alternatives considered**: `designModel: "claude-opus-5"` を明示追加 → 却下。
  scaffold に `steps.design` block を新規出力させ、legacy 互換 assert を壊す。
- 省略理由を説明するコメント（`model-registry.ts` の ProviderDefaults doc および
  `PROVIDER_DEFAULTS` 直上）内の旧モデル名 `claude-opus-4-6[1m]` を `claude-opus-5` に
  追随させる。

### D4: `DEFAULT_ONE_SHOT_MODEL` も同時更新

`"claude-sonnet-4-5"` → `"claude-sonnet-5"`。

- **Rationale**: one-shot query は小粒で単価影響が僅少。registry 既定と世代を揃え
  「既定は 1 世代」の原則を保つ。直接 assert する test は無い。
- **Alternatives considered**: sonnet-4-5 のまま据え置き → 却下。既定に旧世代が 1 つ
  残ると「1 世代 1 値」原則が崩れ、one-shot だけ別世代という説明困難な混在になる。

### D5: 周辺コメント／scaffold 例の追随（設計根拠は保持）

更新対象 const・定義に付随する旧モデル名のみを新世代へ追随させ、根拠文言は保持する。

- **Rationale**: コメントは近接コードを説明する。旧モデル名を残すとコードと不整合になり、
  かつ受け入れ基準の grep（D6）に引っかかる。設計根拠（「Opus is overkill」等）は
  モデル世代に依らず有効なので保持する。
- **Alternatives considered**: コメントを触らず const のみ更新 → 却下。stale コメントが
  残り grep 基準を満たせない。

対象:
- `src/cli/init.ts:117` コメント: `claude-opus-4-6[1m]` → `claude-opus-5`。
- `src/core/step/test-case-gen.ts:21` Design D2 注記: `claude-sonnet-4-6` → `claude-sonnet-5`
  （「design-reading task; Opus is overkill」の根拠は維持）。
- `src/core/command/reviewers-new.ts:25` scaffold 例: `# model: claude-sonnet-4-6` →
  `# model: claude-sonnet-5`。
- `src/config/model-registry.ts` の 2 箇所のコメント（D3）。

### D6: 旧モデル key は registry / pricing に据え置く → grep 受け入れ基準を default/コメント範囲に精緻化

`BUILTIN_MODEL_REGISTRY` の `claude-opus-4-6[1m]` / `claude-sonnet-4-6` / `claude-sonnet-4-5`
key（model-registry.ts の registry リテラル 3 行）は**削除しない**（Non-Goal / backward-compat）。

したがって受け入れ基準の「`src/config/` に旧モデル文字列が残存しないこと」は、
**registry の key リテラルを除外**し、default 定数・one-shot 定数・コメントに旧モデル名が
残らないことを検証する意図として解釈する。検証コマンドは T-06 に明示する。
`src/core/step/` と `src/core/command/`（fixture を除く）は完全に旧文字列ゼロになる。

- **Rationale**: 基準の literal 解釈は Non-Goal（registry 不変）と衝突し充足不能。
  基準の趣旨は「stale な既定参照・コメントの掃討」であり、registry の既知モデル一覧は
  正当に残る定義。
- **Alternatives considered**: registry の旧 key も削除して grep を literal に満たす →
  却下。scope 外であり、pricing の historical cost 計算・旧モデルを pin した config /
  fixture の `resolveProvider` を `CONFIG_INVALID` で壊す。

### D7: test 期待値の更新は fresh-scaffold 出力のみ。preserve 系 test の期待値は据え置く

旧既定値を pin する 3 ファイルの**期待値のみ**更新する:
- `tests/config/model-registry.test.ts`: `PROVIDER_DEFAULTS.anthropic.defaultModel` の
  assert（および同 `it` の description 文字列）を `claude-sonnet-5` に。
- `tests/init.test.ts`: **fresh scaffold 出力の expectation のみ** — 現行行 40 / 102 /
  499 / 514。
- `tests/test-case-gen-step.test.ts`: `TestCaseGenStep.agent.model` の assert（および
  `it` の description 文字列）を `claude-sonnet-5` に。

**据え置く（変更しない）**:
- input fixture（existingConfig）行: init.test.ts 現行行 159 / 236 / 363 / 527。
- `tests/init.test.ts` の「provider flag ignored（既存 config を上書きしない）」test の
  期待値（現行行 539）。この期待値は同 test の input fixture（現行行 527、旧モデルのまま
  据え置き）と**一致していなければならない**。fixture を旧モデルで据え置く以上、期待値も
  旧モデルで据え置く。ここを新モデルに変えると「上書きしない」検証が内部矛盾で fail する。

- **Rationale**: fresh scaffold の期待値は新 `defaultModel`（D3）が駆動するため追随が必要。
  preserve 系は「明示 fixture が既定に勝つ／既存 config を保全する」ことを検証しており、
  期待値＝据え置き fixture 値。
- **Alternatives considered**: attestation が列挙する全期待値（行 539 含む）を一括更新 →
  却下。行 539 は preserve test の期待値で、据え置き fixture 527 と等しくあるべき。
  更新すると build が赤化する。attestation の行 539 列挙は出現箇所の記録であり
  「更新せよ」の指示ではない。行番号でなく test 意味で判定する。
- **Note**: attestation / request 本文の行番号（例 497/512/537 対 499/514/539）は drift
  している。実装は**行番号でなく内容・test 意味**で locate すること。

## Risks / Trade-offs

- **[Risk] 新既定名が registry 未登録だと dispatch 時に `CONFIG_INVALID` throw** →
  Mitigation: 本 change は model-catalog-refresh merge を前提（attestation で
  `claude-sonnet-5` / `claude-opus-5` の registry 登録・`claude-opus-5[1m]` 不在を確認済み）。
  T-06 で typecheck && test green を確認する。
- **[Risk] 受け入れ基準の grep を literal 実行すると registry key で必ず hit し fail** →
  Mitigation: D6 の精緻化。T-06 に registry key 除外の検証コマンドを明示。
- **[Risk] init.test.ts 現行行 539（preserve test 期待値）を更新すると build が壊れる** →
  Mitigation: D7。据え置き対象を明示列挙。実装は test 意味で判定。
- **[Trade-off] tokenizer 変更で同一テキスト約 +30% トークン → 実質 step コスト約 3 割増** →
  Mitigation: request が正とする受容済みトレードオフ。コード側の緩和策は無し、
  usage 実測で観測する。

## Open Questions

- なし（値差し替え中心で設計分岐は architect 評価済み）。
- 参考: `model-registry.ts` の省略理由コメントは `design.ts:12` という stale な行参照を
  含む（実際は const 定義行）。モデル名追随（D5）が本 change の要件であり、行参照の
  訂正は scope 外。実装が同時に直すのは任意（要件化しない）。
