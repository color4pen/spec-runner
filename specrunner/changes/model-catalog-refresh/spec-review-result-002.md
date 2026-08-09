# Spec Review Result (Attempt 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 前回 escalation からの変更確認

前回 (attempt 1) の F-01「受け入れ基準『既存テスト無変更で green』が D5 の必要なテスト更新と字義上衝突する」は、
operator が `request.md` 受け入れ基準の第 4 項を修正することで解消済み。
現在の `request.md` 受け入れ基準:

> 既存テスト無変更で green。ただし要件 4 で意図的に変更する `PROVIDER_DEFAULTS.openai` の旧値を pin している
> 2 テスト(tests/config/model-registry.test.ts の TC-009 の openai 2 assertion、tests/init.test.ts の openai
> scaffold テスト)の期待値更新のみ、意図的挙動変更への追随として許容する

この記述により、design.md D5 / tasks.md T-06 で記述している 2 テスト更新と受け入れ基準の字義上の矛盾は解消された。

---

## 検証した項目

| # | 項目 | 結果 |
|---|------|------|
| 1 | F-01 解消確認: `request.md` 受け入れ基準に 2 テスト更新の例外条項が追記されているか | ✅ 解消済み |
| 2 | `BUILTIN_MODEL_REGISTRY` の現状 (anthropic 9 + openai 4 = 13 エントリ) が request.md 記述と一致するか | ✅ 一致 (model-registry.ts:13-27 実測) |
| 3 | `PROVIDER_DEFAULTS.openai` の現状値 (`gpt-5.4-mini` / `gpt-5.5`) が request.md 記述と一致するか | ✅ 一致 (model-registry.ts:53-56 実測) |
| 4 | `MODEL_PRICING["gpt-5.5"]` の現状値 (input 10.0 / output 40.0 / cacheRead 2.5) が request.md 記述と一致するか | ✅ 一致 (pricing.ts:157-163 実測) |
| 5 | `src/core/usage/types.ts:50-54` のコメントが claude-opus-5 等を pricing 表未収載と記述しているか | ✅ 一致 (types.ts:52-54 実測) |
| 6 | `src/cli/init.ts` の scaffold 経路がデータ駆動 (`PROVIDER_DEFAULTS` 参照) で init.ts 本体の変更不要か | ✅ 確認 (init.ts:102-121 実測) |
| 7 | 追加 6 モデルの pricing 値がキャッシュ率則に適合するか | ✅ 全モデル適合 (下記検算) |
| 8 | spec.md の期待 USD 値が pricing 表と usage (各 1M tok) の積和と一致するか | ✅ 全 7 値一致 (下記検算) |
| 9 | spec.md の全 Requirement に SHALL/MUST normative keyword があるか | ✅ 3 Requirement すべて有 |
| 10 | spec.md の全 Requirement に Given/When/Then Scenario があるか | ✅ 3 Requirement × 複数 Scenario |
| 11 | 既存 drift guard テスト (pricing.test.ts:287-294) が registry 追加漏れを機械検出できるか | ✅ 有効 (BUILTIN_MODEL_REGISTRY 全エントリを lookupPricing でチェック) |
| 12 | D5 更新対象の TC-009 (model-registry.test.ts:104-110) が現在 `gpt-5.4-mini` / `gpt-5.5` を pin しているか | ✅ 確認 |
| 13 | D5 更新対象の init.test.ts openai scaffold テスト (lines 470-485) が現在 `gpt-5.4-mini` / `gpt-5.5` を pin しているか | ✅ 確認 |
| 14 | request.md と design.md / tasks.md / spec.md の間でモデル名・pricing 値に齟齬がないか | ✅ 一致 |
| 15 | スコープ外事項 (step 既定モデル / [1m] SKU / claude-mythos-5 / registry 削除 等) が spec に混入していないか | ✅ Non-Goals 節に明示、混入なし |
| 16 | セキュリティ: 認証・入力検証・OWASP Top 10 に関わるコード変更がないか | ✅ 静的データテーブル更新のみ、セキュリティ影響なし |
| 17 | tasks.md T-06 の更新範囲が「2 テストのみ」に限定され他テストへの波及が禁止されているか | ✅ T-06 末尾の制限条項で明示 |
| 18 | spec.md「every built-in registry model has pricing」Scenario が pricing.test.ts 既存 drift guard と対応するか | ✅ 対応 (pricing.test.ts:287-294) |

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

### キャッシュ率検算

**Anthropic** (cacheRead = 0.1×input / cacheWrite = 1.25×input):

| model | input | cacheRead 期待値 | cacheWrite 期待値 | 一致 |
|---|---|---|---|---|
| claude-opus-5 | 5.0 | 0.5 | 6.25 | ✅ |
| claude-sonnet-5 | 3.0 | 0.3 | 3.75 | ✅ |
| claude-fable-5 | 10.0 | 1.0 | 12.5 | ✅ |

**OpenAI** (cacheRead = 0.1×input / cacheWrite = 0):

| model | input | cacheRead 期待値 | cacheWrite 期待値 | 一致 |
|---|---|---|---|---|
| gpt-5.6-sol | 5.0 | 0.5 | 0 | ✅ |
| gpt-5.6-terra | 2.0 | 0.2 | 0 | ✅ |
| gpt-5.6-luna | 0.2 | 0.02 | 0 | ✅ |
| gpt-5.5 (修正後) | 5.0 | 0.5 | 0 | ✅ |

---

## 検証できなかった項目

| # | 項目 | 理由 |
|---|------|------|
| E1 | pricing 単価の外部事実 (公式ドキュメント・公表価格との照合) | request.md 指示: 「レビューはこれらの値の再検証を試みず、本 request 記載値との一致を確認すること」。コードベース外情報は pipeline で検証不能 |
| E2 | gpt-5.4 / gpt-5.4-mini の Codex 引退日 (2026-08-31) の確認 | 外部事実 |
| E3 | config-source-metadata / step-config-trace / config-effective / codex adapter テスト群が `gpt-5.5` を config fixture 文字列としてのみ参照し PROVIDER_DEFAULTS に依存しないことの直接確認 | design.md D5 で「無影響」と説明済み (gpt-5.5 は registry に存続)。論理的に正しいが当該テストファイルは本レビューでは精読せず |

---

## Findings 詳細

前回 escalation の原因であった F-01 は operator による `request.md` 修正で解消済み。
本 attempt では新たなブロッキング finding は検出されなかった。

*セキュリティ上の懸念点なし: 認証・入力検証・ユーザーデータ経路いずれにも触れない静的データテーブル更新のみ。*
