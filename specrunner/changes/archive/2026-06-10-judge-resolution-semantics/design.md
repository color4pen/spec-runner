# Design: judge prompt の decision-needed 定義を絞り、verdict 規則を導出ルールと整合させる

## Context

verdict は `src/core/step/judge-verdict.ts` の純関数で findings から決定的に導出される:

- `deriveJudgeVerdict`（spec-review / code-review）: `decision-needed ≥ 1 → escalation`、`critical|high ≥ 1 → needs-fix`、else `approved`
- `deriveRequestReviewVerdict`（request-review）: blocking = `critical | high | decision-needed` → `needs-discussion`、else `approve`

この導出は「resolution が `decision-needed` の finding が 1 件でもあれば severity を問わず escalation（request-review では needs-discussion）」という安全側設計で、agent の誤判断を CLI が忖度しない決定性を担保している。

問題は finding に `decision-needed` を付ける判断基準（= prompt 側の定義）が緩いこと:

- `code-review-system.ts:87` / `spec-review-system.ts:107`: 「設計判断が必要で、自動修正では解決不可能」
- `request-review-system.ts:139`: 「人間の設計判断が必要」

この定義だと、実装者が選べる技術判断・推奨改善・ドキュメント追記レベルの提案にまで `decision-needed` が付与され、本来 approved 相当のレビューが escalation で停止する（= 安全弁の空撃ち）。

さらに verdict 規則の説明文が複数箇所に独立して書かれ、いずれも導出実装からドリフトしている:

- `step-output-templates.ts:41,50`（request-review template）: 「approve = No HIGH」「Approval is blocked when HIGH ≥ 1」— `decision-needed` 言及なし
- `step-output-templates.ts:85`（spec-review template）: 「Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1」— `decision-needed` 言及なし
- `step-output-templates.ts:121`（review-feedback template）/ `code-review-system.ts:48`: 「The verdict line is the authoritative decision」— 実際は `executor.ts` が typed toolResult の findings から導出し、result file の verdict 行は machine-parse されない（`parseResult` は no-op）。markdown の verdict 行を権威としており findings 由来の導出と矛盾
- `request-review-system.ts:150-156`（Verdict Derivation Rules）: 「approve = No HIGH」— `decision-needed` 言及なし
- `fragments.ts:32`（PIPELINE_RULES の承認阻止条件）: 「CRITICAL ≥ 1 または HIGH ≥ 1 → needs-fix」— `decision-needed → escalation` 言及なし

agent は「approved のつもりで decision-needed を付ける」混乱状態に置かれ、空撃ちを助長する。

## Goals / Non-Goals

**Goals**:

- judge 系 3 prompt の `decision-needed` 定義を「request 作成者でなければ決められない事項に限る」に絞り、該当例・非該当例・「迷ったら fixable に倒す」を明記する（要件 1）
- `step-output-templates.ts` の FORMAT REQUIREMENTS の verdict 規則を導出ルールと一致させる: blocking 条件に `decision-needed` を含め、markdown の verdict 行と findings が矛盾した場合は findings 由来の導出が優先されることを明記する（要件 2）
- prompt とテンプレートの規則記述が `judge-verdict.ts` の導出実装と意味的に一致する状態を、文言の重複ではなく単一の参照元（source of truth）への参照関係として保守できる形にする（要件 3）

**Non-Goals**:

- `judge-verdict.ts` の導出ルール自体の変更（`decision-needed = escalation` の意味論は維持する）
- findings スキーマ（`Finding` / severity / resolution）の変更
- escalation 時の通知・再開フローの変更
- 導出を severity 連動に緩める方向（architect 評価で却下済）

## Decisions

### D1: 導出（CLI 側）ではなく定義（prompt 側）を直す

verdict 導出ルールは安全側設計として維持し、`decision-needed` ラベル付与の精度だけを上げる。

- **Rationale**: 導出を緩める（例: `decision-needed` を severity 連動にする）と「judge の誤ラベルを CLI が忖度する」ことになり、判定の決定性を損なう。空撃ちの根因は導出ではなくラベル定義の緩さなので、引き金（定義）を絞るのが正しい修正点。
- **Alternatives considered**:
  - 導出を `decision-needed && severity ∈ {high,critical}` で escalation にする → 却下（architect 評価済）。判定の決定性が崩れ、agent の誤ラベルが CLI 挙動に伝播する。
  - escalation 時に人手で握り潰す運用回避 → 却下。空撃ちが残り、安全弁の信頼性が下がる。

### D2: verdict 規則 prose の単一参照元を設け、全消費者がそれを参照する

`decision-needed` 定義と verdict/blocking 規則の説明文を 1 箇所に集約し、3 prompt・PIPELINE_RULES・result template・request-review の Verdict Derivation Rules が同じ文字列を共有する。集約モジュールの正確な配置と命名は実装者の裁量とする（要件 3 が明示的に許容）。ただし以下の不変条件を満たすこと:

- 定義は 1 箇所だけに存在し、各消費者は重複コピーではなく参照（import + interpolation）で取り込む
- import 方向に循環を作らない（集約元は他モジュールを import しない leaf にする）
- `judge-verdict.ts` の導出と意味的に一致する（`decision-needed → escalation`／request-review では `needs-discussion`、`critical|high → needs-fix`、findings 由来の導出が markdown verdict 行より優先）

