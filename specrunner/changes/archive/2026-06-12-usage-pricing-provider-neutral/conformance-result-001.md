# Conformance Result — usage-pricing-provider-neutral — iter 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | 全チェックボックス [x] 済み。T-01〜T-05 の Acceptance Criteria をすべて実装が満たす |
| design.md | ✅ | D1–D5 の設計判断が実装に忠実に反映されている |
| spec.md | ✅ | 全 SHALL/MUST 要件・全シナリオが実装とテストで充足されている |
| request.md | ✅ | 受け入れ基準 4 項目をすべて満たし、typecheck && test が green |

## Detail

### tasks.md

- T-01: `MODEL_PRICING` に `o3` / `gpt-5.1` / `gpt-5.2-codex` / `gpt-5.3-codex` / `gpt-5.4` / `gpt-5.5` の 6 エントリ追加。各エントリは `ModelPricing` 4 軸を満たし `cacheWrite: 0`（D4）。出典コメントと "as of" 日付あり（近似エントリにその旨明記）。ファイルヘッダーを provider 横断に更新（D3）。型・計算式・regex は不変。
- T-02: `DEFAULT_ONE_SHOT_MODEL = "claude-sonnet-4-5"` を `config/model-registry.ts` に新設。adapter のインラインリテラルを定数に置換。adapter とポートの doc コメントを更新。
- T-03: `pricing.test.ts` に OpenAI モデル non-null テスト・4 軸合算式一致テスト・未知モデル null テスト・drift guard テストを追加。
- T-04: `query-one-shot.test.ts` に TC-OSQ-08（config.steps.defaults.model による駆動、DEFAULT_ONE_SHOT_MODEL へのフォールバック）を追加。
- T-05: verification 全フェーズ passed（build / typecheck / test / lint）。

### design.md

| 決定 | 実装状況 |
|------|---------|
| D1: 静的テーブル・純粋関数・config 不注入 | `computeCostUsd`/`lookupPricing` のシグネチャ変更なし |
| D2: `BUILTIN_MODEL_REGISTRY ⊆ pricing` をテストで保証 | drift guard テストが全エントリを網羅 |
| D3: provider 中立ヘッダー | ファイル冒頭と TABLE 上部に Anthropic / OpenAI 両出典 |
| D4: OpenAI は `cacheWrite = 0` | 全 6 エントリで確認 |
| D5: `DEFAULT_ONE_SHOT_MODEL` を config 層に集約 | `model-registry.ts` に定数、adapter が import |

### spec.md

| Requirement | テストカバレッジ |
|-------------|----------------|
| OpenAI models → non-null cost | `gpt-5.3-codex returns a finite number` / `o3 returns non-null` |
| 4-axis formula for OpenAI | `gpt-5.3-codex cost matches 4-axis formula` |
| All registry models have pricing | drift guard（全 `BUILTIN_MODEL_REGISTRY` キーを列挙） |
| Unknown model → null / "$?" | `totally-unknown-model-xyz` / `formatUsd(null)` |
| one-shot uses config chain | TC-OSQ-08（config.steps.defaults.model 駆動・DEFAULT_ONE_SHOT_MODEL フォールバック） |
| Existing Claude costs unchanged | 既存テストが全 pass（typecheck && test green） |

### request.md 受け入れ基準

| 基準 | 状況 |
|------|------|
| OpenAI 系モデルで cost が数値 — テストで固定 | ✅ |
| 未知モデルで null — テストで固定（退行なし） | ✅ |
| one-shot デフォルトが config 解決 — テストで固定 | ✅ |
| `typecheck && test` が green | ✅ (verification passed) |

### Architecture

編集ファイル 4 件（`pricing.ts` / `model-registry.ts` / `query-one-shot.ts` / `one-shot-query-client.ts`）はすべて宣言スコープ（core/usage, config, adapter/claude-code, port）内。scope 外ファイルへの変更なし。ADR path の記載なし（adr-gen 委譲済み）。`core/port/` への config 依存混入なし（定数はコメント参照のみ）。
