# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

| # | 項目 | 結果 |
|---|------|------|
| 1 | `BUILTIN_MODEL_REGISTRY` のエントリ数・内容が request.md 記述 (anthropic 9 + openai 4 = 13) と一致するか | ✅ 一致 |
| 2 | `PROVIDER_DEFAULTS.openai` の現状値 (`gpt-5.4-mini` / `gpt-5.5`) が request.md 記述と一致するか | ✅ 一致 |
| 3 | `MODEL_PRICING["gpt-5.5"]` の現状値 (input 10.0 / output 40.0 / cacheRead 2.5) が request.md 記述と一致するか | ✅ 一致 |
| 4 | `src/core/usage/types.ts:50-54` のコメントが `claude-opus-5 / claude-sonnet-5 / claude-fable-5` を pricing 表未収載と記述しているか | ✅ 一致 |
| 5 | `src/cli/init.ts` の scaffold 経路がデータ駆動 (`PROVIDER_DEFAULTS` 参照) で init.ts 本体の変更不要であるか | ✅ 一致 (lines 102-121) |
| 6 | 新規 6 モデルの pricing 値がキャッシュ率則に適合するか (Anthropic: cacheRead=0.1×input / cacheWrite=1.25×input; OpenAI: cacheRead=0.1×input / cacheWrite=0) | ✅ 全モデル適合 |
| 7 | spec.md の期待 USD 値が pricing 表と usage (各 1M tok) の積和と一致するか | ✅ 全 7 値一致 (下記) |
| 8 | spec.md の全 Requirement に SHALL/MUST normative keyword があるか | ✅ 3 Requirement すべて有 |
| 9 | spec.md の全 Requirement に Given/When/Then Scenario があるか | ✅ 3 Requirement × 複数 Scenario |
| 10 | 既存 drift guard テスト (`pricing.test.ts: every model in BUILTIN_MODEL_REGISTRY has pricing`) が registry 追加漏れを機械検出できるか | ✅ 有効 (pricing.test.ts lines 287-294) |
| 11 | D5 で更新対象と特定された TC-009 (model-registry.test.ts:104-110) が現在 `gpt-5.4-mini` / `gpt-5.5` を pin しているか | ✅ 確認 |
| 12 | D5 で更新対象と特定された init.test.ts openai scaffold テスト (lines 470-485) が現在 `gpt-5.4-mini` / `gpt-5.5` を pin しているか | ✅ 確認 |
| 13 | 旧 gpt-5.5 コスト (spec.md 記載 52.5) が現状の pricing 値と一致するか | ✅ 10+40+2.5+0=52.5 ✓ |
| 14 | セキュリティ: 認証・入力検証・OWASP Top 10 に関わるコード変更がないか | ✅ 静的データテーブル更新のみ、セキュリティ影響なし |
| 15 | スコープ外事項 (step 既定モデル / [1m] SKU / claude-mythos-5 / registry 削除 等) が spec に混入していないか | ✅ Non-Goals 節に明示、混入なし |
| 16 | spec.md の Anthropic キャッシュ率則と request.md 外部事実が整合するか | ✅ 整合 |

### 期待 USD 値の検算 (usage = 各カテゴリ 1,000,000 tokens)

| model | input | output | cacheRead | cacheWrite | 合計 | spec.md 値 | 一致 |
|---|---|---|---|---|---|---|---|
| claude-opus-5 | 5.0 | 25.0 | 0.5 | 6.25 | **36.75** | 36.75 | ✅ |
| claude-sonnet-5 | 3.0 | 15.0 | 0.3 | 3.75 | **22.05** | 22.05 | ✅ |
| claude-fable-5 | 10.0 | 50.0 | 1.0 | 12.5 | **73.5** | 73.5 | ✅ |
| gpt-5.6-sol | 5.0 | 30.0 | 0.5 | 0 | **35.5** | 35.5 | ✅ |
| gpt-5.6-terra | 2.0 | 12.0 | 0.2 | 0 | **14.2** | 14.2 | ✅ |
| gpt-5.6-luna | 0.2 | 1.2 | 0.02 | 0 | **1.42** | 1.42 | ✅ |
| gpt-5.5 (修正後) | 5.0 | 30.0 | 0.5 | 0 | **35.5** | 35.5 | ✅ |

## 検証できなかった項目

| # | 項目 | 理由 |
|---|------|------|
| E1 | pricing 単価の外部事実 (公式ドキュメント・公表価格との照合) | request.md 指示: 「レビューはこれらの値の再検証を試みず、本 request 記載値との一致を確認すること」。パイプラインではコードベース外情報を検証不能 |
| E2 | gpt-5.4 / gpt-5.4-mini の Codex 引退日 (2026-08-31) の確認 | 外部事実 |
| E3 | config-source-metadata / step-config-trace / config-effective / codex adapter テスト群が `gpt-5.5` を config fixture 文字列としてのみ参照し PROVIDER_DEFAULTS に依存しないことの直接確認 | design.md D5 で「無影響」と説明済み。gpt-5.5 は registry に存続するため論理的に正しいが、該当テストファイルは本レビューでは読み込まず |

## Findings 詳細

### F-01: 受け入れ基準「既存テスト無変更で green」が D5 の必要なテスト更新と字義上衝突する

- **severity**: medium
- **resolution**: fixable
- **file**: specrunner/changes/model-catalog-refresh/request.md

**問題**: request.md の受け入れ基準に「既存テスト無変更で green」とある。しかし要件 4 (`PROVIDER_DEFAULTS.openai` の更新) を実施すると、旧値を直接 pin している以下 2 テストが fail する:

1. `tests/config/model-registry.test.ts:104-110` (TC-009) — `gpt-5.4-mini` / `gpt-5.5` を assert
2. `tests/init.test.ts:471-484` — `gpt-5.4-mini` / `gpt-5.5` を assert

design.md D5 では「意図的挙動変更に伴う正当な更新」として 2 テストの更新を明示している。tasks.md T-06 でも同様に扱いが記述されている。設計判断自体は正当。

ただし request.md の受け入れ基準の字義と設計判断の間に明示的な橋渡しがないため、implementer agent が request.md を正典として字義通りに実行した場合、テスト更新を差し控えて `typecheck && test` が fail するリスクがある。

**推奨修正**: request.md の受け入れ基準の該当行を以下のように補記する:
> 既存テスト無変更で green (ただし要件 4 で意図的に変更する PROVIDER_DEFAULTS 値を pin する 2 テスト — TC-009 / openai scaffold テスト — の更新は除く。詳細: design.md D5)

または tasks.md T-06 を T-04 の直後に移動し、「先にこの 2 テストを更新してから T-07 の新規テストを追加する」という実行順序を明確化する。

---

*T-05 (types.ts コメント修正) は doc-only の変更のため spec.md に Scenario がないが、Layer-1 振る舞いでないため spec 規約上は正しい省略。tasks.md T-05 の受け入れ基準でカバーされている。*

*セキュリティ上の懸念点はなし (認証・入力検証・ユーザーデータ経路にいずれも触れない)。*