- **Rationale**: 現状 8 箇所に独立記述された規則がすべて導出からドリフトしている。文言の重複は再ドリフトを招くため、単一参照元への参照関係に置き換えることで「導出が変われば規則記述の参照元 1 箇所を直す」運用にする。これは要件 3 の趣旨そのもの。
- **Alternatives considered**:
  - 各箇所を個別に手で書き直す → 却下。重複が残り再ドリフトする。要件 3 を満たさない。
  - prose を `judge-verdict.ts` に co-locate する → 採用可だが必須としない。導出ロジックと表示文言の混在を避けたい実装者は leaf 定数モジュールを選べる。意味的一致が保てればどちらでもよい。

### D3: 絞った decision-needed 定義の内容

3 prompt の Resolution 定義に共通して以下の趣旨を含める:

- **限定**: `decision-needed` は「request 作成者でなければ決められない事項」に限る
- **該当例**: 要件同士の矛盾 / 複数の妥当な選択肢があり作成者の意図が必要 / 前提となる文脈の不足
- **非該当例**: 実装者が選べる技術判断 / 推奨改善 / ドキュメント追記の提案 →`fixable` と適切な severity で表現する
- **バイアス**: 迷った場合は `fixable` に倒す

- **Rationale**: 「作成者でなければ決められない」は request-review/spec-review/code-review いずれにも適用できる単一基準で、`deriveRequestReviewVerdict` の「作成者と discussion が必要」という routing 意味とも一致する。該当例・非該当例の列挙が緩さの再発を防ぐ。
- **Alternatives considered**: 「設計判断が必要」を維持しつつ severity 下限を足す → 却下。基準が二軸になり判断が曖昧。単一基準（作成者の意図が要るか）に統一する方が agent が迷わない。

### D4: template / prompt の verdict 規則を導出と一致させる（要件 2・3 の適用先）

D2 の参照元を以下の現在ドリフトしている箇所に適用する:

- `step-output-templates.ts` request-review template（approve 説明・blocking 行）: blocking に `decision-needed` を含め、「HIGH のみ」記述を除去
- `step-output-templates.ts` spec-review template（blocking 行）: blocking に `decision-needed` を含める
- `step-output-templates.ts` review-feedback template + `code-review-system.ts` の「verdict line is the authoritative decision」: findings 由来の導出が markdown verdict 行より優先される旨に改める（要件 2 後段）
- `request-review-system.ts` の Verdict Derivation Rules: `decision-needed` を blocking に含め、「No HIGH」記述を除去
- `fragments.ts` PIPELINE_RULES の承認阻止条件: `decision-needed → escalation` を補い導出と一致させる

- **Rationale**: 要件 2 は templates、要件 3 は「prompt とテンプレートの規則記述」が導出と一致することを求める。上記はすべて verdict/blocking を語る「規則記述」で、現状すべて導出からドリフトしている。同一の参照元に揃えることで矛盾を一掃する。
- **Alternatives considered**: 受け入れ基準が明記する `:50` `:85` のみ直す → 却下。`:121` / `:41` / request-review prompt / PIPELINE_RULES の旧記述が残ると要件 3（semantic 一致）を満たさず、agent の混乱源が残る。

### D5: 導出ロジックとスキーマは不変、回帰は test で固定

`deriveJudgeVerdict` / `deriveRequestReviewVerdict` / `collectVerdictAffectingFindings` / `collectFixableFindings` と `Finding` 型は変更しない。既存の verdict 導出テスト（`judge-verdict.test.ts` 等）が green のままであることで導出不変を保証し、新規の文言テストで定義・規則記述の改訂を固定する。

- **Rationale**: 受け入れ基準「導出ルールに変更がない」「typecheck && test が green」を満たす最小の保証手段。prose 変更が誤って導出やスキーマに波及していないことを test で機械的に検出する。
- **Alternatives considered**: 手動レビューのみで導出不変を確認 → 却下。回帰を機械的に固定できない。

## Risks / Trade-offs

- [Risk] decision-needed を絞りすぎ、本来「作成者でなければ決められない」案件まで `fixable` に倒れ、安全弁が弱まる → Mitigation: 該当例（要件矛盾・選択肢分岐・文脈不足）を具体列挙して真の作成者判断は引き続き `decision-needed` に載るようにする。escalation 経路自体は不変なので、正しくラベルされれば安全弁は機能し続ける。
- [Risk] 単一参照元の prose を PIPELINE_RULES 等に interpolation する際、`fragment-coverage.test.ts` が各 prompt に PIPELINE_RULES 全体文字列を含むことを assert しているため、文字列が変わると壊れる → Mitigation: 参照元を PIPELINE_RULES に取り込む場合はテストが参照する定数経由で比較されるため、定数自体を更新すれば assert は追従する。prompt の `buildSystemPrompt` fragments 配列順は変えず PIPELINE_RULES を残す。
- [Risk] template の prose 改訂で既存 `step-output-templates.test.ts` の token assert（"approved" 等）が壊れる → Mitigation: 既存 assert は verdict 値トークン中心で blocking 文言には依存していないため影響は小。新規 assert は追加し、旧文言 assert があれば更新する。
- [Risk] 「verdict line is authoritative」→「findings 優先」へ反転させると、agent が verdict 行を雑に書くようになる懸念 → Mitigation: verdict 行は人間向けの要約として依然必須とし、矛盾時の優先順位（findings 由来が権威）だけを明記する。

## Open Questions

- なし（request type は CLI 注入で `feature`、request.md meta は `bug-fix`。いずれの経路でも spec.md を同梱するため spec presence check の差異は問題にならない）。
