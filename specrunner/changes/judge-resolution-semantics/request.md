# judge prompt の decision-needed 定義を絞り、markdown テンプレートの verdict 規則を導出ルールと整合させる

## Meta

- **type**: bug-fix
- **slug**: judge-resolution-semantics
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

verdict 導出は「resolution が decision-needed の finding が 1 件以上あれば severity を問わず escalation」というルールで動くが、judge prompt の decision-needed 定義が「設計判断が必要」と緩いため、実装者が選べる技術判断や助言級の改善提案にまで decision-needed が付与され、markdown 上の総合判定が approved のレビューが escalation で停止する事象が発生している。escalation の安全弁自体は正しく機能しており、引き金となるラベルの定義が緩いことが原因（空撃ち）。

また result ファイルの FORMAT REQUIREMENTS が旧 verdict 規則（HIGH のみ blocking）を教えており、tool 側の導出ルール（decision-needed も blocking）と食い違っている。agent が「approved のつもりで decision-needed を付ける」混乱の温床になっている。

## 現状コードの前提

- decision-needed の定義: `src/prompts/code-review-system.ts:87` と `src/prompts/spec-review-system.ts:107` が「設計判断が必要で、自動修正では解決不可能」、`src/prompts/request-review-system.ts:139` が「人間の設計判断が必要」
- verdict 導出: `src/core/step/judge-verdict.ts` の `deriveJudgeVerdict`（decision-needed ≥ 1 → escalation、critical/high ≥ 1 → needs-fix）と `deriveRequestReviewVerdict`（blocking = critical / high / decision-needed → needs-discussion）
- 旧規則の記載: `src/templates/step-output-templates.ts:50`（request-review: 「Approval is blocked when HIGH ≥ 1」）と `:85`（spec/code-review: 「Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1」）。decision-needed への言及なし

## 要件

1. judge 系 3 prompt（spec-review / code-review / request-review）の decision-needed 定義を「**request 作成者でなければ決められない事項に限る**」に絞る。該当例（要件同士の矛盾・複数の妥当な選択肢があり作成者の意図が必要・前提となる文脈の不足）と非該当例（実装者が選べる技術判断・推奨改善・ドキュメント追記の提案 → fixable と適切な severity で表現する）を各 prompt に明記する。迷った場合は fixable に倒すことも明記する
2. `step-output-templates.ts` の FORMAT REQUIREMENTS の verdict 規則を導出ルールと一致させる: blocking 条件に decision-needed を含めること、markdown の verdict 行と tool 提出の findings が矛盾した場合は findings 由来の導出が優先されることを記載する
3. prompt とテンプレートの規則記述が `judge-verdict.ts` の導出実装と意味的に一致していることを、文言の重複ではなく参照関係として保守できる形にする（規則の説明文をテンプレート側に集約し prompt から共有する等、実装者の判断でよい）

## スコープ外

- `judge-verdict.ts` の導出ルール自体の変更（decision-needed = escalation の意味論は維持する）
- findings スキーマの変更
- escalation 時の通知・再開フロー

## 受け入れ基準

- [ ] 3 prompt の decision-needed 定義に「作成者でなければ決められない事項に限る」の趣旨と該当例・非該当例が含まれる
- [ ] FORMAT REQUIREMENTS の blocking 条件に decision-needed が含まれ、HIGH のみの旧記述が残っていない
- [ ] 導出ルール（`deriveJudgeVerdict` / `deriveRequestReviewVerdict`）に変更がない
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 導出ルール（CLI 側）ではなく定義（prompt 側）を直す。escalation の安全側設計は維持し、ラベル付与の精度だけを上げる。導出を緩める方向（decision-needed を severity 連動にする等）は「judge の誤ラベルを CLI が忖度する」ことになり、判定の決定性を損なうため採らない
